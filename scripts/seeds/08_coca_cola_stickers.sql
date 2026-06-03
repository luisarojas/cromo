-- scripts/seeds/08_coca_cola_stickers.sql
-- Coca-Cola Partnership stickers CC1–CC13
-- Part of a global marketing campaign; found exclusively behind Coca-Cola bottle labels.
-- Standard paper sticker — not foil. No parallels; one base_borderless variant per sticker
-- (the action-photo design has no visible border).
--
-- Regional fan-out: some CC codes resolve to different players depending on the market
-- the bottle was sold in. The catalog stores every regional alternate as its own row;
-- album_code is a display/group label, not a unique identifier. Identity is sticker_id.
-- See CLAUDE.md §5 and the "Sticker Types & Rarities — Source of Truth" section.

INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = s.team_code),
  s.player_name, s.position, 'coca_cola_special', false
FROM (VALUES
  -- Global (every region prints the same player)
  (981, 'CC1',  'ESP', 'Lamine Yamal',         'FWD'),
  (982, 'CC2',  'GER', 'Joshua Kimmich',       'MID'),
  (984, 'CC4',  'MEX', 'Santiago Giménez',     'FWD'),
  (987, 'CC7',  'MEX', 'Edson Álvarez',        'MID'),
  (990, 'CC10', 'USA', 'Weston McKennie',      'MID'),
  (991, 'CC11', 'ARG', 'Lautaro Martínez',     'FWD'),
  -- CC3 — Kane (default/NA), Camavinga (Europe)
  (983, 'CC3',  'ENG', 'Harry Kane',           'FWD'),
  (1013, 'CC3',  'FRA', 'Eduardo Camavinga',    'MID'),
  -- CC5 — Robinson (default/NA), Gvardiol (LatAm & Europe)
  (985, 'CC5',  'USA', 'Antonee Robinson',     'DEF'),
  (1014, 'CC5',  'CRO', 'Josko Gvardiol',       'DEF'),
  -- CC6 — Lerma (default/NA), Valverde (LatAm & Europe)
  (986, 'CC6',  'COL', 'Jefferson Lerma',      'MID'),
  (1015, 'CC6',  'URU', 'Federico Valverde',    'MID'),
  -- CC8 — Van Dijk (default/NA & Europe), Enner Valencia (LatAm)
  (988, 'CC8',  'NED', 'Virgil van Dijk',      'DEF'),
  (1016, 'CC8',  'ECU', 'Enner Valencia',       'FWD'),
  -- CC9 — Davies (NA), Saliba (Europe), Ayew (Rest of World)
  (989, 'CC9',  'CAN', 'Alphonso Davies',      'DEF'),
  (1017, 'CC9',  'FRA', 'William Saliba',       'DEF'),
  (1018, 'CC9',  'GHA', 'Jordan Ayew',          'FWD'),
  -- CC12 — Magalhães (default/NA & Europe), Emiliano Martínez (LatAm)
  (992, 'CC12', 'BRA', 'Gabriel Magalhães',    'DEF'),
  (1019, 'CC12', 'ARG', 'Emiliano Martínez',    'GK'),
  -- CC13 — Raúl Jiménez (LatAm & Europe only; absent from NA/RoW)
  (1020, 'CC13', 'MEX', 'Raúl Jiménez',        'FWD')
) AS s(number, album_code, team_code, player_name, position)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  album_code   = EXCLUDED.album_code,
  team_id      = EXCLUDED.team_id,
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position;

-- Single base variant per CC sticker; acquired via Coca-Cola bottles.
-- Borderless because Coca-Cola stickers are full-bleed action photos with no border.
INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id, 'base_borderless', 1, 'coca_cola'
FROM stickers
WHERE sticker_type = 'coca_cola_special'
ON CONFLICT (sticker_id, variant_type) DO NOTHING;
