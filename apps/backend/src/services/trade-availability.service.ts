import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { sendSystemMessage } from './messaging.service.js';

/**
 * notifyAffectedTrades — after a sticker-consuming event (async trade
 * completion or live-trade commit) reduces a user's inventory, post a system
 * message to every other pending/accepted trade where they're still on the
 * hook for the same variant but no longer have enough stock.
 *
 * `excludeTradeId` skips the trade that just completed (pass null when the
 * caller has no async trade to exclude — e.g. live-trade commit).
 */
export async function notifyAffectedTrades(
  db: Pool,
  redis: Redis,
  excludeTradeId: string | null,
  givers: { userId: string; variantIds: string[] }[],
): Promise<void> {
  const affectedTradeIds = new Set<string>();

  for (const { userId, variantIds } of givers) {
    if (variantIds.length === 0) continue;
    const { rows } = await db.query<{ trade_id: string }>(
      `SELECT DISTINCT ti.trade_id
       FROM trade_items ti
       JOIN trade_requests tr ON tr.id = ti.trade_id
       WHERE tr.status IN ('pending', 'accepted')
         AND ($1::uuid IS NULL OR tr.id != $1)
         AND (
           (tr.requester_id = $2 AND ti.direction = 'offer')
           OR (tr.recipient_id = $2 AND ti.direction = 'want')
         )
         AND ti.sticker_variant_id = ANY($3::uuid[])
         AND COALESCE(
           (SELECT us.quantity FROM user_stickers us
            WHERE us.album_id = CASE
              WHEN tr.requester_id = $2 THEN tr.requester_album_id
              ELSE tr.recipient_album_id
            END
            AND us.sticker_variant_id = ti.sticker_variant_id),
           0
         ) < ti.quantity`,
      [excludeTradeId, userId, variantIds],
    );
    for (const row of rows) affectedTradeIds.add(row.trade_id);
  }

  await Promise.all(
    Array.from(affectedTradeIds).map((id) =>
      sendSystemMessage(db, redis, id, 'One or more stickers in this trade are no longer available.')
    )
  );
}

/**
 * notifyRestoredAvailability — inverse of notifyAffectedTrades. When an
 * accepted async trade is cancelled/expired, or a live-trade commit is
 * undone, the soft-reservation lock those events created (or the inventory
 * they consumed) is released. Other pending trades that share the same
 * variants may now be acceptable — post a system message so participants
 * know to retry.
 *
 * Scope is `pending` only: an already-accepted trade isn't gated on this
 * signal, and a completed trade can't change. `excludeTradeId` skips the
 * trade that just resolved (pass null when the caller has no async row to
 * skip — e.g. live-trade undo).
 */
export async function notifyRestoredAvailability(
  db: Pool,
  redis: Redis,
  excludeTradeId: string | null,
  givers: { userId: string; variantIds: string[] }[],
): Promise<void> {
  const affectedTradeIds = new Set<string>();

  for (const { userId, variantIds } of givers) {
    if (variantIds.length === 0) continue;
    const { rows } = await db.query<{ trade_id: string }>(
      `SELECT DISTINCT ti.trade_id
       FROM trade_items ti
       JOIN trade_requests tr ON tr.id = ti.trade_id
       WHERE tr.status = 'pending'
         AND ($1::uuid IS NULL OR tr.id != $1)
         AND (
           (tr.requester_id = $2 AND ti.direction = 'offer')
           OR (tr.recipient_id = $2 AND ti.direction = 'want')
         )
         AND ti.sticker_variant_id = ANY($3::uuid[])`,
      [excludeTradeId, userId, variantIds],
    );
    for (const row of rows) affectedTradeIds.add(row.trade_id);
  }

  await Promise.all(
    Array.from(affectedTradeIds).map((id) =>
      sendSystemMessage(db, redis, id, 'One or more stickers in this trade may be available again.')
    )
  );
}
