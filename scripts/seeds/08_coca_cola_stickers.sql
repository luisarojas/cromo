-- scripts/seeds/08_coca_cola_stickers.sql
-- Coca-Cola Partnership stickers CC1–CC12
-- Part of a global marketing campaign; found exclusively behind 500mL/600mL Coca-Cola bottle labels.
-- Standard paper sticker — not foil. No parallel variants; one base_border variant per sticker.

INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = s.team_code),
  s.player_name, s.position, 'coca_cola_special', false
FROM (VALUES
  (981, 'CC1',  'ESP', 'Lamine Yamal',        'FWD'),
  (982, 'CC2',  'GER', 'Joshua Kimmich',      'MID'),
  (983, 'CC3',  'ENG', 'Harry Kane',          'FWD'),
  (984, 'CC4',  'MEX', 'Santiago Giménez',    'FWD'),
  (985, 'CC5',  'USA', 'Antonee Robinson',    'DEF'),
  (986, 'CC6',  'COL', 'Jefferson Lerma',     'MID'),
  (987, 'CC7',  'MEX', 'Edson Álvarez',       'MID'),
  (988, 'CC8',  'NED', 'Virgil van Dijk',     'DEF'),
  (989, 'CC9',  'CAN', 'Alphonso Davies',     'DEF'),
  (990, 'CC10', 'USA', 'Weston McKennie',     'MID'),
  (991, 'CC11', 'ARG', 'Lautaro Martínez',    'FWD'),
  (992, 'CC12', 'BRA', 'Gabriel Magalhães',   'DEF')
) AS s(number, album_code, team_code, player_name, position)
ON CONFLICT (album_type_id, album_code) DO UPDATE SET
  team_id      = EXCLUDED.team_id,
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position;

-- Single base variant per CC sticker; acquired via Coca-Cola bottles
INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id, 'base_border', 1, 'coca_cola'
FROM stickers
WHERE sticker_type = 'coca_cola_special'
ON CONFLICT (sticker_id, variant_type) DO NOTHING;
