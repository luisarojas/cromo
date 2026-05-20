-- Migration 0024: stable helpers for two SQL patterns that are repeated across
-- the read-path services.
--
-- 1. team_pages_json(team_id) — replaces the inline
--      (SELECT jsonb_object_agg(tap.edition, jsonb_build_array(tap.page_start, tap.page_end))
--       FROM team_album_pages tap WHERE tap.team_id = s.team_id) AS team_pages
--    correlated subquery that appears in collection / sticker / missing /
--    duplicates queries. Centralising the aggregation in one function keeps
--    the call sites readable and lets the planner cache a single execution
--    plan instead of re-planning each inline subquery.
--
-- 2. sticker_full view — wraps the sticker → team → team_pages join so
--    services can `FROM sticker_full s` and get the enrichment without
--    repeating three JOIN clauses. Variant joins are still per-use-case
--    because they have different filter semantics across read paths.

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
