import crypto from 'node:crypto';
import type { Pool } from 'pg';
import { statusError } from '../utils/errors.js';
import { env } from '../env.js';

// Single-use, short-lived link a collector hands to someone in person
// (typically via a QR code) to drop the scanner into the same propose-trade
// flow the profile's "Start a trade" button uses. The only thing the invite
// carries is "who is the trade partner" — the rest of the lifecycle is the
// existing trade pipeline (createTrade → pending → accepted → completed).

const TOKEN_LEN_BYTES = 24; // ~32 url-safe chars

export interface TradeInviteRow {
  id: string;
  token: string;
  expiresAt: string;
  url: string;
}

export async function createInvite(db: Pool, hostUserId: string): Promise<TradeInviteRow> {
  const token = crypto.randomBytes(TOKEN_LEN_BYTES).toString('base64url');
  const { rows } = await db.query<{ id: string; expires_at: Date }>(
    `INSERT INTO trade_invites (host_user_id, token)
     VALUES ($1, $2)
     RETURNING id, expires_at`,
    [hostUserId, token],
  );
  const row = rows[0]!;
  return {
    id: row.id,
    token,
    expiresAt: row.expires_at.toISOString(),
    url: `${env.FRONTEND_URL.replace(/\/$/, '')}/trade/invite/${token}`,
  };
}

export interface RedeemedInvite {
  hostUserId: string;
  hostUsername: string;
}

/**
 * Atomically claim an invite. The UPDATE WHERE clause encodes every
 * validity check so two simultaneous scans can't both win — only the
 * statement whose row is still unredeemed and unexpired flips it. We
 * separate the "host == redeemer" check first so that case returns a 400
 * rather than the generic 409 "already claimed" the atomic update would
 * otherwise yield.
 */
export async function redeemInvite(
  db: Pool,
  token: string,
  redeemerUserId: string,
): Promise<RedeemedInvite> {
  const { rows: hostRows } = await db.query<{ host_user_id: string }>(
    `SELECT host_user_id FROM trade_invites WHERE token = $1`,
    [token],
  );
  const hostRow = hostRows[0];
  if (!hostRow) throw statusError('Invite not found.', 404);
  if (hostRow.host_user_id === redeemerUserId) {
    throw statusError("You can't redeem your own trade invite.", 400);
  }

  const { rows } = await db.query<{ host_user_id: string; host_username: string }>(
    `WITH claimed AS (
       UPDATE trade_invites
          SET redeemed_at = now(),
              redeemed_by_user_id = $2
        WHERE token = $1
          AND redeemed_at IS NULL
          AND expires_at > now()
        RETURNING host_user_id
     )
     SELECT c.host_user_id, u.username AS host_username
       FROM claimed c
       JOIN users u ON u.id = c.host_user_id`,
    [token, redeemerUserId],
  );
  const r = rows[0];
  if (!r) {
    throw statusError('This invite has already been used or has expired.', 409);
  }
  return { hostUserId: r.host_user_id, hostUsername: r.host_username };
}
