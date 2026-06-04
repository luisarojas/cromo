-- Restore the preference-aware duplicate calculation that 0005 added but 0009
-- accidentally dropped while switching total/owned to count by album_code.
--
-- 0005 made _sync_user_album_counts honour user_settings.duplicates_count_all_variants:
--   true  → a sticker is a duplicate when SUM(quantity) across its variants > 1
--   false → a sticker is a duplicate when any single variant has quantity > 1
-- 0006 flipped the default to true. 0009 rewrote the function for the CC
-- regional fan-out but hardcoded the false-branch logic, so the column
-- diverged from the frontend's isDuplicateSticker() rule and from the
-- preference-aware "extra copies" branch in getStatsAndExtras.
--
-- This migration keeps 0009's per-album_code total/owned counters (so CC slots
-- still complete by slot, not by regional alternate) and brings the duplicate
-- branch back to the 0005 preference-aware shape. Duplicates remain counted
-- per sticker_id rather than per album_code: every regional CC alternate you
-- own a second copy of is its own duplicate stack you could trade away.

CREATE OR REPLACE FUNCTION _sync_user_album_counts(p_album_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_count_all boolean := true;
BEGIN
  IF p_album_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(us.duplicates_count_all_variants, true)
    INTO v_count_all
  FROM user_albums ua
  LEFT JOIN user_settings us ON us.user_id = ua.user_id
  WHERE ua.id = p_album_id;

  WITH album_info AS (
    SELECT ua.album_type_id,
           (ua.settings->>'includeExtras')::boolean   AS inc_extras,
           (ua.settings->>'includeCocaCola')::boolean AS inc_coca
    FROM user_albums ua
    WHERE ua.id = p_album_id
  ),
  filtered_stickers AS (
    SELECT s.id AS sticker_id, s.album_code
    FROM album_info ai
    JOIN stickers s ON s.album_type_id = ai.album_type_id
    WHERE
      CASE
        WHEN s.sticker_type = 'coca_cola_special' THEN ai.inc_coca
        WHEN s.sticker_type = 'extra'             THEN ai.inc_extras
        ELSE true
      END
  ),
  per_sticker AS (
    SELECT fs.sticker_id,
           fs.album_code,
           COALESCE(SUM(us.quantity), 0) AS total_qty,
           COALESCE(MAX(us.quantity), 0) AS max_qty
    FROM filtered_stickers fs
    LEFT JOIN sticker_variants sv ON sv.sticker_id = fs.sticker_id
    LEFT JOIN user_stickers us
      ON us.sticker_variant_id = sv.id AND us.album_id = p_album_id
    GROUP BY fs.sticker_id, fs.album_code
  ),
  stats AS (
    SELECT
      COUNT(DISTINCT album_code)::int                                            AS total,
      COUNT(DISTINCT CASE WHEN total_qty > 0 THEN album_code END)::int           AS owned,
      CASE WHEN v_count_all
           THEN COUNT(*) FILTER (WHERE total_qty > 1)::int
           ELSE COUNT(*) FILTER (WHERE max_qty   > 1)::int
      END                                                                        AS duplicates
    FROM per_sticker
  )
  UPDATE user_albums ua
  SET total_count     = COALESCE(s.total, 0),
      owned_count     = COALESCE(s.owned, 0),
      duplicate_count = COALESCE(s.duplicates, 0)
  FROM stats s
  WHERE ua.id = p_album_id;
END;
$$;
--> statement-breakpoint

-- Backfill: every existing album has a duplicate_count computed under the
-- preference-blind per-variant rule from 0009. Recompute under the owner's
-- actual preference so the column matches the rest of the app on first boot.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM user_albums LOOP
    PERFORM _sync_user_album_counts(r.id);
  END LOOP;
END
$$;
