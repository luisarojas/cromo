-- Move the "count all variants as duplicates" preference from the account
-- (user_settings.duplicates_count_all_variants) onto each album
-- (user_albums.settings->>'duplicatesCountAllVariants'). It's a property of
-- how the collector runs a given album, so it belongs with the album's other
-- per-album knobs (includeExtras / includeCocaCola / defaultBaseVariant).
--
-- Order matters: backfill the jsonb from the old column, then repoint
-- _sync_user_album_counts at the jsonb, then drop the column.

UPDATE user_albums ua
SET settings = COALESCE(ua.settings, '{}'::jsonb)
             || jsonb_build_object(
                  'duplicatesCountAllVariants',
                  COALESCE(us.duplicates_count_all_variants, true)
                )
FROM users u
LEFT JOIN user_settings us ON us.user_id = u.id
WHERE ua.user_id = u.id;
--> statement-breakpoint

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

  SELECT COALESCE((ua.settings->>'duplicatesCountAllVariants')::boolean, true)
    INTO v_count_all
  FROM user_albums ua
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

ALTER TABLE "user_albums" ALTER COLUMN "settings" SET DEFAULT '{"includeExtras":true,"includeCocaCola":true,"defaultBaseVariant":"base_borderless","duplicatesCountAllVariants":true}'::jsonb;
--> statement-breakpoint

ALTER TABLE "user_settings" DROP COLUMN "duplicates_count_all_variants";
