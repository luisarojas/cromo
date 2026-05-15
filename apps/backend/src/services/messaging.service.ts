import type { Pool } from 'pg';
import type { Redis } from 'ioredis';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MessageRow {
  id: string;
  trade_id: string;
  sender_id: string;
  sender_username: string;
  sender_display_name: string | null;
  body: string;
  sent_at: string;
}

interface MessagePageResult {
  items: MessageRow[];
  nextCursor: string | null;
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * publishTradeEvent — publish a JSON event to the trade's Redis pub/sub channel.
 */
export async function publishTradeEvent(
  redis: Redis,
  tradeId: string,
  eventType: string,
  data: Record<string, unknown>
): Promise<void> {
  const payload = JSON.stringify({ type: eventType, ...data });
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
    const err = new Error('Trade not found.') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  const trade = tradeRows[0]!;
  if (trade.requester_id !== userId && trade.recipient_id !== userId) {
    const err = new Error('You are not a participant in this trade.') as Error & { statusCode: number };
    err.statusCode = 403;
    throw err;
  }

  const activeStatuses = ['pending', 'accepted'];
  if (!activeStatuses.includes(trade.status)) {
    const err = new Error(`Cannot send messages on a trade with status '${trade.status}'.`) as Error & { statusCode: number };
    err.statusCode = 409;
    throw err;
  }

  const messageId = crypto.randomUUID();

  const { rows } = await db.query<MessageRow>(
    `INSERT INTO trade_messages (id, trade_id, sender_id, body, sent_at)
     VALUES ($1, $2, $3, $4, NOW())
     RETURNING
       id,
       trade_id,
       sender_id,
       (SELECT username FROM users WHERE id = $3)     AS sender_username,
       (SELECT display_name FROM users WHERE id = $3) AS sender_display_name,
       body,
       sent_at`,
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
    const err = new Error('Trade not found.') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  const trade = tradeRows[0]!;
  if (trade.requester_id !== userId && trade.recipient_id !== userId) {
    const err = new Error('You are not a participant in this trade.') as Error & { statusCode: number };
    err.statusCode = 403;
    throw err;
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
       tm.sent_at
     FROM trade_messages tm
     JOIN users u ON u.id = tm.sender_id
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
