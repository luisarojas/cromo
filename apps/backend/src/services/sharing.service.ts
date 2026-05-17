import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import crypto from 'node:crypto';
import { env } from '../env.js';

const PUBLIC_PROFILE_CACHE_TTL_S = 60 * 60;
const PUBLIC_WANTED_DEFAULT_LIMIT = 100;
const PUBLIC_WANTED_MAX_LIMIT = 500;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ShareLinkRow {
  id: string;
  user_id: string;
  list_type: string;
  share_token: string;
  expires_at: string | null;
  created_at: string;
  url: string;
}

export interface PublicListItem {
  sticker_variant_id: string;
  number: number;
  album_code: string;
  player_name: string | null;
  sticker_type: string;
  team_name: string | null;
  variant_type: string;
  quantity: number | null;
}

export interface PublicListResult {
  owner: {
    username: string;
    display_name: string | null;
  };
  list_type: string;
  items: PublicListItem[];
  created_at: string;
}

export interface PublicInventoryItem {
  sticker_variant_id: string;
  number: number;
  album_code: string;
  player_name: string | null;
  sticker_type: string;
  team_name: string | null;
  variant_type: string;
  quantity: number | null;
}

export interface PublicProfileAlbum {
  album_id: string;
  album_type_name: string;
  edition_name: string;
  alias: string | null;
  is_default: boolean;
  offered: PublicInventoryItem[];
  wanted_count: number;
}

export interface PublicProfile {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  member_since: string;
  trading_inventory: PublicProfileAlbum[];
}

export interface PublicWantedPage {
  items: PublicInventoryItem[];
  next_cursor: number | null;
  total: number;
}

type ListType = 'missing' | 'duplicates' | 'full_collection';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildShareUrl(token: string): string {
  return `${env.FRONTEND_URL}/share/${token}`;
}

function makeError(message: string, statusCode: number): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * createShareLink — insert a new share link row for the user.
 */
export async function createShareLink(
  db: Pool,
  userId: string,
  listType: ListType,
  _albumId: string
): Promise<ShareLinkRow> {
  const token = crypto.randomBytes(24).toString('base64url');
  const id = crypto.randomUUID();

  const { rows } = await db.query<{
    id: string;
    user_id: string;
    list_type: string;
    share_token: string;
    expires_at: string | null;
    created_at: string;
  }>(
    `INSERT INTO public_lists (id, user_id, list_type, share_token, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     RETURNING id, user_id, list_type, share_token, expires_at, created_at`,
    [id, userId, listType, token]
  );

  const row = rows[0]!;
  return { ...row, url: buildShareUrl(row.share_token) };
}

/**
 * listShareLinks — return all share links owned by the user.
 */
export async function listShareLinks(db: Pool, userId: string): Promise<ShareLinkRow[]> {
  const { rows } = await db.query<{
    id: string;
    user_id: string;
    list_type: string;
    share_token: string;
    expires_at: string | null;
    created_at: string;
  }>(
    `SELECT id, user_id, list_type, share_token, expires_at, created_at
     FROM public_lists
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );

  return rows.map((r) => ({ ...r, url: buildShareUrl(r.share_token) }));
}

/**
 * revokeShareLink — delete a share link by token, only if owned by userId.
 */
export async function revokeShareLink(
  db: Pool,
  userId: string,
  token: string
): Promise<void> {
  const result = await db.query(
    `DELETE FROM public_lists WHERE share_token = $1 AND user_id = $2`,
    [token, userId]
  );

  if ((result.rowCount ?? 0) === 0) {
    throw makeError('Share link not found.', 404);
  }
}

/**
 * getPublicList — fetch sticker list for a share token (no auth required).
 * Returns null if token doesn't exist or has expired.
 */
export async function getPublicList(
  db: Pool,
  token: string
): Promise<PublicListResult | null> {
  const { rows: linkRows } = await db.query<{
    id: string;
    user_id: string;
    list_type: string;
    expires_at: string | null;
    created_at: string;
    username: string;
    display_name: string | null;
  }>(
    `SELECT
       pl.id,
       pl.user_id,
       pl.list_type,
       pl.expires_at,
       pl.created_at,
       u.username,
       u.display_name
     FROM public_lists pl
     JOIN users u ON u.id = pl.user_id
     WHERE pl.share_token = $1
       AND u.deleted_at IS NULL`,
    [token]
  );

  if (linkRows.length === 0) return null;

  const link = linkRows[0]!;

  // Check expiry
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return null;
  }

  // Get owner's default album
  const { rows: albumRows } = await db.query<{ id: string }>(
    `SELECT id FROM user_albums WHERE user_id = $1 AND is_default = true LIMIT 1`,
    [link.user_id]
  );

  if (albumRows.length === 0) {
    return {
      owner: { username: link.username, display_name: link.display_name },
      list_type: link.list_type,
      items: [],
      created_at: link.created_at,
    };
  }

  const albumId = albumRows[0]!.id;
  let items: PublicListItem[] = [];

  if (link.list_type === 'missing') {
    const { rows } = await db.query<PublicListItem>(
      `SELECT
         COALESCE(sv.id, s.id) AS sticker_variant_id,
         s.number,
         s.album_code,
         s.player_name,
         s.sticker_type,
         t.name AS team_name,
         COALESCE(sv.variant_type, 'base') AS variant_type,
         NULL::int AS quantity
       FROM stickers s
       LEFT JOIN teams t ON t.id = s.team_id
       LEFT JOIN sticker_variants sv ON sv.sticker_id = s.id AND sv.variant_type = 'base'
       WHERE NOT EXISTS (
         SELECT 1 FROM user_stickers us
         JOIN sticker_variants sv2 ON sv2.id = us.sticker_variant_id
         WHERE sv2.sticker_id = s.id
           AND us.album_id = $1
           AND us.quantity > 0
       )
       ORDER BY s.number`,
      [albumId]
    );
    items = rows;
  } else if (link.list_type === 'duplicates') {
    const { rows } = await db.query<PublicListItem>(
      `SELECT
         us.sticker_variant_id,
         s.number,
         s.album_code,
         s.player_name,
         s.sticker_type,
         t.name AS team_name,
         sv.variant_type,
         us.quantity
       FROM user_stickers us
       JOIN sticker_variants sv ON sv.id = us.sticker_variant_id
       JOIN stickers s ON s.id = sv.sticker_id
       LEFT JOIN teams t ON t.id = s.team_id
       WHERE us.album_id = $1
         AND us.quantity > 1
       ORDER BY s.number`,
      [albumId]
    );
    items = rows;
  } else {
    // full_collection
    const { rows } = await db.query<PublicListItem>(
      `SELECT
         us.sticker_variant_id,
         s.number,
         s.album_code,
         s.player_name,
         s.sticker_type,
         t.name AS team_name,
         sv.variant_type,
         us.quantity
       FROM user_stickers us
       JOIN sticker_variants sv ON sv.id = us.sticker_variant_id
       JOIN stickers s ON s.id = sv.sticker_id
       LEFT JOIN teams t ON t.id = s.team_id
       WHERE us.album_id = $1
         AND us.quantity > 0
       ORDER BY s.number`,
      [albumId]
    );
    items = rows;
  }

  return {
    owner: { username: link.username, display_name: link.display_name },
    list_type: link.list_type,
    items,
    created_at: link.created_at,
  };
}

/**
 * getPublicProfile — fetch a user's public profile by username.
 *
 * Privacy gates:
 *   1. `users.deleted_at IS NULL` and `user_settings.profile_visibility != 'private'`
 *      else returns null (route surfaces 404).
 *   2. Only albums with `user_albums.is_trade_inventory_public = true` are exposed.
 *   3. The Offered list honors per-variant `trade_hidden` / `trade_forced` flags.
 *
 * Performance:
 *   - Two batched SQL round trips total (albums+wanted_count, offered items).
 *   - Result is cached in Redis under `user:{id}:public_profile` with a 1-hour TTL.
 *     Cache is busted by `invalidateUserCaches` whenever the user mutates albums,
 *     stickers, or trade flags.
 *
 * The full Wanted list is intentionally NOT returned here — only its count — so
 * a profile with thousands of missing stickers stays a small payload. The
 * `getPublicAlbumWanted` function below serves the paginated wanted list.
 */
export async function getPublicProfile(
  db: Pool,
  redis: Redis,
  username: string
): Promise<PublicProfile | null> {
  const { rows: userRows } = await db.query<{
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    created_at: string;
    profile_visibility: string | null;
  }>(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, u.created_at,
            us.profile_visibility
     FROM users u
     LEFT JOIN user_settings us ON us.user_id = u.id
     WHERE u.username = $1 AND u.deleted_at IS NULL`,
    [username]
  );

  if (userRows.length === 0) return null;
  const user = userRows[0]!;
  if (user.profile_visibility === 'private') return null;

  const cacheKey = `user:${user.id}:public_profile`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    const inventory = JSON.parse(cached) as PublicProfileAlbum[];
    return {
      user_id: user.id,
      username: user.username,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      member_since: user.created_at,
      trading_inventory: inventory,
    };
  }

  // Batched query #1: public albums + wanted-count (respecting AlbumSettings filters).
  const { rows: albumRows } = await db.query<{
    album_id: string;
    album_type_name: string;
    edition_name: string;
    alias: string | null;
    is_default: boolean;
    wanted_count: string;
  }>(
    `WITH public_albums AS (
       SELECT ua.id              AS album_id,
              ua.album_type_id,
              ua.alias,
              ua.is_default,
              ua.created_at,
              at.name            AS album_type_name,
              ae.name            AS edition_name,
              (ua.settings->>'includeExtras')::boolean   AS inc_extras,
              (ua.settings->>'includeCocaCola')::boolean AS inc_coca
       FROM user_albums ua
       JOIN album_types at    ON at.id = ua.album_type_id
       JOIN album_editions ae ON ae.id = ua.album_edition_id
       WHERE ua.user_id = $1
         AND ua.is_trade_inventory_public = true
     ),
     filtered_stickers AS (
       SELECT pa.album_id, s.id AS sticker_id
       FROM public_albums pa
       JOIN stickers s ON s.album_type_id = pa.album_type_id
       WHERE CASE
         WHEN s.sticker_type = 'coca_cola_special' THEN pa.inc_coca
         WHEN s.sticker_type = 'extra' THEN pa.inc_extras
         ELSE true
       END
     ),
     wanted_counts AS (
       SELECT fs.album_id, COUNT(*)::text AS wanted_count
       FROM filtered_stickers fs
       WHERE NOT EXISTS (
         SELECT 1 FROM user_stickers us
         JOIN sticker_variants sv2 ON sv2.id = us.sticker_variant_id
         WHERE sv2.sticker_id = fs.sticker_id
           AND us.album_id = fs.album_id
           AND us.quantity > 0
       )
       GROUP BY fs.album_id
     )
     SELECT pa.album_id,
            pa.album_type_name,
            pa.edition_name,
            pa.alias,
            pa.is_default,
            COALESCE(wc.wanted_count, '0') AS wanted_count
     FROM public_albums pa
     LEFT JOIN wanted_counts wc ON wc.album_id = pa.album_id
     ORDER BY pa.is_default DESC, pa.created_at ASC`,
    [user.id]
  );

  // Batched query #2: all offered items across all public albums.
  const { rows: offeredRows } = await db.query<{
    album_id: string;
    sticker_variant_id: string;
    number: number;
    album_code: string;
    player_name: string | null;
    sticker_type: string;
    team_name: string | null;
    variant_type: string;
    quantity: number;
  }>(
    `SELECT us.album_id,
            us.sticker_variant_id,
            s.number,
            s.album_code,
            s.player_name,
            s.sticker_type,
            t.name           AS team_name,
            sv.variant_type,
            us.quantity
     FROM user_stickers us
     JOIN user_albums ua      ON ua.id = us.album_id
     JOIN sticker_variants sv ON sv.id = us.sticker_variant_id
     JOIN stickers s          ON s.id = sv.sticker_id
     LEFT JOIN teams t        ON t.id = s.team_id
     WHERE ua.user_id = $1
       AND ua.is_trade_inventory_public = true
       AND (us.quantity > 1 OR us.trade_forced)
       AND NOT us.trade_hidden
     ORDER BY us.album_id, s.number, sv.variant_type`,
    [user.id]
  );

  const offeredByAlbum = new Map<string, PublicInventoryItem[]>();
  for (const row of offeredRows) {
    const bucket = offeredByAlbum.get(row.album_id) ?? [];
    bucket.push({
      sticker_variant_id: row.sticker_variant_id,
      number: row.number,
      album_code: row.album_code,
      player_name: row.player_name,
      sticker_type: row.sticker_type,
      team_name: row.team_name,
      variant_type: row.variant_type,
      quantity: row.quantity,
    });
    offeredByAlbum.set(row.album_id, bucket);
  }

  const trading_inventory: PublicProfileAlbum[] = albumRows.map((a) => ({
    album_id: a.album_id,
    album_type_name: a.album_type_name,
    edition_name: a.edition_name,
    alias: a.alias,
    is_default: a.is_default,
    offered: offeredByAlbum.get(a.album_id) ?? [],
    wanted_count: parseInt(a.wanted_count, 10),
  }));

  await redis.set(cacheKey, JSON.stringify(trading_inventory), 'EX', PUBLIC_PROFILE_CACHE_TTL_S);

  return {
    user_id: user.id,
    username: user.username,
    display_name: user.display_name,
    avatar_url: user.avatar_url,
    member_since: user.created_at,
    trading_inventory,
  };
}

/**
 * getPublicAlbumWanted — paginated Wanted list for one public album.
 *
 * Applies the album's sticker-visibility filters (includeExtras,
 * includeCocaCola). Each item references the
 * lowest-rarity-rank variant for the sticker (the canonical "base" variant in
 * practice), giving callers a real sticker_variant_id they can hand to the
 * trade composer.
 *
 * Cursor is the previous page's last `number` (stickers within an album_type
 * have a unique number).
 */
export async function getPublicAlbumWanted(
  db: Pool,
  redis: Redis,
  username: string,
  albumId: string,
  cursor: number | null,
  limit: number
): Promise<PublicWantedPage | null> {
  const pageSize = Math.min(Math.max(limit | 0, 1), PUBLIC_WANTED_MAX_LIMIT);

  const { rows: userRows } = await db.query<{
    id: string;
    profile_visibility: string | null;
  }>(
    `SELECT u.id, us.profile_visibility
     FROM users u
     LEFT JOIN user_settings us ON us.user_id = u.id
     WHERE u.username = $1 AND u.deleted_at IS NULL`,
    [username]
  );
  if (userRows.length === 0) return null;
  const { id: userId, profile_visibility } = userRows[0]!;
  if (profile_visibility === 'private') return null;

  // Confirm the album belongs to this user AND is flagged public.
  const { rowCount } = await db.query(
    `SELECT 1 FROM user_albums
     WHERE id = $1 AND user_id = $2 AND is_trade_inventory_public = true`,
    [albumId, userId]
  );
  if ((rowCount ?? 0) === 0) return null;

  const cacheKey = `user:${userId}:public_wanted:${albumId}:${cursor ?? 'start'}:${pageSize}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as PublicWantedPage;

  const { rows: items } = await db.query<PublicInventoryItem & { number: number }>(
    `WITH album_info AS (
       SELECT ua.id              AS album_id,
              ua.album_type_id,
              (ua.settings->>'includeExtras')::boolean   AS inc_extras,
              (ua.settings->>'includeCocaCola')::boolean AS inc_coca
       FROM user_albums ua
       WHERE ua.id = $1
     ),
     filtered_stickers AS (
       SELECT s.id AS sticker_id, s.number, s.album_code, s.player_name,
              s.sticker_type, s.team_id
       FROM album_info ai
       JOIN stickers s ON s.album_type_id = ai.album_type_id
       WHERE CASE
         WHEN s.sticker_type = 'coca_cola_special' THEN ai.inc_coca
         WHEN s.sticker_type = 'extra' THEN ai.inc_extras
         ELSE true
       END
     ),
     missing_stickers AS (
       SELECT fs.*
       FROM filtered_stickers fs
       WHERE NOT EXISTS (
         SELECT 1 FROM user_stickers us
         JOIN sticker_variants sv2 ON sv2.id = us.sticker_variant_id
         WHERE sv2.sticker_id = fs.sticker_id
           AND us.album_id = $1
           AND us.quantity > 0
       )
     ),
     canonical_variant AS (
       SELECT DISTINCT ON (sv.sticker_id)
         sv.sticker_id, sv.id AS variant_id, sv.variant_type
       FROM sticker_variants sv
       WHERE sv.sticker_id IN (SELECT sticker_id FROM missing_stickers)
       ORDER BY sv.sticker_id, sv.rarity_rank ASC
     )
     SELECT cv.variant_id AS sticker_variant_id,
            ms.number,
            ms.album_code,
            ms.player_name,
            ms.sticker_type,
            t.name        AS team_name,
            cv.variant_type,
            NULL::int     AS quantity
     FROM missing_stickers ms
     JOIN canonical_variant cv ON cv.sticker_id = ms.sticker_id
     LEFT JOIN teams t         ON t.id = ms.team_id
     WHERE ($2::int IS NULL OR ms.number > $2)
     ORDER BY ms.number
     LIMIT $3`,
    [albumId, cursor, pageSize + 1]
  );

  const hasMore = items.length > pageSize;
  const pageItems = hasMore ? items.slice(0, pageSize) : items;
  const nextCursor = hasMore ? pageItems[pageItems.length - 1]!.number : null;

  const { rows: countRows } = await db.query<{ total: string }>(
    `WITH album_info AS (
       SELECT ua.album_type_id,
              (ua.settings->>'includeExtras')::boolean   AS inc_extras,
              (ua.settings->>'includeCocaCola')::boolean AS inc_coca
       FROM user_albums ua
       WHERE ua.id = $1
     )
     SELECT COUNT(*)::text AS total
     FROM album_info ai
     JOIN stickers s ON s.album_type_id = ai.album_type_id
     WHERE CASE
       WHEN s.sticker_type = 'coca_cola_special' THEN ai.inc_coca
       WHEN s.sticker_type = 'extra' THEN ai.inc_extras
       ELSE true
     END
       AND NOT EXISTS (
         SELECT 1 FROM user_stickers us
         JOIN sticker_variants sv2 ON sv2.id = us.sticker_variant_id
         WHERE sv2.sticker_id = s.id
           AND us.album_id = $1
           AND us.quantity > 0
       )`,
    [albumId]
  );

  const result: PublicWantedPage = {
    items: pageItems,
    next_cursor: nextCursor,
    total: parseInt(countRows[0]?.total ?? '0', 10),
  };

  await redis.set(cacheKey, JSON.stringify(result), 'EX', PUBLIC_PROFILE_CACHE_TTL_S);
  return result;
}

export const _publicWantedDefaults = {
  defaultLimit: PUBLIC_WANTED_DEFAULT_LIMIT,
  maxLimit: PUBLIC_WANTED_MAX_LIMIT,
};
