-- scripts/seeds/10_extra_stickers.sql
-- Panini "Extra Stickers" — 20 elite players (EX1–EX20)
-- Unnumbered inserts; no dedicated album slot. Randomly inserted in standard packs (~1 in 100).
-- High-gloss metallic foil. Four rarity tiers: Base, Bronze, Silver, Gold.
-- All variants available via retail packs.

INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = s.team_code),
  s.player_name, s.position, 'extra', true
FROM (VALUES
  ( 993, 'EX1',  'MAR', 'Achraf Hakimi',         'DEF'),
  ( 994, 'EX2',  'CAN', 'Alphonso Davies',        'DEF'),
  ( 995, 'EX3',  'USA', 'Christian Pulisic',      'FWD'),
  ( 996, 'EX4',  'NED', 'Cody Gakpo',             'FWD'),
  ( 997, 'EX5',  'POR', 'Cristiano Ronaldo',      'FWD'),
  ( 998, 'EX6',  'NOR', 'Erling Haaland',         'FWD'),
  ( 999, 'EX7',  'URU', 'Federico Valverde',      'MID'),
  (1000, 'EX8',  'GER', 'Florian Wirtz',          'MID'),
  (1001, 'EX9',  'KOR', 'Heung-min Son',          'FWD'),
  (1002, 'EX10', 'BEL', 'Jérémy Doku',            'FWD'),
  (1003, 'EX11', 'ENG', 'Jude Bellingham',        'MID'),
  (1004, 'EX12', 'FRA', 'Kylian Mbappé',          'FWD'),
  (1005, 'EX13', 'ESP', 'Lamine Yamal',           'FWD'),
  (1006, 'EX14', 'ARG', 'Lionel Messi',           'FWD'),
  (1007, 'EX15', 'COL', 'Luis Díaz',              'FWD'),
  (1008, 'EX16', 'CRO', 'Luka Modrić',            'MID'),
  (1009, 'EX17', 'EGY', 'Mohamed Salah',          'FWD'),
  (1010, 'EX18', 'ECU', 'Moisés Caicedo',         'MID'),
  (1011, 'EX19', 'MEX', 'Raúl Jiménez',           'FWD'),
  (1012, 'EX20', 'BRA', 'Vinícius Júnior',        'FWD')
) AS s(number, album_code, team_code, player_name, position)
ON CONFLICT (album_type_id, album_code) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position;

-- Four rarity-tiered variants per Extra sticker (Purple/Bronze/Silver/Gold per official checklist)
INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id,
       unnest(ARRAY['extra_purple', 'extra_bronze', 'extra_silver', 'extra_gold']),
       unnest(ARRAY[15, 16, 17, 18]),
       'retail'
FROM stickers
WHERE sticker_type = 'extra'
ON CONFLICT (sticker_id, variant_type) DO NOTHING;
