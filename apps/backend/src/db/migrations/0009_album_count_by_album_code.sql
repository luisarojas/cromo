-- Switch the album-count sync function to group by album_code instead of
-- sticker_id. With the Coca-Cola regional fan-out, one album_code can map to
-- several sticker rows (e.g. CC9 → Davies / Saliba / Ayew). "Album completion"
-- is per-slot, which is per album_code, so a user who owns any one regional
-- alternate has filled that slot. Non-CC subsets have one sticker per code, so
-- the count is unchanged for them.

CREATE OR REPLACE FUNCTION _sync_user_album_counts(p_album_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_album_id IS NULL THEN
    RETURN;
  END IF;

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
  stats AS (
    SELECT
      COUNT(DISTINCT fs.album_code)::int                                     AS total,
      COUNT(DISTINCT CASE WHEN us.quantity > 0 THEN fs.album_code END)::int  AS owned,
      COUNT(DISTINCT CASE WHEN us.quantity > 1 THEN fs.sticker_id END)::int  AS duplicates
    FROM filtered_stickers fs
    LEFT JOIN sticker_variants sv ON sv.sticker_id = fs.sticker_id
    LEFT JOIN user_stickers us
      ON us.sticker_variant_id = sv.id AND us.album_id = p_album_id
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

-- Backfill: re-sync every existing album so the new CC-aware totals land
-- without waiting for the next user write.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM user_albums LOOP
    PERFORM _sync_user_album_counts(r.id);
  END LOOP;
END
$$;
