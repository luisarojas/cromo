import type { Pool, PoolClient } from 'pg';
import type { Redis } from 'ioredis';
import { invalidateUserCaches } from './cache.js';
import { publishTradeEvent } from './messaging.service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TradeMatch {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  mutual_overlap: number;
  they_have: string[];
  they_have_variant_ids: string[];
  you_have: string[];
}

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
  accepted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface TradeDetail {
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
  accepted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  items: TradeItemRow[];
  messages: TradeMessage[];
}

interface TradeItemInput {
  variantId: string;
  direction: 'offer' | 'want';
  quantity: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeError(message: string, statusCode: number): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

async function assertVariantExists(db: Pool, variantId: string): Promise<void> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM sticker_variants WHERE id = $1`,
    [variantId]
  );
  if (rows.length === 0) throw makeError(`Unknown sticker variant: ${variantId}`, 400);
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
     FROM trade_requests
     WHERE id = $1`,
    [tradeId]
  );

  if (rows.length === 0) {
    throw makeError('Trade not found.', 404);
  }

  const trade = rows[0]!;
  if (trade.requester_id !== userId && trade.recipient_id !== userId) {
    throw makeError('You are not a participant in this trade.', 403);
  }

  return trade;
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * getTradeMatches — find users with mutual sticker overlap for trading.
 * Cached in Redis for 2 minutes.
 */
export async function getTradeMatches(
  db: Pool,
  redis: Redis,
  userId: string,
  albumId: string
): Promise<TradeMatch[]> {
  const cacheKey = `trade:matches:${userId}:${albumId}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as TradeMatch[];
  }

  // Single CTE query: find users with mutual overlap
  const { rows } = await db.query<{
    user_id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    mutual_overlap: number;
    they_have: string[];
    they_have_variant_ids: string[];
    you_have: string[];
  }>(
    `WITH my_missing AS (
       -- Sticker variant IDs (base variants) I don't have in my album
       SELECT sv.id AS variant_id
       FROM sticker_variants sv
       WHERE sv.variant_type = 'base'
         AND NOT EXISTS (
           SELECT 1 FROM user_stickers us
           WHERE us.album_id = $2
             AND us.sticker_variant_id = sv.id
             AND us.quantity > 0
         )
     ),
     my_duplicates AS (
       -- Sticker variant IDs I have as duplicates (quantity > 1)
       SELECT us.sticker_variant_id AS variant_id
       FROM user_stickers us
       WHERE us.album_id = $2
         AND us.quantity > 1
     ),
     candidate_albums AS (
       -- Albums belonging to other users who have trade_matching_enabled
       SELECT ua.id AS album_id, ua.user_id
       FROM user_albums ua
       JOIN user_settings us2 ON us2.user_id = ua.user_id
       JOIN users u ON u.id = ua.user_id
       WHERE ua.user_id != $1
         AND us2.trade_matching_enabled = true
         AND u.deleted_at IS NULL
     ),
     they_have_my_missing AS (
       -- From candidates: which ones have stickers I'm missing (as duplicates)
       SELECT ca.user_id, ca.album_id, uss.sticker_variant_id AS variant_id, s.album_code
       FROM candidate_albums ca
       JOIN user_stickers uss ON uss.album_id = ca.album_id
       JOIN sticker_variants sv ON sv.id = uss.sticker_variant_id
       JOIN stickers s ON s.id = sv.sticker_id
       WHERE uss.sticker_variant_id IN (SELECT variant_id FROM my_missing)
         AND uss.quantity > 1
     ),
     i_have_their_missing AS (
       -- From candidates: which ones are missing stickers I have as duplicates
       SELECT ca.user_id, md.variant_id, s.album_code
       FROM candidate_albums ca
       CROSS JOIN my_duplicates md
       JOIN sticker_variants sv ON sv.id = md.variant_id
       JOIN stickers s ON s.id = sv.sticker_id
       WHERE NOT EXISTS (
         SELECT 1 FROM user_stickers uss2
         WHERE uss2.album_id = ca.album_id
           AND uss2.sticker_variant_id = md.variant_id
           AND uss2.quantity > 0
       )
     ),
     mutual_users AS (
       SELECT DISTINCT thm.user_id
       FROM they_have_my_missing thm
       WHERE thm.user_id IN (SELECT user_id FROM i_have_their_missing)
     ),
     they_have_all_dupes AS (
       -- All variant IDs the partner has as duplicates for stickers in they_have_my_missing
       SELECT DISTINCT thm.user_id, sv_all.id AS variant_id
       FROM they_have_my_missing thm
       JOIN sticker_variants sv_base ON sv_base.id = thm.variant_id
       JOIN sticker_variants sv_all ON sv_all.sticker_id = sv_base.sticker_id
       JOIN user_stickers uss ON uss.sticker_variant_id = sv_all.id
         AND uss.album_id = thm.album_id
         AND uss.quantity > 1
     ),
     overlap_counts AS (
       SELECT
         mu.user_id,
         COUNT(DISTINCT thm.variant_id) AS they_have_count,
         COUNT(DISTINCT ihm.variant_id) AS you_have_count,
         (COUNT(DISTINCT thm.variant_id) + COUNT(DISTINCT ihm.variant_id)) AS mutual_overlap,
         array_agg(DISTINCT thm.album_code) FILTER (WHERE thm.album_code IS NOT NULL) AS they_have,
         array_agg(DISTINCT thad.variant_id::text) FILTER (WHERE thad.variant_id IS NOT NULL) AS they_have_variant_ids,
         array_agg(DISTINCT ihm.album_code) FILTER (WHERE ihm.album_code IS NOT NULL) AS you_have
       FROM mutual_users mu
       LEFT JOIN they_have_my_missing thm ON thm.user_id = mu.user_id
       LEFT JOIN they_have_all_dupes thad ON thad.user_id = mu.user_id
       LEFT JOIN i_have_their_missing ihm ON ihm.user_id = mu.user_id
       GROUP BY mu.user_id
     )
     SELECT
       oc.user_id,
       u.username,
       u.display_name,
       u.avatar_url,
       oc.mutual_overlap,
       COALESCE(oc.they_have, ARRAY[]::text[]) AS they_have,
       COALESCE(oc.they_have_variant_ids, ARRAY[]::text[]) AS they_have_variant_ids,
       COALESCE(oc.you_have, ARRAY[]::text[]) AS you_have
     FROM overlap_counts oc
     JOIN users u ON u.id = oc.user_id
     ORDER BY oc.mutual_overlap DESC`,
    [userId, albumId]
  );

  const result: TradeMatch[] = rows.map((r) => ({
    user_id: r.user_id,
    username: r.username,
    display_name: r.display_name,
    avatar_url: r.avatar_url,
    mutual_overlap: Number(r.mutual_overlap),
    they_have: r.they_have ?? [],
    they_have_variant_ids: r.they_have_variant_ids ?? [],
    you_have: r.you_have ?? [],
  }));

  await redis.set(cacheKey, JSON.stringify(result), 'EX', 120);

  return result;
}

/**
 * createTrade — create a new pending trade request.
 */
export async function createTrade(
  db: Pool,
  redis: Redis,
  userId: string,
  recipientId: string,
  items: TradeItemInput[]
): Promise<{ id: string }> {
  if (userId === recipientId) {
    throw makeError('You cannot trade with yourself.', 400);
  }

  const { rows: recipientRows } = await db.query<{ id: string }>(
    `SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [recipientId]
  );
  if (recipientRows.length === 0) {
    throw makeError('Recipient not found.', 404);
  }

  const hasOffer = items.some((i) => i.direction === 'offer');
  const hasWant = items.some((i) => i.direction === 'want');
  if (!hasOffer || !hasWant) {
    throw makeError('Trade must include at least one offer item and one want item.', 400);
  }

  const tradeId = crypto.randomUUID();
  await db.query(
    `INSERT INTO trade_requests
       (id, requester_id, recipient_id, status, counter_count, created_at, updated_at)
     VALUES ($1, $2, $3, 'pending', 0, NOW(), NOW())`,
    [tradeId, userId, recipientId]
  );

  for (const item of items) {
    await assertVariantExists(db, item.variantId);
    await db.query(
      `INSERT INTO trade_items (id, trade_id, sticker_variant_id, direction, quantity)
       VALUES ($1, $2, $3, $4, $5)`,
      [crypto.randomUUID(), tradeId, item.variantId, item.direction, item.quantity]
    );
  }

  // Invalidate match caches
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
       tr.requester_id,
       ru.username       AS requester_username,
       ru.display_name   AS requester_display_name,
       ru.avatar_url     AS requester_avatar_url,
       tr.recipient_id,
       re.username       AS recipient_username,
       re.display_name   AS recipient_display_name,
       re.avatar_url     AS recipient_avatar_url,
       tr.status,
       tr.counter_count,
       tr.accepted_at,
       tr.completed_at,
       tr.cancelled_at,
       tr.expires_at,
       tr.created_at,
       tr.updated_at,
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
  const { rows: tradeRows } = await db.query<{
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
    accepted_at: string | null;
    completed_at: string | null;
    cancelled_at: string | null;
    expires_at: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT
       tr.id,
       tr.requester_id,
       ru.username       AS requester_username,
       ru.display_name   AS requester_display_name,
       ru.avatar_url     AS requester_avatar_url,
       tr.recipient_id,
       re.username       AS recipient_username,
       re.display_name   AS recipient_display_name,
       re.avatar_url     AS recipient_avatar_url,
       tr.status,
       tr.counter_count,
       tr.accepted_at,
       tr.completed_at,
       tr.cancelled_at,
       tr.expires_at,
       tr.created_at,
       tr.updated_at
     FROM trade_requests tr
     JOIN users ru ON ru.id = tr.requester_id
     JOIN users re ON re.id = tr.recipient_id
     WHERE tr.id = $1
       AND (tr.requester_id = $2 OR tr.recipient_id = $2)`,
    [tradeId, userId]
  );

  if (tradeRows.length === 0) return null;

  const trade = tradeRows[0]!;

  const { rows: itemRows } = await db.query<TradeItemRow>(
    `SELECT
       ti.id,
       ti.trade_id,
       ti.sticker_variant_id,
       ti.direction,
       ti.quantity,
       s.number,
       s.album_code,
       s.player_name,
       s.sticker_type,
       sv.variant_type,
       t.name AS team_name
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
       tm.id,
       tm.trade_id,
       tm.sender_id,
       u.username    AS sender_username,
       u.display_name AS sender_display_name,
       tm.body,
       tm.sent_at
     FROM trade_messages tm
     JOIN users u ON u.id = tm.sender_id
     WHERE tm.trade_id = $1
     ORDER BY tm.sent_at DESC
     LIMIT 50`,
    [tradeId]
  );

  return {
    ...trade,
    items: itemRows,
    messages: msgRows.reverse(),
  };
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

  if (trade.status !== 'pending') {
    throw makeError(`Trade cannot be accepted in status '${trade.status}'.`, 409);
  }
  if (trade.recipient_id !== userId) {
    throw makeError('Only the recipient can accept a trade.', 403);
  }

  await db.query(
    `UPDATE trade_requests
     SET status = 'accepted',
         accepted_at = NOW(),
         expires_at = NOW() + INTERVAL '30 days',
         updated_at = NOW()
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

  if (trade.status !== 'pending') {
    throw makeError(`Trade cannot be declined in status '${trade.status}'.`, 409);
  }
  if (trade.recipient_id !== userId) {
    throw makeError('Only the recipient can decline a trade.', 403);
  }

  await db.query(
    `UPDATE trade_requests
     SET status = 'declined', updated_at = NOW()
     WHERE id = $1`,
    [tradeId]
  );

  await publishTradeEvent(redis, tradeId, 'status_changed', { trade_id: tradeId, status: 'declined' });
}

/**
 * counterTrade — a participant proposes a counter-offer.
 * Swaps requester/recipient and replaces trade items.
 */
export async function counterTrade(
  db: Pool,
  redis: Redis,
  userId: string,
  tradeId: string,
  items: TradeItemInput[]
): Promise<void> {
  const trade = await assertParticipant(db, userId, tradeId);

  if (trade.status !== 'pending') {
    throw makeError(`Trade cannot be countered in status '${trade.status}'.`, 409);
  }
  if (trade.counter_count >= 5) {
    throw makeError('Counter limit reached.', 409);
  }

  const hasOffer = items.some((i) => i.direction === 'offer');
  const hasWant = items.some((i) => i.direction === 'want');
  if (!hasOffer || !hasWant) {
    throw makeError('Counter offer must include at least one offer item and one want item.', 400);
  }

  // The counter-proposer becomes the new requester
  const newRequesterId = userId;
  const newRecipientId =
    trade.requester_id === userId ? trade.recipient_id : trade.requester_id;

  // Replace items and swap roles
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
     SET requester_id = $2,
         recipient_id = $3,
         counter_count = counter_count + 1,
         updated_at = NOW()
     WHERE id = $1`,
    [tradeId, newRequesterId, newRecipientId]
  );

  await publishTradeEvent(redis, tradeId, 'status_changed', {
    trade_id: tradeId,
    status: 'pending',
    counter_count: trade.counter_count + 1,
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
    throw makeError(`Trade cannot be cancelled in status '${trade.status}'.`, 409);
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

    // Lock the row to prevent race conditions
    const { rows } = await client.query<{
      requester_id: string;
      recipient_id: string;
      status: string;
    }>(
      `SELECT requester_id, recipient_id, status
       FROM trade_requests
       WHERE id = $1
       FOR UPDATE`,
      [tradeId]
    );

    const locked = rows[0]!;

    // Idempotent — if already completed, do nothing
    if (locked.status !== 'accepted') {
      await client.query('ROLLBACK');
      return;
    }

    const requesterId = locked.requester_id;
    const recipientId = locked.recipient_id;

    // Mark completed
    await client.query(
      `UPDATE trade_requests
       SET status = 'completed', completed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [tradeId]
    );

    // Fetch trade items
    const { rows: items } = await client.query<{
      sticker_variant_id: string;
      direction: string;
      quantity: number;
      requester_album_id: string | null;
      recipient_album_id: string | null;
    }>(
      `SELECT
         ti.sticker_variant_id,
         ti.direction,
         ti.quantity,
         (SELECT ua.id FROM user_albums ua WHERE ua.user_id = $2 AND ua.is_default = true LIMIT 1) AS requester_album_id,
         (SELECT ua.id FROM user_albums ua WHERE ua.user_id = $3 AND ua.is_default = true LIMIT 1) AS recipient_album_id
       FROM trade_items ti
       WHERE ti.trade_id = $1`,
      [tradeId, requesterId, recipientId]
    );

    for (const item of items) {
      const { sticker_variant_id, direction, quantity } = item;
      const requesterAlbum = item.requester_album_id;
      const recipientAlbum = item.recipient_album_id;

      if (!requesterAlbum || !recipientAlbum) {
        await client.query('ROLLBACK');
        throw makeError('One or both participants have no default album.', 422);
      }

      if (direction === 'offer') {
        // Requester gives → Recipient receives
        await client.query(
          `UPDATE user_stickers
           SET quantity = quantity - $3, updated_at = NOW()
           WHERE album_id = $1 AND sticker_variant_id = $2`,
          [requesterAlbum, sticker_variant_id, quantity]
        );
        await client.query(
          `INSERT INTO user_stickers (album_id, sticker_variant_id, quantity)
           VALUES ($1, $2, $3)
           ON CONFLICT (album_id, sticker_variant_id)
           DO UPDATE SET quantity = user_stickers.quantity + EXCLUDED.quantity, updated_at = NOW()`,
          [recipientAlbum, sticker_variant_id, quantity]
        );
      } else {
        // direction === 'want': Recipient gives → Requester receives
        await client.query(
          `UPDATE user_stickers
           SET quantity = quantity - $3, updated_at = NOW()
           WHERE album_id = $1 AND sticker_variant_id = $2`,
          [recipientAlbum, sticker_variant_id, quantity]
        );
        await client.query(
          `INSERT INTO user_stickers (album_id, sticker_variant_id, quantity)
           VALUES ($1, $2, $3)
           ON CONFLICT (album_id, sticker_variant_id)
           DO UPDATE SET quantity = user_stickers.quantity + EXCLUDED.quantity, updated_at = NOW()`,
          [requesterAlbum, sticker_variant_id, quantity]
        );
      }
    }

    // Clean up zero-quantity rows
    await client.query(
      `DELETE FROM user_stickers
       WHERE album_id IN (
         SELECT id FROM user_albums WHERE user_id IN ($1, $2)
       )
       AND quantity <= 0`,
      [requesterId, recipientId]
    );

    await client.query('COMMIT');

    // Invalidate caches for both users
    await Promise.all([
      invalidateUserCaches(redis, requesterId),
      invalidateUserCaches(redis, recipientId),
    ]);

    await publishTradeEvent(redis, tradeId, 'status_changed', {
      trade_id: tradeId,
      status: 'completed',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
