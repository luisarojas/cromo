import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import crypto from 'node:crypto';

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
  sticker_id: string;
  number: number;
  album_code: string;
  player_name: string | null;
  position: string | null;
  sticker_type: string;
  album_page: number | null;
  notes: string | null;
  team_name: string | null;
  fifa_code: string | null;
  group_name: string | null;
}

export interface MissingItem {
  variant_id: string;
  id: string;
  number: number;
  album_code: string;
  player_name: string | null;
  position: string | null;
  sticker_type: string;
  album_page: number | null;
  notes: string | null;
  team_name: string | null;
  fifa_code: string | null;
  group_name: string | null;
}

export interface DuplicateItem {
  user_sticker_id: string;
  sticker_variant_id: string;
  variant_type: string;
  quantity: number;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hashFilters(filters: object): string {
  return crypto
    .createHash('md5')
    .update(JSON.stringify(filters))
    .digest('hex');
}

async function invalidateUserCaches(redis: Redis, userId: string): Promise<void> {
  const patterns = [
    `user:${userId}:collection:*`,
    `user:${userId}:summary`,
    `user:${userId}:duplicates`,
  ];

  for (const pattern of patterns) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * getCollection — paginated list of stickers the user owns.
 * Cached per (userId + filters) for 5 minutes.
 */
export async function getCollection(
  db: Pool,
  redis: Redis,
  userId: string,
  filters: CollectionFilters
): Promise<PaginatedResult<CollectionItem>> {
  const limit = Math.min(filters.limit ?? 50, 200);
  const normalised = { ...filters, limit };
  const cacheKey = `user:${userId}:collection:${hashFilters(normalised)}`;

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
            s.id AS sticker_id,
            s.number,
            s.album_code,
            s.player_name,
            s.position,
            s.sticker_type,
            s.album_page,
            s.notes,
            t.name AS team_name,
            t.fifa_code,
            t.group_name
     FROM user_stickers us
     JOIN sticker_variants sv ON us.sticker_variant_id = sv.id
     JOIN stickers s ON sv.sticker_id = s.id
     LEFT JOIN teams t ON s.team_id = t.id
     WHERE us.user_id = $1
       AND us.quantity > 0
       AND ($2::text IS NULL OR t.fifa_code = $2)
       AND ($3::text IS NULL OR t.group_name = $3)
       AND ($4::text IS NULL OR s.sticker_type = $4)
       AND ($5::text IS NULL OR sv.variant_type = $5)
       AND ($6::int IS NULL OR s.number > $6)
     ORDER BY s.number
     LIMIT $7`,
    [userId, team ?? null, group ?? null, type ?? null, variant ?? null, cursor ?? null, limit + 1]
  );

  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? pageItems[pageItems.length - 1].number : null;

  const { rows: countRows } = await db.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM user_stickers us
     JOIN sticker_variants sv ON us.sticker_variant_id = sv.id
     JOIN stickers s ON sv.sticker_id = s.id
     LEFT JOIN teams t ON s.team_id = t.id
     WHERE us.user_id = $1
       AND us.quantity > 0
       AND ($2::text IS NULL OR t.fifa_code = $2)
       AND ($3::text IS NULL OR t.group_name = $3)
       AND ($4::text IS NULL OR s.sticker_type = $4)
       AND ($5::text IS NULL OR sv.variant_type = $5)`,
    [userId, team ?? null, group ?? null, type ?? null, variant ?? null]
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
 * getMissing — paginated list of base stickers NOT in the user's collection.
 * Cached per (userId + filters) for 5 minutes.
 */
export async function getMissing(
  db: Pool,
  redis: Redis,
  userId: string,
  filters: MissingFilters
): Promise<PaginatedResult<MissingItem>> {
  const limit = Math.min(filters.limit ?? 50, 200);
  const normalised = { ...filters, limit };
  const cacheKey = `user:${userId}:missing:${hashFilters(normalised)}`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as PaginatedResult<MissingItem>;
  }

  const { team, group, cursor } = filters;

  const { rows: items } = await db.query<MissingItem>(
    `SELECT sv.id AS variant_id,
            s.id,
            s.number,
            s.album_code,
            s.player_name,
            s.position,
            s.sticker_type,
            s.album_page,
            s.notes,
            t.name AS team_name,
            t.fifa_code,
            t.group_name
     FROM sticker_variants sv
     JOIN stickers s ON sv.sticker_id = s.id
     LEFT JOIN teams t ON s.team_id = t.id
     LEFT JOIN user_stickers us ON us.sticker_variant_id = sv.id AND us.user_id = $1
     WHERE sv.variant_type = 'base'
       AND (us.id IS NULL OR us.quantity = 0)
       AND ($2::text IS NULL OR t.fifa_code = $2)
       AND ($3::text IS NULL OR t.group_name = $3)
       AND ($4::int IS NULL OR s.number > $4)
     ORDER BY s.number
     LIMIT $5`,
    [userId, team ?? null, group ?? null, cursor ?? null, limit + 1]
  );

  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? pageItems[pageItems.length - 1].number : null;

  const { rows: countRows } = await db.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM sticker_variants sv
     JOIN stickers s ON sv.sticker_id = s.id
     LEFT JOIN teams t ON s.team_id = t.id
     LEFT JOIN user_stickers us ON us.sticker_variant_id = sv.id AND us.user_id = $1
     WHERE sv.variant_type = 'base'
       AND (us.id IS NULL OR us.quantity = 0)
       AND ($2::text IS NULL OR t.fifa_code = $2)
       AND ($3::text IS NULL OR t.group_name = $3)`,
    [userId, team ?? null, group ?? null]
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
 * getDuplicates — stickers in the user's collection with quantity > 1.
 * Cached for 5 minutes.
 */
export async function getDuplicates(
  db: Pool,
  redis: Redis,
  userId: string,
  cursor?: number,
  limit = 50
): Promise<PaginatedResult<DuplicateItem>> {
  const pageSize = Math.min(limit, 200);
  const cacheKey = `user:${userId}:duplicates:${cursor ?? 0}:${pageSize}`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as PaginatedResult<DuplicateItem>;
  }

  const { rows: items } = await db.query<DuplicateItem>(
    `SELECT us.id AS user_sticker_id,
            us.sticker_variant_id,
            sv.variant_type,
            us.quantity,
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
     WHERE us.user_id = $1
       AND us.quantity > 1
       AND ($2::int IS NULL OR s.number > $2)
     ORDER BY s.number
     LIMIT $3`,
    [userId, cursor ?? null, pageSize + 1]
  );

  const hasMore = items.length > pageSize;
  const pageItems = hasMore ? items.slice(0, pageSize) : items;
  const nextCursor = hasMore ? pageItems[pageItems.length - 1].number : null;

  const { rows: countRows } = await db.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM user_stickers us
     WHERE us.user_id = $1 AND us.quantity > 1`,
    [userId]
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
 * getStats — completion statistics for a user's collection.
 * Cached for 5 minutes.
 */
export async function getStats(
  db: Pool,
  redis: Redis,
  userId: string
): Promise<CollectionStats> {
  const cacheKey = `user:${userId}:summary`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as CollectionStats;
  }

  const { rows } = await db.query<{
    total: string;
    owned: string;
    duplicates: string;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM sticker_variants sv2
        JOIN stickers s2 ON sv2.sticker_id = s2.id
        WHERE sv2.variant_type = 'base') AS total,
       COUNT(DISTINCT us.sticker_variant_id) AS owned,
       SUM(CASE WHEN us.quantity > 1 THEN 1 ELSE 0 END) AS duplicates
     FROM user_stickers us
     WHERE us.user_id = $1
       AND us.quantity > 0`,
    [userId]
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
 * addSticker — upsert a sticker variant into the user's collection.
 * Invalidates all user caches.
 */
export async function addSticker(
  db: Pool,
  redis: Redis,
  userId: string,
  variantId: string,
  quantity = 1
): Promise<void> {
  await db.query(
    `INSERT INTO user_stickers (user_id, sticker_variant_id, quantity)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, sticker_variant_id)
     DO UPDATE SET quantity = user_stickers.quantity + EXCLUDED.quantity,
                   updated_at = NOW()`,
    [userId, variantId, quantity]
  );

  await invalidateUserCaches(redis, userId);
}

/**
 * updateSticker — set an exact quantity for a sticker variant.
 * If quantity is 0, the record is deleted. Invalidates user caches.
 */
export async function updateSticker(
  db: Pool,
  redis: Redis,
  userId: string,
  variantId: string,
  quantity: number
): Promise<void> {
  if (quantity <= 0) {
    await db.query(
      `DELETE FROM user_stickers WHERE user_id = $1 AND sticker_variant_id = $2`,
      [userId, variantId]
    );
  } else {
    await db.query(
      `UPDATE user_stickers
       SET quantity = $3, updated_at = NOW()
       WHERE user_id = $1 AND sticker_variant_id = $2`,
      [userId, variantId, quantity]
    );
  }

  await invalidateUserCaches(redis, userId);
}

/**
 * removeSticker — delete a sticker variant from the user's collection entirely.
 * Invalidates user caches.
 */
export async function removeSticker(
  db: Pool,
  redis: Redis,
  userId: string,
  variantId: string
): Promise<void> {
  await db.query(
    `DELETE FROM user_stickers WHERE user_id = $1 AND sticker_variant_id = $2`,
    [userId, variantId]
  );

  await invalidateUserCaches(redis, userId);
}
