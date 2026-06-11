import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { normalizeAlbumCode } from './scan.service.js';

export interface TradeMatch {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  mutual_overlap: number;
  they_have: string[];
  they_have_variant_ids: string[];
  you_have: string[];
  cities: { label: string; placeId: number; lat: number | null; lng: number | null }[];
  // Great-circle distance (km) to the requester's nearest geocoded city.
  // null when either side has no usable coordinates — those candidates bypass
  // the radius filter and sort last among results with the same overlap.
  distance_km: number | null;
}

export interface TradeMatchesPage {
  items: TradeMatch[];
  nextCursor: string | null;
  total: number;
}

const TRADE_MATCHES_DEFAULT_LIMIT = 50;
const TRADE_MATCHES_MAX_LIMIT = 200;
const TRADE_MATCHES_TTL_SECONDS = 120;
// Priority = mutual_overlap - PRIORITY_DISTANCE_WEIGHT * distance_km.
// 0.05 means each 20 km of distance discounts one overlap point — close
// matches with slightly fewer mutual stickers still beat distant matches
// with many. Tuned to make city-vs-neighbouring-city ordering feel right;
// raise to favour proximity more aggressively.
const PRIORITY_DISTANCE_WEIGHT = 0.05;
// Buffer keeps the index alive well past the longest cache entry it tracks,
// so a write that races near the TTL boundary still finds the membership row
// and can invalidate the in-flight cache. 300s ≫ 120s cache lifetime.
const MATCHES_INDEX_BUFFER_SECONDS = 300;

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
 * Cursor-paginated by (priority DESC, user_id ASC) where priority blends
 * mutual_overlap and great-circle distance to the requester's nearest city.
 * The heavy CTE runs once and large match sets stream in chunks; cached 2 min.
 *
 * Radius filter:
 *   - applyRadius=true (default) drops candidates whose nearest city is
 *     farther than the requester's configured radius. Candidates with no
 *     geocoded city OR a requester with no geocoded city bypass the filter
 *     (we can't measure distance, so we can't honestly exclude them).
 *   - applyRadius=false returns everyone — used when the UI's "show all
 *     outside radius" toggle is on.
 */
export async function getTradeMatches(
  db: Pool,
  redis: Redis,
  userId: string,
  albumId: string,
  opts: { cursor?: string; limit?: number; applyRadius?: boolean } = {},
): Promise<TradeMatchesPage> {
  // Requester's settings: trade-matching opt-out AND search radius/cities for
  // distance scoring. Single round-trip so we don't pay for two SELECTs.
  const { rows: settingRows } = await db.query<{
    trade_matching_enabled: boolean;
    search_radius_km: number;
    cities: { label: string; placeId: number; lat: number | null; lng: number | null }[] | null;
  }>(
    `SELECT trade_matching_enabled, search_radius_km, cities
       FROM user_settings WHERE user_id = $1`,
    [userId],
  );
  if (settingRows.length > 0 && settingRows[0]!.trade_matching_enabled === false) {
    return { items: [], nextCursor: null, total: 0 };
  }
  const requesterSettings = settingRows[0];
  const requesterRadiusKm = requesterSettings?.search_radius_km ?? 50;
  // Only cities with usable coordinates participate in distance scoring.
  const requesterCoords = (requesterSettings?.cities ?? [])
    .filter((c): c is { label: string; placeId: number; lat: number; lng: number } =>
      typeof c.lat === 'number' && typeof c.lng === 'number',
    )
    .map((c) => ({ lat: c.lat, lng: c.lng }));
  const applyRadius = opts.applyRadius !== false;

  const limit = Math.min(opts.limit ?? TRADE_MATCHES_DEFAULT_LIMIT, TRADE_MATCHES_MAX_LIMIT);
  // Cursor is the opaque `${priorityX1000}:${userId}` from the previous page.
  // Priority is a float, but multiplying by 1000 and rounding gives a stable
  // integer cursor that survives JSON round-trips without precision drift.
  let cursorPriority: number | null = null;
  let cursorUserId: string | null = null;
  if (opts.cursor) {
    const [p, u] = opts.cursor.split(':');
    const n = Number.parseInt(p ?? '', 10);
    if (Number.isFinite(n) && u) {
      cursorPriority = n;
      cursorUserId = u;
    }
  }
  const cacheKey = `trade:matches:${userId}:${albumId}:${opts.cursor ?? 'start'}:${limit}:r${applyRadius ? requesterRadiusKm : 'all'}`;
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
    cities: { label: string; placeId: number; lat: number | null; lng: number | null }[];
    distance_km: number | null;
    priority: number;
    total_count: string;
  }>(
    `WITH requester_album AS (
       SELECT album_type_id FROM user_albums WHERE id = $2
     ),
     my_missing AS (
       -- Explicitly wanted variants: respect the user's specific variant preference
       SELECT uwv.sticker_variant_id AS variant_id
       FROM user_wanted_variants uwv
       WHERE uwv.album_id = $2
       UNION
       -- Stickers with no explicit want and no owned variants: accept any variant.
       --
       -- Coca-Cola caveat: CC album_codes can map to multiple stickers (regional
       -- alternates — see CLAUDE.md §5). Album completion is per album_code, so
       -- owning ANY CC9 alternate fills the CC9 slot. The owned-check below
       -- therefore widens to "no variant of any sticker sharing this album_code"
       -- when sticker_type = 'coca_cola_special'; otherwise it stays per sticker_id.
       SELECT sv.id AS variant_id
       FROM sticker_variants sv
       JOIN stickers s ON s.id = sv.sticker_id
       WHERE s.album_type_id = (SELECT album_type_id FROM requester_album)
         AND NOT EXISTS (
           SELECT 1 FROM user_wanted_variants uwv2
           JOIN sticker_variants sv2 ON sv2.id = uwv2.sticker_variant_id
           WHERE uwv2.album_id = $2 AND sv2.sticker_id = s.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM user_stickers us2
           JOIN sticker_variants sv3 ON sv3.id = us2.sticker_variant_id
           JOIN stickers s2 ON s2.id = sv3.sticker_id
           WHERE us2.album_id = $2
             AND us2.quantity > 0
             AND (
               s2.id = s.id
               OR (s.sticker_type = 'coca_cola_special'
                   AND s2.album_type_id = s.album_type_id
                   AND s2.album_code = s.album_code)
             )
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
       LEFT JOIN user_settings us2 ON us2.user_id = ua.user_id
       JOIN users u ON u.id = ua.user_id
       WHERE ua.user_id != $1
         AND ua.album_type_id = (SELECT album_type_id FROM requester_album)
         AND COALESCE(us2.trade_matching_enabled, true) = true
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
       WHERE (
         -- They explicitly want this exact variant
         EXISTS (
           SELECT 1 FROM user_wanted_variants uwv
           WHERE uwv.album_id = ca.album_id
             AND uwv.sticker_variant_id = md.variant_id
         )
         OR (
           -- No explicit want for this sticker AND they don't own any variant of it.
           -- See my_missing for the Coca-Cola caveat — owned-check widens to
           -- album_code for CC alternates so a filled CC slot isn't re-offered.
           NOT EXISTS (
             SELECT 1 FROM user_wanted_variants uwv2
             JOIN sticker_variants sv2 ON sv2.id = uwv2.sticker_variant_id
             WHERE uwv2.album_id = ca.album_id AND sv2.sticker_id = s.id
           )
           AND NOT EXISTS (
             SELECT 1 FROM user_stickers uss2
             JOIN sticker_variants sv3 ON sv3.id = uss2.sticker_variant_id
             JOIN stickers s2 ON s2.id = sv3.sticker_id
             WHERE uss2.album_id = ca.album_id
               AND uss2.quantity > 0
               AND (
                 s2.id = s.id
                 OR (s.sticker_type = 'coca_cola_special'
                     AND s2.album_type_id = s.album_type_id
                     AND s2.album_code = s.album_code)
               )
           )
         )
       )
     ),
     mutual_users AS (
       SELECT DISTINCT thm.user_id
       FROM they_have_my_missing thm
       WHERE thm.user_id IN (SELECT user_id FROM i_have_their_missing)
     ),
     they_have_all_dupes AS (
       -- Expand within a sticker to every variant the candidate has spares of,
       -- but only those that actually satisfy my_missing. Otherwise we'd echo
       -- back variants the requester never asked for (e.g. a blue parallel when
       -- they only want the base), which misleads the trade UI.
       SELECT DISTINCT thm.user_id, sv_all.id AS variant_id
       FROM they_have_my_missing thm
       JOIN sticker_variants sv_base ON sv_base.id = thm.variant_id
       JOIN sticker_variants sv_all ON sv_all.sticker_id = sv_base.sticker_id
       JOIN user_stickers uss ON uss.sticker_variant_id = sv_all.id
         AND uss.album_id = thm.album_id
         AND (uss.quantity > 1 OR uss.trade_forced)
         AND NOT uss.trade_hidden
       WHERE sv_all.id IN (SELECT variant_id FROM my_missing)
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
     ),
     -- Requester's own cities, projected from the JSON parameter into a
     -- regular table so we can JOIN/cross-apply against candidate cities and
     -- run Haversine in SQL. Skipping the unnest entirely when the requester
     -- has no geocoded cities keeps the planner from materialising an empty
     -- relation that produces NULL distances for everyone.
     my_coords AS (
       SELECT (c->>'lat')::double precision AS lat,
              (c->>'lng')::double precision AS lng
         FROM jsonb_array_elements($6::jsonb) AS c
        WHERE (c->>'lat') IS NOT NULL AND (c->>'lng') IS NOT NULL
     ),
     -- Min Haversine distance between any requester city and any candidate
     -- city. NULL when either side has no geocoded city — those rows skip
     -- the radius filter (we can't measure, so we can't honestly exclude).
     -- 6371 = Earth radius (km); the inner expression is the standard
     -- spherical-law-of-cosines form, which is accurate to a few metres at
     -- the city-pair scale we care about and avoids the asin() of Haversine.
     candidate_distances AS (
       SELECT us3.user_id,
              MIN(
                6371.0 * acos(
                  GREATEST(-1.0, LEAST(1.0,
                    sin(radians(mc.lat)) * sin(radians((cc->>'lat')::double precision)) +
                    cos(radians(mc.lat)) * cos(radians((cc->>'lat')::double precision)) *
                    cos(radians((cc->>'lng')::double precision - mc.lng))
                  ))
                )
              ) AS distance_km
         FROM user_settings us3
         CROSS JOIN jsonb_array_elements(us3.cities) AS cc
         CROSS JOIN my_coords mc
        WHERE (cc->>'lat') IS NOT NULL AND (cc->>'lng') IS NOT NULL
          AND us3.user_id IN (SELECT user_id FROM overlap_counts)
        GROUP BY us3.user_id
     ),
     scored AS (
       SELECT
         oc.user_id,
         oc.mutual_overlap,
         oc.they_have,
         oc.they_have_variant_ids,
         oc.you_have,
         cd.distance_km,
         -- Priority: high overlap beats low overlap; ties broken by closer
         -- distance. NULL distance → no penalty (treated as 0) so candidates
         -- without coordinates can still appear, ranked by overlap alone.
         oc.mutual_overlap - $7::float * COALESCE(cd.distance_km, 0) AS priority
       FROM overlap_counts oc
       LEFT JOIN candidate_distances cd ON cd.user_id = oc.user_id
     ),
     -- Radius filter applied here, before the population count, so the total
     -- the UI shows matches the candidates the user can actually page through.
     filtered AS (
       SELECT * FROM scored
        WHERE $8::boolean = false
           OR distance_km IS NULL
           OR distance_km <= $9::float
     ),
     total_pop AS (
       SELECT COUNT(*)::bigint AS total FROM filtered
     )
     SELECT
       f.user_id,
       u.username,
       u.display_name,
       u.avatar_url,
       f.mutual_overlap,
       COALESCE(f.they_have, ARRAY[]::text[]) AS they_have,
       COALESCE(f.they_have_variant_ids, ARRAY[]::text[]) AS they_have_variant_ids,
       COALESCE(f.you_have, ARRAY[]::text[]) AS you_have,
       COALESCE(us3.cities, '[]'::jsonb) AS cities,
       f.distance_km,
       f.priority,
       tp.total AS total_count
     FROM filtered f
     JOIN users u ON u.id = f.user_id
     LEFT JOIN user_settings us3 ON us3.user_id = f.user_id
     CROSS JOIN total_pop tp
     -- Cursor predicate is hand-expanded rather than tuple comparison because
     -- ORDER BY mixes directions (priority DESC, user_id ASC). Cursor stores
     -- priority * 1000 as an int to avoid float round-trip drift.
     WHERE $3::int IS NULL
        OR (f.priority * 1000)::int < $3::int
        OR ((f.priority * 1000)::int = $3::int AND f.user_id > $4::uuid)
     ORDER BY f.priority DESC, f.user_id ASC
     LIMIT $5`,
    [
      userId,
      albumId,
      cursorPriority,
      cursorUserId,
      limit + 1,
      JSON.stringify(requesterCoords),
      PRIORITY_DISTANCE_WEIGHT,
      applyRadius && requesterCoords.length > 0,
      requesterRadiusKm,
    ],
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
    distance_km: r.distance_km === null ? null : Number(r.distance_km),
  }));
  const last = pageRows[pageRows.length - 1];
  const nextCursor = hasMore && last
    ? `${Math.round(Number(last.priority) * 1000)}:${last.user_id}`
    : null;

  const result: TradeMatchesPage = { items, nextCursor, total };
  const indexKey = matchesIndexKey(userId);
  await redis
    .multi()
    .set(cacheKey, JSON.stringify(result), 'EX', TRADE_MATCHES_TTL_SECONDS)
    .sadd(indexKey, cacheKey)
    .expire(indexKey, TRADE_MATCHES_TTL_SECONDS + MATCHES_INDEX_BUFFER_SECONDS)
    .exec();

  return result;
}

// ───────────────────────────────────────────────────────────────────────────
// External-list matching (third-party / anonymous flows)
//
// matchAgainstUserAlbum — match a third-party's offered/wanted list against a
//   registered user's collection (their missing + their duplicates).
// matchPair — purely set-based match between two ephemeral lists, with codes
//   resolved against the catalog so the response carries player metadata.
//
// Both are ephemeral: no persistence, no cache, no rate-limit index.
// Identity is by album code, not variant — hand-written lists rarely carry
// variant detail and the existing trade-request flow can refine variants
// later if the parties decide to formalise.
// ───────────────────────────────────────────────────────────────────────────

export interface ExternalRef {
  albumCode: string;
  playerName: string | null;
  stickerType: 'extra' | 'coca_cola_special' | null;
  number: number | null;
}

export interface MatchAgainstMeOutcome {
  iGet: ExternalRef[];
  theyGet: ExternalRef[];
  unknownCodes: string[];
  mutualOverlap: number;
}

export interface MatchPairOutcome {
  aGets: ExternalRef[];
  bGets: ExternalRef[];
  unknownCodes: string[];
  mutualOverlap: number;
}

// Cap the number of unknown codes echoed back to the caller. A 500-all-bogus
// request would otherwise round-trip every garbage token, which is a cheap
// way to amplify response size. The diagnostic value is the same after ~50.
const UNKNOWN_ECHO_CAP = 50;

function dedupeCodes(input: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const code = normalizeAlbumCode(raw);
    if (code && !seen.has(code)) {
      seen.add(code);
      out.push(code);
    }
  }
  return out;
}

interface CatalogLookupRow {
  album_code: string;
  player_name: string | null;
  sticker_type: string;
  number: number;
}

async function lookupCatalogCodes(
  db: Pool,
  codes: string[],
  albumTypeKey: string,
): Promise<Map<string, ExternalRef>> {
  if (codes.length === 0) return new Map();
  // album_code is unique within an album type except for Coca-Cola regional
  // alternates; for those we pick a representative row (any regional variant
  // satisfies the slot for matching purposes).
  const { rows } = await db.query<CatalogLookupRow>(
    `SELECT DISTINCT ON (s.album_code)
            s.album_code, s.player_name, s.sticker_type, s.number
       FROM stickers s
       JOIN album_types at ON at.id = s.album_type_id
      WHERE at.key = $1
        AND s.album_code = ANY($2::text[])
      ORDER BY s.album_code, s.number ASC`,
    [albumTypeKey, codes],
  );
  const map = new Map<string, ExternalRef>();
  for (const r of rows) {
    map.set(r.album_code, {
      albumCode: r.album_code,
      playerName: r.player_name,
      stickerType:
        r.sticker_type === 'extra' ? 'extra'
        : r.sticker_type === 'coca_cola_special' ? 'coca_cola_special'
        : null,
      number: r.number,
    });
  }
  return map;
}

/**
 * matchAgainstUserAlbum — third-party list vs. a registered user's collection.
 * "iGet" is the set of codes the user is missing AND the third party offers.
 * "theyGet" is the set of codes the user has spares of AND the third party wants.
 * Album codes are resolved against the catalog (scoped to the user's album type)
 * so the response carries player metadata for display.
 */
export async function matchAgainstUserAlbum(
  db: Pool,
  userId: string,
  albumId: string,
  input: { theirOffered: string[]; theirWanted: string[] },
): Promise<MatchAgainstMeOutcome> {
  const offered = dedupeCodes(input.theirOffered);
  const wanted = dedupeCodes(input.theirWanted);
  if (offered.length === 0 && wanted.length === 0) {
    return { iGet: [], theyGet: [], unknownCodes: [], mutualOverlap: 0 };
  }

  // Resolve the album's type key once so the catalog lookup is scoped correctly.
  const { rows: albumRows } = await db.query<{ album_type_key: string }>(
    `SELECT at.key AS album_type_key
       FROM user_albums ua
       JOIN album_types at ON at.id = ua.album_type_id
      WHERE ua.id = $1 AND ua.user_id = $2`,
    [albumId, userId],
  );
  if (albumRows.length === 0) {
    throw Object.assign(new Error('Album not found.'), { statusCode: 404 });
  }
  const albumTypeKey = albumRows[0]!.album_type_key;

  // Codes the user does NOT own any variant of (= missing slots).
  // Codes the user owns 2+ copies of (or has trade_forced) — their duplicates.
  // We intersect inline against the inputs to avoid round-tripping the full
  // album state. Album code as identity matches the way the album-completion
  // count works in _sync_user_album_counts.
  const { rows: stateRows } = await db.query<{
    album_code: string;
    owned_qty: string;
    has_dupe: boolean;
  }>(
    `SELECT s.album_code,
            COALESCE(SUM(us.quantity), 0) AS owned_qty,
            BOOL_OR((us.quantity > 1) OR us.trade_forced) FILTER (WHERE NOT us.trade_hidden) AS has_dupe
       FROM stickers s
       JOIN album_types at ON at.id = s.album_type_id
       LEFT JOIN sticker_variants sv ON sv.sticker_id = s.id
       LEFT JOIN user_stickers us
              ON us.sticker_variant_id = sv.id
             AND us.album_id = $1
      WHERE at.key = $2
        AND s.album_code = ANY($3::text[])
      GROUP BY s.album_code`,
    [albumId, albumTypeKey, [...offered, ...wanted]],
  );

  const ownedByCode = new Map<string, { qty: number; hasDupe: boolean }>();
  for (const r of stateRows) {
    ownedByCode.set(r.album_code, {
      qty: Number(r.owned_qty),
      hasDupe: !!r.has_dupe,
    });
  }

  const myMissingCodes = offered.filter((c) => (ownedByCode.get(c)?.qty ?? 0) === 0);
  const myDuplicateCodes = wanted.filter((c) => ownedByCode.get(c)?.hasDupe);

  const catalog = await lookupCatalogCodes(db, [...new Set([...offered, ...wanted])], albumTypeKey);
  const unknownCodes = [...offered, ...wanted].filter((c) => !catalog.has(c));

  const refOf = (c: string): ExternalRef =>
    catalog.get(c) ?? { albumCode: c, playerName: null, stickerType: null, number: null };

  const iGet = myMissingCodes.filter((c) => catalog.has(c)).map(refOf);
  const theyGet = myDuplicateCodes.filter((c) => catalog.has(c)).map(refOf);

  return {
    iGet,
    theyGet,
    unknownCodes: [...new Set(unknownCodes)].slice(0, UNKNOWN_ECHO_CAP),
    mutualOverlap: iGet.length + theyGet.length,
  };
}

/**
 * matchPair — anonymous two-party matching.
 * Each side specifies offered + wanted. Person A receives stickers that are in
 * their wanted list AND in B's offered list; vice versa for Person B.
 * Codes are resolved against the catalog so the response carries player names.
 */
export async function matchPair(
  db: Pool,
  input: {
    a: { offered: string[]; wanted: string[] };
    b: { offered: string[]; wanted: string[] };
    albumTypeKey: string;
  },
): Promise<MatchPairOutcome> {
  const aOffered = dedupeCodes(input.a.offered);
  const aWanted = dedupeCodes(input.a.wanted);
  const bOffered = dedupeCodes(input.b.offered);
  const bWanted = dedupeCodes(input.b.wanted);

  const allCodes = [...new Set([...aOffered, ...aWanted, ...bOffered, ...bWanted])];
  const catalog = await lookupCatalogCodes(db, allCodes, input.albumTypeKey);
  const unknownCodes = allCodes.filter((c) => !catalog.has(c));

  const bOfferedSet = new Set(bOffered);
  const aOfferedSet = new Set(aOffered);

  const refOf = (c: string): ExternalRef =>
    catalog.get(c) ?? { albumCode: c, playerName: null, stickerType: null, number: null };

  const aGets = aWanted.filter((c) => bOfferedSet.has(c) && catalog.has(c)).map(refOf);
  const bGets = bWanted.filter((c) => aOfferedSet.has(c) && catalog.has(c)).map(refOf);

  return {
    aGets,
    bGets,
    unknownCodes: unknownCodes.slice(0, UNKNOWN_ECHO_CAP),
    mutualOverlap: aGets.length + bGets.length,
  };
}
