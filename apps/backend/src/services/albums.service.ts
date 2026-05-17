import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { DEFAULT_ALBUM_TYPE_KEY, DEFAULT_ALBUM_EDITION_KEY } from '../constants.js';
import { invalidateUserCaches } from './cache.js';
import { recomputeAlbumStats } from './album-stats.service.js';

const MAX_ALBUMS_PER_USER = 10;

import type { AlbumSettings } from '@stickfolio/shared';
export type { AlbumSettings };

export interface UserAlbum {
  id: string;
  user_id: string;
  album_type_id: string;
  album_type_key: string;
  album_type_name: string;
  album_edition_id: string;
  edition: string;        // edition key, e.g. 'north_america'
  edition_name: string;
  alias: string | null;
  is_default: boolean;
  settings: AlbumSettings;
  is_trade_inventory_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface AlbumSummary {
  album_id: string;
  owned_album_codes: string[];
  duplicate_album_codes: string[];
}

export interface AlbumStats {
  album_id: string;
  total: number;
  owned: number;
  missing: number;
  duplicates: number;
  percentage: number;
}

export interface UserAlbumWithStats extends UserAlbum {
  stats: AlbumStats;
}

// ─── Service functions ────────────────────────────────────────────────────────

const ALBUM_SELECT = `
  SELECT ua.id, ua.user_id, ua.album_type_id,
         at.key AS album_type_key, at.name AS album_type_name,
         ua.album_edition_id, ae.key AS edition, ae.name AS edition_name,
         ua.alias, ua.is_default, ua.settings,
         ua.is_trade_inventory_public,
         ua.created_at, ua.updated_at
  FROM user_albums ua
  JOIN album_types at ON at.id = ua.album_type_id
  JOIN album_editions ae ON ae.id = ua.album_edition_id`;

export async function listAlbums(db: Pool, userId: string): Promise<UserAlbum[]> {
  const { rows } = await db.query<UserAlbum>(
    `${ALBUM_SELECT}
     WHERE ua.user_id = $1
     ORDER BY ua.is_default DESC, ua.created_at ASC`,
    [userId]
  );
  return rows;
}

export async function getAlbum(
  db: Pool,
  userId: string,
  albumId: string
): Promise<UserAlbum | null> {
  const { rows } = await db.query<UserAlbum>(
    `${ALBUM_SELECT}
     WHERE ua.id = $1 AND ua.user_id = $2`,
    [albumId, userId]
  );
  return rows[0] ?? null;
}

export async function getDefaultAlbumId(db: Pool, userId: string): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM user_albums WHERE user_id = $1 AND is_default = true LIMIT 1`,
    [userId]
  );
  return rows[0]?.id ?? null;
}

/**
 * Resolves an album ID for the given user. If albumId is provided, verifies it
 * belongs to the user. Otherwise returns the user's default album ID.
 */
export async function resolveAlbumId(
  db: Pool,
  userId: string,
  albumId?: string
): Promise<string | null> {
  if (albumId) {
    const { rows } = await db.query<{ id: string }>(
      `SELECT id FROM user_albums WHERE id = $1 AND user_id = $2`,
      [albumId, userId]
    );
    return rows[0]?.id ?? null;
  }
  return getDefaultAlbumId(db, userId);
}

export async function createAlbum(
  db: Pool,
  redis: Redis,
  userId: string,
  input: {
    alias?: string | null;
    edition?: string;
    settings?: Partial<AlbumSettings>;
    isTradeInventoryPublic?: boolean;
  }
): Promise<UserAlbum> {
  const { rows: countRows } = await db.query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM user_albums WHERE user_id = $1',
    [userId]
  );
  if (parseInt(countRows[0]!.count, 10) >= MAX_ALBUMS_PER_USER) {
    const err = new Error(`Album limit reached (max ${MAX_ALBUMS_PER_USER}).`) as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  const editionKey = input.edition ?? DEFAULT_ALBUM_EDITION_KEY;
  const alias = input.alias ?? null;
  const settings = input.settings ? JSON.stringify(input.settings) : null;
  const isTradeInventoryPublic = input.isTradeInventoryPublic ?? false;

  const { rows } = await db.query<UserAlbum>(
    `WITH ins AS (
       INSERT INTO user_albums (user_id, album_type_id, album_edition_id, alias, is_default, settings, is_trade_inventory_public)
       VALUES (
         $1,
         (SELECT id FROM album_types WHERE key = $5),
         (SELECT ae.id FROM album_editions ae
          JOIN album_types at ON at.id = ae.album_type_id
          WHERE at.key = $5 AND ae.key = $2),
         $3,
         false,
         COALESCE($4::jsonb, '{"includeExtras":true,"includeCocaCola":true}'::jsonb),
         $6
       )
       RETURNING *
     )
     ${ALBUM_SELECT.replace('FROM user_albums ua', 'FROM ins ua')}`,
    [userId, editionKey, alias, settings, DEFAULT_ALBUM_TYPE_KEY, isTradeInventoryPublic]
  );
  // New album starts empty but total_count depends on edition + settings.
  await recomputeAlbumStats(db, [rows[0]!.id]);
  await invalidateUserCaches(redis, userId);
  return rows[0]!;
}

export async function updateAlbum(
  db: Pool,
  redis: Redis,
  userId: string,
  albumId: string,
  patch: {
    alias?: string | null;
    edition?: string;
    settings?: Partial<AlbumSettings>;
    isTradeInventoryPublic?: boolean;
  }
): Promise<UserAlbum | null> {
  if (
    'alias' in patch === false &&
    patch.edition === undefined &&
    patch.settings === undefined &&
    patch.isTradeInventoryPublic === undefined
  ) {
    return getAlbum(db, userId, albumId);
  }

  const setClauses: string[] = ['updated_at = NOW()'];
  const values: unknown[] = [albumId, userId];

  if ('alias' in patch) {
    values.push(patch.alias);
    setClauses.push(`alias = $${values.length}`);
  }
  if (patch.edition !== undefined) {
    values.push(patch.edition);
    setClauses.push(
      `album_edition_id = (
         SELECT ae.id FROM album_editions ae
         WHERE ae.album_type_id = user_albums.album_type_id AND ae.key = $${values.length}
       )`
    );
  }
  if (patch.settings !== undefined) {
    values.push(JSON.stringify(patch.settings));
    setClauses.push(`settings = settings || $${values.length}::jsonb`);
  }
  if (patch.isTradeInventoryPublic !== undefined) {
    values.push(patch.isTradeInventoryPublic);
    setClauses.push(`is_trade_inventory_public = $${values.length}`);
  }

  const { rows } = await db.query<UserAlbum>(
    `WITH upd AS (
       UPDATE user_albums SET ${setClauses.join(', ')}
       WHERE id = $1 AND user_id = $2
       RETURNING *
     )
     ${ALBUM_SELECT.replace('FROM user_albums ua', 'FROM upd ua')}`,
    values
  );
  if (rows[0]) {
    // Settings or edition change can shift total_count and which stickers
    // fall under the per-album CTE. Recompute defensively on every patch.
    await recomputeAlbumStats(db, [rows[0].id]);
    await invalidateUserCaches(redis, userId);
  }
  return rows[0] ?? null;
}

export async function setDefaultAlbum(
  db: Pool,
  userId: string,
  albumId: string
): Promise<UserAlbum> {
  const { rows: check } = await db.query<{ id: string }>(
    'SELECT id FROM user_albums WHERE id = $1 AND user_id = $2',
    [albumId, userId]
  );
  if (check.length === 0) {
    const err = new Error('Album not found.') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE user_albums SET is_default = false, updated_at = NOW() WHERE user_id = $1',
      [userId]
    );
    const { rows } = await client.query<UserAlbum>(
      `WITH upd AS (
         UPDATE user_albums SET is_default = true, updated_at = NOW()
         WHERE id = $1 AND user_id = $2
         RETURNING *
       )
       ${ALBUM_SELECT.replace('FROM user_albums ua', 'FROM upd ua')}`,
      [albumId, userId]
    );
    await client.query('COMMIT');
    return rows[0]!;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteAlbum(
  db: Pool,
  redis: Redis,
  userId: string,
  albumId: string
): Promise<void> {
  const { rows } = await db.query<{ is_default: boolean }>(
    `SELECT is_default FROM user_albums WHERE id = $1 AND user_id = $2`,
    [albumId, userId]
  );

  if (rows.length === 0) {
    const err = new Error('Album not found.') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  if (rows[0]!.is_default) {
    const err = new Error('Cannot delete the default album.') as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  // Cascades to user_stickers via FK ON DELETE CASCADE
  await db.query('DELETE FROM user_albums WHERE id = $1 AND user_id = $2', [albumId, userId]);
  await invalidateUserCaches(redis, userId);
}

export async function getAlbumSummaries(
  db: Pool,
  redis: Redis,
  userId: string
): Promise<AlbumSummary[]> {
  const cacheKey = `user:${userId}:album_summaries`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as AlbumSummary[];

  const { rows } = await db.query<AlbumSummary>(
    `SELECT
       ua.id AS album_id,
       COALESCE(
         array_agg(DISTINCT s.album_code) FILTER (WHERE us.id IS NOT NULL AND us.quantity > 0),
         '{}'
       ) AS owned_album_codes,
       COALESCE(
         array_agg(DISTINCT s.album_code) FILTER (WHERE us.id IS NOT NULL AND us.quantity > 1),
         '{}'
       ) AS duplicate_album_codes
     FROM user_albums ua
     LEFT JOIN user_stickers us ON us.album_id = ua.id
     LEFT JOIN sticker_variants sv ON sv.id = us.sticker_variant_id
     LEFT JOIN stickers s ON s.id = sv.sticker_id
     WHERE ua.user_id = $1
     GROUP BY ua.id
     ORDER BY ua.is_default DESC, ua.created_at ASC`,
    [userId]
  );

  await redis.set(cacheKey, JSON.stringify(rows), 'EX', 300);
  return rows;
}

/**
 * getAlbumStats — per-album completion stats for ALL of a user's albums,
 * computed server-side respecting each album's edition + settings (which stickers
 * count toward the total based on `include_all_stickers`, `include_coca_cola`,
 * `include_non_album_museum`).
 *
 * Replaces the previous client-side `computeAlbumStats` that pulled the entire
 * sticker catalog and filtered in JS.
 */
export async function getAlbumStats(
  db: Pool,
  _redis: Redis,
  userId: string
): Promise<AlbumStats[]> {
  const { rows } = await db.query<{
    album_id: string;
    total: number;
    owned: number;
    duplicates: number;
  }>(
    `SELECT id AS album_id,
            total_count AS total,
            owned_count AS owned,
            duplicate_count AS duplicates
     FROM user_albums
     WHERE user_id = $1
     ORDER BY is_default DESC, created_at ASC`,
    [userId]
  );

  return rows.map((r) => ({
    album_id: r.album_id,
    total: r.total,
    owned: r.owned,
    missing: r.total - r.owned,
    duplicates: r.duplicates,
    percentage: r.total > 0 ? parseFloat(((r.owned / r.total) * 100).toFixed(2)) : 0,
  }));
}

/**
 * getAlbumStatsForOne — stats for a single album, used by create/update endpoints
 * so the frontend doesn't need to refetch after a mutation.
 */
export async function getAlbumStatsForOne(
  db: Pool,
  redis: Redis,
  userId: string,
  albumId: string
): Promise<AlbumStats | null> {
  const all = await getAlbumStats(db, redis, userId);
  return all.find((s) => s.album_id === albumId) ?? null;
}

export async function moveSticker(
  db: Pool,
  redis: Redis,
  userId: string,
  sourceAlbumId: string,
  targetAlbumId: string,
  variantId: string,
  quantity: number
): Promise<void> {
  if (sourceAlbumId === targetAlbumId) {
    const err = new Error('Source and target albums must be different.') as Error & {
      statusCode: number;
    };
    err.statusCode = 400;
    throw err;
  }

  const { rows: albumRows } = await db.query<{ id: string }>(
    `SELECT id FROM user_albums WHERE id = ANY($1) AND user_id = $2`,
    [[sourceAlbumId, targetAlbumId], userId]
  );

  if (albumRows.length !== 2) {
    const err = new Error('One or both albums not found.') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: sourceRows } = await client.query<{ quantity: number }>(
      `SELECT quantity FROM user_stickers WHERE album_id = $1 AND sticker_variant_id = $2`,
      [sourceAlbumId, variantId]
    );

    const sourceQty = sourceRows[0]?.quantity ?? 0;
    if (sourceQty < quantity) {
      const err = new Error(
        `Source album only has ${sourceQty} of this sticker.`
      ) as Error & { statusCode: number };
      err.statusCode = 400;
      throw err;
    }

    if (sourceQty - quantity <= 0) {
      await client.query(
        `DELETE FROM user_stickers WHERE album_id = $1 AND sticker_variant_id = $2`,
        [sourceAlbumId, variantId]
      );
    } else {
      await client.query(
        `UPDATE user_stickers SET quantity = quantity - $3, updated_at = NOW()
         WHERE album_id = $1 AND sticker_variant_id = $2`,
        [sourceAlbumId, variantId, quantity]
      );
    }

    await client.query(
      `INSERT INTO user_stickers (album_id, sticker_variant_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (album_id, sticker_variant_id)
       DO UPDATE SET quantity = user_stickers.quantity + EXCLUDED.quantity, updated_at = NOW()`,
      [targetAlbumId, variantId, quantity]
    );

    await recomputeAlbumStats(client, [sourceAlbumId, targetAlbumId]);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await invalidateUserCaches(redis, userId);
}
