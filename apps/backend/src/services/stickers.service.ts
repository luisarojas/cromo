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
  const cacheKey = `stickers:list:${hashFilters(normalised)}`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as PaginatedResult<StickerRow>;
  }

  const { team, group, type, search, cursor } = filters;

  const { rows: items } = await db.query<StickerRow>(
    `SELECT s.id, s.number, s.album_code, s.player_name, s.position,
            s.sticker_type, s.is_foil, s.team_id, s.notes,
            t.name AS team_name, t.fifa_code, t.group_name,
            sv.id AS base_variant_id,
            (SELECT jsonb_object_agg(tap.edition, jsonb_build_array(tap.page_start, tap.page_end))
             FROM team_album_pages tap WHERE tap.team_id = s.team_id) AS team_pages,
            (SELECT jsonb_object_agg(sap.edition, jsonb_build_object('page_start', sap.page_start, 'page_end', sap.page_end, 'description', sap.description))
             FROM sticker_album_pages sap WHERE sap.sticker_id = s.id) AS sticker_pages
     FROM stickers s
     LEFT JOIN teams t ON s.team_id = t.id
     LEFT JOIN sticker_variants sv ON sv.sticker_id = s.id AND sv.variant_type = 'base'
     WHERE ($1::text IS NULL OR t.fifa_code = $1)
       AND ($2::text IS NULL OR t.group_name = $2)
       AND ($3::text IS NULL OR s.sticker_type = $3)
       AND ($4::text IS NULL OR s.player_name ILIKE '%' || $4 || '%')
       AND ($5::int IS NULL OR s.number > $5)
     ORDER BY s.number
     LIMIT $6`,
    [team ?? null, group ?? null, type ?? null, search ?? null, cursor ?? null, limit + 1]
  );

  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? pageItems[pageItems.length - 1].number : null;

  // Total count (without cursor so it reflects the full filtered set)
  const { rows: countRows } = await db.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM stickers s
     LEFT JOIN teams t ON s.team_id = t.id
     WHERE ($1::text IS NULL OR t.fifa_code = $1)
       AND ($2::text IS NULL OR t.group_name = $2)
       AND ($3::text IS NULL OR s.sticker_type = $3)
       AND ($4::text IS NULL OR s.player_name ILIKE '%' || $4 || '%')`,
    [team ?? null, group ?? null, type ?? null, search ?? null]
  );

  const result: PaginatedResult<StickerRow> = {
    items: pageItems,
    nextCursor,
    total: parseInt(countRows[0]?.count ?? '0', 10),
  };

  await redis.set(cacheKey, JSON.stringify(result), 'EX', 3600);

  return result;
}

/**
 * getStickerByAlbumCode — fetch a single sticker by its album code.
 */
export async function getStickerByAlbumCode(
  db: Pool,
  albumCode: string
): Promise<StickerRow | null> {
  const { rows } = await db.query<StickerRow>(
    `SELECT s.id, s.number, s.album_code, s.player_name, s.position,
            s.sticker_type, s.is_foil, s.team_id, s.notes,
            t.name AS team_name, t.fifa_code, t.group_name,
            sv.id AS base_variant_id,
            (SELECT jsonb_object_agg(tap.edition, jsonb_build_array(tap.page_start, tap.page_end))
             FROM team_album_pages tap WHERE tap.team_id = s.team_id) AS team_pages,
            (SELECT jsonb_object_agg(sap.edition, jsonb_build_object('page_start', sap.page_start, 'page_end', sap.page_end, 'description', sap.description))
             FROM sticker_album_pages sap WHERE sap.sticker_id = s.id) AS sticker_pages
     FROM stickers s
     LEFT JOIN teams t ON s.team_id = t.id
     LEFT JOIN sticker_variants sv ON sv.sticker_id = s.id AND sv.variant_type = 'base'
     WHERE s.album_code = $1`,
    [albumCode]
  );
  return rows[0] ?? null;
}

/**
 * getStickerVariants — fetch all variants for a sticker identified by album code.
 */
export async function getStickerVariants(
  db: Pool,
  albumCode: string
): Promise<StickerVariantRow[]> {
  const { rows } = await db.query<StickerVariantRow>(
    `SELECT sv.id, sv.sticker_id, sv.variant_type, sv.rarity_rank, sv.availability
     FROM sticker_variants sv
     JOIN stickers s ON sv.sticker_id = s.id
     WHERE s.album_code = $1
     ORDER BY sv.rarity_rank`,
    [albumCode]
  );
  return rows;
}
