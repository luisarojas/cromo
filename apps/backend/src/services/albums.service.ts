import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { DEFAULT_ALBUM_TYPE_KEY, DEFAULT_ALBUM_EDITION_KEY, DEFAULT_ALBUM_FORMAT_KEY } from '../constants.js';
import { withTx } from '../db/transaction.js';
import { invalidateUserCaches, userCacheKey } from './cache.js';
import { statusError } from '../utils/errors.js';

const MAX_ALBUMS_PER_USER = 10;

import type { AlbumSettings } from '@stickfolio/shared';
export type { AlbumSettings };

export interface UserAlbum {
  id: string;
  user_id: string;
  album_type_id: string;
  album_type_key: string;
  album_type_name: string;
  album_type_guide_path: string | null;
  album_edition_id: string;
  edition: string;        // edition key, e.g. 'north_america'
  edition_name: string;
  album_format_id: string;
  format: string;         // format key, e.g. 'softcover_standard'
  format_name: string;
  alias: string | null;
  notes: string | null;
  is_default: boolean;
  settings: AlbumSettings;
  is_trade_inventory_public: boolean;
  created_at: string;
  updated_at: string;
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
         at.guide_path AS album_type_guide_path,
         ua.album_edition_id, ae.key AS edition, ae.name AS edition_name,
         ua.album_format_id,  af.key AS format,  af.name AS format_name,
         ua.alias, ua.notes, ua.is_default, ua.settings,
         ua.is_trade_inventory_public,
         ua.created_at, ua.updated_at
  FROM user_albums ua
  JOIN album_types at ON at.id = ua.album_type_id
  JOIN album_editions ae ON ae.id = ua.album_edition_id
  JOIN album_formats af  ON af.id = ua.album_format_id`;

// Whitelisted sort modes so the API can ship server-side ordering without
// risking SQL injection on the ORDER BY clause.
const ALBUM_SORTS: Record<string, string> = {
  default: 'ua.is_default DESC, ua.created_at ASC',
  created_desc: 'ua.created_at DESC',
  created_asc: 'ua.created_at ASC',
  completion_desc: `(CASE WHEN ua.total_count > 0
                          THEN (ua.owned_count::float / ua.total_count)
                          ELSE 0 END) DESC, ua.is_default DESC, ua.created_at ASC`,
  completion_asc: `(CASE WHEN ua.total_count > 0
                          THEN (ua.owned_count::float / ua.total_count)
                          ELSE 0 END) ASC, ua.is_default DESC, ua.created_at ASC`,
  alias_asc: `LOWER(COALESCE(ua.alias, '')) ASC, ua.created_at ASC`,
};

export type AlbumSort = keyof typeof ALBUM_SORTS;

export async function listAlbums(
  db: Pool,
  userId: string,
  sort: string = 'default',
  albumTypeName?: string,
): Promise<UserAlbum[]> {
  const orderBy = ALBUM_SORTS[sort] ?? ALBUM_SORTS.default;
  const { rows } = await db.query<UserAlbum>(
    `${ALBUM_SELECT}
     WHERE ua.user_id = $1
       AND ($2::text IS NULL OR at.name = $2)
     ORDER BY ${orderBy}`,
    [userId, albumTypeName ?? null],
  );
  return rows;
}

/**
 * listAlbumsWithStats — single-query variant of listAlbums that also returns
 * the trigger-maintained completion counts as a nested `stats` field. Used by
 * the dashboard so it can drop the two follow-up round-trips it used to make
 * (one for aggregate stats, one for per-album stats).
 */
const ALBUM_SELECT_WITH_COUNTS = `
  SELECT ua.id, ua.user_id, ua.album_type_id,
         at.key AS album_type_key, at.name AS album_type_name,
         ua.album_edition_id, ae.key AS edition, ae.name AS edition_name,
         ua.album_format_id,  af.key AS format,  af.name AS format_name,
         ua.alias, ua.notes, ua.is_default, ua.settings,
         ua.is_trade_inventory_public,
         ua.created_at, ua.updated_at,
         ua.total_count, ua.owned_count, ua.duplicate_count
  FROM user_albums ua
  JOIN album_types at ON at.id = ua.album_type_id
  JOIN album_editions ae ON ae.id = ua.album_edition_id
  JOIN album_formats af  ON af.id = ua.album_format_id`;

export async function listAlbumsWithStats(
  db: Pool,
  userId: string,
  sort: string = 'default',
  albumTypeName?: string,
): Promise<UserAlbumWithStats[]> {
  const orderBy = ALBUM_SORTS[sort] ?? ALBUM_SORTS.default;
  const { rows } = await db.query<UserAlbum & {
    total_count: number;
    owned_count: number;
    duplicate_count: number;
  }>(
    `${ALBUM_SELECT_WITH_COUNTS}
     WHERE ua.user_id = $1
       AND ($2::text IS NULL OR at.name = $2)
     ORDER BY ${orderBy}`,
    [userId, albumTypeName ?? null],
  );
  return rows.map(({ total_count, owned_count, duplicate_count, ...album }) => ({
    ...album,
    stats: {
      album_id: album.id,
      total: total_count,
      owned: owned_count,
      missing: total_count - owned_count,
      duplicates: duplicate_count,
      percentage: total_count > 0
        ? parseFloat(((owned_count / total_count) * 100).toFixed(2))
        : 0,
    },
  }));
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
    notes?: string | null;
    edition?: string;
    format?: string;
    settings?: Partial<AlbumSettings>;
    isTradeInventoryPublic?: boolean;
  }
): Promise<UserAlbum> {
  const { rows: countRows } = await db.query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM user_albums WHERE user_id = $1',
    [userId]
  );
  if (parseInt(countRows[0]!.count, 10) >= MAX_ALBUMS_PER_USER) {
    throw statusError(`Album limit reached (max ${MAX_ALBUMS_PER_USER}).`, 400);
  }

  const editionKey = input.edition ?? DEFAULT_ALBUM_EDITION_KEY;
  const formatKey = input.format ?? DEFAULT_ALBUM_FORMAT_KEY;
  const alias = input.alias ?? null;
  const notes = input.notes ?? null;
  const settings = input.settings ? JSON.stringify(input.settings) : null;
  const isTradeInventoryPublic = input.isTradeInventoryPublic ?? false;

  let rows: UserAlbum[];
  try {
    ({ rows } = await db.query<UserAlbum>(
      `WITH ins AS (
         INSERT INTO user_albums (user_id, album_type_id, album_edition_id, album_format_id, alias, notes, is_default, settings, is_trade_inventory_public)
         VALUES (
           $1,
           (SELECT id FROM album_types WHERE key = $5),
           (SELECT ae.id FROM album_editions ae
            JOIN album_types at ON at.id = ae.album_type_id
            WHERE at.key = $5 AND ae.key = $2),
           (SELECT af.id FROM album_formats af
            JOIN album_types at ON at.id = af.album_type_id
            WHERE at.key = $5 AND af.key = $7),
           $3,
           $8,
           false,
           COALESCE($4::jsonb, '{"includeExtras":true,"includeCocaCola":true}'::jsonb),
           $6
         )
         RETURNING *
       )
       ${ALBUM_SELECT.replace('FROM user_albums ua', 'FROM ins ua')}`,
      [userId, editionKey, alias, settings, DEFAULT_ALBUM_TYPE_KEY, isTradeInventoryPublic, formatKey, notes]
    ));
  } catch (err) {
    // Composite FK on (edition, format) rejects illegal combinations like
    // "North America + Metallised Softcover". Surface a 400 rather than 500.
    if (err instanceof Error && /user_albums_edition_format_valid/.test(err.message)) {
      throw statusError(`Format "${formatKey}" is not available for edition "${editionKey}".`, 400);
    }
    throw err;
  }
  // Counts are seeded by trg_user_albums_sync_counts (AFTER INSERT trigger).
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
    notes?: string | null;
    edition?: string;
    format?: string;
    settings?: Partial<AlbumSettings>;
    isTradeInventoryPublic?: boolean;
  }
): Promise<UserAlbum | null> {
  if (
    'alias' in patch === false &&
    'notes' in patch === false &&
    patch.edition === undefined &&
    patch.format === undefined &&
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
  if ('notes' in patch) {
    values.push(patch.notes);
    setClauses.push(`notes = $${values.length}`);
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
  if (patch.format !== undefined) {
    values.push(patch.format);
    setClauses.push(
      `album_format_id = (
         SELECT af.id FROM album_formats af
         WHERE af.album_type_id = user_albums.album_type_id AND af.key = $${values.length}
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

  let rows: UserAlbum[];
  try {
    ({ rows } = await db.query<UserAlbum>(
      `WITH upd AS (
         UPDATE user_albums SET ${setClauses.join(', ')}
         WHERE id = $1 AND user_id = $2
         RETURNING *
       )
       ${ALBUM_SELECT.replace('FROM user_albums ua', 'FROM upd ua')}`,
      values
    ));
  } catch (err) {
    if (err instanceof Error && /user_albums_edition_format_valid/.test(err.message)) {
      throw statusError(
        `Format "${patch.format ?? '(current)'}" is not available for edition "${patch.edition ?? '(current)'}".`,
        400,
      );
    }
    throw err;
  }
  if (rows[0]) {
    // Settings/edition changes are picked up by trg_user_albums_sync_counts.
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
    throw statusError('Album not found.', 404);
  }

  return withTx(db, async (client) => {
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
    return rows[0]!;
  });
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
    throw statusError('Album not found.', 404);
  }

  if (rows[0]!.is_default) {
    throw statusError('Cannot delete the default album.', 400);
  }

  // Cascades to user_stickers via FK ON DELETE CASCADE
  await db.query('DELETE FROM user_albums WHERE id = $1 AND user_id = $2', [albumId, userId]);
  await invalidateUserCaches(redis, userId);
}

export interface CrossAlbumAlbumRef {
  id: string;
  name: string;
}

export interface CrossAlbum {
  needed_in: Record<string, CrossAlbumAlbumRef[]>;
  available_in: Record<string, CrossAlbumAlbumRef[]>;
  present_in: Record<string, CrossAlbumAlbumRef[]>;
}

/**
 * getCrossAlbum — for the album the user is viewing, compute three maps
 * keyed by sticker album_code:
 *   needed_in    — other user_albums that do NOT own a code the active album owns
 *   available_in — other user_albums with duplicates of a code
 *   present_in   — other user_albums that also own a code
 *
 * This replaces three client-side useMemo passes over the full
 * /albums/summary payload. The work the client used to do (Map building,
 * difference computation across all other albums' owned_album_codes) is now
 * a single SQL query that aggregates straight from user_stickers.
 */
export async function getCrossAlbum(
  db: Pool,
  redis: Redis,
  userId: string,
  activeAlbumId: string,
): Promise<CrossAlbum> {
  const cacheKey = await userCacheKey(redis, userId, `cross_album:${activeAlbumId}`);
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as CrossAlbum;

  const { rows } = await db.query<{
    album_code: string;
    needed_in: CrossAlbumAlbumRef[];
    available_in: CrossAlbumAlbumRef[];
    present_in: CrossAlbumAlbumRef[];
  }>(
    `WITH other_albums AS (
       SELECT ua.id,
              COALESCE(ua.alias, at.name) AS name
       FROM user_albums ua
       JOIN album_types at ON at.id = ua.album_type_id
       WHERE ua.user_id = $1 AND ua.id <> $2
     ),
     active_owned AS (
       SELECT DISTINCT s.album_code
       FROM user_stickers us
       JOIN sticker_variants sv ON sv.id = us.sticker_variant_id
       JOIN stickers s ON s.id = sv.sticker_id
       WHERE us.album_id = $2 AND us.quantity > 0
     ),
     other_owned AS (
       SELECT ua.id AS album_id,
              ua.name,
              s.album_code,
              MAX(us.quantity) AS max_quantity
       FROM other_albums ua
       JOIN user_stickers us ON us.album_id = ua.id
       JOIN sticker_variants sv ON sv.id = us.sticker_variant_id
       JOIN stickers s ON s.id = sv.sticker_id
       WHERE us.quantity > 0
       GROUP BY ua.id, ua.name, s.album_code
     )
     SELECT
       ao.album_code,
       COALESCE(
         (SELECT jsonb_agg(jsonb_build_object('id', oa.id, 'name', oa.name) ORDER BY oa.name)
          FROM other_albums oa
          WHERE NOT EXISTS (
            SELECT 1 FROM other_owned oo
            WHERE oo.album_id = oa.id AND oo.album_code = ao.album_code
          )),
         '[]'::jsonb
       ) AS needed_in,
       COALESCE(
         (SELECT jsonb_agg(jsonb_build_object('id', oo.album_id, 'name', oo.name) ORDER BY oo.name)
          FROM other_owned oo
          WHERE oo.album_code = ao.album_code AND oo.max_quantity > 1),
         '[]'::jsonb
       ) AS available_in,
       COALESCE(
         (SELECT jsonb_agg(jsonb_build_object('id', oo.album_id, 'name', oo.name) ORDER BY oo.name)
          FROM other_owned oo
          WHERE oo.album_code = ao.album_code),
         '[]'::jsonb
       ) AS present_in
     FROM active_owned ao`,
    [userId, activeAlbumId],
  );

  const result: CrossAlbum = { needed_in: {}, available_in: {}, present_in: {} };
  for (const row of rows) {
    if (row.needed_in.length > 0) result.needed_in[row.album_code] = row.needed_in;
    if (row.available_in.length > 0) result.available_in[row.album_code] = row.available_in;
    if (row.present_in.length > 0) result.present_in[row.album_code] = row.present_in;
  }

  await redis.set(cacheKey, JSON.stringify(result), 'EX', 300);
  return result;
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
    throw statusError('Source and target albums must be different.', 400);
  }

  const { rows: albumRows } = await db.query<{ id: string }>(
    `SELECT id FROM user_albums WHERE id = ANY($1) AND user_id = $2`,
    [[sourceAlbumId, targetAlbumId], userId]
  );

  if (albumRows.length !== 2) {
    throw statusError('One or both albums not found.', 404);
  }

  await withTx(db, async (client) => {
    const { rows: sourceRows } = await client.query<{ quantity: number }>(
      `SELECT quantity FROM user_stickers WHERE album_id = $1 AND sticker_variant_id = $2 FOR UPDATE`,
      [sourceAlbumId, variantId]
    );

    const sourceQty = sourceRows[0]?.quantity ?? 0;
    if (sourceQty < quantity) {
      throw statusError(`Source album only has ${sourceQty} of this sticker.`, 400);
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

    // trg_user_stickers_sync_counts maintains owned/duplicate/total counts on
    // both albums as user_stickers mutates inside this transaction.
  });

  await invalidateUserCaches(redis, userId);
}
