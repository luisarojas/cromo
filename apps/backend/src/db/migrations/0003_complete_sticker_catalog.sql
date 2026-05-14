-- Migration 0003: Complete sticker catalog
-- Adds CC1–CC12 (Coca-Cola), EX1–EX20 (Extra inserts), HC1–HC16 (Host Cities),
-- and L1–L10 (Swiss Legends) stickers plus their variants.
-- Enables FEATURE_COCA_COLA_STICKERS and adds FEATURE_EXTRA_STICKERS.

-- ─── Feature flags ────────────────────────────────────────────────────────────

UPDATE feature_flags
SET enabled = true, rollout_pct = 100, updated_at = now()
WHERE key = 'FEATURE_COCA_COLA_STICKERS';

INSERT INTO feature_flags (key, enabled, rollout_pct, description)
VALUES ('FEATURE_EXTRA_STICKERS', true, 100, 'Panini Extra Sticker inserts — 20-player foil set (4 rarities)')
ON CONFLICT (key) DO UPDATE SET enabled = true, rollout_pct = 100, updated_at = now();

-- ─── Coca-Cola Partnership stickers (CC1–CC12) ────────────────────────────────

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

INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id, 'base', 1, 'coca_cola'
FROM stickers
WHERE sticker_type = 'coca_cola_special'
ON CONFLICT (sticker_id, variant_type) DO NOTHING;

-- ─── Extra Stickers (EX1–EX20) ───────────────────────────────────────────────

INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = s.team_code),
  s.player_name, s.position, 'extra', true
FROM (VALUES
  ( 993, 'EX1',  'ARG', 'Lionel Messi',         'FWD'),
  ( 994, 'EX2',  'POR', 'Cristiano Ronaldo',     'FWD'),
  ( 995, 'EX3',  'FRA', 'Kylian Mbappé',         'FWD'),
  ( 996, 'EX4',  'ESP', 'Lamine Yamal',          'FWD'),
  ( 997, 'EX5',  'ENG', 'Jude Bellingham',       'MID'),
  ( 998, 'EX6',  'BRA', 'Vinícius Júnior',       'FWD'),
  ( 999, 'EX7',  'BRA', 'Endrick',               'FWD'),
  (1000, 'EX8',  'GER', 'Jamal Musiala',         'MID'),
  (1001, 'EX9',  'GER', 'Florian Wirtz',         'MID'),
  (1002, 'EX10', 'ENG', 'Bukayo Saka',           'FWD'),
  (1003, 'EX11', 'ENG', 'Phil Foden',            'MID'),
  (1004, 'EX12', 'ESP', 'Rodri',                 'MID'),
  (1005, 'EX13', 'FRA', 'Antoine Griezmann',     'FWD'),
  (1006, 'EX14', 'ARG', 'Lautaro Martínez',      'FWD'),
  (1007, 'EX15', 'CAN', 'Alphonso Davies',       'DEF'),
  (1008, 'EX16', 'USA', 'Christian Pulisic',     'FWD'),
  (1009, 'EX17', 'MEX', 'Santiago Giménez',      'FWD'),
  (1010, 'EX18', 'BEL', 'Kevin De Bruyne',       'MID'),
  (1011, 'EX19', 'POR', 'Rafael Leão',           'FWD'),
  (1012, 'EX20', 'BRA', 'Neymar Jr.',            'FWD')
) AS s(number, album_code, team_code, player_name, position)
ON CONFLICT (album_type_id, album_code) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position;

INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id,
       unnest(ARRAY['extra_base', 'extra_bronze', 'extra_silver', 'extra_gold']),
       unnest(ARRAY[15, 16, 17, 18]),
       'retail'
FROM stickers
WHERE sticker_type = 'extra'
ON CONFLICT (sticker_id, variant_type) DO NOTHING;

-- ─── Host City stickers (HC1–HC16) ───────────────────────────────────────────

INSERT INTO stickers
  (album_type_id, number, album_code, player_name, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code, s.city_name, 'museum', false
FROM (VALUES
  (1013, 'HC1',  'New York / New Jersey'),
  (1014, 'HC2',  'Los Angeles'),
  (1015, 'HC3',  'Dallas'),
  (1016, 'HC4',  'San Francisco Bay Area'),
  (1017, 'HC5',  'Miami'),
  (1018, 'HC6',  'Atlanta'),
  (1019, 'HC7',  'Seattle'),
  (1020, 'HC8',  'Boston'),
  (1021, 'HC9',  'Philadelphia'),
  (1022, 'HC10', 'Kansas City'),
  (1023, 'HC11', 'Houston'),
  (1024, 'HC12', 'Toronto'),
  (1025, 'HC13', 'Vancouver'),
  (1026, 'HC14', 'Mexico City'),
  (1027, 'HC15', 'Guadalajara'),
  (1028, 'HC16', 'Monterrey')
) AS s(number, album_code, city_name)
ON CONFLICT (album_type_id, album_code) DO UPDATE SET
  player_name = EXCLUDED.player_name;

INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id,
       unnest(ARRAY['base', 'blue', 'red', 'purple', 'green', 'black_1of1']),
       unnest(ARRAY[1, 2, 3, 4, 5, 6]),
       'retail'
FROM stickers
WHERE sticker_type = 'museum' AND album_code LIKE 'HC%'
ON CONFLICT (sticker_id, variant_type) DO NOTHING;

INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id, 'orange_amazon', 7, 'amazon_exclusive'
FROM stickers
WHERE sticker_type = 'museum' AND album_code LIKE 'HC%'
ON CONFLICT (sticker_id, variant_type) DO NOTHING;

-- ─── Swiss Legend stickers (L1–L10) ──────────────────────────────────────────

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

INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id, 'swiss_gold', 19, 'swiss_edition'
FROM stickers
WHERE album_code LIKE 'L%' AND sticker_type = 'museum' AND is_foil = true
  AND album_type_id = (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026')
ON CONFLICT (sticker_id, variant_type) DO NOTHING;
