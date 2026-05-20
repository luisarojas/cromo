import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { statusError } from '../utils/errors.js';
import { camelizeKeys } from '../utils/casing.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MessageRow {
  id: string;
  trade_id: string;
  sender_id: string | null;
  sender_username: string | null;
  sender_display_name: string | null;
  body: string;
  sent_at: string;
  is_system: boolean;
}

interface MessagePageResult {
  items: MessageRow[];
  nextCursor: string | null;
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * publishTradeEvent — publish a JSON event to the trade's Redis pub/sub channel.
 *
 * Events are consumed by the SSE handler in routes/v1/trade.ts and written to
 * a raw socket — which bypasses Fastify's serializer. Per CLAUDE.md, payloads
 * crossing that wire must be camelized at the publisher. writeSSEEvent also
 * camelizes as defence-in-depth, but doing it here keeps the published bytes
 * in the canonical format any other consumer would expect.
 */
export async function publishTradeEvent(
  redis: Redis,
  tradeId: string,
  eventType: string,
  data: Record<string, unknown>
): Promise<void> {
  const payload = JSON.stringify(camelizeKeys({ type: eventType, ...data }));
  await redis.publish(`trade:channel:${tradeId}`, payload);
}

/**
 * sendMessage — insert a message into trade_messages and publish to Redis.
 * Supports idempotency via an optional key.
 */
export async function sendMessage(
  db: Pool,
  redis: Redis,
  userId: string,
  tradeId: string,
  body: string,
  idempotencyKey?: string
): Promise<MessageRow> {
  // Check idempotency cache first
  if (idempotencyKey) {
    const idempCacheKey = `idempotency:msg:${idempotencyKey}:${userId}`;
    const cached = await redis.get(idempCacheKey);
    if (cached) {
      return JSON.parse(cached) as MessageRow;
    }
  }

  // Verify trade exists and user is a participant
  const { rows: tradeRows } = await db.query<{
    requester_id: string;
    recipient_id: string;
    status: string;
  }>(
    `SELECT requester_id, recipient_id, status
     FROM trade_requests
     WHERE id = $1`,
    [tradeId]
  );

  if (tradeRows.length === 0) {
    throw statusError('Trade not found.', 404);
  }

  const trade = tradeRows[0]!;
  if (trade.requester_id !== userId && trade.recipient_id !== userId) {
    throw statusError('You are not a participant in this trade.', 403);
  }

  const activeStatuses = ['pending', 'accepted'];
  if (!activeStatuses.includes(trade.status)) {
    throw statusError(`Cannot send messages on a trade with status '${trade.status}'.`, 409);
  }

  const messageId = crypto.randomUUID();

  // CTE-form RETURNING with a single users join — one row lookup instead of two
  // correlated subqueries per insert.
  const { rows } = await db.query<MessageRow>(
    `WITH ins AS (
       INSERT INTO trade_messages (id, trade_id, sender_id, body, sent_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, trade_id, sender_id, body, sent_at, is_system
     )
     SELECT ins.id, ins.trade_id, ins.sender_id,
            u.username     AS sender_username,
            u.display_name AS sender_display_name,
            ins.body, ins.sent_at, ins.is_system
     FROM ins
     LEFT JOIN users u ON u.id = ins.sender_id`,
    [messageId, tradeId, userId, body]
  );

  const message = rows[0]!;

  // Publish to Redis pub/sub
  await publishTradeEvent(redis, tradeId, 'new_message', {
    id: message.id,
    trade_id: message.trade_id,
    sender_id: message.sender_id,
    sender_username: message.sender_username,
    sender_display_name: message.sender_display_name,
    body: message.body,
    sent_at: message.sent_at,
  });

  // Store idempotency response for 24 hours
  if (idempotencyKey) {
    const idempCacheKey = `idempotency:msg:${idempotencyKey}:${userId}`;
    await redis.set(idempCacheKey, JSON.stringify(message), 'EX', 86400);
  }

  return message;
}

/**
 * sendSystemMessage — insert a system notification into trade_messages (no sender).
 * Intended to be called from within an existing db client / transaction.
 */
export async function sendSystemMessage(
  client: { query: Pool['query'] },
  redis: Redis,
  tradeId: string,
  body: string,
): Promise<void> {
  const messageId = crypto.randomUUID();
  const { rows } = await client.query<MessageRow>(
    `INSERT INTO trade_messages (id, trade_id, sender_id, body, sent_at, is_system)
     VALUES ($1, $2, NULL, $3, NOW(), TRUE)
     RETURNING id, trade_id, sender_id, NULL AS sender_username, NULL AS sender_display_name,
               body, sent_at, is_system`,
    [messageId, tradeId, body],
  );
  const message = rows[0]!;
  await publishTradeEvent(redis, tradeId, 'new_message', {
    id: message.id,
    trade_id: message.trade_id,
    sender_id: null,
    sender_username: null,
    sender_display_name: null,
    body: message.body,
    sent_at: message.sent_at,
    is_system: true,
  });
}

/**
 * getMessages — paginated message history for a trade (cursor = sent_at ISO string).
 */
export async function getMessages(
  db: Pool,
  userId: string,
  tradeId: string,
  cursor?: string,
  limit = 50
): Promise<MessagePageResult> {
  // Verify participant
  const { rows: tradeRows } = await db.query<{ requester_id: string; recipient_id: string }>(
    `SELECT requester_id, recipient_id FROM trade_requests WHERE id = $1`,
    [tradeId]
  );

  if (tradeRows.length === 0) {
    throw statusError('Trade not found.', 404);
  }

  const trade = tradeRows[0]!;
  if (trade.requester_id !== userId && trade.recipient_id !== userId) {
    throw statusError('You are not a participant in this trade.', 403);
  }

  const pageSize = Math.min(limit, 200);

  const { rows } = await db.query<MessageRow>(
    `SELECT
       tm.id,
       tm.trade_id,
       tm.sender_id,
       u.username      AS sender_username,
       u.display_name  AS sender_display_name,
       tm.body,
       tm.sent_at,
       tm.is_system
     FROM trade_messages tm
     LEFT JOIN users u ON u.id = tm.sender_id
     WHERE tm.trade_id = $1
       AND ($2::timestamptz IS NULL OR tm.sent_at > $2::timestamptz)
     ORDER BY tm.sent_at ASC
     LIMIT $3`,
    [tradeId, cursor ?? null, pageSize + 1]
  );

  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;
  const nextCursor = hasMore ? items[items.length - 1]!.sent_at : null;

  return { items, nextCursor };
}
