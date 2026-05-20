import type { Pool } from 'pg';
import type { Redis } from 'ioredis';

export interface TradeMatch {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  mutual_overlap: number;
  they_have: string[];
  they_have_variant_ids: string[];
  you_have: string[];
  cities: { label: string; placeId: number }[];
}

export interface TradeMatchesPage {
  items: TradeMatch[];
  nextCursor: string | null;
  total: number;
}

const TRADE_MATCHES_DEFAULT_LIMIT = 50;
const TRADE_MATCHES_MAX_LIMIT = 200;
const TRADE_MATCHES_TTL_SECONDS = 120;

/**
 * Per-user index of trade-matches cache keys. invalidateMatches() (in
 * trade-requests.service.ts) uses this to drop a user's match cache in O(set
 * size) instead of SCANning the keyspace. The index TTL is kept slightly
 * longer than the cache TTL so a write can never produce an indexed key that
 * outlives its membership.
 */
export function matchesIndexKey(userId: string): string {
  return `trade:matches:idx:${userId}`;
}

/**
 * getTradeMatches — find users with mutual sticker overlap for trading.
 * Cursor-paginated by (mutual_overlap DESC, user_id ASC) so the heavy CTE
 * query runs once and large match sets stream in chunks. Cached for 2 min.
 */
export async function getTradeMatches(
  db: Pool,
  redis: Redis,
  userId: string,
  albumId: string,
  opts: { cursor?: string; limit?: number } = {},
): Promise<TradeMatchesPage> {
  const limit = Math.min(opts.limit ?? TRADE_MATCHES_DEFAULT_LIMIT, TRADE_MATCHES_MAX_LIMIT);
  // Cursor is the opaque `${overlap}:${userId}` from the previous page.
  let cursorOverlap: number | null = null;
  let cursorUserId: string | null = null;
  if (opts.cursor) {
    const [o, u] = opts.cursor.split(':');
    const n = Number.parseInt(o ?? '', 10);
    if (Number.isFinite(n) && u) {
      cursorOverlap = n;
      cursorUserId = u;
    }
  }
  const cacheKey = `trade:matches:${userId}:${albumId}:${opts.cursor ?? 'start'}:${limit}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as TradeMatchesPage;
  }

  const { rows } = await db.query<{
    user_id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    mutual_overlap: number;
    they_have: string[];
    they_have_variant_ids: string[];
    you_have: string[];
    cities: { label: string; placeId: number }[];
    total_count: string;
  }>(
    `WITH requester_album AS (
       SELECT album_type_id FROM user_albums WHERE id = $2
     ),
     my_missing AS (
       SELECT sv.id AS variant_id
       FROM sticker_variants sv
       WHERE sv.variant_type IN ('base_border', 'base_borderless')
         AND NOT EXISTS (
           SELECT 1 FROM user_stickers us
           WHERE us.album_id = $2
             AND us.sticker_variant_id = sv.id
             AND us.quantity > 0
         )
     ),
     my_duplicates AS (
       SELECT us.sticker_variant_id AS variant_id
       FROM user_stickers us
       WHERE us.album_id = $2
         AND (us.quantity > 1 OR us.trade_forced)
         AND NOT us.trade_hidden
     ),
     candidate_albums AS (
       SELECT DISTINCT ON (ua.user_id) ua.id AS album_id, ua.user_id
       FROM user_albums ua
       JOIN user_settings us2 ON us2.user_id = ua.user_id
       JOIN users u ON u.id = ua.user_id
       WHERE ua.user_id != $1
         AND ua.album_type_id = (SELECT album_type_id FROM requester_album)
         AND us2.trade_matching_enabled = true
         AND u.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM user_bans ub
           WHERE ub.user_id = ua.user_id
             AND ub.lifted_at IS NULL
             AND (ub.expires_at IS NULL OR ub.expires_at > NOW())
         )
       ORDER BY ua.user_id, ua.is_default DESC, ua.updated_at DESC
     ),
     they_have_my_missing AS (
       SELECT ca.user_id, ca.album_id, uss.sticker_variant_id AS variant_id, s.album_code
       FROM candidate_albums ca
       JOIN user_stickers uss ON uss.album_id = ca.album_id
       JOIN sticker_variants sv ON sv.id = uss.sticker_variant_id
       JOIN stickers s ON s.id = sv.sticker_id
       WHERE uss.sticker_variant_id IN (SELECT variant_id FROM my_missing)
         AND (uss.quantity > 1 OR uss.trade_forced)
         AND NOT uss.trade_hidden
     ),
     i_have_their_missing AS (
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
       SELECT DISTINCT thm.user_id, sv_all.id AS variant_id
       FROM they_have_my_missing thm
       JOIN sticker_variants sv_base ON sv_base.id = thm.variant_id
       JOIN sticker_variants sv_all ON sv_all.sticker_id = sv_base.sticker_id
       JOIN user_stickers uss ON uss.sticker_variant_id = sv_all.id
         AND uss.album_id = thm.album_id
         AND (uss.quantity > 1 OR uss.trade_forced)
         AND NOT uss.trade_hidden
     ),
     overlap_counts AS (
       SELECT
         mu.user_id,
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
       COALESCE(oc.you_have, ARRAY[]::text[]) AS you_have,
       COALESCE(us3.cities, '[]'::jsonb) AS cities,
       COUNT(*) OVER () AS total_count
     FROM overlap_counts oc
     JOIN users u ON u.id = oc.user_id
     LEFT JOIN user_settings us3 ON us3.user_id = oc.user_id
     WHERE ($3::int IS NULL OR (oc.mutual_overlap, oc.user_id) < ($3::int, $4::uuid))
     ORDER BY oc.mutual_overlap DESC, oc.user_id ASC
     LIMIT $5`,
    [userId, albumId, cursorOverlap, cursorUserId, limit + 1]
  );

  const total = rows[0] ? Number(rows[0].total_count ?? 0) : 0;
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const items: TradeMatch[] = pageRows.map((r) => ({
    user_id: r.user_id,
    username: r.username,
    display_name: r.display_name,
    avatar_url: r.avatar_url,
    mutual_overlap: Number(r.mutual_overlap),
    they_have: r.they_have ?? [],
    they_have_variant_ids: r.they_have_variant_ids ?? [],
    you_have: r.you_have ?? [],
    cities: r.cities ?? [],
  }));
  const last = pageRows[pageRows.length - 1];
  const nextCursor = hasMore && last ? `${last.mutual_overlap}:${last.user_id}` : null;

  const result: TradeMatchesPage = { items, nextCursor, total };
  const indexKey = matchesIndexKey(userId);
  await redis
    .multi()
    .set(cacheKey, JSON.stringify(result), 'EX', TRADE_MATCHES_TTL_SECONDS)
    .sadd(indexKey, cacheKey)
    .expire(indexKey, TRADE_MATCHES_TTL_SECONDS + 30)
    .exec();

  return result;
}
