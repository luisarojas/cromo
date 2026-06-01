-- Make _sync_user_album_counts honour the album owner's
-- user_settings.duplicates_count_all_variants preference, so the denormalized
-- duplicate_count column (read by the dashboard and the album page) matches
-- the user's chosen counting rule. Off (default): a sticker counts as a
-- duplicate when any one variant has qty > 1. On: a sticker counts when the
-- sum of qty across all its variants is > 1.

CREATE OR REPLACE FUNCTION _sync_user_album_counts(p_album_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_count_all boolean := false;
BEGIN
  IF p_album_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(us.duplicates_count_all_variants, false)
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
    SELECT s.id AS sticker_id
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
           COALESCE(SUM(us.quantity), 0) AS total_qty,
           COALESCE(MAX(us.quantity), 0) AS max_qty
    FROM filtered_stickers fs
    LEFT JOIN sticker_variants sv ON sv.sticker_id = fs.sticker_id
    LEFT JOIN user_stickers us
      ON us.sticker_variant_id = sv.id AND us.album_id = p_album_id
    GROUP BY fs.sticker_id
  ),
  stats AS (
    SELECT
      COUNT(*)::int                                AS total,
      COUNT(*) FILTER (WHERE total_qty > 0)::int   AS owned,
      CASE WHEN v_count_all
           THEN COUNT(*) FILTER (WHERE total_qty > 1)::int
           ELSE COUNT(*) FILTER (WHERE max_qty   > 1)::int
      END                                          AS duplicates
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

-- Backfill: every existing album currently has duplicate_count computed under
-- the per-variant rule. Recompute under whichever rule the owner now prefers
-- so the column reflects reality on first boot of the new function.
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN SELECT id FROM user_albums LOOP
    PERFORM _sync_user_album_counts(rec.id);
  END LOOP;
END;
$$;
