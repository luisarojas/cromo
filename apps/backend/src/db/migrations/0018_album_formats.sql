-- Migration: 0018_album_formats
-- Description: Add album_formats + album_edition_formats, link user_albums to a format,
--              and add a free-text `notes` field for serial numbers / edition annotations.
--              No backward compat: existing user_albums are wiped (per CLAUDE.md).

CREATE TABLE IF NOT EXISTS album_formats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_type_id UUID NOT NULL REFERENCES album_types(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS album_formats_album_type_id_key_unique ON album_formats(album_type_id, key);
CREATE UNIQUE INDEX IF NOT EXISTS album_formats_id_album_type_id_unique ON album_formats(id, album_type_id);
CREATE INDEX IF NOT EXISTS idx_album_formats_album_type_id ON album_formats(album_type_id);

-- Junction holds its own album_type_id so the composite FKs below can prove
-- that the linked edition and format both belong to the same album type — no
-- cross-type pollution is structurally representable.
CREATE TABLE IF NOT EXISTS album_edition_formats (
  album_type_id    UUID NOT NULL REFERENCES album_types(id) ON DELETE CASCADE,
  album_edition_id UUID NOT NULL,
  album_format_id  UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (album_edition_id, album_format_id),
  CONSTRAINT album_edition_formats_edition_matches_type
    FOREIGN KEY (album_edition_id, album_type_id)
    REFERENCES album_editions(id, album_type_id) ON DELETE CASCADE,
  CONSTRAINT album_edition_formats_format_matches_type
    FOREIGN KEY (album_format_id, album_type_id)
    REFERENCES album_formats(id, album_type_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_album_edition_formats_edition_id ON album_edition_formats(album_edition_id);
CREATE INDEX IF NOT EXISTS idx_album_edition_formats_format_id  ON album_edition_formats(album_format_id);
CREATE INDEX IF NOT EXISTS idx_album_edition_formats_type_id    ON album_edition_formats(album_type_id);

-- ─── Seed: formats for fifa_world_cup_2026 ────────────────────────────────────

INSERT INTO album_formats (album_type_id, key, name)
SELECT t.id, f.key, f.name
FROM album_types t
CROSS JOIN (VALUES
  ('softcover_standard',  'Softcover'),
  ('hardcover',           'Hardcover'),
  ('limited_hardcover',   'Limited Hardcover (Treasure Box)'),
  ('silver_hardcover',    'Silver Hardcover'),
  ('gold_hardcover',      'Gold Hardcover'),
  ('metallised_softcover','Metallised Softcover')
) AS f(key, name)
WHERE t.key = 'fifa_world_cup_2026'
ON CONFLICT (album_type_id, key) DO UPDATE SET name = EXCLUDED.name;

-- ─── Seed: per-edition format availability ────────────────────────────────────
-- Softcover Standard + Hardcover are globally available, so map to every edition.
-- Metallised Softcover and Limited Hardcover are Switzerland-only → swiss_gold.
-- Silver / Gold Hardcover are French premium variants → international (France
-- ships the international edition; if a France-specific edition is added later
-- the mapping can be moved there).

INSERT INTO album_edition_formats (album_type_id, album_edition_id, album_format_id)
SELECT at.id, ae.id, af.id
FROM album_editions ae
JOIN album_types at ON at.id = ae.album_type_id
JOIN album_formats af ON af.album_type_id = at.id
WHERE at.key = 'fifa_world_cup_2026'
  AND (
    af.key IN ('softcover_standard', 'hardcover')
    OR (af.key IN ('metallised_softcover', 'limited_hardcover') AND ae.key = 'swiss_gold')
    OR (af.key IN ('silver_hardcover', 'gold_hardcover')        AND ae.key = 'international')
  )
ON CONFLICT (album_edition_id, album_format_id) DO NOTHING;

-- ─── user_albums: wipe and add format columns ─────────────────────────────────
-- trade_requests FKs to user_albums lack ON DELETE CASCADE, so clear the
-- dependency chain manually before wiping user_albums.

TRUNCATE user_albums CASCADE;

ALTER TABLE user_albums
  ADD COLUMN album_format_id UUID NOT NULL,
  ADD COLUMN notes TEXT
    CHECK (notes IS NULL OR char_length(notes) <= 500);

CREATE INDEX IF NOT EXISTS idx_user_albums_album_format_id ON user_albums(album_format_id);

ALTER TABLE user_albums
  ADD CONSTRAINT user_albums_format_matches_type
    FOREIGN KEY (album_format_id, album_type_id)
    REFERENCES album_formats(id, album_type_id);

ALTER TABLE user_albums
  ADD CONSTRAINT user_albums_edition_format_valid
    FOREIGN KEY (album_edition_id, album_format_id)
    REFERENCES album_edition_formats(album_edition_id, album_format_id);
