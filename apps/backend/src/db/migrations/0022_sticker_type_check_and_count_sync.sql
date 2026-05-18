-- Migration 0022: data-integrity guardrails.
--
-- 1. CHECK constraint on stickers.sticker_type so a bad INSERT can't corrupt the
--    catalog. Mirrors the StickerType union in @stickfolio/shared.
-- 2. Trigger-based safety net for the denormalized owned/duplicate/total counts
--    on user_albums. Application code still maintains them inside the same
--    transaction that mutates user_stickers, but if anything bypasses that path
--    (manual SQL, future code that forgets to call recomputeAlbumStats, etc.)
--    the trigger keeps the counts in sync. Compatible: the trigger does the same
--    work as services/album-stats.service.ts:recomputeAlbumStats.

-- ── sticker_type CHECK ────────────────────────────────────────────────────────
ALTER TABLE stickers
  DROP CONSTRAINT IF EXISTS stickers_sticker_type_check;

ALTER TABLE stickers
  ADD CONSTRAINT stickers_sticker_type_check CHECK (
    sticker_type IN (
      'intro',
      'badge',
      'team_photo',
      'player',
      'museum',
      'coca_cola_special',
      'extra'
    )
  );

-- ── Count-sync function + triggers ────────────────────────────────────────────
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
  stats AS (
    SELECT
      COUNT(DISTINCT fs.sticker_id)::int                                    AS total,
      COUNT(DISTINCT CASE WHEN us.quantity > 0 THEN fs.sticker_id END)::int AS owned,
      COUNT(DISTINCT CASE WHEN us.quantity > 1 THEN fs.sticker_id END)::int AS duplicates
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

-- Trigger function on user_stickers — recompute for the affected album (and the
-- old album, if the row's album_id changed).
CREATE OR REPLACE FUNCTION _trg_user_stickers_sync_counts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM _sync_user_album_counts(OLD.album_id);
    RETURN OLD;
  END IF;

  PERFORM _sync_user_album_counts(NEW.album_id);
  IF TG_OP = 'UPDATE' AND OLD.album_id IS DISTINCT FROM NEW.album_id THEN
    PERFORM _sync_user_album_counts(OLD.album_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_stickers_sync_counts ON user_stickers;
CREATE TRIGGER trg_user_stickers_sync_counts
  AFTER INSERT OR UPDATE OR DELETE ON user_stickers
  FOR EACH ROW EXECUTE FUNCTION _trg_user_stickers_sync_counts();

-- Trigger on user_albums — when settings change, recompute (the catalog filter
-- depends on includeExtras / includeCocaCola).
CREATE OR REPLACE FUNCTION _trg_user_albums_sync_counts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.settings IS DISTINCT FROM OLD.settings
     OR NEW.album_type_id IS DISTINCT FROM OLD.album_type_id THEN
    PERFORM _sync_user_album_counts(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_albums_sync_counts ON user_albums;
CREATE TRIGGER trg_user_albums_sync_counts
  AFTER UPDATE ON user_albums
  FOR EACH ROW EXECUTE FUNCTION _trg_user_albums_sync_counts();

-- Reconcile any existing drift now that the triggers are in place.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM user_albums LOOP
    PERFORM _sync_user_album_counts(r.id);
  END LOOP;
END $$;
