import type { Pool, PoolClient } from 'pg';
import type { Redis } from 'ioredis';
import { withTx } from '../db/transaction.js';
import { hashFilters, invalidateUserCaches, userCacheKey } from './cache.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CollectionFilters {
  team?: string;
  group?: string;
  type?: string;
  variant?: string;
  cursor?: number;
  limit?: number;
}

export interface MissingFilters {
  team?: string;
  group?: string;
  cursor?: number;
  limit?: number;
}

export interface CollectionItem {
  user_sticker_id: string;
  sticker_variant_id: string;
  variant_type: string;
  quantity: number;
  trade_hidden: boolean;
  trade_forced: boolean;
  sticker_id: string;
  number: number;
  album_code: string;
  player_name: string | null;
  position: string | null;
  sticker_type: string;
  notes: string | null;
  team_name: string | null;
  fifa_code: string | null;
  group_name: string | null;
  team_pages: Record<string, [number, number]> | null;
}

export interface MissingItem {
  id: string;
  number: number;
  album_code: string;
  player_name: string | null;
  position: string | null;
  sticker_type: string;
  is_foil: boolean;
  notes: string | null;
  team_name: string | null;
  fifa_code: string | null;
  group_name: string | null;
  base_variant_id: string | null;
  team_pages: Record<string, [number, number]> | null;
}

export interface DuplicateItem {
  user_sticker_id: string;
  sticker_variant_id: string;
  variant_type: string;
  quantity: number;
  trade_hidden: boolean;
  trade_forced: boolean;
  sticker_id: string;
  number: number;
  album_code: string;
  player_name: string | null;
  sticker_type: string;
  is_foil: boolean;
  team_name: string | null;
  fifa_code: string | null;
  group_name: string | null;
}

export interface CollectionStats {
  total: number;
  owned: number;
  missing: number;
  duplicates: number;
  percentage: number;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: number | null;
  total: number;
}

import type { FilterOptionsDto } from '@stickfolio/shared';
export type FilterOptions = FilterOptionsDto;

export interface CollectionPage extends PaginatedResult<CollectionItem> {
  stats: CollectionStats;
  totalExtraCopies: number;
  filterOptions: FilterOptions;
}

export { invalidateUserCaches } from './cache.js';

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * getCollection — paginated list of stickers owned in a specific album.
 * Cached per (albumId + filters) for 5 minutes.
 */
export async function getCollection(
  db: Pool,
  redis: Redis,
  userId: string,
  albumId: string,
  filters: CollectionFilters
): Promise<PaginatedResult<CollectionItem>> {
  const limit = Math.min(filters.limit ?? 50, 1000);
  const normalised = { ...filters, limit };
  const cacheKey = await userCacheKey(redis, userId, `collection:${albumId}:${hashFilters(normalised)}`);

  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as PaginatedResult<CollectionItem>;
  }

  const { team, group, type, variant, cursor } = filters;

  // One round-trip via window function. The inner SELECT applies the static
  // filters (album + facets); COUNT(*) OVER () is evaluated over THAT set, so
  // `total` is unaffected by cursor pagination. The outer query then applies
  // cursor + LIMIT to slice a page. team_pages_json is hoisted to a CTE keyed
  // on distinct team_ids so the STABLE helper executes once per team in the
  // page rather than once per row.
  const { rows: items } = await db.query<CollectionItem & { total_count: string }>(
    `WITH page AS (
       SELECT us.id AS user_sticker_id,
              us.sticker_variant_id,
              sv.variant_type,
              us.quantity,
              us.trade_hidden,
              us.trade_forced,
              s.id AS sticker_id,
              s.number,
              s.album_code,
              s.player_name,
              s.position,
              s.sticker_type,
              s.notes,
              s.team_id,
              t.name AS team_name,
              t.fifa_code,
              t.group_name,
              COUNT(*) OVER () AS total_count
       FROM user_stickers us
       JOIN sticker_variants sv ON us.sticker_variant_id = sv.id
       JOIN stickers s ON sv.sticker_id = s.id
       LEFT JOIN teams t ON s.team_id = t.id
       WHERE us.album_id = $1
         AND us.quantity > 0
         AND ($2::text IS NULL OR t.fifa_code = $2)
         AND ($3::text IS NULL OR t.group_name = $3)
         AND ($4::text IS NULL OR s.sticker_type = $4)
         AND ($5::text IS NULL OR sv.variant_type = $5)
     ),
     team_pages AS (
       SELECT DISTINCT team_id, team_pages_json(team_id) AS team_pages
       FROM page WHERE team_id IS NOT NULL
     )
     SELECT page.user_sticker_id, page.sticker_variant_id, page.variant_type,
            page.quantity, page.trade_hidden, page.trade_forced,
            page.sticker_id, page.number, page.album_code, page.player_name,
            page.position, page.sticker_type, page.notes,
            page.team_name, page.fifa_code, page.group_name,
            tp.team_pages,
            page.total_count
     FROM page
     LEFT JOIN team_pages tp ON tp.team_id = page.team_id
     WHERE ($6::int IS NULL OR page.number > $6)
     ORDER BY page.number
     LIMIT $7`,
    [albumId, team ?? null, group ?? null, type ?? null, variant ?? null, cursor ?? null, limit + 1]
  );

  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? pageItems[pageItems.length - 1]!.number : null;
  const total = items[0] ? parseInt(items[0].total_count, 10) : 0;

  // total_count is implementation detail of the page query — strip it before
  // returning so the wire format matches CollectionItem.
  for (const row of pageItems) {
    delete (row as Partial<typeof row>).total_count;
  }

  const result: PaginatedResult<CollectionItem> = {
    items: pageItems,
    nextCursor,
    total,
  };

  await redis.set(cacheKey, JSON.stringify(result), 'EX', 300);

  return result;
}

/**
 * getMissing — paginated list of stickers NOT in the specified album.
 * Cached per (albumId + filters) for 5 minutes.
 */
export async function getMissing(
  db: Pool,
  redis: Redis,
  userId: string,
  albumId: string,
  filters: MissingFilters
): Promise<PaginatedResult<MissingItem>> {
  const limit = Math.min(filters.limit ?? 50, 1000);
  const normalised = { ...filters, limit };
  const cacheKey = await userCacheKey(redis, userId, `missing:${albumId}:${hashFilters(normalised)}`);

  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as PaginatedResult<MissingItem>;
  }

  const { team, group, cursor } = filters;

  const { rows: items } = await db.query<MissingItem & { total_count: string }>(
    `WITH page AS (
       SELECT s.id,
              s.number,
              s.album_code,
              s.player_name,
              s.position,
              s.sticker_type,
              s.is_foil,
              s.notes,
              s.team_id,
              t.name AS team_name,
              t.fifa_code,
              t.group_name,
              base_sv.id AS base_variant_id,
              COUNT(*) OVER () AS total_count
       FROM stickers s
       LEFT JOIN teams t ON s.team_id = t.id
       LEFT JOIN LATERAL (
         SELECT id FROM sticker_variants
         WHERE sticker_id = s.id
           AND variant_type IN ('base_border', 'base_borderless')
         ORDER BY rarity_rank LIMIT 1
       ) base_sv ON true
       WHERE NOT EXISTS (
         SELECT 1
         FROM user_stickers us
         JOIN sticker_variants sv ON us.sticker_variant_id = sv.id
         WHERE sv.sticker_id = s.id
           AND us.album_id = $1
           AND us.quantity > 0
       )
         AND ($2::text IS NULL OR t.fifa_code = $2)
         AND ($3::text IS NULL OR t.group_name = $3)
     ),
     team_pages AS (
       SELECT DISTINCT team_id, team_pages_json(team_id) AS team_pages
       FROM page WHERE team_id IS NOT NULL
     )
     SELECT page.id, page.number, page.album_code, page.player_name,
            page.position, page.sticker_type, page.is_foil, page.notes,
            page.team_name, page.fifa_code, page.group_name,
            page.base_variant_id, tp.team_pages,
            page.total_count
     FROM page
     LEFT JOIN team_pages tp ON tp.team_id = page.team_id
     WHERE ($4::int IS NULL OR page.number > $4)
     ORDER BY page.number
     LIMIT $5`,
    [albumId, team ?? null, group ?? null, cursor ?? null, limit + 1]
  );

  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? pageItems[pageItems.length - 1]!.number : null;
  const total = items[0] ? parseInt(items[0].total_count, 10) : 0;
  for (const row of pageItems) {
    delete (row as Partial<typeof row>).total_count;
  }

  const result: PaginatedResult<MissingItem> = {
    items: pageItems,
    nextCursor,
    total,
  };

  await redis.set(cacheKey, JSON.stringify(result), 'EX', 300);

  return result;
}

/**
 * getDuplicates — stickers in the album with quantity > 1.
 * Cached for 5 minutes.
 */
export async function getDuplicates(
  db: Pool,
  redis: Redis,
  userId: string,
  albumId: string,
  cursor?: number,
  limit = 50
): Promise<PaginatedResult<DuplicateItem>> {
  const pageSize = Math.min(limit, 1000);
  const cacheKey = await userCacheKey(redis, userId, `duplicates:${albumId}:${cursor ?? 0}:${pageSize}`);

  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as PaginatedResult<DuplicateItem>;
  }

  const { rows: items } = await db.query<DuplicateItem & { total_count: string }>(
    `SELECT * FROM (
       SELECT us.id AS user_sticker_id,
              us.sticker_variant_id,
              sv.variant_type,
              us.quantity,
              us.trade_hidden,
              us.trade_forced,
              s.id AS sticker_id,
              s.number,
              s.album_code,
              s.player_name,
              s.sticker_type,
              s.is_foil,
              t.name AS team_name,
              t.fifa_code,
              t.group_name,
              COUNT(*) OVER () AS total_count
       FROM user_stickers us
       JOIN sticker_variants sv ON us.sticker_variant_id = sv.id
       JOIN stickers s ON sv.sticker_id = s.id
       LEFT JOIN teams t ON s.team_id = t.id
       WHERE us.album_id = $1
         AND us.quantity > 1
     ) page
     WHERE ($2::int IS NULL OR page.number > $2)
     ORDER BY page.number
     LIMIT $3`,
    [albumId, cursor ?? null, pageSize + 1]
  );

  const hasMore = items.length > pageSize;
  const pageItems = hasMore ? items.slice(0, pageSize) : items;
  const nextCursor = hasMore ? pageItems[pageItems.length - 1]!.number : null;
  const total = items[0] ? parseInt(items[0].total_count, 10) : 0;
  for (const row of pageItems) {
    delete (row as Partial<typeof row>).total_count;
  }

  const result: PaginatedResult<DuplicateItem> = {
    items: pageItems,
    nextCursor,
    total,
  };

  await redis.set(cacheKey, JSON.stringify(result), 'EX', 300);

  return result;
}

/**
 * getStats — completion statistics for an album. Reads the denormalized
 * owned_count / duplicate_count / total_count maintained by every write.
 */
export async function getStats(
  db: Pool,
  _redis: Redis,
  _userId: string,
  albumId: string
): Promise<CollectionStats> {
  const { rows } = await db.query<{
    total: number;
    owned: number;
    duplicates: number;
  }>(
    `SELECT total_count AS total,
            owned_count AS owned,
            duplicate_count AS duplicates
     FROM user_albums WHERE id = $1`,
    [albumId],
  );

  const row = rows[0];
  const total = row?.total ?? 0;
  const owned = row?.owned ?? 0;
  const duplicates = row?.duplicates ?? 0;
  const missing = total - owned;
  const percentage = total > 0 ? parseFloat(((owned / total) * 100).toFixed(2)) : 0;

  return { total, owned, missing, duplicates, percentage };
}

/**
 * getStatsAndExtras — combined query returning album stats + total extra
 * copies in a single round trip. Replaces parallel getStats + getTotalExtraCopies
 * calls in getCollectionPage (2 connection acquires → 1).
 */
async function getStatsAndExtras(
  db: Pool,
  albumId: string,
): Promise<{ stats: CollectionStats; totalExtraCopies: number }> {
  const { rows } = await db.query<{
    total: number;
    owned: number;
    duplicates: number;
    extra: number;
  }>(
    `SELECT ua.total_count     AS total,
            ua.owned_count     AS owned,
            ua.duplicate_count AS duplicates,
            COALESCE((
              SELECT SUM(GREATEST(us.quantity - 1, 0))::int
              FROM user_stickers us WHERE us.album_id = ua.id
            ), 0) AS extra
     FROM user_albums ua WHERE ua.id = $1`,
    [albumId],
  );

  const row = rows[0];
  const total = row?.total ?? 0;
  const owned = row?.owned ?? 0;
  const duplicates = row?.duplicates ?? 0;
  const missing = total - owned;
  const percentage = total > 0 ? parseFloat(((owned / total) * 100).toFixed(2)) : 0;
  return {
    stats: { total, owned, missing, duplicates, percentage },
    totalExtraCopies: row?.extra ?? 0,
  };
}

/**
 * getFilterOptions — distinct (group, team, type, variant) values currently
 * present in the user's collection for the given album. Cached under the
 * user's versioned namespace so the four GROUP BY aggregates don't re-run on
 * every collection-page load.
 */
export async function getFilterOptions(
  db: Pool,
  redis: Redis,
  userId: string,
  albumId: string,
): Promise<FilterOptions> {
  const cacheKey = await userCacheKey(redis, userId, `filter_options:${albumId}`);
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as FilterOptions;

  const { rows } = await db.query<{
    groups: string[] | null;
    teams: { fifa_code: string; name: string }[] | null;
    types: string[] | null;
    variants: string[] | null;
  }>(
    `SELECT
       array_remove(array_agg(DISTINCT t.group_name), NULL) AS groups,
       COALESCE(
         jsonb_agg(DISTINCT jsonb_build_object('fifa_code', t.fifa_code, 'name', t.name))
           FILTER (WHERE t.fifa_code IS NOT NULL),
         '[]'::jsonb
       ) AS teams,
       array_remove(array_agg(DISTINCT s.sticker_type), NULL) AS types,
       array_remove(array_agg(DISTINCT sv.variant_type), NULL) AS variants
     FROM user_stickers us
     JOIN sticker_variants sv ON sv.id = us.sticker_variant_id
     JOIN stickers s ON s.id = sv.sticker_id
     LEFT JOIN teams t ON t.id = s.team_id
     WHERE us.album_id = $1 AND us.quantity > 0`,
    [albumId],
  );

  const row = rows[0];
  const rawTeams = (row?.teams ?? []) as unknown as { fifa_code: string; name: string }[];
  const result: FilterOptions = {
    groups: (row?.groups ?? []).sort(),
    teams: rawTeams.map((t) => ({ fifaCode: t.fifa_code, name: t.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    types: row?.types ?? [],
    variants: row?.variants ?? [],
  };

  await redis.set(cacheKey, JSON.stringify(result), 'EX', 300);
  return result;
}

/**
 * getTotalExtraCopies — sum of (quantity - 1) across all sticker_variants in
 * an album. Used by the UI's "Duplicates (12 / +37)" tab label.
 */
export async function getTotalExtraCopies(
  db: Pool,
  redis: Redis,
  userId: string,
  albumId: string,
): Promise<number> {
  const cacheKey = await userCacheKey(redis, userId, `extra_copies:${albumId}`);
  const cached = await redis.get(cacheKey);
  if (cached !== null) return Number.parseInt(cached, 10);

  const { rows } = await db.query<{ extra: number | null }>(
    `SELECT COALESCE(SUM(GREATEST(quantity - 1, 0)), 0)::int AS extra
     FROM user_stickers WHERE album_id = $1`,
    [albumId],
  );
  const extra = rows[0]?.extra ?? 0;
  await redis.set(cacheKey, String(extra), 'EX', 300);
  return extra;
}

/**
 * getCollectionPage — single endpoint returning collection items + stats +
 * filter options + extra-copies count for a given album. Replaces 3 round
 * trips (getCollection + getStats + client-side filter computation).
 */
export async function getCollectionPage(
  db: Pool,
  redis: Redis,
  userId: string,
  albumId: string,
  filters: CollectionFilters,
): Promise<CollectionPage> {
  const [page, statsAndExtras, filterOptions] = await Promise.all([
    getCollection(db, redis, userId, albumId, filters),
    getStatsAndExtras(db, albumId),
    getFilterOptions(db, redis, userId, albumId),
  ]);

  return {
    ...page,
    stats: statsAndExtras.stats,
    filterOptions,
    totalExtraCopies: statsAndExtras.totalExtraCopies,
  };
}

/**
 * addSticker — upsert a sticker variant into an album. Wrapped in a
 * transaction so the upsert + denormalized stats refresh stay consistent.
 */
export async function addSticker(
  db: Pool,
  redis: Redis,
  userId: string,
  albumId: string,
  variantId: string,
  quantity = 1
): Promise<void> {
  await withTx(db, async (client) => {
    await client.query(
      `INSERT INTO user_stickers (album_id, sticker_variant_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (album_id, sticker_variant_id)
       DO UPDATE SET quantity = user_stickers.quantity + EXCLUDED.quantity,
                     updated_at = NOW()`,
      [albumId, variantId, quantity]
    );
    // trg_user_stickers_sync_counts updates the album's counts.
  });

  await invalidateUserCaches(redis, userId);
}

/**
 * updateSticker — set exact quantity for a sticker variant in an album.
 * If quantity is 0, the record is deleted.
 */
export async function updateSticker(
  db: Pool,
  redis: Redis,
  userId: string,
  albumId: string,
  variantId: string,
  quantity: number
): Promise<void> {
  await withTx(db, async (client) => {
    if (quantity <= 0) {
      await client.query(
        `DELETE FROM user_stickers WHERE album_id = $1 AND sticker_variant_id = $2`,
        [albumId, variantId]
      );
    } else {
      await client.query(
        `INSERT INTO user_stickers (album_id, sticker_variant_id, quantity)
         VALUES ($1, $2, $3)
         ON CONFLICT (album_id, sticker_variant_id)
         DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW()`,
        [albumId, variantId, quantity]
      );
    }
    // Counts maintained by trg_user_stickers_sync_counts.
  });

  await invalidateUserCaches(redis, userId);
}

/**
 * setTradeFlags — update trade_hidden / trade_forced for a single user_sticker row.
 */
export async function setTradeFlags(
  db: Pool,
  redis: Redis,
  userId: string,
  albumId: string,
  variantId: string,
  flags: { tradeHidden?: boolean; tradeForced?: boolean }
): Promise<void> {
  const setParts: string[] = [];
  const values: (boolean | string)[] = [albumId, variantId];
  let idx = 3;

  const resolvedHidden = flags.tradeHidden ?? (flags.tradeForced ? false : undefined);
  const resolvedForced = flags.tradeForced ?? (flags.tradeHidden ? false : undefined);

  if (resolvedHidden !== undefined) {
    setParts.push(`trade_hidden = $${idx++}`);
    values.push(resolvedHidden);
  }
  if (resolvedForced !== undefined) {
    setParts.push(`trade_forced = $${idx++}`);
    values.push(resolvedForced);
  }

  if (setParts.length === 0) return;

  await db.query(
    `UPDATE user_stickers
     SET ${setParts.join(', ')}, updated_at = NOW()
     WHERE album_id = $1 AND sticker_variant_id = $2`,
    values
  );

  await invalidateUserCaches(redis, userId);
}

/**
 * removeSticker — delete a sticker variant from an album entirely.
 */
export async function removeSticker(
  db: Pool,
  redis: Redis,
  userId: string,
  albumId: string,
  variantId: string
): Promise<void> {
  await withTx(db, async (client) => {
    await client.query(
      `DELETE FROM user_stickers WHERE album_id = $1 AND sticker_variant_id = $2`,
      [albumId, variantId]
    );
    // Counts maintained by trg_user_stickers_sync_counts.
  });

  await invalidateUserCaches(redis, userId);
}

// ─── Wanted variants ──────────────────────────────────────────────────────────

export async function getWantedVariants(
  db: Pool,
  userId: string,
  albumId: string,
): Promise<string[]> {
  const { rows } = await db.query<{ sticker_variant_id: string }>(
    `SELECT sticker_variant_id FROM user_wanted_variants
     WHERE user_id = $1 AND album_id = $2`,
    [userId, albumId],
  );
  return rows.map((r) => r.sticker_variant_id);
}

export async function addWantedVariant(
  db: Pool,
  userId: string,
  albumId: string,
  variantId: string,
): Promise<void> {
  await db.query(
    `INSERT INTO user_wanted_variants (user_id, sticker_variant_id, album_id)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [userId, variantId, albumId],
  );
}

export async function removeWantedVariant(
  db: Pool,
  userId: string,
  albumId: string,
  variantId: string,
): Promise<void> {
  await db.query(
    `DELETE FROM user_wanted_variants
     WHERE user_id = $1 AND sticker_variant_id = $2 AND album_id = $3`,
    [userId, variantId, albumId],
  );
}
