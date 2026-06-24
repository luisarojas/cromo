-- scripts/seeds/15_orphan_team_cleanup.sql
-- Runs last in the catalog seed (see apps/backend/src/db/seed.ts).
--
-- When a team's fifa_code is renamed in 01_teams.sql, the upsert there
-- inserts a fresh row under the new code and leaves the old row behind.
-- The sticker seeds (03/08/10) now re-point team_id via ON CONFLICT, so
-- the stale row ends up with no stickers — and we can safely drop it.
-- (teams → team_album_pages cascades on delete; teams is otherwise only
-- referenced from stickers, which we've already re-pointed.)
DELETE FROM teams
 WHERE NOT EXISTS (
   SELECT 1 FROM stickers s WHERE s.team_id = teams.id
 );
