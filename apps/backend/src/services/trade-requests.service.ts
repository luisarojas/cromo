import type { Pool, PoolClient } from 'pg';
import type { Redis } from 'ioredis';
import type { TradeHistoryItem } from '@cromo/shared';
import { withTx } from '../db/transaction.js';
import { invalidateUserCaches } from './cache.js';
import { publishTradeEvent, sendSystemMessage } from './messaging.service.js';
import { statusError } from '../utils/errors.js';
import { recordAuditBulk } from '../utils/audit.js';
import { invalidateMatchesFor } from './trade-matching.service.js';
import { listLiveTradeHistory } from './live-trade.service.js';
import { notifyAffectedTrades, notifyRestoredAvailability } from './trade-availability.service.js';

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

/**
 * assertVariantsBelongToAlbumType — verify every variant exists AND its sticker
 * belongs to the trade's album type. Prevents a client from offering stickers
 * from a different album in the same trade payload.
 */
async function assertVariantsBelongToAlbumType(
  client: PoolClient | Pool,
  variantIds: string[],
  albumTypeId: string,
): Promise<void> {
  if (variantIds.length === 0) return;
  const { rows } = await client.query<{ id: string; album_type_id: string }>(
    `SELECT sv.id, s.album_type_id
     FROM sticker_variants sv
     JOIN stickers s ON s.id = sv.sticker_id
     WHERE sv.id = ANY($1::uuid[])`,
    [variantIds],
  );
  const unique = new Set(variantIds);
  if (rows.length !== unique.size) {
    const found = new Set(rows.map((r) => r.id));
    const missing = variantIds.find((v) => !found.has(v));
    throw statusError(`Unknown sticker variant: ${missing}`, 400);
  }
  const mismatch = rows.find((r) => r.album_type_id !== albumTypeId);
  if (mismatch) {
    throw statusError(
      'One or more stickers do not belong to this trade\'s album.',
      400,
    );
  }
}

interface SideCommitment {
  userId: string;
  albumId: string;
  items: { variantId: string; quantity: number }[];
}

/**
 * assertSufficientUncommittedQuantity — for each (user, album) side of a
 * proposed trade, ensure that adding the proposed give-quantities to the
 * quantity already committed across *other* accepted trades does not exceed
 * the user's owned quantity. The completion path is quantity-aware via
 * SELECT FOR UPDATE on user_stickers; this pre-flight mirrors that so we
 * reject early instead of letting the conflict surface only at completion.
 *
 * A power trader with 5x BRA5 can therefore have BRA5 across multiple
 * accepted trades in parallel — the old binary check blocked that even when
 * spare copies existed. Same-variant rows within one trade are summed before
 * the comparison so an items list with `[BRA5×2, BRA5×1]` is treated as a
 * single 3-quantity commitment.
 */
async function assertSufficientUncommittedQuantity(
  client: PoolClient | Pool,
  sides: SideCommitment[],
): Promise<void> {
  for (const { userId, albumId, items } of sides) {
    if (items.length === 0) continue;

    const proposedByVariant = new Map<string, number>();
    for (const it of items) {
      proposedByVariant.set(it.variantId, (proposedByVariant.get(it.variantId) ?? 0) + it.quantity);
    }
    const variantIds = [...proposedByVariant.keys()];
    const proposedQtys = [...proposedByVariant.values()];

    const { rows } = await client.query(
      `WITH proposed AS (
         SELECT t.variant_id, t.qty AS proposed_qty
         FROM unnest($3::uuid[], $4::int[]) AS t(variant_id, qty)
       ),
       committed AS (
         SELECT ti.sticker_variant_id AS variant_id, SUM(ti.quantity)::int AS committed_qty
         FROM trade_items ti
         JOIN trade_requests tr ON tr.id = ti.trade_id
         WHERE tr.status = 'accepted'
           AND ((tr.requester_id = $1 AND tr.requester_album_id = $2 AND ti.direction = 'offer')
                OR (tr.recipient_id = $1 AND tr.recipient_album_id = $2 AND ti.direction = 'want'))
           AND ti.sticker_variant_id = ANY($3::uuid[])
         GROUP BY ti.sticker_variant_id
       ),
       owned AS (
         SELECT us.sticker_variant_id AS variant_id, us.quantity AS owned_qty
         FROM user_stickers us
         WHERE us.album_id = $2 AND us.sticker_variant_id = ANY($3::uuid[])
       )
       SELECT p.variant_id
       FROM proposed p
       LEFT JOIN committed c ON c.variant_id = p.variant_id
       LEFT JOIN owned o ON o.variant_id = p.variant_id
       WHERE p.proposed_qty + COALESCE(c.committed_qty, 0) > COALESCE(o.owned_qty, 0)
       LIMIT 1`,
      [userId, albumId, variantIds, proposedQtys],
    );

    if (rows.length > 0) {
      throw statusError(
        'Insufficient uncommitted quantity for one or more stickers — some copies are already promised to other accepted trades.',
        409,
      );
    }
  }
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

  const tradeId = await withTx(db, async (client) => {
    const { rows: recipientRows } = await client.query<{ id: string; trade_matching_enabled: boolean | null }>(
      `SELECT u.id, us.trade_matching_enabled
         FROM users u
         LEFT JOIN user_settings us ON us.user_id = u.id
        WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [recipientId],
    );
    if (recipientRows.length === 0) throw statusError('Recipient not found.', 404);
    if (recipientRows[0]!.trade_matching_enabled === false) {
      throw statusError('This user is not accepting trades.', 409);
    }

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
    // can't pull them out between assertion and insert. Validate they all
    // belong to this trade's album type so a client can't mix albums.
    await assertVariantsBelongToAlbumType(client, items.map((i) => i.variantId), albumTypeId);

    const toCommitItems = (dir: 'offer' | 'want') =>
      items.filter((i) => i.direction === dir).map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
    await assertSufficientUncommittedQuantity(client, [
      { userId, albumId: resolvedRequesterAlbumId, items: toCommitItems('offer') },
      { userId: recipientId, albumId: resolvedRecipientAlbumId, items: toCommitItems('want') },
    ]);

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

export interface TradeListPage {
  items: TradeSummary[];
  nextCursor: string | null;
}

/**
 * listTrades — cursor-paginated trades for a user (as requester or recipient).
 * Cursor encodes (updated_at, id) — id is a tiebreaker for trades that share
 * an updated_at to the millisecond.
 */
export async function listTrades(
  db: Pool,
  userId: string,
  opts: { status?: string; cursor?: string; limit?: number } = {},
): Promise<TradeListPage> {
  const pageSize = Math.min(Math.max(opts.limit ?? 50, 1), 200);

  // Decode "<iso>|<uuid>" cursor.
  let cursorTs: string | null = null;
  let cursorId: string | null = null;
  if (opts.cursor) {
    const idx = opts.cursor.lastIndexOf('|');
    if (idx > 0) {
      cursorTs = opts.cursor.slice(0, idx);
      cursorId = opts.cursor.slice(idx + 1);
    }
  }

  const { rows } = await db.query<TradeSummary>(
    `SELECT
       tr.id,
       tr.requester_id, ru.username AS requester_username,
       ru.display_name AS requester_display_name, ru.avatar_url AS requester_avatar_url,
       tr.recipient_id, re.username AS recipient_username,
       re.display_name AS recipient_display_name, re.avatar_url AS recipient_avatar_url,
       tr.status, tr.counter_count, tr.offer_cash, tr.want_cash,
       tr.accepted_at, tr.rating_eligible_at, tr.completed_at,
       tr.requester_completed_at, tr.recipient_completed_at,
       tr.cancelled_at, tr.expires_at,
       tr.created_at, tr.updated_at,
       COALESCE(mc.message_count, 0)::int AS message_count,
       COALESCE(items.items, '[]'::jsonb) AS items
     FROM trade_requests tr
     JOIN users ru ON ru.id = tr.requester_id
     JOIN users re ON re.id = tr.recipient_id
     LEFT JOIN LATERAL (
       SELECT COUNT(*) AS message_count
       FROM trade_messages tm
       WHERE tm.trade_id = tr.id
     ) mc ON true
     LEFT JOIN LATERAL (
       -- Lightweight item lines so My Trades can show the swapped stickers
       -- inline without an extra round trip per row (mirrors getTrade, fewer
       -- columns). Keys are snake_case; the global serializer camelizes them.
       SELECT jsonb_agg(jsonb_build_object(
         'sticker_variant_id', ti.sticker_variant_id,
         'direction', ti.direction,
         'quantity', ti.quantity,
         'album_code', s.album_code,
         'player_name', s.player_name
       ) ORDER BY ti.direction, s.number) AS items
       FROM trade_items ti
       JOIN sticker_variants sv ON sv.id = ti.sticker_variant_id
       JOIN stickers s ON s.id = sv.sticker_id
       WHERE ti.trade_id = tr.id
     ) items ON true
     WHERE (tr.requester_id = $1 OR tr.recipient_id = $1)
       AND ($2::text IS NULL OR tr.status = $2)
       AND (
         $3::timestamptz IS NULL
         OR tr.updated_at < $3::timestamptz
         OR (tr.updated_at = $3::timestamptz AND tr.id < $4::uuid)
       )
     ORDER BY tr.updated_at DESC, tr.id DESC
     LIMIT $5`,
    [userId, opts.status ?? null, cursorTs, cursorId, pageSize + 1],
  );

  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? `${last.updated_at}|${last.id}` : null;

  return { items, nextCursor };
}

// ─── Unified history (trade requests + live trades) ─────────────────────────
//
// The two sources have different in-process shapes:
//   • Trade-request rows are raw SQL output (snake_case) — the global Fastify
//     serializer camelizes them at the wire boundary.
//   • Live-trade rows are built in JS and are already camelCase.
// We merge in this mixed-case state and let the serializer normalise. The
// comparator works on whichever timestamp/id key is present on each shape.

/** What the merge function returns *internally*, before the wire serializer
 *  camelizes the request side. The route signs off on this as the wire-side
 *  TradeHistoryItem because both branches camelize to the same shape. */
type InternalHistoryItem =
  | (TradeSummary & { kind?: 'request' })
  | TradeHistoryItem;

export interface TradeHistoryPage {
  items: InternalHistoryItem[];
  nextCursor: string | null;
}

/**
 * Live trades only have two outcomes (`completed`, `cancelled` = undone). Map
 * the request-side status filter to the live source: filters whose semantics
 * have no live equivalent skip the live query entirely.
 */
function mapStatusForLive(status: string | undefined): 'completed' | 'cancelled' | 'skip' | undefined {
  if (status === undefined) return undefined;
  if (status === 'completed') return 'completed';
  if (status === 'cancelled') return 'cancelled';
  return 'skip';
}

function timestampOf(item: InternalHistoryItem): number {
  // Request rows carry snake_case `updated_at`; live rows carry camel
  // `updatedAt`. Read whichever is present so the comparator stays correct
  // across both feed sources.
  const ts = 'updatedAt' in item ? item.updatedAt : item.updated_at;
  return Date.parse(ts);
}

/**
 * Comparator for the merged history list. Same (updatedAt desc, id desc)
 * ordering both sources already produce, so the merge stays a stable global sort.
 */
function compareDesc(a: InternalHistoryItem, b: InternalHistoryItem): number {
  const ta = timestampOf(a);
  const tb = timestampOf(b);
  if (ta !== tb) return tb - ta;
  return b.id < a.id ? -1 : b.id > a.id ? 1 : 0;
}

/**
 * listTradeHistory — unified trade-history feed: classic trade requests +
 * host-only live-trade completions. Both sources page via the same
 * `<iso>|<uuid>` cursor encoding and the same (updatedAt desc, id desc)
 * order. We over-fetch the same page size from each source so the merged
 * window can be trimmed to `pageSize` while still producing a correct
 * next-cursor — pulling pageSize from each guarantees the global top pageSize
 * is contained in the union regardless of how the two timelines interleave.
 */
export async function listTradeHistory(
  db: Pool,
  userId: string,
  opts: { status?: string; cursor?: string; limit?: number } = {},
): Promise<TradeHistoryPage> {
  const pageSize = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const liveStatus = mapStatusForLive(opts.status);

  // Skip the live source entirely when the filter has no live analogue
  // (pending / accepted / declined / expired all live in trade_requests only).
  const [requests, live] = await Promise.all([
    listTrades(db, userId, { status: opts.status, cursor: opts.cursor, limit: pageSize }),
    liveStatus === 'skip'
      ? Promise.resolve({ items: [], nextCursor: null as string | null })
      : listLiveTradeHistory(db, userId, {
          status: liveStatus,
          cursor: opts.cursor,
          limit: pageSize,
        }),
  ]);

  // Tag request items with their kind so the camelized wire payload is a
  // proper discriminated union.
  for (const r of requests.items) (r as InternalHistoryItem).kind = 'request';

  const merged: InternalHistoryItem[] = [...requests.items, ...live.items];
  merged.sort(compareDesc);

  // Anything beyond pageSize is dropped — but if either source has more data
  // OR our merged window had to be trimmed, there's a next page. New cursor
  // points to the last row we're keeping; both sources will re-query past it
  // on the next call. Same algebra `listTrades` already uses.
  const trimmed = merged.slice(0, pageSize);
  const last = trimmed[trimmed.length - 1];
  const hasMore =
    merged.length > pageSize
    || requests.nextCursor !== null
    || live.nextCursor !== null;
  let nextCursor: string | null = null;
  if (hasMore && last) {
    const ts = 'updatedAt' in last ? last.updatedAt : last.updated_at;
    nextCursor = `${ts}|${last.id}`;
  }

  return { items: trimmed, nextCursor };
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
       tr.accepted_at, tr.rating_eligible_at, tr.completed_at,
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
     WHERE tr.id = $1`,
    [tradeId],
  );

  const trade = rows[0];
  if (!trade) return null;
  if (trade.requester_id !== userId && trade.recipient_id !== userId) {
    throw statusError('You are not a party to this trade.', 403);
  }
  return trade;
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
  await withTx(db, async (client) => {
    // Lock the trade row so a concurrent accept/cancel can't slip between
    // the status check and the conflict check.
    const { rows: lockedRows } = await client.query<{
      requester_id: string;
      recipient_id: string;
      requester_album_id: string;
      recipient_album_id: string;
      status: string;
    }>(
      `SELECT requester_id, recipient_id, requester_album_id, recipient_album_id, status
       FROM trade_requests WHERE id = $1 FOR UPDATE`,
      [tradeId],
    );
    if (lockedRows.length === 0) throw statusError('Trade not found.', 404);
    const locked = lockedRows[0]!;
    if (locked.requester_id !== userId && locked.recipient_id !== userId) {
      throw statusError('You are not a participant in this trade.', 403);
    }
    if (locked.status !== 'pending') {
      throw statusError(`Trade cannot be accepted in status '${locked.status}'.`, 409);
    }
    if (locked.recipient_id !== userId) {
      throw statusError('Only the recipient can accept a trade.', 403);
    }

    // Re-assert the soft-reservation invariant before flipping to accepted:
    // for each side, ensure proposed give-quantities + already-committed in
    // other accepted trades fit within owned quantity. createTrade enforces
    // this at creation time, but a parallel pending trade can be accepted
    // between then and now. Best-effort — two concurrent acceptTrade calls
    // can still both succeed (we only hold a row lock on this trade, not on
    // conflicting trades' items); completion-time inventory validation
    // cancels whichever trade loses the race.
    const { rows: itemRows } = await client.query<{
      sticker_variant_id: string; direction: 'offer' | 'want'; quantity: number;
    }>(
      `SELECT sticker_variant_id, direction, quantity FROM trade_items WHERE trade_id = $1`,
      [tradeId],
    );
    const sideItems = (dir: 'offer' | 'want') =>
      itemRows.filter((i) => i.direction === dir).map((i) => ({
        variantId: i.sticker_variant_id, quantity: i.quantity,
      }));
    await assertSufficientUncommittedQuantity(client, [
      { userId: locked.requester_id, albumId: locked.requester_album_id, items: sideItems('offer') },
      { userId: locked.recipient_id, albumId: locked.recipient_album_id, items: sideItems('want') },
    ]);

    await client.query(
      `UPDATE trade_requests
       SET status = 'accepted', accepted_at = NOW(),
           rating_eligible_at = COALESCE(rating_eligible_at, NOW()),
           expires_at = NOW() + INTERVAL '30 days', updated_at = NOW()
       WHERE id = $1`,
      [tradeId],
    );
  });

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
  await sendSystemMessage(db, redis, tradeId, 'Trade declined.');
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

  const { newCounter } = await withTx(db, async (client) => {
    // Lock the trade row so two concurrent counter-offers can't both pass the
    // status / counter_count check.
    const { rows: lockedRows } = await client.query<{
      requester_id: string;
      recipient_id: string;
      requester_album_id: string;
      recipient_album_id: string;
      status: string;
      counter_count: number;
      offer_cash: number;
      want_cash: number;
      album_type_id: string;
    }>(
      `SELECT tr.requester_id, tr.recipient_id,
              tr.requester_album_id, tr.recipient_album_id,
              tr.status, tr.counter_count,
              tr.offer_cash, tr.want_cash, ua.album_type_id
       FROM trade_requests tr
       JOIN user_albums ua ON ua.id = tr.requester_album_id
       WHERE tr.id = $1 FOR UPDATE OF tr`,
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

    await assertVariantsBelongToAlbumType(client, items.map((i) => i.variantId), locked.album_type_id);

    // After the counter is committed below, the submitter becomes the new
    // requester and the album IDs swap. Resolve each side's album from the
    // current row, not the post-swap shape: the submitter's offer items come
    // from whichever album they currently hold (recipient_album_id if they
    // were the recipient, requester_album_id otherwise), and the other side's
    // want items come from the other album.
    const counterOtherUserId = locked.requester_id === userId ? locked.recipient_id : locked.requester_id;
    const submitterAlbumId = locked.recipient_id === userId
      ? locked.recipient_album_id : locked.requester_album_id;
    const otherAlbumId = locked.recipient_id === userId
      ? locked.requester_album_id : locked.recipient_album_id;
    const toCommitItems = (dir: 'offer' | 'want') =>
      items.filter((i) => i.direction === dir).map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
    await assertSufficientUncommittedQuantity(client, [
      { userId, albumId: submitterAlbumId, items: toCommitItems('offer') },
      { userId: counterOtherUserId, albumId: otherAlbumId, items: toCommitItems('want') },
    ]);

    // Snapshot old items (with display labels) before deleting them. We pull
    // variant_type too because a trade can now contain multiple variants of
    // the same album code — labelling those rows only by code would render
    // an ambiguous "+BRA1, +BRA1" in the diff message.
    const { rows: oldItemRows } = await client.query<{
      sticker_variant_id: string;
      direction: string;
      quantity: number;
      album_code: string;
      variant_type: string;
    }>(
      `SELECT ti.sticker_variant_id, ti.direction, ti.quantity, s.album_code, sv.variant_type
       FROM trade_items ti
       JOIN sticker_variants sv ON sv.id = ti.sticker_variant_id
       JOIN stickers s ON s.id = sv.sticker_id
       WHERE ti.trade_id = $1`,
      [tradeId],
    );

    // Fetch display labels for incoming items
    const newVariantIds = items.map((i) => i.variantId);
    const { rows: newCodeRows } = newVariantIds.length > 0
      ? await client.query<{ variant_id: string; album_code: string; variant_type: string }>(
          `SELECT sv.id AS variant_id, s.album_code, sv.variant_type
           FROM sticker_variants sv
           JOIN stickers s ON s.id = sv.sticker_id
           WHERE sv.id = ANY($1::uuid[])`,
          [newVariantIds],
        )
      : { rows: [] as { variant_id: string; album_code: string; variant_type: string }[] };
    const newCodeMap = new Map(
      newCodeRows.map((r) => [r.variant_id, { code: r.album_code, type: r.variant_type }]),
    );

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
           rating_eligible_at = CASE
             WHEN rating_eligible_at IS NULL AND counter_count + 1 >= 2 THEN NOW()
             ELSE rating_eligible_at
           END,
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
    // A label like "BRA1 (Blue)" disambiguates rows that share an album code
    // but differ in variant — e.g., requesting both BRA1 Blue and BRA1 Red
    // in one counter. Base variants drop the (Base) suffix to keep the
    // common case concise.
    function fmtLabel(code: string, variantType: string, qty: number): string {
      const isBase = variantType === 'base_border' || variantType === 'base_borderless';
      const head = isBase ? code : `${code} (${variantType})`;
      return qty > 1 ? `${head} ×${qty}` : head;
    }
    function newLabel(variantId: string, qty: number): string {
      const m = newCodeMap.get(variantId);
      if (!m) return '?';
      return fmtLabel(m.code, m.type, qty);
    }

    const addedOffer  = newOfferItems.filter((i) => !oldOfferIds.has(i.variantId))
      .map((i) => `+${newLabel(i.variantId, i.quantity)}`);
    const removedOffer = oldItemRows.filter((i) => i.direction === 'want' && !newOfferIds.has(i.sticker_variant_id))
      .map((i) => `−${fmtLabel(i.album_code, i.variant_type, i.quantity)}`);
    const addedWant   = newWantItems.filter((i) => !oldWantIds.has(i.variantId))
      .map((i) => `+${newLabel(i.variantId, i.quantity)}`);
    const removedWant  = oldItemRows.filter((i) => i.direction === 'offer' && !newWantIds.has(i.sticker_variant_id))
      .map((i) => `−${fmtLabel(i.album_code, i.variant_type, i.quantity)}`);

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

  const { counterCount } = await withTx(db, async (client) => {
    const { rows: lockedRows } = await client.query<{
      requester_id: string;
      recipient_id: string;
      requester_album_id: string;
      recipient_album_id: string;
      status: string;
      counter_count: number;
      offer_cash: number;
      want_cash: number;
      album_type_id: string;
    }>(
      `SELECT tr.requester_id, tr.recipient_id,
              tr.requester_album_id, tr.recipient_album_id,
              tr.status, tr.counter_count,
              tr.offer_cash, tr.want_cash, ua.album_type_id
       FROM trade_requests tr
       JOIN user_albums ua ON ua.id = tr.requester_album_id
       WHERE tr.id = $1 FOR UPDATE OF tr`,
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

    await assertVariantsBelongToAlbumType(client, items.map((i) => i.variantId), locked.album_type_id);

    const toCommitItems = (dir: 'offer' | 'want') =>
      items.filter((i) => i.direction === dir).map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
    await assertSufficientUncommittedQuantity(client, [
      { userId, albumId: locked.requester_album_id, items: toCommitItems('offer') },
      { userId: locked.recipient_id, albumId: locked.recipient_album_id, items: toCommitItems('want') },
    ]);

    // Snapshot old items for the diff message. variant_type tags the rows
    // so multi-variant trades render unambiguously — see counterTrade for
    // the matching pattern.
    const { rows: oldItemRows } = await client.query<{
      sticker_variant_id: string;
      direction: string;
      quantity: number;
      album_code: string;
      variant_type: string;
    }>(
      `SELECT ti.sticker_variant_id, ti.direction, ti.quantity, s.album_code, sv.variant_type
       FROM trade_items ti
       JOIN sticker_variants sv ON sv.id = ti.sticker_variant_id
       JOIN stickers s ON s.id = sv.sticker_id
       WHERE ti.trade_id = $1`,
      [tradeId],
    );

    const newVariantIds = items.map((i) => i.variantId);
    const { rows: newCodeRows } = newVariantIds.length > 0
      ? await client.query<{ variant_id: string; album_code: string; variant_type: string }>(
          `SELECT sv.id AS variant_id, s.album_code, sv.variant_type
           FROM sticker_variants sv
           JOIN stickers s ON s.id = sv.sticker_id
           WHERE sv.id = ANY($1::uuid[])`,
          [newVariantIds],
        )
      : { rows: [] as { variant_id: string; album_code: string; variant_type: string }[] };
    const newCodeMap = new Map(
      newCodeRows.map((r) => [r.variant_id, { code: r.album_code, type: r.variant_type }]),
    );

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
    function fmtLabel(code: string, variantType: string, qty: number): string {
      const isBase = variantType === 'base_border' || variantType === 'base_borderless';
      const head = isBase ? code : `${code} (${variantType})`;
      return qty > 1 ? `${head} ×${qty}` : head;
    }
    function newLabel(variantId: string, qty: number): string {
      const m = newCodeMap.get(variantId);
      if (!m) return '?';
      return fmtLabel(m.code, m.type, qty);
    }

    const addedOffer   = newOfferItems.filter((i) => !oldOfferIds.has(i.variantId))
      .map((i) => `+${newLabel(i.variantId, i.quantity)}`);
    const removedOffer = oldItemRows.filter((i) => i.direction === 'offer' && !newOfferIds.has(i.sticker_variant_id))
      .map((i) => `−${fmtLabel(i.album_code, i.variant_type, i.quantity)}`);
    const addedWant    = newWantItems.filter((i) => !oldWantIds.has(i.variantId))
      .map((i) => `+${newLabel(i.variantId, i.quantity)}`);
    const removedWant  = oldItemRows.filter((i) => i.direction === 'want' && !newWantIds.has(i.sticker_variant_id))
      .map((i) => `−${fmtLabel(i.album_code, i.variant_type, i.quantity)}`);

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

  // Snapshot the items + givers before flipping status so we can re-notify
  // pending trades whose acceptance was soft-blocked by this one. Only
  // matters when the trade was actually 'accepted' — pending→cancelled
  // released nothing.
  const wasAccepted = trade.status === 'accepted';
  const { rows: itemRows } = wasAccepted
    ? await db.query<{ sticker_variant_id: string; direction: 'offer' | 'want' }>(
        `SELECT sticker_variant_id, direction FROM trade_items WHERE trade_id = $1`,
        [tradeId],
      )
    : { rows: [] as { sticker_variant_id: string; direction: 'offer' | 'want' }[] };

  await db.query(
    `UPDATE trade_requests
     SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [tradeId]
  );
  await sendSystemMessage(db, redis, tradeId, 'Trade cancelled.');
  await publishTradeEvent(redis, tradeId, 'status_changed', { trade_id: tradeId, status: 'cancelled' });

  if (wasAccepted) {
    await notifyRestoredAvailability(db, redis, tradeId, [
      {
        userId: trade.requester_id,
        variantIds: itemRows.filter((i) => i.direction === 'offer').map((i) => i.sticker_variant_id),
      },
      {
        userId: trade.recipient_id,
        variantIds: itemRows.filter((i) => i.direction === 'want').map((i) => i.sticker_variant_id),
      },
    ]);
  }
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

    await client.query(
      `UPDATE trade_requests
       SET status = 'completed', completed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [tradeId]
    );

    if (items.length > 0) {
      // Build per-item "from / to" tuples once.
      const fromAlbumIds: string[] = [];
      const toAlbumIds:   string[] = [];
      const variantIds:   string[] = [];
      const quantities:   number[] = [];
      for (const item of items) {
        const [from, to] = item.direction === 'offer'
          ? [requesterAlbumId, recipientAlbumId]
          : [recipientAlbumId, requesterAlbumId];
        fromAlbumIds.push(from);
        toAlbumIds.push(to);
        variantIds.push(item.sticker_variant_id);
        quantities.push(item.quantity);
      }

      // Lock source rows and validate stock. Locking via a separate SELECT
      // FOR UPDATE on existing rows avoids the FOR UPDATE / LEFT JOIN
      // nullable-side restriction in PostgreSQL.
      const { rows: sourceRows } = await client.query<{
        album_id: string; sticker_variant_id: string; quantity: number;
      }>(
        `SELECT us.album_id, us.sticker_variant_id, us.quantity
         FROM user_stickers us
         WHERE (us.album_id, us.sticker_variant_id) IN (
           SELECT t.album_id, t.sticker_variant_id
           FROM unnest($1::uuid[], $2::uuid[]) AS t(album_id, sticker_variant_id)
         )
         FOR UPDATE`,
        [fromAlbumIds, variantIds]
      );

      const stockMap = new Map(
        sourceRows.map((r) => [`${r.album_id}:${r.sticker_variant_id}`, r.quantity])
      );
      const shortfall = fromAlbumIds.some(
        (albumId, i) => (stockMap.get(`${albumId}:${variantIds[i]}`) ?? 0) < quantities[i]!
      );

      if (shortfall) {
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

      // Bulk decrement source inventory.
      await client.query(
        `UPDATE user_stickers us
         SET quantity = us.quantity - t.qty, updated_at = NOW()
         FROM unnest($1::uuid[], $2::uuid[], $3::int[]) AS t(album_id, sticker_variant_id, qty)
         WHERE us.album_id = t.album_id AND us.sticker_variant_id = t.sticker_variant_id`,
        [fromAlbumIds, variantIds, quantities]
      );

      // Bulk upsert destination inventory. Aggregating by (album_id, variant_id)
      // first avoids the ON CONFLICT cardinality-violation case where the same
      // destination row would be inserted twice in one statement.
      await client.query(
        `INSERT INTO user_stickers (album_id, sticker_variant_id, quantity)
         SELECT album_id, sticker_variant_id, SUM(qty)::int
         FROM unnest($1::uuid[], $2::uuid[], $3::int[]) AS t(album_id, sticker_variant_id, qty)
         GROUP BY album_id, sticker_variant_id
         ON CONFLICT (album_id, sticker_variant_id)
         DO UPDATE SET quantity = user_stickers.quantity + EXCLUDED.quantity, updated_at = NOW()`,
        [toAlbumIds, variantIds, quantities]
      );

      await client.query(
        `DELETE FROM user_stickers WHERE album_id IN ($1, $2) AND quantity <= 0`,
        [requesterAlbumId, recipientAlbumId]
      );
    }

    // Counts maintained by trg_user_stickers_sync_counts as user_stickers
    // mutate inside this transaction.

    // Audit trail — recorded inside the trade tx so a dispute query can
    // reconstruct who completed what and when. metadata holds the variant set
    // since trade_items is the source of truth and may be archived later.
    await recordAuditBulk(client, [requesterId, recipientId], 'trade_completed', {
      tradeId,
      items: items.map((i) => ({
        stickerVariantId: i.sticker_variant_id,
        direction: i.direction,
        quantity: i.quantity,
      })),
    });

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
