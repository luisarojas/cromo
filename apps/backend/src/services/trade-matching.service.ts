// Coverage note: this file sits in the aggregate-only coverage floor (see
// vitest.config.ts). The matchmaking CTE is hand-tuned SQL with branches
// (radius on/off, requester-with-no-coords, Coca-Cola album_code widening,
// scarcity weighting, cursor decoding) that integration-test through
// trade.test.ts but resist line-by-line unit tests because the value is in
// whether the CTE returns the right rows against real fixtures, not in any
// individual TS branch. Don't chase the missing percentage with mocked DB
// stubs — they'd lie.
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import type {
  ExternalListItem,
  ScarcityTotals,
  StickerType,
  VariantWeights,
} from '@cromo/shared';
import {
  computeScarcityBalance,
  effectiveScarcity,
  isSingleVariantTrade,
  variantScarcity,
} from '@cromo/shared';
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
 * Per-user index of trade-matches cache keys. invalidateMatchesFor uses this
 * to drop a user's match cache in O(set size) instead of SCANning the
 * keyspace. The index TTL is kept slightly longer than the cache TTL so a
 * write can never produce an indexed key that outlives its membership.
 */
export function matchesIndexKey(userId: string): string {
  return `trade:matches:idx:${userId}`;
}

/**
 * invalidateMatchesFor — drop every cached matchmaker result for the given
 * users. Call after any event that changes a user's tradable inventory
 * (trade completion, live-trade commit/undo, sticker scan that adds a
 * duplicate, etc.) so the next /matches request rebuilds against fresh
 * counts instead of serving a stale page.
 */
export async function invalidateMatchesFor(redis: Redis, userIds: string[]): Promise<void> {
  const indexKeys = userIds.map(matchesIndexKey);
  const memberArrays = await Promise.all(indexKeys.map((k) => redis.smembers(k)));

  const allKeys = memberArrays.flat();
  if (allKeys.length === 0 && indexKeys.length === 0) return;

  const CHUNK = 500;
  const pipeline = redis.pipeline();
  for (let i = 0; i < allKeys.length; i += CHUNK) {
    pipeline.unlink(...allKeys.slice(i, i + CHUNK));
  }
  if (indexKeys.length > 0) pipeline.unlink(...indexKeys);
  await pipeline.exec();
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
       SELECT album_type_id,
              COALESCE((settings->>'duplicatesCountAllVariants')::boolean, true) AS count_all
       FROM user_albums WHERE id = $2
     ),
     my_missing AS (
       -- Explicitly wanted variants: respect the user's specific variant
       -- preference. This is the variant-collector exception to "never offer a
       -- sticker you already own" — a collector who explicitly wants BRA5(red)
       -- while owning BRA5(base) DOES want the red, so it's offered. The
       -- implicit arm below is what enforces the owned-in-any-variant rule.
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
       -- Spares I could give away. Per-variant excess (qty > 1 / trade_forced)
       -- always counts; when the album counts all variants as duplicates, a
       -- single copy also counts as long as another copy of the same sticker
       -- (any variant) stays behind.
       SELECT us.sticker_variant_id AS variant_id
       FROM user_stickers us
       JOIN sticker_variants sv ON sv.id = us.sticker_variant_id
       WHERE us.album_id = $2
         AND NOT us.trade_hidden
         AND (
           us.quantity > 1 OR us.trade_forced
           OR (
             (SELECT count_all FROM requester_album)
             AND us.quantity > 0
             AND (SELECT SUM(us3.quantity)
                    FROM user_stickers us3
                    JOIN sticker_variants sv3 ON sv3.id = us3.sticker_variant_id
                   WHERE us3.album_id = $2
                     AND sv3.sticker_id = sv.sticker_id) > 1
           )
         )
     ),
     candidate_albums AS (
       -- Matchmaker scope: public albums only. Private (owner-only) and
       -- unlisted (capability-by-URL only) albums are intentionally excluded
       -- from discovery so trade matches never surface inventory the owner
       -- didn't opt into making public.
       SELECT DISTINCT ON (ua.user_id) ua.id AS album_id, ua.user_id,
              COALESCE((ua.settings->>'duplicatesCountAllVariants')::boolean, true) AS count_all
       FROM user_albums ua
       LEFT JOIN user_settings us2 ON us2.user_id = ua.user_id
       JOIN users u ON u.id = ua.user_id
       WHERE ua.user_id != $1
         AND ua.album_type_id = (SELECT album_type_id FROM requester_album)
         AND ua.trade_inventory_visibility = 'public'
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
       -- Same spare rule as my_duplicates, evaluated under EACH candidate
       -- album's own duplicatesCountAllVariants setting.
       SELECT ca.user_id, ca.album_id, ca.count_all, uss.sticker_variant_id AS variant_id, s.album_code
       FROM candidate_albums ca
       JOIN user_stickers uss ON uss.album_id = ca.album_id
       JOIN sticker_variants sv ON sv.id = uss.sticker_variant_id
       JOIN stickers s ON s.id = sv.sticker_id
       WHERE uss.sticker_variant_id IN (SELECT variant_id FROM my_missing)
         AND NOT uss.trade_hidden
         AND (
           uss.quantity > 1 OR uss.trade_forced
           OR (
             ca.count_all
             AND uss.quantity > 0
             AND (SELECT SUM(q.quantity)
                    FROM user_stickers q
                    JOIN sticker_variants qv ON qv.id = q.sticker_variant_id
                   WHERE q.album_id = ca.album_id
                     AND qv.sticker_id = sv.sticker_id) > 1
           )
         )
     ),
     i_have_their_missing AS (
       SELECT ca.user_id, md.variant_id, s.album_code
       FROM candidate_albums ca
       CROSS JOIN my_duplicates md
       JOIN sticker_variants sv ON sv.id = md.variant_id
       JOIN stickers s ON s.id = sv.sticker_id
       WHERE (
         -- They explicitly want this exact variant (variant-collector exception:
         -- honoured even if they own a different variant of the same sticker).
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
         AND NOT uss.trade_hidden
         AND (
           uss.quantity > 1 OR uss.trade_forced
           OR (
             thm.count_all
             AND uss.quantity > 0
             AND (SELECT SUM(q.quantity)
                    FROM user_stickers q
                    JOIN sticker_variants qv ON qv.id = q.sticker_variant_id
                   WHERE q.album_id = thm.album_id
                     AND qv.sticker_id = sv_all.sticker_id) > 1
           )
         )
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
//
// Identity is `(album_code, variant_type)`. An input item with variantToken
// left null is resolved to the album's default base variant per sticker type:
//   • Coca-Cola stickers          → base_borderless (always)
//   • Extras                      → extra_purple
//   • Everything else (core/FWC)  → the album owner's defaultBaseVariant
//                                   (base_border for NA-edition albums,
//                                   base_borderless otherwise). matchPair
//                                   has no album owner, so it falls back to
//                                   base_borderless — the global default.
// ───────────────────────────────────────────────────────────────────────────

export interface ExternalRef {
  albumCode: string;
  playerName: string | null;
  /** Team for player/badge/team_photo stickers; null for FWC, CC, Extras. */
  teamName: string | null;
  stickerType: StickerType | null;
  number: number | null;
  variantToken: string | null;
  variantLabel: string | null;
  stickerVariantId: string | null;
  /** Representative sticker_id (parent of stickerVariantId). Used to match
   *  favourites — they key by sticker_id, not variant_id. Optional because
   *  the anonymous matchPair flow has no album-scoped favourites context. */
  stickerId?: string | null;
  scarcity: number;
  quantity: number;
  /** Set by matchAgainstUserAlbum when the requester has flagged this sticker
   *  as a favourite in this album. Drives the "starred" badge + priority sort
   *  in the editable third-party UI. */
  favourite?: boolean;
  /** Set when the requester has explicitly added this variant to their wanted
   *  list. Independent of `favourite` — wanted is per-variant, favourite is
   *  per-sticker. */
  wanted?: boolean;
}

export interface MatchAgainstMeOutcome {
  /** Suggested selection — the subset the optimizer recommends the user
   *  receive. Always a subset of `candidatesIGet`. The third-party UI uses
   *  this as the default checkbox state; the user can edit. */
  iGet: ExternalRef[];
  /** Suggested selection — the subset the user would give. Subset of
   *  `candidatesTheyGet`. */
  theyGet: ExternalRef[];
  /** Full pool of stickers the requester could receive (their offered ∩ the
   *  requester's missing). Includes items the suggestion trimmed away so the
   *  editable UI can offer them as toggleable options. */
  candidatesIGet: ExternalRef[];
  /** Full pool of stickers the requester could give (their wanted ∩ the
   *  requester's spares). */
  candidatesTheyGet: ExternalRef[];
  unknownCodes: string[];
  mutualOverlap: number;
  balance: ScarcityTotals;
}

export interface MatchPairOutcome {
  aGets: ExternalRef[];
  bGets: ExternalRef[];
  unknownCodes: string[];
  mutualOverlap: number;
  balance: ScarcityTotals;
}

// Cap the number of unknown codes echoed back to the caller. A 500-all-bogus
// request would otherwise round-trip every garbage token, which is a cheap
// way to amplify response size. The diagnostic value is the same after ~50.
const UNKNOWN_ECHO_CAP = 50;

/**
 * Pick the default variant to assume when a list line carries no variant tag.
 * The user's stated preference is the default for core stickers; CC and Extras
 * are handled by absolute fallback because they have their own variant lanes.
 */
export function defaultVariantFor(
  stickerType: string,
  defaultBaseVariant: string,
): string {
  if (stickerType === 'coca_cola_special') return 'base_borderless';
  if (stickerType === 'extra') return 'extra_purple';
  return defaultBaseVariant === 'base_border' ? 'base_border' : 'base_borderless';
}

const VARIANT_LABELS: Record<string, string> = {
  base_border: 'Base · White Border',
  base_borderless: 'Base',
  blue: 'Blue',
  red: 'Red',
  purple: 'Purple',
  green: 'Green',
  black: 'Black',
  orange_amazon: 'Orange · Amazon',
  swiss_green: 'Swiss · Light Green',
  gold_crumple: 'Gold · Crumple',
  blue_crumple: 'Blue · Crumple',
  red_crumple: 'Red · Crumple',
  purple_crumple: 'Purple · Crumple',
  green_crumple: 'Green · Crumple',
  black_crumple: 'Black · Crumple',
  extra_purple: 'Extra · Purple',
  extra_bronze: 'Extra · Bronze',
  extra_silver: 'Extra · Silver',
  extra_gold: 'Extra · Gold',
};

export function labelFor(token: string | null): string | null {
  if (!token) return null;
  return VARIANT_LABELS[token] ?? token;
}

export interface NormalisedItem {
  albumCode: string;
  /** Raw user-supplied token (still un-resolved against album context). */
  variantToken: string | null;
  quantity: number;
}

export function dedupeItems(input: ExternalListItem[]): NormalisedItem[] {
  const seen = new Map<string, NormalisedItem>();
  for (const raw of input) {
    const code = normalizeAlbumCode(raw.albumCode);
    if (!code) continue;
    const token = raw.variantToken && raw.variantToken.trim() !== ''
      ? raw.variantToken.trim().toLowerCase()
      : null;
    const qty = Math.max(1, Math.min(99, Math.floor(raw.quantity || 1)));
    const key = `${code}|${token ?? ''}`;
    const existing = seen.get(key);
    if (existing) {
      existing.quantity = Math.min(99, existing.quantity + qty);
    } else {
      seen.set(key, { albumCode: code, variantToken: token, quantity: qty });
    }
  }
  return [...seen.values()];
}

interface CatalogVariantRow {
  album_code: string;
  player_name: string | null;
  team_name: string | null;
  sticker_type: string;
  number: number;
  sticker_id: string;
  variant_type: string;
  sticker_variant_id: string;
}

export interface CatalogEntry {
  albumCode: string;
  playerName: string | null;
  teamName: string | null;
  stickerType: string;
  number: number;
  /** Representative sticker_id for this album_code. For CC slots with regional
   *  alternates, this is the lowest-numbered alternate (matches playerName).
   *  Used by callers that key off `stickers.id` (e.g. user_sticker_favourites). */
  stickerId: string;
  /** Variants available for this album_code, keyed by variant_type. */
  variants: Map<string, { stickerVariantId: string }>;
}

export async function lookupCatalogVariants(
  db: Pool,
  codes: string[],
  albumTypeKey: string,
): Promise<Map<string, CatalogEntry>> {
  if (codes.length === 0) return new Map();
  // For CC slots, multiple sticker rows share one album_code (regional alternates).
  // Picking the lowest number gives a stable representative — variant lanes are
  // identical across alternates, so the choice doesn't affect ownership math.
  const { rows } = await db.query<CatalogVariantRow>(
    `SELECT s.album_code,
            s.player_name,
            t.name AS team_name,
            s.sticker_type,
            s.number,
            s.id AS sticker_id,
            sv.variant_type,
            sv.id AS sticker_variant_id
       FROM stickers s
       JOIN album_types at ON at.id = s.album_type_id
       JOIN sticker_variants sv ON sv.sticker_id = s.id
       LEFT JOIN teams t ON t.id = s.team_id
      WHERE at.key = $1
        AND s.album_code = ANY($2::text[])`,
    [albumTypeKey, codes],
  );

  const out = new Map<string, CatalogEntry>();
  for (const r of rows) {
    let entry = out.get(r.album_code);
    if (!entry) {
      entry = {
        albumCode: r.album_code,
        playerName: r.player_name,
        teamName: r.team_name,
        stickerType: r.sticker_type,
        number: r.number,
        stickerId: r.sticker_id,
        variants: new Map(),
      };
      out.set(r.album_code, entry);
    } else if (r.number < entry.number) {
      // Stable representative across CC regional alternates: lowest sticker
      // number wins. (Player name displayed in the UI will be that one's.)
      entry.playerName = r.player_name;
      entry.teamName = r.team_name;
      entry.number = r.number;
      entry.stickerId = r.sticker_id;
    }
    // For shared CC album_codes, the same variant_type may appear once per
    // regional row — keep the first; ownership is by sticker_variant_id, so
    // a single representative is all we need for downstream lookups.
    if (!entry.variants.has(r.variant_type)) {
      entry.variants.set(r.variant_type, { stickerVariantId: r.sticker_variant_id });
    }
  }
  return out;
}

/**
 * Resolve a NormalisedItem against the catalog, producing a CatalogEntry +
 * concrete variant_type, or null when either the code or the requested
 * variant is unknown.
 */
function resolveItem(
  item: NormalisedItem,
  catalog: Map<string, CatalogEntry>,
  defaultBaseVariant: string,
): { entry: CatalogEntry; variantType: string; stickerVariantId: string } | null {
  const entry = catalog.get(item.albumCode);
  if (!entry) return null;
  const variantType = item.variantToken ?? defaultVariantFor(entry.stickerType, defaultBaseVariant);
  const v = entry.variants.get(variantType);
  if (!v) return null;
  return { entry, variantType, stickerVariantId: v.stickerVariantId };
}

export interface ResolvedItem {
  entry: CatalogEntry;
  variantType: string;
  stickerVariantId: string;
  quantity: number;
  /** Source item's raw token — preserved so the response can surface what the
   *  user actually typed when it didn't resolve, instead of just the code. */
  rawToken: string | null;
}

export function resolveItems(
  items: NormalisedItem[],
  catalog: Map<string, CatalogEntry>,
  defaultBaseVariant: string,
): { resolved: ResolvedItem[]; unknown: string[] } {
  const resolved: ResolvedItem[] = [];
  const unknown: string[] = [];
  for (const item of items) {
    const r = resolveItem(item, catalog, defaultBaseVariant);
    if (!r) {
      unknown.push(item.variantToken ? `${item.albumCode}(${item.variantToken})` : item.albumCode);
      continue;
    }
    resolved.push({
      entry: r.entry,
      variantType: r.variantType,
      stickerVariantId: r.stickerVariantId,
      quantity: item.quantity,
      rawToken: item.variantToken,
    });
  }
  return { resolved, unknown };
}

export function refOf(r: ResolvedItem): ExternalRef {
  return {
    albumCode: r.entry.albumCode,
    playerName: r.entry.playerName,
    teamName: r.entry.teamName,
    stickerType: r.entry.stickerType as StickerType,
    number: r.entry.number,
    variantToken: r.variantType,
    variantLabel: labelFor(r.variantType),
    stickerVariantId: r.stickerVariantId,
    stickerId: r.entry.stickerId,
    scarcity: variantScarcity(r.variantType),
    quantity: r.quantity,
  };
}

// Local convenience around computeScarcityBalance. The shared helper takes a
// 4-arg shape; this collapses the optional cash hint so the call sites in this
// service read the same as before the cash extension.
function computeBalance(
  give: ExternalRef[],
  get: ExternalRef[],
  weights?: VariantWeights | null,
  cash?: { giveCashCents?: number; getCashCents?: number },
): ScarcityTotals {
  return computeScarcityBalance(give, get, {
    weights,
    giveCashCents: cash?.giveCashCents,
    getCashCents: cash?.getCashCents,
  });
}

/**
 * matchAgainstUserAlbum — third-party list vs. a registered user's collection.
 * "iGet" is what the user receives (the third party offers it AND the user
 * owns NO variant of that sticker). "theyGet" is what the user gives (the
 * third party wants it AND the user has a spare of that exact variant).
 *
 * Receive side is per-STICKER by default: we never recommend the user receive
 * a sticker they already own in ANY variant — owning BRA5(base) means BRA5(red)
 * is "owned" and is never suggested (CC widens to album_code: owning any
 * regional alternate fills the slot). The variant-collector exception: if the
 * user has explicitly added BRA5(red) to their wanted list, it IS offered even
 * while they own BRA5(base) — an explicit per-variant want is a deliberate
 * signal. The exact variant they already own is never offered either way. The
 * give side stays per-variant for MATCHING (a spare of BRA5(base) only
 * satisfies a want for BRA5(base)), but what counts as a "spare" follows the
 * album's duplicatesCountAllVariants setting: when on, a single copy of a
 * variant is a spare as long as the user owns another copy of the sticker in
 * any variant.
 */
export async function matchAgainstUserAlbum(
  db: Pool,
  userId: string,
  albumId: string,
  input: {
    theirOffered: ExternalListItem[];
    theirWanted: ExternalListItem[];
    variantWeights?: VariantWeights | null;
  },
): Promise<MatchAgainstMeOutcome> {
  const offered = dedupeItems(input.theirOffered);
  const wanted = dedupeItems(input.theirWanted);
  if (offered.length === 0 && wanted.length === 0) {
    return {
      iGet: [], theyGet: [], candidatesIGet: [], candidatesTheyGet: [],
      unknownCodes: [], mutualOverlap: 0,
      balance: { give: 0, get: 0, ratio: null, lopsided: false, sameVariant: false },
    };
  }

  // Resolve the album's type key + the owner's preferred base variant so
  // untagged items map to the right "base" for this album region.
  const { rows: albumRows } = await db.query<{
    album_type_key: string;
    settings: { defaultBaseVariant?: string; duplicatesCountAllVariants?: boolean } | null;
  }>(
    `SELECT at.key AS album_type_key, ua.settings
       FROM user_albums ua
       JOIN album_types at ON at.id = ua.album_type_id
      WHERE ua.id = $1 AND ua.user_id = $2`,
    [albumId, userId],
  );
  if (albumRows.length === 0) {
    throw Object.assign(new Error('Album not found.'), { statusCode: 404 });
  }
  const albumTypeKey = albumRows[0]!.album_type_key;
  const defaultBaseVariant = albumRows[0]!.settings?.defaultBaseVariant ?? 'base_borderless';
  const countAllVariants = albumRows[0]!.settings?.duplicatesCountAllVariants ?? true;

  const allCodes = [...new Set([...offered, ...wanted].map((i) => i.albumCode))];
  const catalog = await lookupCatalogVariants(db, allCodes, albumTypeKey);

  const { resolved: offeredRes, unknown: unknownOffered } = resolveItems(offered, catalog, defaultBaseVariant);
  const { resolved: wantedRes, unknown: unknownWanted } = resolveItems(wanted, catalog, defaultBaseVariant);

  // Per-variant ownership: a sticker_variant the user has 0 of is "missing"
  // for the iGet path; one with qty > 1 or trade_forced is a "spare" for
  // theyGet. Both filters require the variant to NOT be trade_hidden when we
  // evaluate the spare flag (matches the FILTER clause in the user-album
  // matching CTE).
  const variantIds = [
    ...new Set([...offeredRes, ...wantedRes].map((r) => r.stickerVariantId)),
  ];

  const { rows: stateRows } = variantIds.length === 0
    ? { rows: [] as { sticker_variant_id: string; sticker_id: string; qty: string; visible_qty: string; spare: boolean }[] }
    : await db.query<{ sticker_variant_id: string; sticker_id: string; qty: string; visible_qty: string; spare: boolean }>(
        `SELECT us.sticker_variant_id,
                sv.sticker_id,
                COALESCE(SUM(us.quantity), 0) AS qty,
                COALESCE(SUM(us.quantity) FILTER (WHERE NOT us.trade_hidden), 0) AS visible_qty,
                BOOL_OR((us.quantity > 1) OR us.trade_forced) FILTER (WHERE NOT us.trade_hidden) AS spare
           FROM user_stickers us
           JOIN sticker_variants sv ON sv.id = us.sticker_variant_id
          WHERE us.album_id = $1
            AND us.sticker_variant_id = ANY($2::uuid[])
          GROUP BY us.sticker_variant_id, sv.sticker_id`,
        [albumId, variantIds],
      );

  const ownedByVariant = new Map<string, { stickerId: string; qty: number; visibleQty: number; spare: boolean }>();
  for (const r of stateRows) {
    ownedByVariant.set(r.sticker_variant_id, {
      stickerId: r.sticker_id,
      qty: Number(r.qty),
      visibleQty: Number(r.visible_qty),
      spare: !!r.spare,
    });
  }

  // Sticker-level ownership for the receive side: a trade must never hand the
  // user a sticker they already own in ANY variant. Owning BRA5(base) makes
  // BRA5(red) "owned" for receive purposes too, so it can't be a candidate to
  // receive. CC widens to album_code (owning any regional alternate fills the
  // slot). This is the per-STICKER check, distinct from ownedByVariant's
  // per-variant spare check used on the give side.
  const { rows: ownedRows } = await db.query<{
    sticker_id: string;
    album_code: string;
    sticker_type: string;
    total_qty: string;
  }>(
    `SELECT s.id AS sticker_id, s.album_code, s.sticker_type,
            SUM(us.quantity) AS total_qty
       FROM user_stickers us
       JOIN sticker_variants sv ON sv.id = us.sticker_variant_id
       JOIN stickers s ON s.id = sv.sticker_id
      WHERE us.album_id = $1 AND us.quantity > 0
      GROUP BY s.id, s.album_code, s.sticker_type`,
    [albumId],
  );
  const ownedStickerIds = new Set(ownedRows.map((r) => r.sticker_id));
  const ownedCcAlbumCodes = new Set(
    ownedRows
      .filter((r) => r.sticker_type === 'coca_cola_special')
      .map((r) => r.album_code),
  );
  // Copies owned per sticker across ALL its variants — the all-variants
  // duplicates rule needs the sticker-level total to decide whether a
  // single-copy variant still leaves the slot filled after being traded away.
  const totalOwnedBySticker = new Map(
    ownedRows.map((r) => [r.sticker_id, Number(r.total_qty)]),
  );

  // Pull the user's favourites + wanted lists for this album so the optimizer
  // can surface "you marked this as wanted" / "you starred this" first when
  // suggesting what to receive. Both queries are tiny (typically <100 rows)
  // and run in parallel with each other.
  const [favRows, wantedRows] = await Promise.all([
    db.query<{ sticker_id: string }>(
      `SELECT sticker_id FROM user_sticker_favourites WHERE album_id = $1`,
      [albumId],
    ),
    db.query<{ sticker_variant_id: string }>(
      `SELECT sticker_variant_id FROM user_wanted_variants
        WHERE user_id = $1 AND album_id = $2`,
      [userId, albumId],
    ),
  ]);
  const favouriteStickerIds = new Set(favRows.rows.map((r) => r.sticker_id));
  const wantedVariantIds = new Set(wantedRows.rows.map((r) => r.sticker_variant_id));

  const candidatesIGet = offeredRes
    .filter((r) => {
      // Already own this EXACT variant → never receive it.
      if ((ownedByVariant.get(r.stickerVariantId)?.qty ?? 0) > 0) return false;
      // Variant-collector exception: an explicit per-variant want is offered even
      // when another variant of the sticker is owned.
      if (wantedVariantIds.has(r.stickerVariantId)) return true;
      // Otherwise never receive a sticker already owned in any variant (CC: any alternate).
      if (ownedStickerIds.has(r.entry.stickerId)) return false;
      if (
        r.entry.stickerType === 'coca_cola_special' &&
        ownedCcAlbumCodes.has(r.entry.albumCode)
      ) {
        return false;
      }
      return true;
    })
    .map((r) => {
      const ref = refOf(r);
      ref.favourite = favouriteStickerIds.has(r.entry.stickerId);
      ref.wanted = wantedVariantIds.has(r.stickerVariantId);
      return ref;
    });
  const candidatesTheyGet = wantedRes
    .filter((r) => {
      const st = ownedByVariant.get(r.stickerVariantId);
      if (!st) return false;
      // Per-variant spare: a second copy of this exact variant (or trade_forced).
      if (st.spare) return true;
      // All-variants duplicates: when the album counts variants as duplicates,
      // a single tradeable copy is a spare as long as another copy of the same
      // sticker (any variant) stays behind — owning NED3(base)+NED3(blue) means
      // either one can be given away.
      return (
        countAllVariants &&
        st.visibleQty > 0 &&
        (totalOwnedBySticker.get(st.stickerId) ?? 0) > 1
      );
    })
    .map(refOf);

  const { iGet, theyGet } = selectOptimalSubset(
    candidatesIGet,
    candidatesTheyGet,
    input.variantWeights ?? null,
  );

  const balance = computeBalance(theyGet, iGet, input.variantWeights);
  const unknownCodes = [...new Set([...unknownOffered, ...unknownWanted])].slice(0, UNKNOWN_ECHO_CAP);

  return {
    iGet,
    theyGet,
    candidatesIGet,
    candidatesTheyGet,
    unknownCodes,
    mutualOverlap: iGet.length + theyGet.length,
    balance,
  };
}

/**
 * priorityScore — higher means "user wants this more".
 * Favourites trump wanted; both trump untagged stickers. Scarcity is a tiny
 * tiebreaker so when forced to drop one of two equal-priority items we keep
 * the rarer one. Cap at 4 priority tiers (fav+want, fav, want, none) so the
 * sort is stable and explainable.
 */
function priorityScore(ref: ExternalRef): number {
  let score = 0;
  if (ref.favourite) score += 100;
  if (ref.wanted) score += 50;
  return score;
}

/**
 * selectOptimalSubset — pick a default suggestion from the full candidate
 * pools that:
 *   1. Surfaces favourites and wanted-marked items first on the receive side.
 *   2. When both sides collapse to a single variant lane, trims to equal
 *      counts (same-variant trades are only fair at exact parity).
 *   3. When the receive side has fewer items than the give side, trims the
 *      give side down to the same length, preferring to keep types that
 *      mirror the receive side's distribution. This keeps the suggestion
 *      from looking like "I give you 12 base team stickers for 3 base FWC"
 *      when a 3-for-3 same-bucket trade is possible.
 *
 * Returns subsets — the full pools remain available so the editable UI can
 * offer the trimmed items as toggleable additions.
 */
function selectOptimalSubset(
  candidatesIGet: ExternalRef[],
  candidatesTheyGet: ExternalRef[],
  weights: VariantWeights | null,
): { iGet: ExternalRef[]; theyGet: ExternalRef[] } {
  // Honour per-trade weight overrides so the suggestion agrees with the
  // displayed balance. When weights are null this collapses to variantScarcity
  // (the value already baked into ref.scarcity), so the legacy behaviour is
  // preserved.
  const w = (r: ExternalRef): number => effectiveScarcity(r.variantToken, weights);

  // Sort iGet by priority (favourite > wanted > none), then weighted scarcity
  // desc so rarer cards float up within the same priority tier, then number
  // asc for a stable, album-ordered display.
  const sortedIGet = [...candidatesIGet].sort((a, b) => {
    const ps = priorityScore(b) - priorityScore(a);
    if (ps !== 0) return ps;
    const sw = w(b) - w(a);
    if (sw !== 0) return sw;
    return (a.number ?? 0) - (b.number ?? 0);
  });
  // Sort theyGet by weighted scarcity asc — when forced to trim, drop the most
  // valuable stickers I'd be giving up first. Number asc for stable order.
  const sortedTheyGet = [...candidatesTheyGet].sort((a, b) => {
    const sw = w(a) - w(b);
    if (sw !== 0) return sw;
    return (a.number ?? 0) - (b.number ?? 0);
  });

  // Same-variant parity: when both sides are a single (matching) variant lane,
  // any imbalance is unfair regardless of scarcity. Trim both sides to the
  // smaller length so the suggestion is honest about what the math allows.
  const sameVariant = isSingleVariantTrade(sortedIGet, sortedTheyGet);
  if (sameVariant && sortedIGet.length !== sortedTheyGet.length) {
    const target = Math.min(sortedIGet.length, sortedTheyGet.length);
    return {
      iGet: sortedIGet.slice(0, target),
      theyGet: sortedTheyGet.slice(0, target),
    };
  }

  // Mixed-variant case: don't trim iGet (user wants what they want), but if
  // theyGet is longer than iGet, prefer to mirror iGet's type distribution.
  if (sortedIGet.length > 0 && sortedTheyGet.length > sortedIGet.length) {
    return {
      iGet: sortedIGet,
      theyGet: pickTypeMirroredSubset(sortedTheyGet, sortedIGet, sortedIGet.length),
    };
  }

  return { iGet: sortedIGet, theyGet: sortedTheyGet };
}

/**
 * pickTypeMirroredSubset — given a pool and a target distribution (the other
 * side of the trade), pick `n` items whose sticker_type counts approximate
 * the target's. Greedy: walk the pool in its pre-sorted order, but prefer
 * items whose type still has remaining quota in the target. Falls through to
 * pool order once quotas are met.
 *
 * This is a soft heuristic — used only when the give side has more candidates
 * than the receive side. Not a hard constraint; the user can re-add trimmed
 * items via the editable UI.
 */
function pickTypeMirroredSubset(
  pool: ExternalRef[],
  target: ExternalRef[],
  n: number,
): ExternalRef[] {
  if (n >= pool.length) return pool.slice(0);
  if (n <= 0) return [];

  // Tally target distribution by sticker_type. Untyped items bucket under '_'.
  const quota = new Map<string, number>();
  for (const r of target) {
    const key = r.stickerType ?? '_';
    quota.set(key, (quota.get(key) ?? 0) + 1);
  }

  const picked: ExternalRef[] = [];
  const skipped: ExternalRef[] = [];
  for (const item of pool) {
    if (picked.length >= n) break;
    const key = item.stickerType ?? '_';
    const remaining = quota.get(key) ?? 0;
    if (remaining > 0) {
      picked.push(item);
      quota.set(key, remaining - 1);
    } else {
      skipped.push(item);
    }
  }
  // Fill remaining slots from the items that didn't match the type quota,
  // preserving the pool's original sort order (scarcity asc).
  for (const item of skipped) {
    if (picked.length >= n) break;
    picked.push(item);
  }
  return picked;
}

/**
 * matchPair — anonymous two-party matching.
 * Each side specifies offered + wanted. Person A receives stickers in their
 * wanted list AND in B's offered list; vice versa for Person B. Identity is
 * `(album_code, variant_type)` like matchAgainstUserAlbum.
 */
export async function matchPair(
  db: Pool,
  input: {
    a: { offered: ExternalListItem[]; wanted: ExternalListItem[] };
    b: { offered: ExternalListItem[]; wanted: ExternalListItem[] };
    albumTypeKey: string;
    variantWeights?: VariantWeights | null;
  },
): Promise<MatchPairOutcome> {
  const aOffered = dedupeItems(input.a.offered);
  const aWanted = dedupeItems(input.a.wanted);
  const bOffered = dedupeItems(input.b.offered);
  const bWanted = dedupeItems(input.b.wanted);

  const allCodes = [...new Set([
    ...aOffered, ...aWanted, ...bOffered, ...bWanted,
  ].map((i) => i.albumCode))];

  const catalog = await lookupCatalogVariants(db, allCodes, input.albumTypeKey);

  // No album owner here, so untagged items resolve to the global default.
  // North-American collectors using match-pair just need to type "(base)" or
  // "(white)" if they want the bordered base. CC and Extras get their own
  // sticker-type fallbacks regardless.
  const DEFAULT_BASE = 'base_borderless';

  // Unknowns from all four lists feed `unknownCodes` so the UI can flag what
  // didn't resolve, regardless of which side it came from.
  const { resolved: aOfferedR, unknown: uAO } = resolveItems(aOffered, catalog, DEFAULT_BASE);
  const { resolved: aWantedR,  unknown: uAW } = resolveItems(aWanted,  catalog, DEFAULT_BASE);
  const { resolved: bOfferedR, unknown: uBO } = resolveItems(bOffered, catalog, DEFAULT_BASE);
  const { resolved: bWantedR,  unknown: uBW } = resolveItems(bWanted,  catalog, DEFAULT_BASE);

  const bOfferedSet = new Set(bOfferedR.map((r) => r.stickerVariantId));
  const aOfferedSet = new Set(aOfferedR.map((r) => r.stickerVariantId));

  const aGets = aWantedR.filter((r) => bOfferedSet.has(r.stickerVariantId)).map(refOf);
  const bGets = bWantedR.filter((r) => aOfferedSet.has(r.stickerVariantId)).map(refOf);

  const balance = computeBalance(bGets, aGets, input.variantWeights);
  const unknownCodes = [...new Set([...uAO, ...uAW, ...uBO, ...uBW])].slice(0, UNKNOWN_ECHO_CAP);

  return {
    aGets,
    bGets,
    unknownCodes,
    mutualOverlap: aGets.length + bGets.length,
    balance,
  };
}
