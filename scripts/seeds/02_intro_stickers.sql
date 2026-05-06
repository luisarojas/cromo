-- scripts/seeds/02_intro_stickers.sql
-- Stickers 00 and FWC1–FWC8 (introduction / emblem pages)
-- These have no team association — all are foil stickers
-- Source: paninitrade.com/checklist
-- NOTE: seed-data.md documented numbers 0–8 (provisional pre-release).
--       The actual album uses 1–9.

INSERT INTO stickers
  (number, album_code, team_id, player_name, sticker_type, is_foil)
VALUES
  (1, '00',   NULL, 'Panini Logo - We Are Panini',                  'intro', true),
  (2, 'FWC1', NULL, 'FIFA World Cup 2026 Official Emblem',           'intro', true),
  (3, 'FWC2', NULL, 'FIFA World Cup 2026 Official Emblem (Variant)', 'intro', true),
  (4, 'FWC3', NULL, 'FIFA World Cup 2026 Official Mascots',          'intro', true),
  (5, 'FWC4', NULL, 'FIFA World Cup 2026 Official Slogan',           'intro', true),
  (6, 'FWC5', NULL, 'FIFA World Cup 2026 Official Match Ball',       'intro', true),
  (7, 'FWC6', NULL, 'Canada — Host Country',                        'intro', true),
  (8, 'FWC7', NULL, 'Mexico — Host Country',                        'intro', true),
  (9, 'FWC8', NULL, 'United States — Host Country',                 'intro', true)
ON CONFLICT (album_code) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  sticker_type = EXCLUDED.sticker_type,
  is_foil      = EXCLUDED.is_foil;
