-- Migration 0015: Missing indexes + denormalized album stats + favourites + report tracking.
--
-- 1. Trade_requests composite indexes for the hot `listTrades` query pattern
--    WHERE (requester_id = $1 OR recipient_id = $1) AND status = $2.
-- 2. user_stickers index on (album_id) alone — every collection query filters
--    on album_id; existing partial index only covers duplicates.
-- 3. trade_items index on sticker_variant_id used by trade matching joins.
-- 4. Denormalized counts on user_albums to retire the expensive getAlbumStats CTE.
-- 5. user_sticker_favourites table (replaces localStorage per-album favourites).

-- ── Indexes ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_trade_requests_requester_id_status
  ON trade_requests (requester_id, status);

CREATE INDEX IF NOT EXISTS idx_trade_requests_recipient_id_status
  ON trade_requests (recipient_id, status);

CREATE INDEX IF NOT EXISTS idx_user_stickers_album_id
  ON user_stickers (album_id);

CREATE INDEX IF NOT EXISTS idx_trade_items_sticker_variant_id
  ON trade_items (sticker_variant_id);

-- ── Denormalized counts on user_albums ─────────────────────────────────────────
-- owned_count    = distinct sticker IDs with quantity > 0 (respecting album settings)
-- duplicate_count = distinct sticker IDs with quantity > 1 (respecting album settings)
-- total_count    = catalog size matching this album's edition + settings
-- These are updated by application code inside the same transactions that mutate
-- user_stickers (addSticker / updateSticker / completeTrade / moveSticker /
-- removeSticker / setTradeFlags-no-op). Album setting/edition changes recompute
-- total_count and the owned/duplicate counts via a single SQL pass.
ALTER TABLE user_albums
  ADD COLUMN IF NOT EXISTS owned_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duplicate_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_count integer NOT NULL DEFAULT 0;

-- Backfill from current data using the same logic as getAlbumStats.
WITH album_info AS (
  SELECT ua.id AS album_id,
         ua.album_type_id,
         ae.key AS edition,
         (ua.settings->>'includeAllStickers')::boolean AS inc_all,
         (ua.settings->>'includeCocaCola')::boolean AS inc_coca,
         (ua.settings->>'includeNonAlbumMuseum')::boolean AS inc_museum
  FROM user_albums ua
  JOIN album_editions ae ON ae.id = ua.album_edition_id
),
filtered_stickers AS (
  SELECT ai.album_id, s.id AS sticker_id
  FROM album_info ai
  JOIN stickers s ON s.album_type_id = ai.album_type_id
  LEFT JOIN sticker_album_pages sap
    ON sap.sticker_id = s.id AND sap.edition = ai.edition
  LEFT JOIN team_album_pages tap
    ON tap.team_id = s.team_id AND tap.edition = ai.edition
  WHERE
    CASE
      WHEN s.sticker_type = 'coca_cola_special' THEN ai.inc_coca
      WHEN s.sticker_type = 'museum'
        AND sap.page_start IS NULL AND tap.page_start IS NULL THEN ai.inc_museum
      WHEN sap.page_start IS NOT NULL OR tap.page_start IS NOT NULL THEN true
      ELSE ai.inc_all
    END
),
stats AS (
  SELECT
    fs.album_id,
    COUNT(DISTINCT fs.sticker_id)::int AS total,
    COUNT(DISTINCT CASE WHEN us.quantity > 0 THEN fs.sticker_id END)::int AS owned,
    COUNT(DISTINCT CASE WHEN us.quantity > 1 THEN fs.sticker_id END)::int AS duplicates
  FROM filtered_stickers fs
  LEFT JOIN sticker_variants sv ON sv.sticker_id = fs.sticker_id
  LEFT JOIN user_stickers us
    ON us.sticker_variant_id = sv.id AND us.album_id = fs.album_id
  GROUP BY fs.album_id
)
UPDATE user_albums ua SET
  total_count    = COALESCE(s.total, 0),
  owned_count    = COALESCE(s.owned, 0),
  duplicate_count = COALESCE(s.duplicates, 0)
FROM stats s
WHERE s.album_id = ua.id;

-- ── user_sticker_favourites ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_sticker_favourites (
  album_id uuid NOT NULL REFERENCES user_albums(id) ON DELETE CASCADE,
  sticker_id uuid NOT NULL REFERENCES stickers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (album_id, sticker_id)
);

CREATE INDEX IF NOT EXISTS idx_user_sticker_favourites_album_id
  ON user_sticker_favourites (album_id);
