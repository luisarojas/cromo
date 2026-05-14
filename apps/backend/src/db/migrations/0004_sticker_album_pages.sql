-- Migration 0004: Add sticker_album_pages table
-- Stores per-sticker, per-edition page locations for stickers that aren't
-- team-associated (intro/FWC, Coca-Cola, etc.). Replaces the hardcoded
-- COCA_COLA_LOCATION frontend config.

-- ─── Create sticker_album_pages ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sticker_album_pages (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  sticker_id  UUID    NOT NULL REFERENCES stickers(id) ON DELETE CASCADE,
  edition     TEXT    NOT NULL,
  page_start  INTEGER,
  page_end    INTEGER,
  description TEXT,
  CONSTRAINT sticker_album_pages_sticker_id_edition_unique UNIQUE (sticker_id, edition)
);

CREATE INDEX idx_sticker_album_pages_sticker_id ON sticker_album_pages(sticker_id);

