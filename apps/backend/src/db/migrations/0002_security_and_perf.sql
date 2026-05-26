-- Schema changes for the security + perf review pass:
--   1. Hash email/password-reset tokens at rest (only the cleartext leaves
--      the server, in the outgoing email).
--   2. Enforce one default album per user with a partial unique index.
--   3. Denormalize team_album_pages onto teams.pages so the per-row
--      team_pages_json() STABLE call goes away in hot paths.

-- ─── 1. Token hashing ─────────────────────────────────────────────────────────
-- Existing tokens become unusable; they're 24h / 1h lifetime so users just
-- request a new email link. No backward compat needed (see CLAUDE.md).

DELETE FROM email_verification_tokens;
ALTER TABLE email_verification_tokens RENAME COLUMN token TO token_hash;

DELETE FROM password_reset_tokens;
ALTER TABLE password_reset_tokens RENAME COLUMN token TO token_hash;
--> statement-breakpoint

-- ─── 2. One default album per user ────────────────────────────────────────────
-- Collapses any pre-existing duplicate defaults to a single winner (the most
-- recently updated) before the constraint goes on, so legacy data passes.

WITH ranked AS (
  SELECT id,
         user_id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id
           ORDER BY updated_at DESC, created_at DESC, id
         ) AS rn
  FROM user_albums
  WHERE is_default = true
)
UPDATE user_albums ua
   SET is_default = false
  FROM ranked r
 WHERE ua.id = r.id AND r.rn > 1;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS user_albums_one_default_per_user
  ON user_albums(user_id)
  WHERE is_default;
--> statement-breakpoint

-- ─── 3. Denormalized teams.pages ──────────────────────────────────────────────
-- The catalog query previously called team_pages_json(team_id) per distinct
-- team in a page via a CTE. Same value materialised on the team row removes
-- the function call entirely from the hot read path.

ALTER TABLE teams ADD COLUMN IF NOT EXISTS pages jsonb;
--> statement-breakpoint

UPDATE teams t
   SET pages = COALESCE((
     SELECT jsonb_object_agg(
              tap.edition,
              jsonb_build_array(tap.page_start, tap.page_end)
            )
       FROM team_album_pages tap
      WHERE tap.team_id = t.id
   ), '{}'::jsonb);
--> statement-breakpoint

CREATE OR REPLACE FUNCTION _refresh_team_pages(p_team_id uuid)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE teams t
     SET pages = COALESCE((
       SELECT jsonb_object_agg(
                tap.edition,
                jsonb_build_array(tap.page_start, tap.page_end)
              )
         FROM team_album_pages tap
        WHERE tap.team_id = t.id
     ), '{}'::jsonb)
   WHERE t.id = p_team_id;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION _trg_team_album_pages_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM _refresh_team_pages(OLD.team_id);
    RETURN OLD;
  END IF;
  PERFORM _refresh_team_pages(NEW.team_id);
  IF TG_OP = 'UPDATE' AND OLD.team_id IS DISTINCT FROM NEW.team_id THEN
    PERFORM _refresh_team_pages(OLD.team_id);
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS trg_team_album_pages_sync ON team_album_pages;
--> statement-breakpoint
CREATE TRIGGER trg_team_album_pages_sync
  AFTER INSERT OR UPDATE OR DELETE ON team_album_pages
  FOR EACH ROW EXECUTE FUNCTION _trg_team_album_pages_sync();
--> statement-breakpoint

-- Refresh sticker_full to read from the denormalized teams.pages column so
-- the (slow) team_pages_json() call no longer runs per row in catalog reads.
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
         t.pages           AS team_pages
  FROM stickers s
  LEFT JOIN teams t ON t.id = s.team_id;
