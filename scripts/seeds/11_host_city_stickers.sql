-- scripts/seeds/11_host_city_stickers.sql
-- Host City stickers HC1–HC16
-- One sticker per FIFA World Cup 2026 host city (11 USA, 2 Canada, 3 Mexico).
-- Museum/City type — no team association. Not foil.
-- Variants: standard parallels (base → black) + Orange Amazon exclusive.

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

-- Standard parallels (base → black_1of1) for non-foil HC stickers
INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id,
       unnest(ARRAY['base', 'blue', 'red', 'purple', 'green', 'black_1of1']),
       unnest(ARRAY[1, 2, 3, 4, 5, 6]),
       'retail'
FROM stickers
WHERE sticker_type = 'museum' AND album_code LIKE 'HC%'
ON CONFLICT (sticker_id, variant_type) DO NOTHING;

-- Orange Amazon exclusive for HC stickers
INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id, 'orange_amazon', 7, 'amazon_exclusive'
FROM stickers
WHERE sticker_type = 'museum' AND album_code LIKE 'HC%'
ON CONFLICT (sticker_id, variant_type) DO NOTHING;
