import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { hashFilters } from './cache.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StickerFilters {
  team?: string;
  group?: string;
  type?: string;
  search?: string;
  cursor?: number;
  limit?: number;
  albumTypeKey?: string;
}

export interface StickerRow {
  id: string;
  number: number;
  album_code: string;
  player_name: string | null;
  position: string | null;
  sticker_type: string;
  is_foil: boolean;
  team_id: string | null;
  notes: string | null;
  team_name: string | null;
  fifa_code: string | null;
  group_name: string | null;
  base_variant_id: string | null;
  team_pages: Record<string, [number, number]> | null;
  sticker_pages: Record<string, { page_start: number | null; page_end: number | null; description: string | null }> | null;
}

export interface StickerVariantRow {
  id: string;
  sticker_id: string;
  variant_type: string;
  rarity_rank: number;
  availability: string;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: number | null;
  total: number;
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * listStickers — paginated sticker master list with optional filters.
 * Results are cached in Redis for 1 hour.
 */
export async function listStickers(
  db: Pool,
  redis: Redis,
  filters: StickerFilters
): Promise<PaginatedResult<StickerRow>> {
  const limit = Math.min(filters.limit ?? 50, 200);
  const normalised = { ...filters, limit };
  // Scope the cache key by catalog version so any sticker mutation (seed,
  // admin patch, future write path) naturally orphans old entries instead of
  // serving them for the 1-hour TTL. getCatalogVersion is itself cached for
  // 5 min so this adds at most one extra Redis GET per call.
  const version = await getCatalogVersion(db, redis);
  const cacheKey = `stickers:list:${version}:${hashFilters(normalised)}`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as PaginatedResult<StickerRow>;
  }

  const { team, group, type, search, cursor, albumTypeKey } = filters;

  // sticker_full pre-joins teams + team_pages_json. The variant join is kept
  // here because we only want the base variant.
  // One round-trip via COUNT(*) OVER () so total reflects the full filter set
  // (cursor + LIMIT are applied in the outer query).
  const { rows: items } = await db.query<StickerRow & { total_count: string }>(
    `SELECT * FROM (
       SELECT s.sticker_id AS id, s.number, s.album_code, s.player_name, s.position,
              s.sticker_type, s.is_foil, s.team_id, s.notes,
              s.team_name, s.fifa_code, s.group_name,
              sv.id AS base_variant_id,
              s.team_pages,
              (SELECT jsonb_object_agg(sap.edition, jsonb_build_object('page_start', sap.page_start, 'page_end', sap.page_end, 'description', sap.description))
               FROM sticker_album_pages sap WHERE sap.sticker_id = s.sticker_id) AS sticker_pages,
              COUNT(*) OVER () AS total_count
       FROM sticker_full s
       JOIN album_types at ON at.id = s.album_type_id
       LEFT JOIN LATERAL (
         SELECT id FROM sticker_variants
         WHERE sticker_id = s.sticker_id
           AND variant_type IN ('base_border', 'base_borderless')
         ORDER BY rarity_rank LIMIT 1
       ) sv ON true
       WHERE ($1::text IS NULL OR s.fifa_code = $1)
         AND ($2::text IS NULL OR s.group_name = $2)
         AND ($3::text IS NULL OR s.sticker_type = $3)
         AND ($4::text IS NULL OR unaccent(s.player_name) ILIKE '%' || unaccent($4) || '%')
         AND ($7::text IS NULL OR at.key = $7)
     ) page
     WHERE ($5::int IS NULL OR page.number > $5)
     ORDER BY page.number
     LIMIT $6`,
    [team ?? null, group ?? null, type ?? null, search ?? null, cursor ?? null, limit + 1, albumTypeKey ?? null]
  );

  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? pageItems[pageItems.length - 1]!.number : null;
  const total = items[0] ? parseInt(items[0].total_count, 10) : 0;
  for (const row of pageItems) {
    delete (row as Partial<typeof row>).total_count;
  }

  const result: PaginatedResult<StickerRow> = {
    items: pageItems,
    nextCursor,
    total,
  };

  await redis.set(cacheKey, JSON.stringify(result), 'EX', 3600);

  return result;
}

/**
 * getStickerByAlbumCode — fetch a single sticker by its album code, optionally
 * scoped to a specific album type key.
 */
export async function getStickerByAlbumCode(
  db: Pool,
  albumCode: string,
  albumTypeKey?: string,
): Promise<StickerRow | null> {
  const { rows } = await db.query<StickerRow>(
    `SELECT s.sticker_id AS id, s.number, s.album_code, s.player_name, s.position,
            s.sticker_type, s.is_foil, s.team_id, s.notes,
            s.team_name, s.fifa_code, s.group_name,
            sv.id AS base_variant_id,
            s.team_pages,
            (SELECT jsonb_object_agg(sap.edition, jsonb_build_object('page_start', sap.page_start, 'page_end', sap.page_end, 'description', sap.description))
             FROM sticker_album_pages sap WHERE sap.sticker_id = s.sticker_id) AS sticker_pages
     FROM sticker_full s
     JOIN album_types at ON at.id = s.album_type_id
     LEFT JOIN LATERAL (
       SELECT id FROM sticker_variants
       WHERE sticker_id = s.sticker_id
         AND variant_type IN ('base_border', 'base_borderless')
       ORDER BY rarity_rank LIMIT 1
     ) sv ON true
     WHERE s.album_code = $1
       AND ($2::text IS NULL OR at.key = $2)`,
    [albumCode, albumTypeKey ?? null]
  );
  return rows[0] ?? null;
}

/**
 * getStickerByPlayerName — fetch a single sticker by exact player name (case-insensitive),
 * optionally scoped to a specific album type key and sticker type.
 */
export async function getStickerByPlayerName(
  db: Pool,
  playerName: string,
  albumTypeKey?: string,
  stickerType?: string,
  excludeSpecialTypes = false,
): Promise<StickerRow | null> {
  const { rows } = await db.query<StickerRow>(
    `SELECT s.sticker_id AS id, s.number, s.album_code, s.player_name, s.position,
            s.sticker_type, s.is_foil, s.team_id, s.notes,
            s.team_name, s.fifa_code, s.group_name,
            sv.id AS base_variant_id,
            s.team_pages,
            (SELECT jsonb_object_agg(sap.edition, jsonb_build_object('page_start', sap.page_start, 'page_end', sap.page_end, 'description', sap.description))
             FROM sticker_album_pages sap WHERE sap.sticker_id = s.sticker_id) AS sticker_pages
     FROM sticker_full s
     JOIN album_types at ON at.id = s.album_type_id
     LEFT JOIN LATERAL (
       SELECT id FROM sticker_variants
       WHERE sticker_id = s.sticker_id
         AND variant_type IN ('base_border', 'base_borderless')
       ORDER BY rarity_rank LIMIT 1
     ) sv ON true
     WHERE unaccent(s.player_name) ILIKE unaccent($1)
       AND ($2::text IS NULL OR at.key = $2)
       AND ($3::text IS NULL OR s.sticker_type = $3)
       AND (NOT $4 OR s.sticker_type NOT IN ('extra', 'coca_cola_special'))
     LIMIT 1`,
    [playerName, albumTypeKey ?? null, stickerType ?? null, excludeSpecialTypes]
  );
  return rows[0] ?? null;
}

/**
 * getStickerVariants — fetch all variants for a sticker identified by album code,
 * optionally scoped to a specific album type key. For album codes that resolve
 * to multiple stickers (CC regional alternates), this returns the union; callers
 * that need disambiguation must pass `stickerId` instead via getStickerVariantsByStickerId.
 */
export async function getStickerVariants(
  db: Pool,
  albumCode: string,
  albumTypeKey?: string,
): Promise<StickerVariantRow[]> {
  const { rows } = await db.query<StickerVariantRow>(
    `SELECT sv.id, sv.sticker_id, sv.variant_type, sv.rarity_rank, sv.availability
     FROM sticker_variants sv
     JOIN stickers s ON sv.sticker_id = s.id
     JOIN album_types at ON at.id = s.album_type_id
     WHERE s.album_code = $1
       AND ($2::text IS NULL OR at.key = $2)
     ORDER BY sv.rarity_rank`,
    [albumCode, albumTypeKey ?? null]
  );
  return rows;
}

/**
 * getStickerVariantsByStickerId — variants scoped to one specific sticker.
 * Required for CC stickers where multiple sticker rows share one album_code.
 */
export async function getStickerVariantsByStickerId(
  db: Pool,
  stickerId: string,
): Promise<StickerVariantRow[]> {
  const { rows } = await db.query<StickerVariantRow>(
    `SELECT sv.id, sv.sticker_id, sv.variant_type, sv.rarity_rank, sv.availability
     FROM sticker_variants sv
     WHERE sv.sticker_id = $1
     ORDER BY sv.rarity_rank`,
    [stickerId]
  );
  return rows;
}

/**
 * getCatalogVersion — opaque version string derived from the latest catalog
 * mutation. The frontend keys its localStorage entry off this so a backend
 * catalog reseed automatically invalidates every browser, replacing the
 * manual STICKER_CACHE_KEY bump documented in CLAUDE.md.
 *
 * Cached in Redis for 5 min so the version probe doesn't hit the catalog
 * tables on every page load. invalidate by deleting the key when seeding.
 */
const CATALOG_VERSION_CACHE_KEY = 'cromo:catalog_version';
const CATALOG_VERSION_TTL_S = 300;

export async function getCatalogVersion(db: Pool, redis: Redis): Promise<string> {
  const cached = await redis.get(CATALOG_VERSION_CACHE_KEY);
  if (cached) return cached;

  // Version = last sticker mutation timestamp + row counts across catalog
  // tables. The counts naturally bump the version when variants are
  // added/removed even though sticker_variants has no timestamp column.
  const { rows } = await db.query<{ version: string }>(
    `SELECT to_char(
       COALESCE((SELECT MAX(updated_at) FROM stickers), 'epoch'::timestamptz),
       'YYYYMMDDHH24MISSMS'
     ) || ':' || (
       (SELECT COUNT(*) FROM stickers)::text
       || '.' ||
       (SELECT COUNT(*) FROM sticker_variants)::text
     ) AS version`
  );

  const version = rows[0]?.version ?? '0';
  await redis.set(CATALOG_VERSION_CACHE_KEY, version, 'EX', CATALOG_VERSION_TTL_S);
  return version;
}

export interface StickerLookupRow {
  id: string;
  album_code: string;
  player_name: string | null;
  team_name: string | null;
  fifa_code: string | null;
  group_name: string | null;
  variants: StickerVariantRow[];
}

/**
 * getStickersByAlbumCodes — fetch sticker display info + all variants for a
 * list of album codes in a single query. Used by the trade sticker picker to
 * avoid N×2 individual requests. Returns one row per sticker (not per code) so
 * regional alternates that share an album_code stay distinct.
 */
export async function getStickersByAlbumCodes(
  db: Pool,
  albumCodes: string[]
): Promise<StickerLookupRow[]> {
  if (albumCodes.length === 0) return [];

  const { rows } = await db.query<StickerLookupRow>(
    `SELECT
       s.id,
       s.album_code,
       s.player_name,
       t.name AS team_name,
       t.fifa_code AS fifa_code,
       t.group_name AS group_name,
       json_agg(
         json_build_object(
           'id',           sv.id,
           'sticker_id',   sv.sticker_id,
           'variant_type', sv.variant_type,
           'rarity_rank',  sv.rarity_rank,
           'availability', sv.availability
         )
         ORDER BY sv.rarity_rank
       ) AS variants
     FROM stickers s
     LEFT JOIN teams t ON t.id = s.team_id
     JOIN sticker_variants sv ON sv.sticker_id = s.id
     WHERE s.album_code = ANY($1)
     GROUP BY s.id, s.album_code, s.player_name, t.name, t.fifa_code, t.group_name
     ORDER BY s.number`,
    [albumCodes]
  );

  return rows;
}
