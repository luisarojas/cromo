import type { Pool, PoolClient } from 'pg';
import type { Redis } from 'ioredis';
import { invalidateUserCaches } from './cache.js';
import { publishTradeEvent, sendSystemMessage } from './messaging.service.js';
import { recomputeAlbumStats } from './album-stats.service.js';

async function invalidateMatchesFor(redis: Redis, userIds: string[]): Promise<void> {
  for (const userId of userIds) {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(
        cursor, 'MATCH', `trade:matches:${userId}:*`, 'COUNT', 100,
      );
      cursor = next;
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== '0');
  }
}

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
  requester_completed_at: string | null;
  recipient_completed_at: string | null;
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

async function assertVariantsExist(
  client: PoolClient | Pool,
  variantIds: string[],
): Promise<void> {
  if (variantIds.length === 0) return;
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM sticker_variants WHERE id = ANY($1::uuid[])`,
    [variantIds],
  );
  if (rows.length !== new Set(variantIds).size) {
    const found = new Set(rows.map((r) => r.id));
    const missing = variantIds.find((v) => !found.has(v));
    throw statusError(`Unknown sticker variant: ${missing}`, 400);
  }
}

async function assertNotOfferedInAcceptedTrade(
  client: PoolClient | Pool,
  userId: string,
  variantIds: string[],
): Promise<void> {
  if (variantIds.length === 0) return;
  const { rows } = await client.query<{ sticker_variant_id: string }>(
    `SELECT ti.sticker_variant_id
     FROM trade_items ti
     JOIN trade_requests tr ON tr.id = ti.trade_id
     WHERE tr.status = 'accepted'
       AND (
         (tr.requester_id = $1 AND ti.direction = 'offer')
         OR (tr.recipient_id = $1 AND ti.direction = 'want')
       )
       AND ti.sticker_variant_id = ANY($2::uuid[])
     LIMIT 1`,
    [userId, variantIds],
  );
  if (rows.length > 0) {
    throw statusError('One or more stickers are already committed to an accepted trade.', 409);
  }
}

async function notifyAffectedTrades(
  db: Pool,
  redis: Redis,
  completedTradeId: string,
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
         AND tr.id != $1
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
      [completedTradeId, userId, variantIds],
    );
    for (const row of rows) affectedTradeIds.add(row.trade_id);
  }

  await Promise.all(
    Array.from(affectedTradeIds).map((id) =>
      sendSystemMessage(db, redis, id, 'One or more stickers in this trade are no longer available.')
    )
  );
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
  requesterAlbumId?: string,
): Promise<{ id: string }> {
  if (userId === recipientId) {
    throw statusError('You cannot trade with yourself.', 400);
  }

  const hasOffer = items.some((i) => i.direction === 'offer') || offerCash > 0;
  const hasWant = items.some((i) => i.direction === 'want') || wantCash > 0;
  if (!hasOffer || !hasWant) {
    throw statusError('Trade must include at least one offer and one request (stickers or cash).', 400);
  }

  const tradeId = await withTradeTx(db, async (client) => {
    const { rows: recipientRows } = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [recipientId],
    );
    if (recipientRows.length === 0) throw statusError('Recipient not found.', 404);

    // Resolve requester's album. If not specified, use their default.
    let resolvedRequesterAlbumId: string;
    let albumTypeId: string;

    if (requesterAlbumId) {
      const { rows } = await client.query<{ id: string; album_type_id: string }>(
        `SELECT id, album_type_id FROM user_albums WHERE id = $1 AND user_id = $2`,
        [requesterAlbumId, userId],
      );
      if (rows.length === 0) throw statusError('Requester album not found.', 400);
      resolvedRequesterAlbumId = rows[0]!.id;
      albumTypeId = rows[0]!.album_type_id;
    } else {
      const { rows } = await client.query<{ id: string; album_type_id: string }>(
        `SELECT id, album_type_id FROM user_albums
         WHERE user_id = $1 AND is_default = true LIMIT 1`,
        [userId],
      );
      if (rows.length === 0) throw statusError('Requester has no default album.', 422);
      resolvedRequesterAlbumId = rows[0]!.id;
      albumTypeId = rows[0]!.album_type_id;
    }

    const { rows: recAlbumRows } = await client.query<{ id: string }>(
      `SELECT id FROM user_albums
       WHERE user_id = $1 AND album_type_id = $2
       ORDER BY is_default DESC, updated_at DESC LIMIT 1`,
      [recipientId, albumTypeId],
    );
    if (recAlbumRows.length === 0) {
      throw statusError('Recipient has no compatible album for this trade.', 422);
    }
    const resolvedRecipientAlbumId = recAlbumRows[0]!.id;

    // Lock the variants we're about to reference so a concurrent admin delete
    // can't pull them out between assertion and insert.
    await assertVariantsExist(client, items.map((i) => i.variantId));

    const offerVariantIds = items.filter((i) => i.direction === 'offer').map((i) => i.variantId);
    const wantVariantIds  = items.filter((i) => i.direction === 'want').map((i) => i.variantId);
    await assertNotOfferedInAcceptedTrade(client, userId, offerVariantIds);
    await assertNotOfferedInAcceptedTrade(client, recipientId, wantVariantIds);

    const newTradeId = crypto.randomUUID();
    await client.query(
      `INSERT INTO trade_requests
         (id, requester_id, recipient_id, requester_album_id, recipient_album_id,
          status, counter_count, offer_cash, want_cash, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', 0, $6, $7, NOW(), NOW())`,
      [newTradeId, userId, recipientId, resolvedRequesterAlbumId, resolvedRecipientAlbumId, offerCash, wantCash],
    );

    if (items.length > 0) {
      const itemIds = items.map(() => crypto.randomUUID());
      await client.query(
        `INSERT INTO trade_items (id, trade_id, sticker_variant_id, direction, quantity)
         SELECT * FROM UNNEST(
           $1::uuid[], $2::uuid[], $3::uuid[], $4::text[], $5::int[]
         )`,
        [
          itemIds,
          items.map(() => newTradeId),
          items.map((i) => i.variantId),
          items.map((i) => i.direction),
          items.map((i) => i.quantity),
        ],
      );
    }

    return newTradeId;
  });

  await invalidateMatchesFor(redis, [userId, recipientId]);

  return { id: tradeId };
}

async function withTradeTx<T>(
  db: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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
       tr.accepted_at, tr.completed_at,
       tr.requester_completed_at, tr.recipient_completed_at,
       tr.cancelled_at, tr.expires_at,
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
  tradeId: string,
): Promise<TradeDetail | null> {
  // Single round trip: header + items + messages aggregated with jsonb_agg.
  // Replaces 3 sequential queries (header, items, last-50 messages) — listing
  // 28 trades on the UI previously did 84 round trips.
  const { rows } = await db.query<TradeDetail & { items: TradeItemRow[]; messages: TradeMessage[] }>(
    `SELECT
       tr.id,
       tr.requester_id, ru.username AS requester_username,
       ru.display_name AS requester_display_name, ru.avatar_url AS requester_avatar_url,
       tr.recipient_id, re.username AS recipient_username,
       re.display_name AS recipient_display_name, re.avatar_url AS recipient_avatar_url,
       tr.status, tr.counter_count, tr.offer_cash, tr.want_cash,
       tr.accepted_at, tr.completed_at,
       tr.requester_completed_at, tr.recipient_completed_at,
       tr.cancelled_at, tr.expires_at,
       tr.created_at, tr.updated_at,
       COALESCE(items.items, '[]'::jsonb) AS items,
       COALESCE(msgs.messages, '[]'::jsonb) AS messages
     FROM trade_requests tr
     JOIN users ru ON ru.id = tr.requester_id
     JOIN users re ON re.id = tr.recipient_id
     LEFT JOIN LATERAL (
       SELECT jsonb_agg(jsonb_build_object(
         'id', ti.id,
         'trade_id', ti.trade_id,
         'sticker_variant_id', ti.sticker_variant_id,
         'direction', ti.direction,
         'quantity', ti.quantity,
         'number', s.number,
         'album_code', s.album_code,
         'player_name', s.player_name,
         'sticker_type', s.sticker_type,
         'variant_type', sv.variant_type,
         'team_name', t.name
       ) ORDER BY ti.direction, s.number) AS items
       FROM trade_items ti
       JOIN sticker_variants sv ON sv.id = ti.sticker_variant_id
       JOIN stickers s ON s.id = sv.sticker_id
       LEFT JOIN teams t ON t.id = s.team_id
       WHERE ti.trade_id = tr.id
     ) items ON true
     LEFT JOIN LATERAL (
       SELECT jsonb_agg(m ORDER BY m.sent_at ASC) AS messages
       FROM (
         SELECT
           tm.id, tm.trade_id, tm.sender_id,
           u.username AS sender_username,
           u.display_name AS sender_display_name,
           tm.body, tm.sent_at, tm.is_system
         FROM trade_messages tm
         LEFT JOIN users u ON u.id = tm.sender_id
         WHERE tm.trade_id = tr.id
         ORDER BY tm.sent_at DESC
         LIMIT 50
       ) m
     ) msgs ON true
     WHERE tr.id = $1 AND (tr.requester_id = $2 OR tr.recipient_id = $2)`,
    [tradeId, userId],
  );

  return rows[0] ?? null;
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
  await sendSystemMessage(db, redis, tradeId, 'Trade accepted.');
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
  wantCash: number = 0,
): Promise<void> {
  const hasOffer = items.some((i) => i.direction === 'offer') || offerCash > 0;
  const hasWant = items.some((i) => i.direction === 'want') || wantCash > 0;
  if (!hasOffer || !hasWant) {
    throw statusError('Counter offer must include at least one offer and one request (stickers or cash).', 400);
  }

  const { newCounter } = await withTradeTx(db, async (client) => {
    // Lock the trade row so two concurrent counter-offers can't both pass the
    // status / counter_count check.
    const { rows: lockedRows } = await client.query<{
      requester_id: string;
      recipient_id: string;
      status: string;
      counter_count: number;
      offer_cash: number;
      want_cash: number;
    }>(
      `SELECT requester_id, recipient_id, status, counter_count, offer_cash, want_cash
       FROM trade_requests WHERE id = $1 FOR UPDATE`,
      [tradeId],
    );
    if (lockedRows.length === 0) throw statusError('Trade not found.', 404);
    const locked = lockedRows[0]!;
    if (locked.requester_id !== userId && locked.recipient_id !== userId) {
      throw statusError('You are not a participant in this trade.', 403);
    }
    if (locked.status !== 'pending') {
      throw statusError(`Trade cannot be countered in status '${locked.status}'.`, 409);
    }
    if (locked.counter_count >= 5) throw statusError('Counter limit reached.', 409);

    await assertVariantsExist(client, items.map((i) => i.variantId));

    // After a counter the submitter becomes the new requester; check their offered
    // stickers aren't locked in another accepted trade, and likewise for the other party.
    const counterOtherUserId = locked.requester_id === userId ? locked.recipient_id : locked.requester_id;
    await assertNotOfferedInAcceptedTrade(
      client, userId,
      items.filter((i) => i.direction === 'offer').map((i) => i.variantId),
    );
    await assertNotOfferedInAcceptedTrade(
      client, counterOtherUserId,
      items.filter((i) => i.direction === 'want').map((i) => i.variantId),
    );

    // Snapshot old items (with display labels) before deleting them
    const { rows: oldItemRows } = await client.query<{
      sticker_variant_id: string;
      direction: string;
      quantity: number;
      album_code: string;
    }>(
      `SELECT ti.sticker_variant_id, ti.direction, ti.quantity, s.album_code
       FROM trade_items ti
       JOIN sticker_variants sv ON sv.id = ti.sticker_variant_id
       JOIN stickers s ON s.id = sv.sticker_id
       WHERE ti.trade_id = $1`,
      [tradeId],
    );

    // Fetch display labels for incoming items
    const newVariantIds = items.map((i) => i.variantId);
    const { rows: newCodeRows } = newVariantIds.length > 0
      ? await client.query<{ variant_id: string; album_code: string }>(
          `SELECT sv.id AS variant_id, s.album_code
           FROM sticker_variants sv
           JOIN stickers s ON s.id = sv.sticker_id
           WHERE sv.id = ANY($1::uuid[])`,
          [newVariantIds],
        )
      : { rows: [] as { variant_id: string; album_code: string }[] };
    const newCodeMap = new Map(newCodeRows.map((r) => [r.variant_id, r.album_code]));

    await client.query(`DELETE FROM trade_items WHERE trade_id = $1`, [tradeId]);

    if (items.length > 0) {
      const itemIds = items.map(() => crypto.randomUUID());
      await client.query(
        `INSERT INTO trade_items (id, trade_id, sticker_variant_id, direction, quantity)
         SELECT * FROM UNNEST(
           $1::uuid[], $2::uuid[], $3::uuid[], $4::text[], $5::int[]
         )`,
        [
          itemIds,
          items.map(() => tradeId),
          items.map((i) => i.variantId),
          items.map((i) => i.direction),
          items.map((i) => i.quantity),
        ],
      );
    }

    const newRequesterId = userId;
    const newRecipientId = locked.requester_id === userId ? locked.recipient_id : locked.requester_id;

    await client.query(
      `UPDATE trade_requests
       SET requester_id = $2, recipient_id = $3,
           requester_album_id = recipient_album_id,
           recipient_album_id = requester_album_id,
           counter_count = counter_count + 1,
           offer_cash = $4, want_cash = $5,
           updated_at = NOW()
       WHERE id = $1`,
      [tradeId, newRequesterId, newRecipientId, offerCash, wantCash],
    );

    // Build and insert system message describing the changes
    // Counter-offerer's perspective: old 'want' items = what they were giving;
    // old 'offer' items = what they were receiving.
    const oldOfferIds = new Set(oldItemRows.filter((i) => i.direction === 'want').map((i) => i.sticker_variant_id));
    const oldWantIds  = new Set(oldItemRows.filter((i) => i.direction === 'offer').map((i) => i.sticker_variant_id));
    const newOfferItems = items.filter((i) => i.direction === 'offer');
    const newWantItems  = items.filter((i) => i.direction === 'want');
    const newOfferIds = new Set(newOfferItems.map((i) => i.variantId));
    const newWantIds  = new Set(newWantItems.map((i) => i.variantId));

    function fmtCash(cents: number) { return `CA$${(cents / 100).toFixed(2)}`; }
    function fmtItem(code: string, qty: number) { return qty > 1 ? `${code} ×${qty}` : code; }

    const addedOffer  = newOfferItems.filter((i) => !oldOfferIds.has(i.variantId))
      .map((i) => `+${fmtItem(newCodeMap.get(i.variantId) ?? '?', i.quantity)}`);
    const removedOffer = oldItemRows.filter((i) => i.direction === 'want' && !newOfferIds.has(i.sticker_variant_id))
      .map((i) => `−${i.album_code}`);
    const addedWant   = newWantItems.filter((i) => !oldWantIds.has(i.variantId))
      .map((i) => `+${newCodeMap.get(i.variantId) ?? '?'}`);
    const removedWant  = oldItemRows.filter((i) => i.direction === 'offer' && !newWantIds.has(i.sticker_variant_id))
      .map((i) => `−${i.album_code}`);

    function cashDiff(oldCents: number, newCents: number): string | null {
      if (oldCents === newCents) return null;
      if (oldCents === 0) return `+${fmtCash(newCents)} cash`;
      if (newCents === 0) return `−${fmtCash(oldCents)} cash`;
      return `cash ${fmtCash(oldCents)} → ${fmtCash(newCents)}`;
    }

    const offerParts = [...addedOffer, ...removedOffer];
    const offerCashDiff = cashDiff(locked.want_cash, offerCash);
    if (offerCashDiff) offerParts.push(offerCashDiff);

    const wantParts = [...addedWant, ...removedWant];
    const wantCashDiff = cashDiff(locked.offer_cash, wantCash);
    if (wantCashDiff) wantParts.push(wantCashDiff);

    const msgLines = [`Counter offer #${locked.counter_count + 1} submitted.`];
    if (offerParts.length > 0) msgLines.push(`Offering: ${offerParts.join(', ')}`);
    if (wantParts.length > 0) msgLines.push(`Requesting: ${wantParts.join(', ')}`);

    await sendSystemMessage(client, redis, tradeId, msgLines.join('\n'));

    return { newCounter: locked.counter_count + 1 };
  });

  await publishTradeEvent(redis, tradeId, 'status_changed', {
    trade_id: tradeId, status: 'pending', counter_count: newCounter,
  });
}

/**
 * editTrade — the current requester edits their pending counter-offer in place.
 * Replaces items and cash without swapping roles or incrementing counter_count.
 * Only valid when counter_count > 0 (i.e. a counter was already submitted).
 */
export async function editTrade(
  db: Pool,
  redis: Redis,
  userId: string,
  tradeId: string,
  items: TradeItemInput[],
  offerCash: number = 0,
  wantCash: number = 0,
): Promise<void> {
  const hasOffer = items.some((i) => i.direction === 'offer') || offerCash > 0;
  const hasWant = items.some((i) => i.direction === 'want') || wantCash > 0;
  if (!hasOffer || !hasWant) {
    throw statusError('Trade must include at least one offer and one request (stickers or cash).', 400);
  }

  const { counterCount } = await withTradeTx(db, async (client) => {
    const { rows: lockedRows } = await client.query<{
      requester_id: string;
      recipient_id: string;
      status: string;
      counter_count: number;
      offer_cash: number;
      want_cash: number;
    }>(
      `SELECT requester_id, recipient_id, status, counter_count, offer_cash, want_cash
       FROM trade_requests WHERE id = $1 FOR UPDATE`,
      [tradeId],
    );
    if (lockedRows.length === 0) throw statusError('Trade not found.', 404);
    const locked = lockedRows[0]!;
    if (locked.requester_id !== userId) {
      throw statusError('Only the current requester can edit a counter-offer.', 403);
    }
    if (locked.status !== 'pending') {
      throw statusError(`Trade cannot be edited in status '${locked.status}'.`, 409);
    }
    if (locked.counter_count === 0) {
      throw statusError('Only counter-offers can be edited.', 409);
    }

    await assertVariantsExist(client, items.map((i) => i.variantId));

    await assertNotOfferedInAcceptedTrade(
      client, userId,
      items.filter((i) => i.direction === 'offer').map((i) => i.variantId),
    );
    await assertNotOfferedInAcceptedTrade(
      client, locked.recipient_id,
      items.filter((i) => i.direction === 'want').map((i) => i.variantId),
    );

    // Snapshot old items for the diff message
    const { rows: oldItemRows } = await client.query<{
      sticker_variant_id: string;
      direction: string;
      quantity: number;
      album_code: string;
    }>(
      `SELECT ti.sticker_variant_id, ti.direction, ti.quantity, s.album_code
       FROM trade_items ti
       JOIN sticker_variants sv ON sv.id = ti.sticker_variant_id
       JOIN stickers s ON s.id = sv.sticker_id
       WHERE ti.trade_id = $1`,
      [tradeId],
    );

    const newVariantIds = items.map((i) => i.variantId);
    const { rows: newCodeRows } = newVariantIds.length > 0
      ? await client.query<{ variant_id: string; album_code: string }>(
          `SELECT sv.id AS variant_id, s.album_code
           FROM sticker_variants sv
           JOIN stickers s ON s.id = sv.sticker_id
           WHERE sv.id = ANY($1::uuid[])`,
          [newVariantIds],
        )
      : { rows: [] as { variant_id: string; album_code: string }[] };
    const newCodeMap = new Map(newCodeRows.map((r) => [r.variant_id, r.album_code]));

    await client.query(`DELETE FROM trade_items WHERE trade_id = $1`, [tradeId]);

    if (items.length > 0) {
      const itemIds = items.map(() => crypto.randomUUID());
      await client.query(
        `INSERT INTO trade_items (id, trade_id, sticker_variant_id, direction, quantity)
         SELECT * FROM UNNEST(
           $1::uuid[], $2::uuid[], $3::uuid[], $4::text[], $5::int[]
         )`,
        [
          itemIds,
          items.map(() => tradeId),
          items.map((i) => i.variantId),
          items.map((i) => i.direction),
          items.map((i) => i.quantity),
        ],
      );
    }

    await client.query(
      `UPDATE trade_requests
       SET offer_cash = $2, want_cash = $3, updated_at = NOW()
       WHERE id = $1`,
      [tradeId, offerCash, wantCash],
    );

    // Build diff system message
    const oldOfferIds = new Set(oldItemRows.filter((i) => i.direction === 'offer').map((i) => i.sticker_variant_id));
    const oldWantIds  = new Set(oldItemRows.filter((i) => i.direction === 'want').map((i) => i.sticker_variant_id));
    const newOfferItems = items.filter((i) => i.direction === 'offer');
    const newWantItems  = items.filter((i) => i.direction === 'want');
    const newOfferIds = new Set(newOfferItems.map((i) => i.variantId));
    const newWantIds  = new Set(newWantItems.map((i) => i.variantId));

    function fmtCash(cents: number) { return `CA$${(cents / 100).toFixed(2)}`; }
    function fmtItem(code: string, qty: number) { return qty > 1 ? `${code} ×${qty}` : code; }

    const addedOffer   = newOfferItems.filter((i) => !oldOfferIds.has(i.variantId))
      .map((i) => `+${fmtItem(newCodeMap.get(i.variantId) ?? '?', i.quantity)}`);
    const removedOffer = oldItemRows.filter((i) => i.direction === 'offer' && !newOfferIds.has(i.sticker_variant_id))
      .map((i) => `−${i.album_code}`);
    const addedWant    = newWantItems.filter((i) => !oldWantIds.has(i.variantId))
      .map((i) => `+${newCodeMap.get(i.variantId) ?? '?'}`);
    const removedWant  = oldItemRows.filter((i) => i.direction === 'want' && !newWantIds.has(i.sticker_variant_id))
      .map((i) => `−${i.album_code}`);

    function cashDiff(oldCents: number, newCents: number): string | null {
      if (oldCents === newCents) return null;
      if (oldCents === 0) return `+${fmtCash(newCents)} cash`;
      if (newCents === 0) return `−${fmtCash(oldCents)} cash`;
      return `cash ${fmtCash(oldCents)} → ${fmtCash(newCents)}`;
    }

    const offerParts = [...addedOffer, ...removedOffer];
    const offerCashDiff = cashDiff(locked.offer_cash, offerCash);
    if (offerCashDiff) offerParts.push(offerCashDiff);

    const wantParts = [...addedWant, ...removedWant];
    const wantCashDiff = cashDiff(locked.want_cash, wantCash);
    if (wantCashDiff) wantParts.push(wantCashDiff);

    const msgLines = [`Counter offer #${locked.counter_count} updated.`];
    if (offerParts.length > 0) msgLines.push(`Offering: ${offerParts.join(', ')}`);
    if (wantParts.length > 0) msgLines.push(`Requesting: ${wantParts.join(', ')}`);

    await sendSystemMessage(client, redis, tradeId, msgLines.join('\n'));

    return { counterCount: locked.counter_count };
  });

  await publishTradeEvent(redis, tradeId, 'status_changed', {
    trade_id: tradeId, status: 'pending', counter_count: counterCount,
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
  await sendSystemMessage(db, redis, tradeId, 'Trade cancelled.');
  await publishTradeEvent(redis, tradeId, 'status_changed', { trade_id: tradeId, status: 'cancelled' });
}

/**
 * completeTrade — record the caller's completion confirmation.
 * The trade finalises (stickers transfer, status → completed) only when both
 * requester and recipient have each called this endpoint.
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
      requester_completed_at: string | null;
      recipient_completed_at: string | null;
    }>(
      `SELECT requester_id, recipient_id, requester_album_id, recipient_album_id,
              status, requester_completed_at, recipient_completed_at
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

    const isRequester = userId === requesterId;
    const confirmColumn = isRequester ? 'requester_completed_at' : 'recipient_completed_at';
    const alreadyConfirmed = isRequester
      ? locked.requester_completed_at !== null
      : locked.recipient_completed_at !== null;

    if (alreadyConfirmed) {
      await client.query('ROLLBACK');
      return;
    }

    await client.query(
      `UPDATE trade_requests SET ${confirmColumn} = NOW(), updated_at = NOW() WHERE id = $1`,
      [tradeId]
    );

    // Re-read to check whether the other side had already confirmed.
    const { rows: updated } = await client.query<{
      requester_completed_at: string | null;
      recipient_completed_at: string | null;
    }>(
      `SELECT requester_completed_at, recipient_completed_at FROM trade_requests WHERE id = $1`,
      [tradeId]
    );
    const bothConfirmed =
      updated[0]!.requester_completed_at !== null &&
      updated[0]!.recipient_completed_at !== null;

    if (!bothConfirmed) {
      await client.query('COMMIT');
      await sendSystemMessage(db, redis, tradeId,
        `Waiting for the other participant to confirm completion.`);
      await publishTradeEvent(redis, tradeId, 'confirmation_updated', {
        trade_id: tradeId,
        requester_completed_at: updated[0]!.requester_completed_at,
        recipient_completed_at: updated[0]!.recipient_completed_at,
      });
      return;
    }

    // Both confirmed — validate inventory and finalise.
    const { rows: items } = await client.query<{
      sticker_variant_id: string; direction: string; quantity: number;
    }>(
      `SELECT sticker_variant_id, direction, quantity FROM trade_items WHERE trade_id = $1`,
      [tradeId]
    );

    for (const item of items) {
      const albumId = item.direction === 'offer' ? requesterAlbumId : recipientAlbumId;
      const { rows: stock } = await client.query<{ quantity: number }>(
        `SELECT quantity FROM user_stickers
         WHERE album_id = $1 AND sticker_variant_id = $2 FOR UPDATE`,
        [albumId, item.sticker_variant_id]
      );
      const available = stock[0]?.quantity ?? 0;
      if (available < item.quantity) {
        await client.query(
          `UPDATE trade_requests
           SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [tradeId]
        );
        await client.query('COMMIT');
        await Promise.all([
          invalidateUserCaches(redis, requesterId),
          invalidateUserCaches(redis, recipientId),
        ]);
        await sendSystemMessage(db, redis, tradeId, 'Trade cancelled — one or more stickers are no longer available.');
        await publishTradeEvent(redis, tradeId, 'status_changed', {
          trade_id: tradeId, status: 'cancelled',
        });
        throw statusError('One or more stickers in this trade are no longer available', 409);
      }
    }

    await client.query(
      `UPDATE trade_requests
       SET status = 'completed', completed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
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

    await client.query(
      `DELETE FROM user_stickers WHERE album_id IN ($1, $2) AND quantity <= 0`,
      [requesterAlbumId, recipientAlbumId]
    );

    await recomputeAlbumStats(client, [requesterAlbumId, recipientAlbumId]);

    await client.query('COMMIT');

    await Promise.all([
      invalidateUserCaches(redis, requesterId),
      invalidateUserCaches(redis, recipientId),
      invalidateMatchesFor(redis, [requesterId, recipientId]),
    ]);

    await sendSystemMessage(db, redis, tradeId, 'Trade completed.');
    await publishTradeEvent(redis, tradeId, 'status_changed', {
      trade_id: tradeId, status: 'completed',
    });

    await notifyAffectedTrades(db, redis, tradeId, [
      { userId: requesterId, variantIds: items.filter((i) => i.direction === 'offer').map((i) => i.sticker_variant_id) },
      { userId: recipientId, variantIds: items.filter((i) => i.direction === 'want').map((i) => i.sticker_variant_id) },
    ]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
