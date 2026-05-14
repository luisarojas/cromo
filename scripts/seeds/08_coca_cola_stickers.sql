-- scripts/seeds/08_coca_cola_stickers.sql
-- Coca-Cola Partnership stickers CC1–CC12
-- Part of a global marketing campaign; found exclusively behind 500mL/600mL Coca-Cola bottle labels.
-- Standard paper sticker — not foil. No parallel variants; one base variant per sticker.

INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = s.team_code),
  s.player_name, s.position, 'coca_cola_special', false
FROM (VALUES
  (981, 'CC1',  'USA', 'Christian Pulisic',  'FWD'),
  (982, 'CC2',  'CAN', 'Alphonso Davies',    'DEF'),
  (983, 'CC3',  'MEX', 'Santiago Giménez',   'FWD'),
  (984, 'CC4',  'ARG', 'Lionel Messi',       'FWD'),
  (985, 'CC5',  'FRA', 'Kylian Mbappé',      'FWD'),
  (986, 'CC6',  'ENG', 'Jude Bellingham',    'MID'),
  (987, 'CC7',  'ESP', 'Lamine Yamal',       'FWD'),
  (988, 'CC8',  'BRA', 'Vinícius Júnior',    'FWD'),
  (989, 'CC9',  'GER', 'Jamal Musiala',      'MID'),
  (990, 'CC10', 'NOR', 'Erling Haaland',     'FWD'),
  (991, 'CC11', 'KOR', 'Son Heung-min',      'FWD'),
  (992, 'CC12', 'EGY', 'Mohamed Salah',      'FWD')
) AS s(number, album_code, team_code, player_name, position)
ON CONFLICT (album_type_id, album_code) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position;

-- Single base variant per CC sticker; acquired via Coca-Cola bottles
INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id, 'base', 1, 'coca_cola'
FROM stickers
WHERE sticker_type = 'coca_cola_special'
ON CONFLICT (sticker_id, variant_type) DO NOTHING;
