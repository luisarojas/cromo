-- Functions, triggers, and views.
-- These are not tracked by Drizzle's schema.ts, so they live as a hand-written
-- SQL migration that follows the auto-generated DDL baseline.

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
--> statement-breakpoint

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
--> statement-breakpoint

CREATE OR REPLACE FUNCTION _trg_user_albums_sync_counts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM _sync_user_album_counts(NEW.id);
    RETURN NEW;
  END IF;

  IF NEW.settings IS DISTINCT FROM OLD.settings
     OR NEW.album_type_id IS DISTINCT FROM OLD.album_type_id THEN
    PERFORM _sync_user_album_counts(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION team_pages_json(p_team_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_object_agg(
           tap.edition,
           jsonb_build_array(tap.page_start, tap.page_end)
         )
  FROM team_album_pages tap
  WHERE tap.team_id = p_team_id;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS trg_user_stickers_sync_counts ON user_stickers;
--> statement-breakpoint
CREATE TRIGGER trg_user_stickers_sync_counts
  AFTER INSERT OR UPDATE OR DELETE ON user_stickers
  FOR EACH ROW EXECUTE FUNCTION _trg_user_stickers_sync_counts();
--> statement-breakpoint

DROP TRIGGER IF EXISTS trg_user_albums_sync_counts ON user_albums;
--> statement-breakpoint
CREATE TRIGGER trg_user_albums_sync_counts
  AFTER INSERT OR UPDATE ON user_albums
  FOR EACH ROW EXECUTE FUNCTION _trg_user_albums_sync_counts();
--> statement-breakpoint

CREATE OR REPLACE VIEW sticker_full AS
  SELECT s.id              AS sticker_id,
         s.album_type_id,
         s.number,
         s.album_code,
         s.player_name,
         s.position,
         s.sticker_type,
         s.is_foil,
         s.notes,
         s.team_id,
         t.name            AS team_name,
         t.fifa_code,
         t.group_name,
         team_pages_json(s.team_id) AS team_pages
  FROM stickers s
  LEFT JOIN teams t ON t.id = s.team_id;
