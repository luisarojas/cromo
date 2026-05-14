-- scripts/seeds/12_swiss_legend_stickers.sql
-- Swiss Legends stickers L1–L10
-- Exclusive to the Swiss Gold edition of the album.
-- Foil sticker — one variant only: swiss_gold (swiss_edition availability).
-- No standard parallels; no Amazon/iCollect variants.

INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'SUI'),
  s.player_name, s.position, 'museum', true
FROM (VALUES
  (1029, 'L1',  'Stéphane Chapuisat', 'FWD'),
  (1030, 'L2',  'Alex Frei',          'FWD'),
  (1031, 'L3',  'Köbi Kuhn',          'MID'),
  (1032, 'L4',  'Roger Vonlanthen',   'FWD'),
  (1033, 'L5',  'Alain Geiger',       'DEF'),
  (1034, 'L6',  'Patrick Müller',     'DEF'),
  (1035, 'L7',  'Marco Streller',     'FWD'),
  (1036, 'L8',  'Hakan Yakin',        'MID'),
  (1037, 'L9',  'Xherdan Shaqiri',    'FWD'),
  (1038, 'L10', 'Granit Xhaka',       'MID')
) AS s(number, album_code, player_name, position)
ON CONFLICT (album_type_id, album_code) DO UPDATE SET
  player_name = EXCLUDED.player_name,
  position    = EXCLUDED.position;

-- Swiss Gold is the only variant for these stickers
INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id, 'swiss_gold', 19, 'swiss_edition'
FROM stickers
WHERE album_code LIKE 'L%' AND sticker_type = 'museum' AND is_foil = true
  AND album_type_id = (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026')
ON CONFLICT (sticker_id, variant_type) DO NOTHING;
