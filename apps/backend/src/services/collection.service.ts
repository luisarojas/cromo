import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { hashFilters, invalidateUserCaches } from './cache.js';

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
  const cacheKey = `user:${userId}:collection:${albumId}:${hashFilters(normalised)}`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as PaginatedResult<CollectionItem>;
  }

  const { team, group, type, variant, cursor } = filters;

  const { rows: items } = await db.query<CollectionItem>(
    `SELECT us.id AS user_sticker_id,
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
            t.name AS team_name,
            t.fifa_code,
            t.group_name,
            (SELECT jsonb_object_agg(tap.edition, jsonb_build_array(tap.page_start, tap.page_end))
             FROM team_album_pages tap WHERE tap.team_id = s.team_id) AS team_pages
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
       AND ($6::int IS NULL OR s.number > $6)
     ORDER BY s.number
     LIMIT $7`,
    [albumId, team ?? null, group ?? null, type ?? null, variant ?? null, cursor ?? null, limit + 1]
  );

  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? pageItems[pageItems.length - 1]!.number : null;

  const { rows: countRows } = await db.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM user_stickers us
     JOIN sticker_variants sv ON us.sticker_variant_id = sv.id
     JOIN stickers s ON sv.sticker_id = s.id
     LEFT JOIN teams t ON s.team_id = t.id
     WHERE us.album_id = $1
       AND us.quantity > 0
       AND ($2::text IS NULL OR t.fifa_code = $2)
       AND ($3::text IS NULL OR t.group_name = $3)
       AND ($4::text IS NULL OR s.sticker_type = $4)
       AND ($5::text IS NULL OR sv.variant_type = $5)`,
    [albumId, team ?? null, group ?? null, type ?? null, variant ?? null]
  );

  const result: PaginatedResult<CollectionItem> = {
    items: pageItems,
    nextCursor,
    total: parseInt(countRows[0]?.count ?? '0', 10),
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
  const cacheKey = `user:${userId}:missing:${albumId}:${hashFilters(normalised)}`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as PaginatedResult<MissingItem>;
  }

  const { team, group, cursor } = filters;

  const { rows: items } = await db.query<MissingItem>(
    `SELECT s.id,
            s.number,
            s.album_code,
            s.player_name,
            s.position,
            s.sticker_type,
            s.is_foil,
            s.notes,
            t.name AS team_name,
            t.fifa_code,
            t.group_name,
            base_sv.id AS base_variant_id,
            (SELECT jsonb_object_agg(tap.edition, jsonb_build_array(tap.page_start, tap.page_end))
             FROM team_album_pages tap WHERE tap.team_id = s.team_id) AS team_pages
     FROM stickers s
     LEFT JOIN teams t ON s.team_id = t.id
     LEFT JOIN sticker_variants base_sv
       ON base_sv.sticker_id = s.id AND base_sv.variant_type = 'base'
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
       AND ($4::int IS NULL OR s.number > $4)
     ORDER BY s.number
     LIMIT $5`,
    [albumId, team ?? null, group ?? null, cursor ?? null, limit + 1]
  );

  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? pageItems[pageItems.length - 1]!.number : null;

  const { rows: countRows } = await db.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM stickers s
     LEFT JOIN teams t ON s.team_id = t.id
     WHERE NOT EXISTS (
       SELECT 1
       FROM user_stickers us
       JOIN sticker_variants sv ON us.sticker_variant_id = sv.id
       WHERE sv.sticker_id = s.id
         AND us.album_id = $1
         AND us.quantity > 0
     )
       AND ($2::text IS NULL OR t.fifa_code = $2)
       AND ($3::text IS NULL OR t.group_name = $3)`,
    [albumId, team ?? null, group ?? null]
  );

  const result: PaginatedResult<MissingItem> = {
    items: pageItems,
    nextCursor,
    total: parseInt(countRows[0]?.count ?? '0', 10),
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
  const cacheKey = `user:${userId}:duplicates:${albumId}:${cursor ?? 0}:${pageSize}`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as PaginatedResult<DuplicateItem>;
  }

  const { rows: items } = await db.query<DuplicateItem>(
    `SELECT us.id AS user_sticker_id,
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
            t.group_name
     FROM user_stickers us
     JOIN sticker_variants sv ON us.sticker_variant_id = sv.id
     JOIN stickers s ON sv.sticker_id = s.id
     LEFT JOIN teams t ON s.team_id = t.id
     WHERE us.album_id = $1
       AND us.quantity > 1
       AND ($2::int IS NULL OR s.number > $2)
     ORDER BY s.number
     LIMIT $3`,
    [albumId, cursor ?? null, pageSize + 1]
  );

  const hasMore = items.length > pageSize;
  const pageItems = hasMore ? items.slice(0, pageSize) : items;
  const nextCursor = hasMore ? pageItems[pageItems.length - 1]!.number : null;

  const { rows: countRows } = await db.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM user_stickers us WHERE us.album_id = $1 AND us.quantity > 1`,
    [albumId]
  );

  const result: PaginatedResult<DuplicateItem> = {
    items: pageItems,
    nextCursor,
    total: parseInt(countRows[0]?.count ?? '0', 10),
  };

  await redis.set(cacheKey, JSON.stringify(result), 'EX', 300);

  return result;
}

/**
 * getStats — completion statistics for a specific album.
 * Cached for 5 minutes.
 */
export async function getStats(
  db: Pool,
  redis: Redis,
  userId: string,
  albumId: string
): Promise<CollectionStats> {
  const cacheKey = `user:${userId}:summary:${albumId}`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as CollectionStats;
  }

  const { rows } = await db.query<{
    total: string;
    owned: string;
    duplicates: string;
  }>(
    `WITH album_stats AS (
       SELECT
         COUNT(DISTINCT sv.sticker_id) FILTER (WHERE us.quantity > 0) AS owned,
         COUNT(*)                      FILTER (WHERE us.quantity > 1) AS duplicates
       FROM user_stickers us
       JOIN sticker_variants sv ON us.sticker_variant_id = sv.id
       WHERE us.album_id = $1
     )
     SELECT
       (SELECT COUNT(*) FROM stickers)::text AS total,
       owned::text,
       duplicates::text
     FROM album_stats`,
    [albumId]
  );

  const row = rows[0];
  const total = parseInt(row?.total ?? '0', 10);
  const owned = parseInt(row?.owned ?? '0', 10);
  const duplicates = parseInt(row?.duplicates ?? '0', 10);
  const missing = total - owned;
  const percentage = total > 0 ? parseFloat(((owned / total) * 100).toFixed(2)) : 0;

  const stats: CollectionStats = { total, owned, missing, duplicates, percentage };

  await redis.set(cacheKey, JSON.stringify(stats), 'EX', 300);

  return stats;
}

/**
 * addSticker — upsert a sticker variant into an album.
 * Invalidates all user caches.
 */
export async function addSticker(
  db: Pool,
  redis: Redis,
  userId: string,
  albumId: string,
  variantId: string,
  quantity = 1
): Promise<void> {
  await db.query(
    `INSERT INTO user_stickers (album_id, sticker_variant_id, quantity)
     VALUES ($1, $2, $3)
     ON CONFLICT (album_id, sticker_variant_id)
     DO UPDATE SET quantity = user_stickers.quantity + EXCLUDED.quantity,
                   updated_at = NOW()`,
    [albumId, variantId, quantity]
  );

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
  if (quantity <= 0) {
    await db.query(
      `DELETE FROM user_stickers WHERE album_id = $1 AND sticker_variant_id = $2`,
      [albumId, variantId]
    );
  } else {
    await db.query(
      `UPDATE user_stickers
       SET quantity = $3, updated_at = NOW()
       WHERE album_id = $1 AND sticker_variant_id = $2`,
      [albumId, variantId, quantity]
    );
  }

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
  await db.query(
    `DELETE FROM user_stickers WHERE album_id = $1 AND sticker_variant_id = $2`,
    [albumId, variantId]
  );

  await invalidateUserCaches(redis, userId);
}
