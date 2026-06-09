import crypto from 'node:crypto';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { camelizeKeys } from '../utils/casing.js';
import { statusError } from '../utils/errors.js';

// Live trade session — two-collector room with append-only event log,
// served over the same SSE bus as regular trade messaging. The bus's
// pattern `trade:channel:*` matches `trade:channel:live:<sessionId>` so
// no plugin changes are needed — the channel name encodes the room ID
// and the SSE handler subscribes to that virtual "trade ID."

const TOKEN_LEN_BYTES = 24; // ~32 url-safe chars
const SESSION_DEFAULT_TTL_MIN = 30;

export interface LiveTradeSessionRow {
  id: string;
  hostUserId: string;
  guestUserId: string | null;
  inviteToken: string;
  status: 'open' | 'joined' | 'confirmed' | 'closed' | 'expired';
  hostConfirmedAt: string | null;
  guestConfirmedAt: string | null;
  createdAt: string;
  expiresAt: string;
  closedAt: string | null;
  host: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
  guest: { id: string; username: string; displayName: string | null; avatarUrl: string | null } | null;
}

export interface LiveTradeActionRow {
  id: string;
  sessionId: string;
  userId: string;
  username: string | null;
  actionType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

function busChannel(sessionId: string): string {
  return `trade:channel:live:${sessionId}`;
}

async function loadSession(db: Pool, where: string, params: unknown[]): Promise<LiveTradeSessionRow | null> {
  const { rows } = await db.query<{
    id: string; host_user_id: string; guest_user_id: string | null;
    invite_token: string; status: string;
    host_confirmed_at: Date | null; guest_confirmed_at: Date | null;
    created_at: Date; expires_at: Date; closed_at: Date | null;
    host_username: string; host_display_name: string | null; host_avatar_url: string | null;
    guest_username: string | null; guest_display_name: string | null; guest_avatar_url: string | null;
  }>(
    `SELECT s.id, s.host_user_id, s.guest_user_id, s.invite_token, s.status,
            s.host_confirmed_at, s.guest_confirmed_at, s.created_at, s.expires_at, s.closed_at,
            uh.username AS host_username, uh.display_name AS host_display_name, uh.avatar_url AS host_avatar_url,
            ug.username AS guest_username, ug.display_name AS guest_display_name, ug.avatar_url AS guest_avatar_url
       FROM live_trade_sessions s
       JOIN users uh ON uh.id = s.host_user_id
       LEFT JOIN users ug ON ug.id = s.guest_user_id
      WHERE ${where}
      LIMIT 1`,
    params,
  );
  const r = rows[0];
  if (!r) return null;

  // Auto-expire on read so we don't need a sweeper job.
  let status = r.status as LiveTradeSessionRow['status'];
  if (status !== 'closed' && status !== 'expired' && r.expires_at.getTime() < Date.now()) {
    status = 'expired';
    await db.query(`UPDATE live_trade_sessions SET status = 'expired' WHERE id = $1`, [r.id]);
  }

  return {
    id: r.id,
    hostUserId: r.host_user_id,
    guestUserId: r.guest_user_id,
    inviteToken: r.invite_token,
    status,
    hostConfirmedAt: r.host_confirmed_at?.toISOString() ?? null,
    guestConfirmedAt: r.guest_confirmed_at?.toISOString() ?? null,
    createdAt: r.created_at.toISOString(),
    expiresAt: r.expires_at.toISOString(),
    closedAt: r.closed_at?.toISOString() ?? null,
    host: {
      id: r.host_user_id,
      username: r.host_username,
      displayName: r.host_display_name,
      avatarUrl: r.host_avatar_url,
    },
    guest: r.guest_user_id ? {
      id: r.guest_user_id,
      username: r.guest_username ?? '',
      displayName: r.guest_display_name,
      avatarUrl: r.guest_avatar_url,
    } : null,
  };
}

export async function createSession(db: Pool, hostUserId: string): Promise<LiveTradeSessionRow> {
  const token = crypto.randomBytes(TOKEN_LEN_BYTES).toString('base64url');
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO live_trade_sessions (host_user_id, invite_token, expires_at)
     VALUES ($1, $2, now() + ($3 * interval '1 minute'))
     RETURNING id`,
    [hostUserId, token, SESSION_DEFAULT_TTL_MIN],
  );
  const session = await loadSession(db, 's.id = $1', [rows[0]!.id]);
  if (!session) throw statusError('Failed to create session', 500);
  return session;
}

export async function getSessionByToken(db: Pool, token: string): Promise<LiveTradeSessionRow | null> {
  return loadSession(db, 's.invite_token = $1', [token]);
}

export async function getSessionById(db: Pool, id: string): Promise<LiveTradeSessionRow | null> {
  return loadSession(db, 's.id = $1', [id]);
}

/**
 * Join a session as the guest. Refuses if the session is closed/expired,
 * already has a different guest, or if the joiner is the host (a session
 * should connect two distinct users — opening a self-trade room would
 * just confuse the UI).
 */
export async function joinSession(db: Pool, token: string, userId: string): Promise<LiveTradeSessionRow> {
  const session = await getSessionByToken(db, token);
  if (!session) throw statusError('Session not found', 404);
  if (session.status === 'closed' || session.status === 'expired') {
    throw statusError('Session is no longer active', 410);
  }
  if (session.hostUserId === userId) throw statusError('Host cannot join their own session', 400);
  if (session.guestUserId && session.guestUserId !== userId) {
    throw statusError('Session already has another guest', 409);
  }
  await db.query(
    `UPDATE live_trade_sessions
        SET guest_user_id = $1,
            status = CASE WHEN status = 'open' THEN 'joined' ELSE status END
      WHERE id = $2`,
    [userId, session.id],
  );
  return (await getSessionById(db, session.id))!;
}

/**
 * Authorise a request by checking the caller is one of the two
 * participants. Throws 403 otherwise. Returns the session so the caller
 * doesn't have to load it twice.
 */
export async function requireParticipant(
  db: Pool,
  sessionIdOrToken: { id?: string; token?: string },
  userId: string,
): Promise<LiveTradeSessionRow> {
  const session = sessionIdOrToken.id
    ? await getSessionById(db, sessionIdOrToken.id)
    : await getSessionByToken(db, sessionIdOrToken.token!);
  if (!session) throw statusError('Session not found', 404);
  if (session.hostUserId !== userId && session.guestUserId !== userId) {
    throw statusError('Not a participant in this session', 403);
  }
  return session;
}

const ALLOWED_ACTIONS = new Set([
  'message',
  'stage_offer',
  'unstage_offer',
  'confirm',
  'unconfirm',
  'close',
]);

/**
 * Append an action to the log and publish it over the bus. Confirms
 * mutate the session row's `host_confirmed_at`/`guest_confirmed_at`
 * timestamps so a re-load reflects them without replaying the log.
 */
export async function appendAction(
  db: Pool,
  redis: Redis,
  sessionId: string,
  userId: string,
  actionType: string,
  payload: Record<string, unknown>,
): Promise<LiveTradeActionRow> {
  if (!ALLOWED_ACTIONS.has(actionType)) {
    throw statusError(`Unknown action type: ${actionType}`, 400);
  }

  // Stamp confirmations on the session row so the status reflects them
  // without replaying the action log on every read.
  if (actionType === 'confirm' || actionType === 'unconfirm') {
    const { rows: srows } = await db.query<{ host_user_id: string; guest_user_id: string | null }>(
      `SELECT host_user_id, guest_user_id FROM live_trade_sessions WHERE id = $1`,
      [sessionId],
    );
    const s = srows[0];
    if (!s) throw statusError('Session not found', 404);
    const isHost = s.host_user_id === userId;
    const isGuest = s.guest_user_id === userId;
    if (!isHost && !isGuest) throw statusError('Not a participant', 403);
    const col = isHost ? 'host_confirmed_at' : 'guest_confirmed_at';
    const val = actionType === 'confirm' ? 'now()' : 'NULL';
    await db.query(
      `UPDATE live_trade_sessions
          SET ${col} = ${val},
              status = CASE
                WHEN host_confirmed_at IS NOT NULL AND guest_confirmed_at IS NOT NULL THEN 'confirmed'
                WHEN guest_user_id IS NOT NULL THEN 'joined'
                ELSE 'open'
              END
        WHERE id = $1`,
      [sessionId],
    );
  }

  if (actionType === 'close') {
    await db.query(
      `UPDATE live_trade_sessions SET status = 'closed', closed_at = now() WHERE id = $1`,
      [sessionId],
    );
  }

  const { rows } = await db.query<{
    id: string; session_id: string; user_id: string;
    username: string | null; action_type: string;
    payload: Record<string, unknown>; created_at: Date;
  }>(
    `INSERT INTO live_trade_actions (session_id, user_id, action_type, payload)
     VALUES ($1, $2, $3, $4)
     RETURNING id, session_id, user_id, action_type, payload, created_at,
       (SELECT username FROM users WHERE id = $2) AS username`,
    [sessionId, userId, actionType, JSON.stringify(payload)],
  );
  const r = rows[0]!;
  const event: LiveTradeActionRow = {
    id: r.id,
    sessionId: r.session_id,
    userId: r.user_id,
    username: r.username,
    actionType: r.action_type,
    payload: r.payload,
    createdAt: r.created_at.toISOString(),
  };

  // Per CLAUDE.md: SSE handlers bypass Fastify serializers; publishers must
  // camelize the payload themselves.
  await redis.publish(busChannel(sessionId), JSON.stringify(camelizeKeys({ type: 'action', ...event })));
  return event;
}

/**
 * Read actions for a session ordered by createdAt. Used for SSE replay
 * via Last-Event-ID — the caller supplies the cursor (the last seen
 * action id) and gets back any actions that have since landed.
 */
export async function listActions(
  db: Pool,
  sessionId: string,
  afterActionId?: string,
): Promise<LiveTradeActionRow[]> {
  const params: unknown[] = [sessionId];
  let after = '';
  if (afterActionId) {
    params.push(afterActionId);
    after = `AND a.created_at > (SELECT created_at FROM live_trade_actions WHERE id = $2)`;
  }
  const { rows } = await db.query<{
    id: string; session_id: string; user_id: string;
    username: string | null; action_type: string;
    payload: Record<string, unknown>; created_at: Date;
  }>(
    `SELECT a.id, a.session_id, a.user_id, a.action_type, a.payload, a.created_at,
            u.username
       FROM live_trade_actions a
       LEFT JOIN users u ON u.id = a.user_id
      WHERE a.session_id = $1 ${after}
      ORDER BY a.created_at ASC
      LIMIT 500`,
    params,
  );
  return rows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    userId: r.user_id,
    username: r.username,
    actionType: r.action_type,
    payload: r.payload,
    createdAt: r.created_at.toISOString(),
  }));
}

export function liveSessionChannel(sessionId: string): string {
  return `live:${sessionId}`;
}
