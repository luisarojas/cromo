import type { Pool, PoolClient } from 'pg';
import type { Redis } from 'ioredis';
import { invalidateUserCaches } from './cache.js';
import { publishTradeEvent } from './messaging.service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TradeItemRow {
  id: string;
  trade_id: string;
  sticker_variant_id: string;
  direction: 'offer' | 'want';
  quantity: number;
  number: number | null;
  album_code: string | null;
  player_name: string | null;
  sticker_type: string | null;
  variant_type: string | null;
  team_name: string | null;
}

export interface TradeMessage {
  id: string;
  trade_id: string;
  sender_id: string;
  sender_username: string;
  sender_display_name: string | null;
  body: string;
  sent_at: string;
}

export interface TradeSummary {
  id: string;
  requester_id: string;
  requester_username: string;
  requester_display_name: string | null;
  requester_avatar_url: string | null;
  recipient_id: string;
  recipient_username: string;
  recipient_display_name: string | null;
  recipient_avatar_url: string | null;
  status: string;
  counter_count: number;
  offer_cash: number;
  want_cash: number;
  accepted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface TradeDetail extends Omit<TradeSummary, 'message_count'> {
  items: TradeItemRow[];
  messages: TradeMessage[];
}

interface TradeItemInput {
  variantId: string;
  direction: 'offer' | 'want';
  quantity: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusError(message: string, statusCode: number): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

async function assertVariantExists(db: Pool, variantId: string): Promise<void> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM sticker_variants WHERE id = $1`,
    [variantId]
  );
  if (rows.length === 0) throw statusError(`Unknown sticker variant: ${variantId}`, 400);
}

async function assertParticipant(
  db: Pool,
  userId: string,
  tradeId: string
): Promise<{ requester_id: string; recipient_id: string; status: string; counter_count: number }> {
  const { rows } = await db.query<{
    requester_id: string;
    recipient_id: string;
    status: string;
    counter_count: number;
  }>(
    `SELECT requester_id, recipient_id, status, counter_count
     FROM trade_requests WHERE id = $1`,
    [tradeId]
  );

  if (rows.length === 0) throw statusError('Trade not found.', 404);
  const trade = rows[0]!;
  if (trade.requester_id !== userId && trade.recipient_id !== userId) {
    throw statusError('You are not a participant in this trade.', 403);
  }
  return trade;
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * createTrade — create a new pending trade request.
 * The requester must specify their own album (which pins the album type for the trade).
 */
export async function createTrade(
  db: Pool,
  redis: Redis,
  userId: string,
  recipientId: string,
  items: TradeItemInput[],
  offerCash: number = 0,
  wantCash: number = 0,
  requesterAlbumId?: string
): Promise<{ id: string }> {
  if (userId === recipientId) {
    throw statusError('You cannot trade with yourself.', 400);
  }

  const { rows: recipientRows } = await db.query<{ id: string }>(
    `SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [recipientId]
  );
  if (recipientRows.length === 0) throw statusError('Recipient not found.', 404);

  const hasOffer = items.some((i) => i.direction === 'offer') || offerCash > 0;
  const hasWant = items.some((i) => i.direction === 'want') || wantCash > 0;
  if (!hasOffer || !hasWant) {
    throw statusError('Trade must include at least one offer and one request (stickers or cash).', 400);
  }

  // Resolve requester's album. If not specified, use their default.
  let resolvedRequesterAlbumId: string;
  let albumTypeId: string;

  if (requesterAlbumId) {
    const { rows } = await db.query<{ id: string; album_type_id: string }>(
      `SELECT id, album_type_id FROM user_albums WHERE id = $1 AND user_id = $2`,
      [requesterAlbumId, userId]
    );
    if (rows.length === 0) throw statusError('Requester album not found.', 400);
    resolvedRequesterAlbumId = rows[0]!.id;
    albumTypeId = rows[0]!.album_type_id;
  } else {
    const { rows } = await db.query<{ id: string; album_type_id: string }>(
      `SELECT id, album_type_id FROM user_albums
       WHERE user_id = $1 AND is_default = true LIMIT 1`,
      [userId]
    );
    if (rows.length === 0) throw statusError('Requester has no default album.', 422);
    resolvedRequesterAlbumId = rows[0]!.id;
    albumTypeId = rows[0]!.album_type_id;
  }

  // Recipient's album of the same type (prefer default, then most recently updated).
  const { rows: recAlbumRows } = await db.query<{ id: string }>(
    `SELECT id FROM user_albums
     WHERE user_id = $1 AND album_type_id = $2
     ORDER BY is_default DESC, updated_at DESC LIMIT 1`,
    [recipientId, albumTypeId]
  );
  if (recAlbumRows.length === 0) {
    throw statusError('Recipient has no compatible album for this trade.', 422);
  }
  const resolvedRecipientAlbumId = recAlbumRows[0]!.id;

  const tradeId = crypto.randomUUID();
  await db.query(
    `INSERT INTO trade_requests
       (id, requester_id, recipient_id, requester_album_id, recipient_album_id,
        status, counter_count, offer_cash, want_cash, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'pending', 0, $6, $7, NOW(), NOW())`,
    [tradeId, userId, recipientId, resolvedRequesterAlbumId, resolvedRecipientAlbumId, offerCash, wantCash]
  );

  for (const item of items) {
    await assertVariantExists(db, item.variantId);
    await db.query(
      `INSERT INTO trade_items (id, trade_id, sticker_variant_id, direction, quantity)
       VALUES ($1, $2, $3, $4, $5)`,
      [crypto.randomUUID(), tradeId, item.variantId, item.direction, item.quantity]
    );
  }

  await Promise.all([
    redis.del(`trade:matches:${userId}:*`),
    redis.del(`trade:matches:${recipientId}:*`),
  ]);

  return { id: tradeId };
}

/**
 * listTrades — return all trades for a user (as requester or recipient).
 */
export async function listTrades(
  db: Pool,
  userId: string,
  status?: string
): Promise<TradeSummary[]> {
  const { rows } = await db.query<TradeSummary>(
    `SELECT
       tr.id,
       tr.requester_id, ru.username AS requester_username,
       ru.display_name AS requester_display_name, ru.avatar_url AS requester_avatar_url,
       tr.recipient_id, re.username AS recipient_username,
       re.display_name AS recipient_display_name, re.avatar_url AS recipient_avatar_url,
       tr.status, tr.counter_count, tr.offer_cash, tr.want_cash,
       tr.accepted_at, tr.completed_at, tr.cancelled_at, tr.expires_at,
       tr.created_at, tr.updated_at,
       (SELECT COUNT(*) FROM trade_messages tm WHERE tm.trade_id = tr.id)::int AS message_count
     FROM trade_requests tr
     JOIN users ru ON ru.id = tr.requester_id
     JOIN users re ON re.id = tr.recipient_id
     WHERE (tr.requester_id = $1 OR tr.recipient_id = $1)
       AND ($2::text IS NULL OR tr.status = $2)
     ORDER BY tr.updated_at DESC`,
    [userId, status ?? null]
  );

  return rows;
}

/**
 * getTrade — return full trade detail for a participant.
 */
export async function getTrade(
  db: Pool,
  userId: string,
  tradeId: string
): Promise<TradeDetail | null> {
  const { rows: tradeRows } = await db.query<Omit<TradeDetail, 'items' | 'messages'>>(
    `SELECT
       tr.id,
       tr.requester_id, ru.username AS requester_username,
       ru.display_name AS requester_display_name, ru.avatar_url AS requester_avatar_url,
       tr.recipient_id, re.username AS recipient_username,
       re.display_name AS recipient_display_name, re.avatar_url AS recipient_avatar_url,
       tr.status, tr.counter_count, tr.offer_cash, tr.want_cash,
       tr.accepted_at, tr.completed_at, tr.cancelled_at, tr.expires_at,
       tr.created_at, tr.updated_at
     FROM trade_requests tr
     JOIN users ru ON ru.id = tr.requester_id
     JOIN users re ON re.id = tr.recipient_id
     WHERE tr.id = $1 AND (tr.requester_id = $2 OR tr.recipient_id = $2)`,
    [tradeId, userId]
  );

  if (tradeRows.length === 0) return null;
  const trade = tradeRows[0]!;

  const { rows: itemRows } = await db.query<TradeItemRow>(
    `SELECT
       ti.id, ti.trade_id, ti.sticker_variant_id, ti.direction, ti.quantity,
       s.number, s.album_code, s.player_name, s.sticker_type,
       sv.variant_type, t.name AS team_name
     FROM trade_items ti
     JOIN sticker_variants sv ON sv.id = ti.sticker_variant_id
     JOIN stickers s ON s.id = sv.sticker_id
     LEFT JOIN teams t ON t.id = s.team_id
     WHERE ti.trade_id = $1
     ORDER BY ti.direction, s.number`,
    [tradeId]
  );

  const { rows: msgRows } = await db.query<TradeMessage>(
    `SELECT
       tm.id, tm.trade_id, tm.sender_id,
       u.username AS sender_username,
       u.display_name AS sender_display_name,
       tm.body, tm.sent_at
     FROM trade_messages tm
     JOIN users u ON u.id = tm.sender_id
     WHERE tm.trade_id = $1
     ORDER BY tm.sent_at DESC
     LIMIT 50`,
    [tradeId]
  );

  return { ...trade, items: itemRows, messages: msgRows.reverse() };
}

/**
 * acceptTrade — recipient accepts a pending trade.
 */
export async function acceptTrade(
  db: Pool,
  redis: Redis,
  userId: string,
  tradeId: string
): Promise<void> {
  const trade = await assertParticipant(db, userId, tradeId);
  if (trade.status !== 'pending') throw statusError(`Trade cannot be accepted in status '${trade.status}'.`, 409);
  if (trade.recipient_id !== userId) throw statusError('Only the recipient can accept a trade.', 403);

  await db.query(
    `UPDATE trade_requests
     SET status = 'accepted', accepted_at = NOW(),
         expires_at = NOW() + INTERVAL '30 days', updated_at = NOW()
     WHERE id = $1`,
    [tradeId]
  );
  await publishTradeEvent(redis, tradeId, 'status_changed', { trade_id: tradeId, status: 'accepted' });
}

/**
 * declineTrade — recipient declines a pending trade.
 */
export async function declineTrade(
  db: Pool,
  redis: Redis,
  userId: string,
  tradeId: string
): Promise<void> {
  const trade = await assertParticipant(db, userId, tradeId);
  if (trade.status !== 'pending') throw statusError(`Trade cannot be declined in status '${trade.status}'.`, 409);
  if (trade.recipient_id !== userId) throw statusError('Only the recipient can decline a trade.', 403);

  await db.query(
    `UPDATE trade_requests SET status = 'declined', updated_at = NOW() WHERE id = $1`,
    [tradeId]
  );
  await publishTradeEvent(redis, tradeId, 'status_changed', { trade_id: tradeId, status: 'declined' });
}

/**
 * counterTrade — a participant proposes a counter-offer.
 * Swaps requester/recipient roles and album IDs, replaces trade items.
 */
export async function counterTrade(
  db: Pool,
  redis: Redis,
  userId: string,
  tradeId: string,
  items: TradeItemInput[],
  offerCash: number = 0,
  wantCash: number = 0
): Promise<void> {
  const trade = await assertParticipant(db, userId, tradeId);
  if (trade.status !== 'pending') throw statusError(`Trade cannot be countered in status '${trade.status}'.`, 409);
  if (trade.counter_count >= 5) throw statusError('Counter limit reached.', 409);

  const hasOffer = items.some((i) => i.direction === 'offer') || offerCash > 0;
  const hasWant = items.some((i) => i.direction === 'want') || wantCash > 0;
  if (!hasOffer || !hasWant) {
    throw statusError('Counter offer must include at least one offer and one request (stickers or cash).', 400);
  }

  const newRequesterId = userId;
  const newRecipientId = trade.requester_id === userId ? trade.recipient_id : trade.requester_id;

  await db.query(`DELETE FROM trade_items WHERE trade_id = $1`, [tradeId]);

  for (const item of items) {
    await assertVariantExists(db, item.variantId);
    await db.query(
      `INSERT INTO trade_items (id, trade_id, sticker_variant_id, direction, quantity)
       VALUES ($1, $2, $3, $4, $5)`,
      [crypto.randomUUID(), tradeId, item.variantId, item.direction, item.quantity]
    );
  }

  await db.query(
    `UPDATE trade_requests
     SET requester_id = $2, recipient_id = $3,
         requester_album_id = recipient_album_id,
         recipient_album_id = requester_album_id,
         counter_count = counter_count + 1,
         offer_cash = $4, want_cash = $5,
         updated_at = NOW()
     WHERE id = $1`,
    [tradeId, newRequesterId, newRecipientId, offerCash, wantCash]
  );

  await publishTradeEvent(redis, tradeId, 'status_changed', {
    trade_id: tradeId, status: 'pending', counter_count: trade.counter_count + 1,
  });
}

/**
 * cancelTrade — a participant cancels an accepted or pending trade.
 */
export async function cancelTrade(
  db: Pool,
  redis: Redis,
  userId: string,
  tradeId: string
): Promise<void> {
  const trade = await assertParticipant(db, userId, tradeId);
  if (trade.status !== 'pending' && trade.status !== 'accepted') {
    throw statusError(`Trade cannot be cancelled in status '${trade.status}'.`, 409);
  }

  await db.query(
    `UPDATE trade_requests
     SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [tradeId]
  );
  await publishTradeEvent(redis, tradeId, 'status_changed', { trade_id: tradeId, status: 'cancelled' });
}

/**
 * completeTrade — mark trade as completed and update inventories atomically.
 * Relies on stored requester/recipient album IDs (NOT NULL since migration 0010).
 */
export async function completeTrade(
  db: Pool,
  redis: Redis,
  userId: string,
  tradeId: string
): Promise<void> {
  await assertParticipant(db, userId, tradeId);

  const client: PoolClient = await (db as Pool & { connect(): Promise<PoolClient> }).connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<{
      requester_id: string;
      recipient_id: string;
      requester_album_id: string;
      recipient_album_id: string;
      status: string;
    }>(
      `SELECT requester_id, recipient_id, requester_album_id, recipient_album_id, status
       FROM trade_requests WHERE id = $1 FOR UPDATE`,
      [tradeId]
    );

    const locked = rows[0]!;

    if (locked.status !== 'accepted') {
      await client.query('ROLLBACK');
      return;
    }

    const { requester_id: requesterId, recipient_id: recipientId,
            requester_album_id: requesterAlbumId, recipient_album_id: recipientAlbumId } = locked;

    await client.query(
      `UPDATE trade_requests
       SET status = 'completed', completed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [tradeId]
    );

    const { rows: items } = await client.query<{
      sticker_variant_id: string; direction: string; quantity: number;
    }>(
      `SELECT sticker_variant_id, direction, quantity FROM trade_items WHERE trade_id = $1`,
      [tradeId]
    );

    for (const item of items) {
      const { sticker_variant_id, direction, quantity } = item;
      const [from, to] = direction === 'offer'
        ? [requesterAlbumId, recipientAlbumId]
        : [recipientAlbumId, requesterAlbumId];

      await client.query(
        `UPDATE user_stickers
         SET quantity = quantity - $3, updated_at = NOW()
         WHERE album_id = $1 AND sticker_variant_id = $2`,
        [from, sticker_variant_id, quantity]
      );
      await client.query(
        `INSERT INTO user_stickers (album_id, sticker_variant_id, quantity)
         VALUES ($1, $2, $3)
         ON CONFLICT (album_id, sticker_variant_id)
         DO UPDATE SET quantity = user_stickers.quantity + EXCLUDED.quantity, updated_at = NOW()`,
        [to, sticker_variant_id, quantity]
      );
    }

    // Clean up zero-quantity rows for the two affected albums.
    await client.query(
      `DELETE FROM user_stickers WHERE album_id IN ($1, $2) AND quantity <= 0`,
      [requesterAlbumId, recipientAlbumId]
    );

    await client.query('COMMIT');

    await Promise.all([
      invalidateUserCaches(redis, requesterId),
      invalidateUserCaches(redis, recipientId),
    ]);

    await publishTradeEvent(redis, tradeId, 'status_changed', {
      trade_id: tradeId, status: 'completed',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
