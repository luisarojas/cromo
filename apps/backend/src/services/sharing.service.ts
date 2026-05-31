import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import crypto from 'node:crypto';
import { env } from '../env.js';
import { statusError } from '../utils/errors.js';
import { userCacheKey } from './cache.js';

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
  fifa_code: string | null;
  variant_type: string | null;
  quantity: number | null;
}

export interface PublicProfileAlbum {
  album_id: string;
  album_type_key: string;
  album_type_name: string;
  album_type_guide_path: string | null;
  edition_name: string;
  format_name: string;
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
  trading_enabled: boolean;
}

export interface PublicInventoryFilterOptions {
  sticker_types: string[];
  teams: string[];
  variant_types: string[];
}

export interface PublicWantedPage {
  items: PublicInventoryItem[];
  next_cursor: number | null;
  total: number;
  filter_options: PublicInventoryFilterOptions;
}

export interface WantedFilters {
  stickerTypes?: string[];
  teams?: string[];
  variantTypes?: string[];
  search?: string;
}

type ListType = 'missing' | 'duplicates' | 'full_collection';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildShareUrl(token: string): string {
  return `${env.FRONTEND_URL}/share/${token}`;
}

/**
 * publicFilterOptions — full universe of filter chips for a public album's
 * inventory list. Returns distinct (sticker_type, team, variant_type) across
 * the entire matching set, ignoring whatever filters the caller is applying so
 * the chip set doesn't shrink as the user narrows the view.
 *
 * The two list kinds need different selection logic (Wanted = missing stickers
 * walking the catalog through album_info; Offered = present sticker rows),
 * so the SQL bodies diverge — only the result shape and the empty-row default
 * are shared.
 */
async function publicFilterOptions(
  db: Pool,
  albumId: string,
  kind: 'wanted' | 'offered',
): Promise<PublicInventoryFilterOptions> {
  const sql = kind === 'wanted'
    ? `WITH album_info AS (
         SELECT ua.album_type_id,
                (ua.settings->>'includeExtras')::boolean   AS inc_extras,
                (ua.settings->>'includeCocaCola')::boolean AS inc_coca
         FROM user_albums ua
         WHERE ua.id = $1
       ),
       missing_stickers AS (
         SELECT s.id AS sticker_id, s.sticker_type, s.team_id
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
           WHERE sv2.sticker_id = s.id AND us.album_id = $1 AND us.quantity > 0
         )
       )
       SELECT
         (SELECT array_agg(DISTINCT sticker_type ORDER BY sticker_type)
          FROM missing_stickers) AS sticker_types,
         (SELECT array_agg(DISTINCT COALESCE(t.name, 'Other') ORDER BY COALESCE(t.name, 'Other'))
          FROM missing_stickers ms LEFT JOIN teams t ON t.id = ms.team_id) AS teams,
         (SELECT array_agg(DISTINCT sv.variant_type ORDER BY sv.variant_type)
          FROM sticker_variants sv
          WHERE sv.sticker_id IN (SELECT sticker_id FROM missing_stickers)) AS variant_types`
    : `SELECT
         array_agg(DISTINCT s.sticker_type ORDER BY s.sticker_type)                              AS sticker_types,
         array_agg(DISTINCT COALESCE(t.name, 'Other') ORDER BY COALESCE(t.name, 'Other'))        AS teams,
         array_agg(DISTINCT sv.variant_type ORDER BY sv.variant_type)                            AS variant_types
       FROM user_stickers us
       JOIN sticker_variants sv ON sv.id = us.sticker_variant_id
       JOIN stickers s          ON s.id = sv.sticker_id
       LEFT JOIN teams t        ON t.id = s.team_id
       WHERE us.album_id = $1
         AND (us.quantity > 1 OR us.trade_forced)
         AND NOT us.trade_hidden`;

  const { rows } = await db.query<{
    sticker_types: string[] | null;
    teams: string[] | null;
    variant_types: string[] | null;
  }>(sql, [albumId]);

  const row = rows[0];
  return {
    sticker_types: row?.sticker_types ?? [],
    teams: row?.teams ?? [],
    variant_types: row?.variant_types ?? [],
  };
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
    throw statusError('Share link not found.', 404);
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
         COALESCE(sv.variant_type, 'base_border') AS variant_type,
         NULL::int AS quantity
       FROM stickers s
       LEFT JOIN teams t ON t.id = s.team_id
       LEFT JOIN LATERAL (
         SELECT id, variant_type FROM sticker_variants
         WHERE sticker_id = s.id
           AND variant_type IN ('base_border', 'base_borderless')
         ORDER BY rarity_rank LIMIT 1
       ) sv ON true
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
    trade_matching_enabled: boolean | null;
  }>(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, u.created_at,
            us.profile_visibility, us.trade_matching_enabled
     FROM users u
     LEFT JOIN user_settings us ON us.user_id = u.id
     WHERE u.username = $1 AND u.deleted_at IS NULL`,
    [username]
  );

  if (userRows.length === 0) return null;
  const user = userRows[0]!;
  if (user.profile_visibility === 'private') return null;
  const tradingEnabled = user.trade_matching_enabled ?? true;

  const cacheKey = await userCacheKey(redis, user.id, 'public_profile');
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
      trading_enabled: tradingEnabled,
    };
  }

  // Two batched queries: public albums + wanted-count, then offered items.
  const { rows: albumRows } = await db.query<{
    album_id: string;
    album_type_key: string;
    album_type_name: string;
    album_type_guide_path: string | null;
    edition_name: string;
    format_name: string;
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
              at.key             AS album_type_key,
              at.name            AS album_type_name,
              at.guide_path      AS album_type_guide_path,
              ae.name            AS edition_name,
              af.name            AS format_name,
              (ua.settings->>'includeExtras')::boolean   AS inc_extras,
              (ua.settings->>'includeCocaCola')::boolean AS inc_coca
       FROM user_albums ua
       JOIN album_types at    ON at.id = ua.album_type_id
       JOIN album_editions ae ON ae.id = ua.album_edition_id
       JOIN album_formats af  ON af.id = ua.album_format_id
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
            pa.album_type_key,
            pa.album_type_name,
            pa.album_type_guide_path,
            pa.edition_name,
            pa.format_name,
            pa.alias,
            pa.is_default,
            COALESCE(wc.wanted_count, '0') AS wanted_count
     FROM public_albums pa
     LEFT JOIN wanted_counts wc ON wc.album_id = pa.album_id
     ORDER BY pa.is_default DESC, pa.created_at ASC`,
    [user.id]
  );

  // Fetch all offered items for all public albums in a single query.
  const albumIds = albumRows.map((a) => a.album_id);
  const offeredByAlbum = new Map<string, PublicInventoryItem[]>();
  if (albumIds.length > 0) {
    const { rows: offeredRows } = await db.query<PublicInventoryItem & { album_id: string }>(
      `SELECT us.album_id,
              us.sticker_variant_id,
              s.number,
              s.album_code,
              s.player_name,
              s.sticker_type,
              t.name       AS team_name,
              t.fifa_code  AS fifa_code,
              t.group_name AS group_name,
              sv.variant_type,
              us.quantity
       FROM user_stickers us
       JOIN sticker_variants sv ON sv.id = us.sticker_variant_id
       JOIN stickers s          ON s.id = sv.sticker_id
       LEFT JOIN teams t        ON t.id = s.team_id
       WHERE us.album_id = ANY($1::uuid[])
         AND (us.quantity > 1 OR us.trade_forced)
         AND NOT us.trade_hidden
       ORDER BY us.album_id, s.number, sv.variant_type`,
      [albumIds],
    );
    for (const { album_id, ...item } of offeredRows) {
      if (!offeredByAlbum.has(album_id)) offeredByAlbum.set(album_id, []);
      offeredByAlbum.get(album_id)!.push(item);
    }
  }

  const trading_inventory: PublicProfileAlbum[] = albumRows.map((a) => ({
    album_id: a.album_id,
    album_type_key: a.album_type_key,
    album_type_name: a.album_type_name,
    album_type_guide_path: a.album_type_guide_path,
    edition_name: a.edition_name,
    format_name: a.format_name,
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
    trading_enabled: tradingEnabled,
  };
}

// Appends filter WHERE clauses to `params` starting at `startIdx`.
// Returns the SQL fragments and the next available param index.
function buildFilterClauses(
  params: unknown[],
  filters: WantedFilters,
  startIdx: number,
): {
  stickerTypeClause: string;
  searchClause: string;
  variantTypeClause: string;
  teamClause: string;
  nextIdx: number;
} {
  let idx = startIdx;

  let stickerTypeClause = '';
  if (filters.stickerTypes?.length) {
    params.push(filters.stickerTypes);
    stickerTypeClause = `AND s.sticker_type = ANY($${idx++}::text[])`;
  }

  let searchClause = '';
  if (filters.search?.trim()) {
    params.push(`%${filters.search.trim()}%`);
    const i = idx++;
    searchClause = `AND (s.album_code ILIKE $${i} OR s.player_name ILIKE $${i})`;
  }

  let variantTypeClause = '';
  if (filters.variantTypes?.length) {
    params.push(filters.variantTypes);
    variantTypeClause = `AND sv.variant_type = ANY($${idx++}::text[])`;
  }

  const namedTeams = (filters.teams ?? []).filter((t) => t !== 'Other');
  const includeOther = filters.teams?.includes('Other') ?? false;
  let teamClause = '';
  if (filters.teams?.length) {
    if (namedTeams.length && includeOther) {
      params.push(namedTeams);
      teamClause = `AND (t.name = ANY($${idx++}::text[]) OR t.name IS NULL)`;
    } else if (namedTeams.length) {
      params.push(namedTeams);
      teamClause = `AND t.name = ANY($${idx++}::text[])`;
    } else {
      teamClause = `AND t.name IS NULL`;
    }
  }

  return { stickerTypeClause, searchClause, variantTypeClause, teamClause, nextIdx: idx };
}

/**
 * getPublicAlbumWanted — paginated Wanted list for one public album.
 *
 * Supports optional server-side filtering by sticker type, team, variant type,
 * and free-text search. When filters are supplied the cache key includes them
 * so each unique filter combination is cached independently.
 */
export async function getPublicAlbumWanted(
  db: Pool,
  redis: Redis,
  username: string,
  albumId: string,
  cursor: number | null,
  limit: number,
  filters: WantedFilters = {}
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

  const { rowCount } = await db.query(
    `SELECT 1 FROM user_albums
     WHERE id = $1 AND user_id = $2 AND is_trade_inventory_public = true`,
    [albumId, userId]
  );
  if ((rowCount ?? 0) === 0) return null;

  const filterKey =
    (filters.stickerTypes?.length ?? 0) > 0 ||
    (filters.teams?.length ?? 0) > 0 ||
    (filters.variantTypes?.length ?? 0) > 0 ||
    !!filters.search?.trim()
      ? ':' +
        JSON.stringify({
          t: [...(filters.stickerTypes ?? [])].sort(),
          m: [...(filters.teams ?? [])].sort(),
          v: [...(filters.variantTypes ?? [])].sort(),
          q: filters.search?.trim() ?? '',
        })
      : '';
  const cacheKey = await userCacheKey(redis, userId, `public_wanted:${albumId}:${cursor ?? 'start'}:${pageSize}${filterKey}`);
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as PublicWantedPage;

  // Page query: $1=albumId, $2=userId, $3=cursor, then filter params, then $N=limit
  // Variant filtering uses an EXISTS subquery ("sticker has this variant available")
  // rather than matching the canonical variant, since wanted items represent missing
  // stickers wanted in any variant.
  const pageParams: unknown[] = [albumId, userId, cursor];
  const filtersWithoutVariant: WantedFilters = { ...filters, variantTypes: [] };
  const { stickerTypeClause, searchClause, teamClause, nextIdx: afterPageFilters } =
    buildFilterClauses(pageParams, filtersWithoutVariant, 4);
  let variantTypeClause = '';
  let pageLimitIdx = afterPageFilters;
  if (filters.variantTypes?.length) {
    pageParams.push(filters.variantTypes);
    variantTypeClause = `AND EXISTS (
      SELECT 1 FROM sticker_variants sv_vf
      WHERE sv_vf.sticker_id = ms.sticker_id
        AND sv_vf.variant_type = ANY($${pageLimitIdx}::text[])
    )`;
    pageLimitIdx++;
  }
  pageParams.push(pageSize + 1);

  // Count query: $1=albumId, then the same filter params (no cursor)
  const countParams: unknown[] = [albumId];
  const { stickerTypeClause: cStickerType, searchClause: cSearch,
          teamClause: cTeam, nextIdx: afterCountFilters } =
    buildFilterClauses(countParams, filtersWithoutVariant, 2);
  let cVariant = '';
  if (filters.variantTypes?.length) {
    countParams.push(filters.variantTypes);
    cVariant = `AND EXISTS (
      SELECT 1 FROM sticker_variants sv_vf
      WHERE sv_vf.sticker_id = ms.sticker_id
        AND sv_vf.variant_type = ANY($${afterCountFilters}::text[])
    )`;
  }

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
       ${stickerTypeClause}
       ${searchClause}
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
         sv.sticker_id, sv.id AS variant_id
       FROM sticker_variants sv
       WHERE sv.sticker_id IN (SELECT sticker_id FROM missing_stickers)
       ORDER BY sv.sticker_id, sv.rarity_rank ASC
     ),
     wanted_specific AS (
       SELECT sv.sticker_id, sv.variant_type AS wanted_variant_type
       FROM user_wanted_variants uwv
       JOIN sticker_variants sv ON sv.id = uwv.sticker_variant_id
       WHERE uwv.user_id = $2 AND uwv.album_id = $1
     )
     SELECT cv.variant_id AS sticker_variant_id,
            ms.number,
            ms.album_code,
            ms.player_name,
            ms.sticker_type,
            t.name        AS team_name,
            t.fifa_code   AS fifa_code,
            t.group_name  AS group_name,
            ws.wanted_variant_type AS variant_type,
            NULL::int     AS quantity
     FROM missing_stickers ms
     JOIN canonical_variant cv ON cv.sticker_id = ms.sticker_id
     LEFT JOIN wanted_specific ws ON ws.sticker_id = ms.sticker_id
     LEFT JOIN teams t         ON t.id = ms.team_id
     WHERE ($3::int IS NULL OR ms.number > $3)
     ${variantTypeClause}
     ${teamClause}
     ORDER BY ms.number
     LIMIT $${pageLimitIdx}`,
    pageParams
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
     ),
     filtered_stickers AS (
       SELECT s.id AS sticker_id, s.sticker_type, s.album_code, s.player_name, s.team_id
       FROM album_info ai
       JOIN stickers s ON s.album_type_id = ai.album_type_id
       WHERE CASE
         WHEN s.sticker_type = 'coca_cola_special' THEN ai.inc_coca
         WHEN s.sticker_type = 'extra' THEN ai.inc_extras
         ELSE true
       END
       ${cStickerType}
       ${cSearch}
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
         sv.sticker_id, sv.variant_type
       FROM sticker_variants sv
       WHERE sv.sticker_id IN (SELECT sticker_id FROM missing_stickers)
       ORDER BY sv.sticker_id, sv.rarity_rank ASC
     )
     SELECT COUNT(*)::text AS total
     FROM missing_stickers ms
     JOIN canonical_variant cv ON cv.sticker_id = ms.sticker_id
     LEFT JOIN teams t ON t.id = ms.team_id
     WHERE 1=1
     ${cVariant}
     ${cTeam}`,
    countParams
  );

  const filter_options = await publicFilterOptions(db, albumId, 'wanted');

  const result: PublicWantedPage = {
    items: pageItems,
    next_cursor: nextCursor,
    total: parseInt(countRows[0]?.total ?? '0', 10),
    filter_options,
  };

  await redis.set(cacheKey, JSON.stringify(result), 'EX', PUBLIC_PROFILE_CACHE_TTL_S);
  return result;
}

export const _publicWantedDefaults = {
  defaultLimit: PUBLIC_WANTED_DEFAULT_LIMIT,
  maxLimit: PUBLIC_WANTED_MAX_LIMIT,
};

/**
 * getPublicAlbumOffered — paginated Offered list for one public album. Mirror
 * of getPublicAlbumWanted so the frontend can stop carrying every offered
 * sticker in the profile payload and stop re-filtering/grouping in JS.
 */
export async function getPublicAlbumOffered(
  db: Pool,
  redis: Redis,
  username: string,
  albumId: string,
  cursor: number | null,
  limit: number,
  filters: WantedFilters = {},
): Promise<PublicWantedPage | null> {
  const pageSize = Math.min(Math.max(limit | 0, 1), PUBLIC_WANTED_MAX_LIMIT);

  const { rows: userRows } = await db.query<{ id: string; profile_visibility: string | null }>(
    `SELECT u.id, us.profile_visibility
     FROM users u
     LEFT JOIN user_settings us ON us.user_id = u.id
     WHERE u.username = $1 AND u.deleted_at IS NULL`,
    [username],
  );
  if (userRows.length === 0) return null;
  const { id: userId, profile_visibility } = userRows[0]!;
  if (profile_visibility === 'private') return null;

  const { rowCount } = await db.query(
    `SELECT 1 FROM user_albums
     WHERE id = $1 AND user_id = $2 AND is_trade_inventory_public = true`,
    [albumId, userId],
  );
  if ((rowCount ?? 0) === 0) return null;

  const filterKey =
    (filters.stickerTypes?.length ?? 0) > 0 ||
    (filters.teams?.length ?? 0) > 0 ||
    (filters.variantTypes?.length ?? 0) > 0 ||
    !!filters.search?.trim()
      ? ':' +
        JSON.stringify({
          t: [...(filters.stickerTypes ?? [])].sort(),
          m: [...(filters.teams ?? [])].sort(),
          v: [...(filters.variantTypes ?? [])].sort(),
          q: filters.search?.trim() ?? '',
        })
      : '';
  const cacheKey = await userCacheKey(
    redis,
    userId,
    `public_offered:${albumId}:${cursor ?? 'start'}:${pageSize}${filterKey}`,
  );
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as PublicWantedPage;

  // Build filter clauses against the `s.*` / `sv.*` aliases used below. We
  // reuse buildFilterClauses by feeding it parallel parameter arrays.
  const pageParams: unknown[] = [albumId, cursor];
  const { stickerTypeClause, searchClause, variantTypeClause, teamClause, nextIdx: pageLimitIdx } =
    buildFilterClauses(pageParams, filters, 3);
  pageParams.push(pageSize + 1);

  const countParams: unknown[] = [albumId];
  const { stickerTypeClause: cStickerType, searchClause: cSearch,
          variantTypeClause: cVariant, teamClause: cTeam } =
    buildFilterClauses(countParams, filters, 2);

  const { rows: items } = await db.query<PublicInventoryItem & { number: number }>(
    `SELECT us.sticker_variant_id,
            s.number,
            s.album_code,
            s.player_name,
            s.sticker_type,
            t.name           AS team_name,
            t.fifa_code      AS fifa_code,
            t.group_name     AS group_name,
            sv.variant_type,
            us.quantity
     FROM user_stickers us
     JOIN sticker_variants sv ON sv.id = us.sticker_variant_id
     JOIN stickers s          ON s.id = sv.sticker_id
     LEFT JOIN teams t        ON t.id = s.team_id
     WHERE us.album_id = $1
       AND (us.quantity > 1 OR us.trade_forced)
       AND NOT us.trade_hidden
       AND ($2::int IS NULL OR s.number > $2)
       ${stickerTypeClause}
       ${searchClause}
       ${variantTypeClause}
       ${teamClause}
     ORDER BY s.number, sv.variant_type
     LIMIT $${pageLimitIdx}`,
    pageParams,
  );

  const hasMore = items.length > pageSize;
  const pageItems = hasMore ? items.slice(0, pageSize) : items;
  const nextCursor = hasMore ? pageItems[pageItems.length - 1]!.number : null;

  const { rows: countRows } = await db.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total
     FROM user_stickers us
     JOIN sticker_variants sv ON sv.id = us.sticker_variant_id
     JOIN stickers s          ON s.id = sv.sticker_id
     LEFT JOIN teams t        ON t.id = s.team_id
     WHERE us.album_id = $1
       AND (us.quantity > 1 OR us.trade_forced)
       AND NOT us.trade_hidden
       ${cStickerType}
       ${cSearch}
       ${cVariant}
       ${cTeam}`,
    countParams,
  );

  const filter_options = await publicFilterOptions(db, albumId, 'offered');

  const result: PublicWantedPage = {
    items: pageItems,
    next_cursor: nextCursor,
    total: parseInt(countRows[0]?.total ?? '0', 10),
    filter_options,
  };

  await redis.set(cacheKey, JSON.stringify(result), 'EX', PUBLIC_PROFILE_CACHE_TTL_S);
  return result;
}
