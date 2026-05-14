-- Migration 0002: Add team_album_pages table, drop stickers.album_page

-- ─── Create team_album_pages ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS team_album_pages (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  edition    TEXT        NOT NULL,
  page_start INTEGER     NOT NULL,
  page_end   INTEGER     NOT NULL,
  CONSTRAINT team_album_pages_team_id_edition_unique UNIQUE (team_id, edition)
);

CREATE INDEX idx_team_album_pages_team_id ON team_album_pages(team_id);

-- ─── Drop stickers.album_page ─────────────────────────────────────────────────

ALTER TABLE stickers DROP COLUMN IF EXISTS album_page;
