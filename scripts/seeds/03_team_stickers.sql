-- scripts/seeds/03_team_stickers.sql
-- 960 team stickers — all 48 teams × 20 stickers each
-- Ordered by album order (Group A → Group L)
-- Source: paninitrade.com/checklist (verified against checklistinsider.com)
-- NOTE: Sticker numbers are 1-based per the actual Panini album.
--       seed-data.md used provisional 0-based numbering before album release.

-- ─────────────────────────────────────────────────────────
-- GROUP A — MEXICO (stickers 10–29, MEX1–MEX20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'MEX'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  (  10, 'MEX1', NULL, 'Team Logo - Mexico', NULL, 'badge', true),
  (  11, 'MEX2', 'Luis Malagón', 'Luis Malagón', 'GK', 'player', false),
  (  12, 'MEX3', 'Johan Vásquez', 'Johan Vásquez', 'DEF', 'player', false),
  (  13, 'MEX4', 'Jorge Sánchez', 'Jorge Sánchez', 'DEF', 'player', false),
  (  14, 'MEX5', 'César Montes', 'César Montes', 'DEF', 'player', false),
  (  15, 'MEX6', 'Jesús Gallardo', 'Jesús Gallardo', 'DEF', 'player', false),
  (  16, 'MEX7', 'Israel Reyes', 'Israel Reyes', 'DEF', 'player', false),
  (  17, 'MEX8', 'Diego Lainez', 'Diego Lainez', 'MID', 'player', false),
  (  18, 'MEX9', 'Carlos Rodríguez', 'Carlos Rodríguez', 'MID', 'player', false),
  (  19, 'MEX10', 'Edson Álvarez', 'Edson Álvarez', 'MID', 'player', false),
  (  20, 'MEX11', 'Orbelín Pineda', 'Orbelín Pineda', 'MID', 'player', false),
  (  21, 'MEX12', 'Marcel Ruiz', 'Marcel Ruiz', 'MID', 'player', false),
  (  22, 'MEX13', NULL, 'Team Photo - Mexico', NULL, 'team_photo', false),
  (  23, 'MEX14', 'Érick Sánchez', 'Érick Sánchez', 'MID', 'player', false),
  (  24, 'MEX15', 'Hirving Lozano', 'Hirving Lozano', 'FWD', 'player', false),
  (  25, 'MEX16', 'Santiago Giménez', 'Santiago Giménez', 'FWD', 'player', false),
  (  26, 'MEX17', 'Raúl Jiménez', 'Raúl Jiménez', 'FWD', 'player', false),
  (  27, 'MEX18', 'Alexis Vega', 'Alexis Vega', 'FWD', 'player', false),
  (  28, 'MEX19', 'Roberto Alvarado', 'Roberto Alvarado', 'FWD', 'player', false),
  (  29, 'MEX20', 'César Huerta', 'César Huerta', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP A — SOUTH AFRICA (stickers 30–49, RSA1–RSA20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'RSA'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  (  30, 'RSA1', NULL, 'Team Logo - South Africa', NULL, 'badge', true),
  (  31, 'RSA2', 'Ronwen Williams', 'Ronwen Williams', 'GK', 'player', false),
  (  32, 'RSA3', 'Sipho Chaine', 'Sipho Chaine', 'GK', 'player', false),
  (  33, 'RSA4', 'Aubrey Modiba', 'Aubrey Modiba', 'DEF', 'player', false),
  (  34, 'RSA5', 'Samukelo Kabini', 'Samukelo Kabini', 'DEF', 'player', false),
  (  35, 'RSA6', 'Mbekezeli Mbokazi', 'Mbekezeli Mbokazi', 'DEF', 'player', false),
  (  36, 'RSA7', 'Khulumani Ndamane', 'Khulumani Ndamane', 'DEF', 'player', false),
  (  37, 'RSA8', 'Siyabonga Ngezana', 'Siyabonga Ngezana', 'DEF', 'player', false),
  (  38, 'RSA9', 'Khuliso Mudau', 'Khuliso Mudau', 'MID', 'player', false),
  (  39, 'RSA10', 'Nkosinathi Sibisi', 'Nkosinathi Sibisi', 'MID', 'player', false),
  (  40, 'RSA11', 'Teboho Mokoena', 'Teboho Mokoena', 'MID', 'player', false),
  (  41, 'RSA12', 'Thalente Mbatha', 'Thalente Mbatha', 'MID', 'player', false),
  (  42, 'RSA13', NULL, 'Team Photo - South Africa', NULL, 'team_photo', false),
  (  43, 'RSA14', 'Bathusi Aubaas', 'Bathusi Aubaas', 'MID', 'player', false),
  (  44, 'RSA15', 'Yaya Sithole', 'Yaya Sithole', 'FWD', 'player', false),
  (  45, 'RSA16', 'Sipho Mbule', 'Sipho Mbule', 'FWD', 'player', false),
  (  46, 'RSA17', 'Lyle Foster', 'Lyle Foster', 'FWD', 'player', false),
  (  47, 'RSA18', 'Iqraam Rayners', 'Iqraam Rayners', 'FWD', 'player', false),
  (  48, 'RSA19', 'Mohau Nkota', 'Mohau Nkota', 'FWD', 'player', false),
  (  49, 'RSA20', 'Oswin Appollis', 'Oswin Appollis', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP A — SOUTH KOREA (stickers 50–69, KOR1–KOR20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'KOR'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  (  50, 'KOR1', NULL, 'Team Logo - South Korea', NULL, 'badge', true),
  (  51, 'KOR2', 'Hyeon-woo Jo', 'Hyeon-woo Jo', 'GK', 'player', false),
  (  52, 'KOR3', 'Seung-gyu Kim', 'Seung-gyu Kim', 'GK', 'player', false),
  (  53, 'KOR4', 'Min-jae Kim', 'Min-jae Kim', 'DEF', 'player', false),
  (  54, 'KOR5', 'Yu-min Cho', 'Yu-min Cho', 'DEF', 'player', false),
  (  55, 'KOR6', 'Young-woo Seol', 'Young-woo Seol', 'DEF', 'player', false),
  (  56, 'KOR7', 'Han-beom Lee', 'Han-beom Lee', 'DEF', 'player', false),
  (  57, 'KOR8', 'Tae-seok Lee', 'Tae-seok Lee', 'DEF', 'player', false),
  (  58, 'KOR9', 'Myung-jae Lee', 'Myung-jae Lee', 'MID', 'player', false),
  (  59, 'KOR10', 'Jae-sung Lee', 'Jae-sung Lee', 'MID', 'player', false),
  (  60, 'KOR11', 'In-beom Hwang', 'In-beom Hwang', 'MID', 'player', false),
  (  61, 'KOR12', 'Kang-in Lee', 'Kang-in Lee', 'MID', 'player', false),
  (  62, 'KOR13', NULL, 'Team Photo - South Korea', NULL, 'team_photo', false),
  (  63, 'KOR14', 'Seung-ho Paik', 'Seung-ho Paik', 'MID', 'player', false),
  (  64, 'KOR15', 'Jens Castrop', 'Jens Castrop', 'MID', 'player', false),
  (  65, 'KOR16', 'Dong-gyeong Lee', 'Dong-gyeong Lee', 'MID', 'player', false),
  (  66, 'KOR17', 'Gue-sung Cho', 'Gue-sung Cho', 'FWD', 'player', false),
  (  67, 'KOR18', 'Heung-min Son', 'Heung-min Son', 'FWD', 'player', false),
  (  68, 'KOR19', 'Hee-chan Hwang', 'Hee-chan Hwang', 'FWD', 'player', false),
  (  69, 'KOR20', 'Hyeon-gyu Oh', 'Hyeon-gyu Oh', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP A — CZECH REPUBLIC (stickers 70–89, CZE1–CZE20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'CZE'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  (  70, 'CZE1', NULL, 'Team Logo - Czech Republic', NULL, 'badge', true),
  (  71, 'CZE2', 'Matěj Kovář', 'Matěj Kovář', 'GK', 'player', false),
  (  72, 'CZE3', 'Jindřich Staněk', 'Jindřich Staněk', 'GK', 'player', false),
  (  73, 'CZE4', 'Ladislav Krejčí', 'Ladislav Krejčí', 'DEF', 'player', false),
  (  74, 'CZE5', 'Vladimír Coufal', 'Vladimír Coufal', 'DEF', 'player', false),
  (  75, 'CZE6', 'Jaroslav Zelený', 'Jaroslav Zelený', 'DEF', 'player', false),
  (  76, 'CZE7', 'Tomáš Holeš', 'Tomáš Holeš', 'DEF', 'player', false),
  (  77, 'CZE8', 'David Zima', 'David Zima', 'DEF', 'player', false),
  (  78, 'CZE9', 'Michal Sadílek', 'Michal Sadílek', 'MID', 'player', false),
  (  79, 'CZE10', 'Lukáš Provod', 'Lukáš Provod', 'MID', 'player', false),
  (  80, 'CZE11', 'Lukáš Červ', 'Lukáš Červ', 'MID', 'player', false),
  (  81, 'CZE12', 'Tomáš Souček', 'Tomáš Souček', 'MID', 'player', false),
  (  82, 'CZE13', NULL, 'Team Photo - Czech Republic', NULL, 'team_photo', false),
  (  83, 'CZE14', 'Pavel Šulc', 'Pavel Šulc', 'MID', 'player', false),
  (  84, 'CZE15', 'Matěj Vydra', 'Matěj Vydra', 'FWD', 'player', false),
  (  85, 'CZE16', 'Vasil Kušej', 'Vasil Kušej', 'FWD', 'player', false),
  (  86, 'CZE17', 'Tomáš Chorý', 'Tomáš Chorý', 'FWD', 'player', false),
  (  87, 'CZE18', 'Václav Černý', 'Václav Černý', 'FWD', 'player', false),
  (  88, 'CZE19', 'Adam Hložek', 'Adam Hložek', 'FWD', 'player', false),
  (  89, 'CZE20', 'Patrik Schick', 'Patrik Schick', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP B — CANADA (stickers 90–109, CAN1–CAN20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'CAN'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  (  90, 'CAN1', NULL, 'Team Logo - Canada', NULL, 'badge', true),
  (  91, 'CAN2', 'Dayne St. Clair', 'Dayne St. Clair', 'GK', 'player', false),
  (  92, 'CAN3', 'Alphonso Davies', 'Alphonso Davies', 'DEF', 'player', false),
  (  93, 'CAN4', 'Alistair Johnston', 'Alistair Johnston', 'DEF', 'player', false),
  (  94, 'CAN5', 'Samuel Adekugbe', 'Samuel Adekugbe', 'DEF', 'player', false),
  (  95, 'CAN6', 'Richie Laryea', 'Richie Laryea', 'DEF', 'player', false),
  (  96, 'CAN7', 'Derek Cornelius', 'Derek Cornelius', 'DEF', 'player', false),
  (  97, 'CAN8', 'Moïse Bombito', 'Moïse Bombito', 'DEF', 'player', false),
  (  98, 'CAN9', 'Kamal Miller', 'Kamal Miller', 'DEF', 'player', false),
  (  99, 'CAN10', 'Stephen Eustáquio', 'Stephen Eustáquio', 'MID', 'player', false),
  ( 100, 'CAN11', 'Ismaël Koné', 'Ismaël Koné', 'MID', 'player', false),
  ( 101, 'CAN12', 'Jonathan Osorio', 'Jonathan Osorio', 'MID', 'player', false),
  ( 102, 'CAN13', NULL, 'Team Photo - Canada', NULL, 'team_photo', false),
  ( 103, 'CAN14', 'Jacob Shaffelburg', 'Jacob Shaffelburg', 'MID', 'player', false),
  ( 104, 'CAN15', 'Mathieu Choinière', 'Mathieu Choinière', 'MID', 'player', false),
  ( 105, 'CAN16', 'Niko Sigur', 'Niko Sigur', 'MID', 'player', false),
  ( 106, 'CAN17', 'Tajon Buchanan', 'Tajon Buchanan', 'FWD', 'player', false),
  ( 107, 'CAN18', 'Liam Millar', 'Liam Millar', 'FWD', 'player', false),
  ( 108, 'CAN19', 'Cyle Larin', 'Cyle Larin', 'FWD', 'player', false),
  ( 109, 'CAN20', 'Jonathan David', 'Jonathan David', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP B — BOSNIA & HERZEGOVINA (stickers 110–129, BIH1–BIH20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'BIH'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 110, 'BIH1', NULL, 'Team Logo - Bosnia & Herzegovina', NULL, 'badge', true),
  ( 111, 'BIH2', 'Nikola Vasilj', 'Nikola Vasilj', 'GK', 'player', false),
  ( 112, 'BIH3', 'Amar Dedić', 'Amar Dedić', 'DEF', 'player', false),
  ( 113, 'BIH4', 'Sead Kolašinac', 'Sead Kolašinac', 'DEF', 'player', false),
  ( 114, 'BIH5', 'Tarik Muharemović', 'Tarik Muharemović', 'DEF', 'player', false),
  ( 115, 'BIH6', 'Nihad Mujakić', 'Nihad Mujakić', 'DEF', 'player', false),
  ( 116, 'BIH7', 'Nikola Katić', 'Nikola Katić', 'DEF', 'player', false),
  ( 117, 'BIH8', 'Amir Hadžiahmetović', 'Amir Hadžiahmetović', 'MID', 'player', false),
  ( 118, 'BIH9', 'Benjamin Tahirović', 'Benjamin Tahirović', 'MID', 'player', false),
  ( 119, 'BIH10', 'Armin Gigović', 'Armin Gigović', 'MID', 'player', false),
  ( 120, 'BIH11', 'Ivan Šunjić', 'Ivan Šunjić', 'MID', 'player', false),
  ( 121, 'BIH12', 'Ivan Bašić', 'Ivan Bašić', 'MID', 'player', false),
  ( 122, 'BIH13', NULL, 'Team Photo - Bosnia & Herzegovina', NULL, 'team_photo', false),
  ( 123, 'BIH14', 'Dženis Burnić', 'Dženis Burnić', 'MID', 'player', false),
  ( 124, 'BIH15', 'Esmir Bajraktarević', 'Esmir Bajraktarević', 'FWD', 'player', false),
  ( 125, 'BIH16', 'Amar Memić', 'Amar Memić', 'MID', 'player', false),
  ( 126, 'BIH17', 'Ermedin Demirović', 'Ermedin Demirović', 'FWD', 'player', false),
  ( 127, 'BIH18', 'Edin Džeko', 'Edin Džeko', 'FWD', 'player', false),
  ( 128, 'BIH19', 'Samed Baždar', 'Samed Baždar', 'FWD', 'player', false),
  ( 129, 'BIH20', 'Haris Tabaković', 'Haris Tabaković', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP B — QATAR (stickers 130–149, QAT1–QAT20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'QAT'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 130, 'QAT1', NULL, 'Team Logo - Qatar', NULL, 'badge', true),
  ( 131, 'QAT2', 'Meshaal Barsham', 'Meshaal Barsham', 'GK', 'player', false),
  ( 132, 'QAT3', 'Sultan Al-Brake', 'Sultan Al-Brake', 'DEF', 'player', false),
  ( 133, 'QAT4', 'Lucas Mendes', 'Lucas Mendes', 'DEF', 'player', false),
  ( 134, 'QAT5', 'Homam Ahmed', 'Homam Ahmed', 'DEF', 'player', false),
  ( 135, 'QAT6', 'Boualem Khoukhi', 'Boualem Khoukhi', 'DEF', 'player', false),
  ( 136, 'QAT7', 'Pedro Miguel', 'Pedro Miguel', 'DEF', 'player', false),
  ( 137, 'QAT8', 'Tarek Salman', 'Tarek Salman', 'DEF', 'player', false),
  ( 138, 'QAT9', 'Mohammed Al-Mannai', 'Mohammed Al-Mannai', 'MID', 'player', false),
  ( 139, 'QAT10', 'Karim Boudiaf', 'Karim Boudiaf', 'MID', 'player', false),
  ( 140, 'QAT11', 'Assim Madibo', 'Assim Madibo', 'MID', 'player', false),
  ( 141, 'QAT12', 'Ahmed Fathy', 'Ahmed Fathy', 'MID', 'player', false),
  ( 142, 'QAT13', NULL, 'Team Photo - Qatar', NULL, 'team_photo', false),
  ( 143, 'QAT14', 'Mohammed Waad', 'Mohammed Waad', 'MID', 'player', false),
  ( 144, 'QAT15', 'Abdulaziz Hatem', 'Abdulaziz Hatem', 'MID', 'player', false),
  ( 145, 'QAT16', 'Hassan Al-Haydos', 'Hassan Al-Haydos', 'MID', 'player', false),
  ( 146, 'QAT17', 'Edmilson Junior', 'Edmilson Junior', 'FWD', 'player', false),
  ( 147, 'QAT18', 'Akram Afif', 'Akram Afif', 'FWD', 'player', false),
  ( 148, 'QAT19', 'Ahmed Al-Ganehi', 'Ahmed Al-Ganehi', 'FWD', 'player', false),
  ( 149, 'QAT20', 'Almoez Ali', 'Almoez Ali', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP B — SWITZERLAND (stickers 150–169, SUI1–SUI20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'SUI'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 150, 'SUI1', NULL, 'Team Logo - Switzerland', NULL, 'badge', true),
  ( 151, 'SUI2', 'Gregor Kobel', 'Gregor Kobel', 'GK', 'player', false),
  ( 152, 'SUI3', 'Yvon Mvogo', 'Yvon Mvogo', 'GK', 'player', false),
  ( 153, 'SUI4', 'Manuel Akanji', 'Manuel Akanji', 'DEF', 'player', false),
  ( 154, 'SUI5', 'Ricardo Rodríguez', 'Ricardo Rodríguez', 'DEF', 'player', false),
  ( 155, 'SUI6', 'Nico Elvedi', 'Nico Elvedi', 'DEF', 'player', false),
  ( 156, 'SUI7', 'Aurèle Amenda', 'Aurèle Amenda', 'DEF', 'player', false),
  ( 157, 'SUI8', 'Silvan Widmer', 'Silvan Widmer', 'DEF', 'player', false),
  ( 158, 'SUI9', 'Granit Xhaka', 'Granit Xhaka', 'MID', 'player', false),
  ( 159, 'SUI10', 'Denis Zakaria', 'Denis Zakaria', 'MID', 'player', false),
  ( 160, 'SUI11', 'Remo Freuler', 'Remo Freuler', 'MID', 'player', false),
  ( 161, 'SUI12', 'Fabian Rieder', 'Fabian Rieder', 'MID', 'player', false),
  ( 162, 'SUI13', NULL, 'Team Photo - Switzerland', NULL, 'team_photo', false),
  ( 163, 'SUI14', 'Ardon Jashari', 'Ardon Jashari', 'MID', 'player', false),
  ( 164, 'SUI15', 'Johan Manzambi', 'Johan Manzambi', 'MID', 'player', false),
  ( 165, 'SUI16', 'Michel Aebischer', 'Michel Aebischer', 'MID', 'player', false),
  ( 166, 'SUI17', 'Breel Embolo', 'Breel Embolo', 'FWD', 'player', false),
  ( 167, 'SUI18', 'Rubén Vargas', 'Rubén Vargas', 'FWD', 'player', false),
  ( 168, 'SUI19', 'Dan Ndoye', 'Dan Ndoye', 'FWD', 'player', false),
  ( 169, 'SUI20', 'Zeki Amdouni', 'Zeki Amdouni', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP K — BRAZIL (stickers 170–189, BRA1–BRA20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'BRA'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 170, 'BRA1', NULL, 'Team Logo - Brazil', NULL, 'badge', true),
  ( 171, 'BRA2', 'Alisson', 'Alisson', 'GK', 'player', false),
  ( 172, 'BRA3', 'Bento', 'Bento', 'GK', 'player', false),
  ( 173, 'BRA4', 'Marquinhos', 'Marquinhos', 'DEF', 'player', false),
  ( 174, 'BRA5', 'Éder Militão', 'Éder Militão', 'DEF', 'player', false),
  ( 175, 'BRA6', 'Gabriel Magalhães', 'Gabriel Magalhães', 'DEF', 'player', false),
  ( 176, 'BRA7', 'Danilo', 'Danilo', 'DEF', 'player', false),
  ( 177, 'BRA8', 'Wesley', 'Wesley', 'DEF', 'player', false),
  ( 178, 'BRA9', 'Lucas Paquetá', 'Lucas Paquetá', 'MID', 'player', false),
  ( 179, 'BRA10', 'Casemiro', 'Casemiro', 'MID', 'player', false),
  ( 180, 'BRA11', 'Bruno Guimarães', 'Bruno Guimarães', 'MID', 'player', false),
  ( 181, 'BRA12', 'Luiz Henrique', 'Luiz Henrique', 'FWD', 'player', false),
  ( 182, 'BRA13', NULL, 'Team Photo - Brazil', NULL, 'team_photo', false),
  ( 183, 'BRA14', 'Vinícius Júnior', 'Vinícius Júnior', 'FWD', 'player', false),
  ( 184, 'BRA15', 'Rodrygo', 'Rodrygo', 'FWD', 'player', false),
  ( 185, 'BRA16', 'João Pedro', 'João Pedro', 'FWD', 'player', false),
  ( 186, 'BRA17', 'Matheus Cunha', 'Matheus Cunha', 'FWD', 'player', false),
  ( 187, 'BRA18', 'Gabriel Martinelli', 'Gabriel Martinelli', 'FWD', 'player', false),
  ( 188, 'BRA19', 'Raphinha', 'Raphinha', 'FWD', 'player', false),
  ( 189, 'BRA20', 'Estêvão', 'Estêvão', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP K — MOROCCO (stickers 190–209, MAR1–MAR20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'MAR'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 190, 'MAR1', NULL, 'Team Logo - Morocco', NULL, 'badge', true),
  ( 191, 'MAR2', 'Yassine Bounou', 'Yassine Bounou', 'GK', 'player', false),
  ( 192, 'MAR3', 'Munir El Kajoui', 'Munir El Kajoui', 'GK', 'player', false),
  ( 193, 'MAR4', 'Achraf Hakimi', 'Achraf Hakimi', 'DEF', 'player', false),
  ( 194, 'MAR5', 'Noussair Mazraoui', 'Noussair Mazraoui', 'DEF', 'player', false),
  ( 195, 'MAR6', 'Nayef Aguerd', 'Nayef Aguerd', 'DEF', 'player', false),
  ( 196, 'MAR7', 'Romain Saïss', 'Romain Saïss', 'DEF', 'player', false),
  ( 197, 'MAR8', 'Jawad El Yamiq', 'Jawad El Yamiq', 'DEF', 'player', false),
  ( 198, 'MAR9', 'Adam Masina', 'Adam Masina', 'DEF', 'player', false),
  ( 199, 'MAR10', 'Sofyan Amrabat', 'Sofyan Amrabat', 'MID', 'player', false),
  ( 200, 'MAR11', 'Azzedine Ounahi', 'Azzedine Ounahi', 'MID', 'player', false),
  ( 201, 'MAR12', 'Eliesse Ben Seghir', 'Eliesse Ben Seghir', 'MID', 'player', false),
  ( 202, 'MAR13', NULL, 'Team Photo - Morocco', NULL, 'team_photo', false),
  ( 203, 'MAR14', 'Bilal El Khannouss', 'Bilal El Khannouss', 'MID', 'player', false),
  ( 204, 'MAR15', 'Ismaël Saibari', 'Ismaël Saibari', 'MID', 'player', false),
  ( 205, 'MAR16', 'Youssef En-Nesyri', 'Youssef En-Nesyri', 'FWD', 'player', false),
  ( 206, 'MAR17', 'Abde Ezzalzouli', 'Abde Ezzalzouli', 'FWD', 'player', false),
  ( 207, 'MAR18', 'Soufiane Rahimi', 'Soufiane Rahimi', 'FWD', 'player', false),
  ( 208, 'MAR19', 'Brahim Díaz', 'Brahim Díaz', 'MID', 'player', false),
  ( 209, 'MAR20', 'Ayoub El Kaabi', 'Ayoub El Kaabi', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP G — HAITI (stickers 210–229, HAI1–HAI20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'HAI'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 210, 'HAI1', NULL, 'Team Logo - Haiti', NULL, 'badge', true),
  ( 211, 'HAI2', 'Johny Placide', 'Johny Placide', 'GK', 'player', false),
  ( 212, 'HAI3', 'Carlens Arcus', 'Carlens Arcus', 'DEF', 'player', false),
  ( 213, 'HAI4', 'Martin Expérience', 'Martin Expérience', 'DEF', 'player', false),
  ( 214, 'HAI5', 'Jean-Kévin Duverne', 'Jean-Kévin Duverne', 'DEF', 'player', false),
  ( 215, 'HAI6', 'Ricardo Adé', 'Ricardo Adé', 'DEF', 'player', false),
  ( 216, 'HAI7', 'Duke Lacroix', 'Duke Lacroix', 'DEF', 'player', false),
  ( 217, 'HAI8', 'Garven Metusala', 'Garven Metusala', 'DEF', 'player', false),
  ( 218, 'HAI9', 'Hannes Delcroix', 'Hannes Delcroix', 'DEF', 'player', false),
  ( 219, 'HAI10', 'Leverton Pierre', 'Leverton Pierre', 'MID', 'player', false),
  ( 220, 'HAI11', 'Danley Jean-Jacques', 'Danley Jean-Jacques', 'MID', 'player', false),
  ( 221, 'HAI12', 'Jean-Ricner Bellegarde', 'Jean-Ricner Bellegarde', 'MID', 'player', false),
  ( 222, 'HAI13', NULL, 'Team Photo - Haiti', NULL, 'team_photo', false),
  ( 223, 'HAI14', 'Christopher Attys', 'Christopher Attys', 'MID', 'player', false),
  ( 224, 'HAI15', 'Derrick Etienne Jr.', 'Derrick Etienne Jr.', 'FWD', 'player', false),
  ( 225, 'HAI16', 'Josué Casimir', 'Josué Casimir', 'FWD', 'player', false),
  ( 226, 'HAI17', 'Ruben Providence', 'Ruben Providence', 'FWD', 'player', false),
  ( 227, 'HAI18', 'Duckens Nazon', 'Duckens Nazon', 'FWD', 'player', false),
  ( 228, 'HAI19', 'Louicius Don Deedson', 'Louicius Don Deedson', 'FWD', 'player', false),
  ( 229, 'HAI20', 'Frantzdy Pierrot', 'Frantzdy Pierrot', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP F — SCOTLAND (stickers 230–249, SCO1–SCO20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'SCO'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 230, 'SCO1', NULL, 'Team Logo - Scotland', NULL, 'badge', true),
  ( 231, 'SCO2', 'Angus Gunn', 'Angus Gunn', 'GK', 'player', false),
  ( 232, 'SCO3', 'Jack Hendry', 'Jack Hendry', 'DEF', 'player', false),
  ( 233, 'SCO4', 'Kieran Tierney', 'Kieran Tierney', 'DEF', 'player', false),
  ( 234, 'SCO5', 'Aaron Hickey', 'Aaron Hickey', 'DEF', 'player', false),
  ( 235, 'SCO6', 'Andrew Robertson', 'Andrew Robertson', 'DEF', 'player', false),
  ( 236, 'SCO7', 'Scott McKenna', 'Scott McKenna', 'DEF', 'player', false),
  ( 237, 'SCO8', 'John Souttar', 'John Souttar', 'DEF', 'player', false),
  ( 238, 'SCO9', 'Anthony Ralston', 'Anthony Ralston', 'DEF', 'player', false),
  ( 239, 'SCO10', 'Grant Hanley', 'Grant Hanley', 'DEF', 'player', false),
  ( 240, 'SCO11', 'Scott McTominay', 'Scott McTominay', 'MID', 'player', false),
  ( 241, 'SCO12', 'Billy Gilmour', 'Billy Gilmour', 'MID', 'player', false),
  ( 242, 'SCO13', NULL, 'Team Photo - Scotland', NULL, 'team_photo', false),
  ( 243, 'SCO14', 'Lewis Ferguson', 'Lewis Ferguson', 'MID', 'player', false),
  ( 244, 'SCO15', 'Ryan Christie', 'Ryan Christie', 'MID', 'player', false),
  ( 245, 'SCO16', 'Kenny McLean', 'Kenny McLean', 'MID', 'player', false),
  ( 246, 'SCO17', 'John McGinn', 'John McGinn', 'MID', 'player', false),
  ( 247, 'SCO18', 'Lyndon Dykes', 'Lyndon Dykes', 'FWD', 'player', false),
  ( 248, 'SCO19', 'Che Adams', 'Che Adams', 'FWD', 'player', false),
  ( 249, 'SCO20', 'Ben Doak', 'Ben Doak', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP D — USA (stickers 250–269, USA1–USA20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'USA'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 250, 'USA1', NULL, 'Team Logo - USA', NULL, 'badge', true),
  ( 251, 'USA2', 'Matt Freese', 'Matt Freese', 'GK', 'player', false),
  ( 252, 'USA3', 'Chris Richards', 'Chris Richards', 'DEF', 'player', false),
  ( 253, 'USA4', 'Tim Ream', 'Tim Ream', 'DEF', 'player', false),
  ( 254, 'USA5', 'Mark McKenzie', 'Mark McKenzie', 'DEF', 'player', false),
  ( 255, 'USA6', 'Alex Freeman', 'Alex Freeman', 'DEF', 'player', false),
  ( 256, 'USA7', 'Antonee Robinson', 'Antonee Robinson', 'DEF', 'player', false),
  ( 257, 'USA8', 'Tyler Adams', 'Tyler Adams', 'MID', 'player', false),
  ( 258, 'USA9', 'Tanner Tessmann', 'Tanner Tessmann', 'MID', 'player', false),
  ( 259, 'USA10', 'Weston McKennie', 'Weston McKennie', 'MID', 'player', false),
  ( 260, 'USA11', 'Cristian Roldan', 'Cristian Roldan', 'MID', 'player', false),
  ( 261, 'USA12', 'Timothy Weah', 'Timothy Weah', 'MID', 'player', false),
  ( 262, 'USA13', NULL, 'Team Photo - USA', NULL, 'team_photo', false),
  ( 263, 'USA14', 'Diego Luna', 'Diego Luna', 'MID', 'player', false),
  ( 264, 'USA15', 'Malik Tillman', 'Malik Tillman', 'FWD', 'player', false),
  ( 265, 'USA16', 'Christian Pulisic', 'Christian Pulisic', 'FWD', 'player', false),
  ( 266, 'USA17', 'Brenden Aaronson', 'Brenden Aaronson', 'FWD', 'player', false),
  ( 267, 'USA18', 'Ricardo Pepi', 'Ricardo Pepi', 'FWD', 'player', false),
  ( 268, 'USA19', 'Haji Wright', 'Haji Wright', 'FWD', 'player', false),
  ( 269, 'USA20', 'Folarin Balogun', 'Folarin Balogun', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP D — PARAGUAY (stickers 270–289, PAR1–PAR20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'PAR'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 270, 'PAR1', NULL, 'Team Logo - Paraguay', NULL, 'badge', true),
  ( 271, 'PAR2', 'Roberto Fernández', 'Roberto Fernández', 'GK', 'player', false),
  ( 272, 'PAR3', 'Orlando Gill', 'Orlando Gill', 'GK', 'player', false),
  ( 273, 'PAR4', 'Gustavo Gómez', 'Gustavo Gómez', 'DEF', 'player', false),
  ( 274, 'PAR5', 'Fabián Balbuena', 'Fabián Balbuena', 'DEF', 'player', false),
  ( 275, 'PAR6', 'Juan José Cáceres', 'Juan José Cáceres', 'DEF', 'player', false),
  ( 276, 'PAR7', 'Omar Alderete', 'Omar Alderete', 'DEF', 'player', false),
  ( 277, 'PAR8', 'Júnior Alonso', 'Júnior Alonso', 'DEF', 'player', false),
  ( 278, 'PAR9', 'Mathías Villasanti', 'Mathías Villasanti', 'MID', 'player', false),
  ( 279, 'PAR10', 'Diego Gómez', 'Diego Gómez', 'MID', 'player', false),
  ( 280, 'PAR11', 'Damián Bobadilla', 'Damián Bobadilla', 'MID', 'player', false),
  ( 281, 'PAR12', 'Andrés Cubas', 'Andrés Cubas', 'MID', 'player', false),
  ( 282, 'PAR13', NULL, 'Team Photo - Paraguay', NULL, 'team_photo', false),
  ( 283, 'PAR14', 'Matías Galarza Fonda', 'Matías Galarza Fonda', 'MID', 'player', false),
  ( 284, 'PAR15', 'Julio Enciso', 'Julio Enciso', 'MID', 'player', false),
  ( 285, 'PAR16', 'Alejandro Romero Gamarra', 'Alejandro Romero Gamarra', 'MID', 'player', false),
  ( 286, 'PAR17', 'Miguel Almirón', 'Miguel Almirón', 'FWD', 'player', false),
  ( 287, 'PAR18', 'Ramón Sosa', 'Ramón Sosa', 'FWD', 'player', false),
  ( 288, 'PAR19', 'Ángel Romero', 'Ángel Romero', 'FWD', 'player', false),
  ( 289, 'PAR20', 'Antonio Sanabria', 'Antonio Sanabria', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP D — AUSTRALIA (stickers 290–309, AUS1–AUS20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'AUS'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 290, 'AUS1', NULL, 'Team Logo - Australia', NULL, 'badge', true),
  ( 291, 'AUS2', 'Mathew Ryan', 'Mathew Ryan', 'GK', 'player', false),
  ( 292, 'AUS3', 'Joe Gauci', 'Joe Gauci', 'GK', 'player', false),
  ( 293, 'AUS4', 'Harry Souttar', 'Harry Souttar', 'DEF', 'player', false),
  ( 294, 'AUS5', 'Alessandro Circati', 'Alessandro Circati', 'DEF', 'player', false),
  ( 295, 'AUS6', 'Jordan Bos', 'Jordan Bos', 'DEF', 'player', false),
  ( 296, 'AUS7', 'Aziz Behich', 'Aziz Behich', 'DEF', 'player', false),
  ( 297, 'AUS8', 'Cameron Burgess', 'Cameron Burgess', 'DEF', 'player', false),
  ( 298, 'AUS9', 'Lewis Miller', 'Lewis Miller', 'DEF', 'player', false),
  ( 299, 'AUS10', 'Miloš Degenek', 'Miloš Degenek', 'DEF', 'player', false),
  ( 300, 'AUS11', 'Jackson Irvine', 'Jackson Irvine', 'MID', 'player', false),
  ( 301, 'AUS12', 'Riley McGree', 'Riley McGree', 'MID', 'player', false),
  ( 302, 'AUS13', NULL, 'Team Photo - Australia', NULL, 'team_photo', false),
  ( 303, 'AUS14', 'Aiden O''Neill', 'Aiden O''Neill', 'MID', 'player', false),
  ( 304, 'AUS15', 'Connor Metcalfe', 'Connor Metcalfe', 'MID', 'player', false),
  ( 305, 'AUS16', 'Patrick Yazbek', 'Patrick Yazbek', 'MID', 'player', false),
  ( 306, 'AUS17', 'Craig Goodwin', 'Craig Goodwin', 'FWD', 'player', false),
  ( 307, 'AUS18', 'Kusini Yengi', 'Kusini Yengi', 'FWD', 'player', false),
  ( 308, 'AUS19', 'Nestory Irankunda', 'Nestory Irankunda', 'FWD', 'player', false),
  ( 309, 'AUS20', 'Mohamed Touré', 'Mohamed Touré', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP D — TÜRKIYE (stickers 310–329, TUR1–TUR20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'TUR'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 310, 'TUR1', NULL, 'Team Logo - Türkiye', NULL, 'badge', true),
  ( 311, 'TUR2', 'Uğurcan Çakır', 'Uğurcan Çakır', 'GK', 'player', false),
  ( 312, 'TUR3', 'Mert Müldür', 'Mert Müldür', 'DEF', 'player', false),
  ( 313, 'TUR4', 'Zeki Çelik', 'Zeki Çelik', 'DEF', 'player', false),
  ( 314, 'TUR5', 'Abdülkerim Bardakcı', 'Abdülkerim Bardakcı', 'DEF', 'player', false),
  ( 315, 'TUR6', 'Çağlar Söyüncü', 'Çağlar Söyüncü', 'DEF', 'player', false),
  ( 316, 'TUR7', 'Merih Demiral', 'Merih Demiral', 'DEF', 'player', false),
  ( 317, 'TUR8', 'Ferdi Kadıoğlu', 'Ferdi Kadıoğlu', 'DEF', 'player', false),
  ( 318, 'TUR9', 'Kaan Ayhan', 'Kaan Ayhan', 'MID', 'player', false),
  ( 319, 'TUR10', 'İsmail Yüksek', 'İsmail Yüksek', 'MID', 'player', false),
  ( 320, 'TUR11', 'Hakan Çalhanoğlu', 'Hakan Çalhanoğlu', 'MID', 'player', false),
  ( 321, 'TUR12', 'Orkun Kökçü', 'Orkun Kökçü', 'MID', 'player', false),
  ( 322, 'TUR13', NULL, 'Team Photo - Türkiye', NULL, 'team_photo', false),
  ( 323, 'TUR14', 'Arda Güler', 'Arda Güler', 'MID', 'player', false),
  ( 324, 'TUR15', 'İrfan Can Kahveci', 'İrfan Can Kahveci', 'MID', 'player', false),
  ( 325, 'TUR16', 'Yunus Akgün', 'Yunus Akgün', 'FWD', 'player', false),
  ( 326, 'TUR17', 'Can Uzun', 'Can Uzun', 'FWD', 'player', false),
  ( 327, 'TUR18', 'Barış Alper Yılmaz', 'Barış Alper Yılmaz', 'FWD', 'player', false),
  ( 328, 'TUR19', 'Kerem Aktürkoğlu', 'Kerem Aktürkoğlu', 'FWD', 'player', false),
  ( 329, 'TUR20', 'Kenan Yıldız', 'Kenan Yıldız', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP F — GERMANY (stickers 330–349, GER1–GER20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'GER'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 330, 'GER1', NULL, 'Team Logo - Germany', NULL, 'badge', true),
  ( 331, 'GER2', 'Marc-André ter Stegen', 'Marc-André ter Stegen', 'GK', 'player', false),
  ( 332, 'GER3', 'Jonathan Tah', 'Jonathan Tah', 'DEF', 'player', false),
  ( 333, 'GER4', 'David Raum', 'David Raum', 'DEF', 'player', false),
  ( 334, 'GER5', 'Nico Schlotterbeck', 'Nico Schlotterbeck', 'DEF', 'player', false),
  ( 335, 'GER6', 'Antonio Rüdiger', 'Antonio Rüdiger', 'DEF', 'player', false),
  ( 336, 'GER7', 'Waldemar Anton', 'Waldemar Anton', 'DEF', 'player', false),
  ( 337, 'GER8', 'Ridle Baku', 'Ridle Baku', 'DEF', 'player', false),
  ( 338, 'GER9', 'Maximilian Mittelstädt', 'Maximilian Mittelstädt', 'DEF', 'player', false),
  ( 339, 'GER10', 'Joshua Kimmich', 'Joshua Kimmich', 'MID', 'player', false),
  ( 340, 'GER11', 'Florian Wirtz', 'Florian Wirtz', 'MID', 'player', false),
  ( 341, 'GER12', 'Felix Nmecha', 'Felix Nmecha', 'MID', 'player', false),
  ( 342, 'GER13', NULL, 'Team Photo - Germany', NULL, 'team_photo', false),
  ( 343, 'GER14', 'Leon Goretzka', 'Leon Goretzka', 'MID', 'player', false),
  ( 344, 'GER15', 'Jamal Musiala', 'Jamal Musiala', 'MID', 'player', false),
  ( 345, 'GER16', 'Serge Gnabry', 'Serge Gnabry', 'FWD', 'player', false),
  ( 346, 'GER17', 'Kai Havertz', 'Kai Havertz', 'FWD', 'player', false),
  ( 347, 'GER18', 'Leroy Sané', 'Leroy Sané', 'FWD', 'player', false),
  ( 348, 'GER19', 'Karim Adeyemi', 'Karim Adeyemi', 'FWD', 'player', false),
  ( 349, 'GER20', 'Nick Woltemade', 'Nick Woltemade', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP F — CURAÇAO (stickers 350–369, CUW1–CUW20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'CUW'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 350, 'CUW1', NULL, 'Team Logo - Curaçao', NULL, 'badge', true),
  ( 351, 'CUW2', 'Eloy Room', 'Eloy Room', 'GK', 'player', false),
  ( 352, 'CUW3', 'Armando Obispo', 'Armando Obispo', 'DEF', 'player', false),
  ( 353, 'CUW4', 'Sherel Floranus', 'Sherel Floranus', 'DEF', 'player', false),
  ( 354, 'CUW5', 'Juriën Gaari', 'Juriën Gaari', 'DEF', 'player', false),
  ( 355, 'CUW6', 'Joshua Brenet', 'Joshua Brenet', 'DEF', 'player', false),
  ( 356, 'CUW7', 'Roshon van Eijma', 'Roshon van Eijma', 'DEF', 'player', false),
  ( 357, 'CUW8', 'Shurandy Sambo', 'Shurandy Sambo', 'DEF', 'player', false),
  ( 358, 'CUW9', 'Livano Comenencia', 'Livano Comenencia', 'DEF', 'player', false),
  ( 359, 'CUW10', 'Godfried Roemeratoe', 'Godfried Roemeratoe', 'MID', 'player', false),
  ( 360, 'CUW11', 'Juninho Bacuna', 'Juninho Bacuna', 'MID', 'player', false),
  ( 361, 'CUW12', 'Leandro Bacuna', 'Leandro Bacuna', 'MID', 'player', false),
  ( 362, 'CUW13', NULL, 'Team Photo - Curaçao', NULL, 'team_photo', false),
  ( 363, 'CUW14', 'Tahith Chong', 'Tahith Chong', 'MID', 'player', false),
  ( 364, 'CUW15', 'Kenji Gorré', 'Kenji Gorré', 'FWD', 'player', false),
  ( 365, 'CUW16', 'Jearl Margaritha', 'Jearl Margaritha', 'FWD', 'player', false),
  ( 366, 'CUW17', 'Jürgen Locadia', 'Jürgen Locadia', 'FWD', 'player', false),
  ( 367, 'CUW18', 'Jeremy Antonisse', 'Jeremy Antonisse', 'FWD', 'player', false),
  ( 368, 'CUW19', 'Gervane Kastaneer', 'Gervane Kastaneer', 'FWD', 'player', false),
  ( 369, 'CUW20', 'Sontje Hansen', 'Sontje Hansen', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP E — IVORY COAST (stickers 370–389, CIV1–CIV20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'CIV'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 370, 'CIV1', NULL, 'Team Logo - Ivory Coast', NULL, 'badge', true),
  ( 371, 'CIV2', 'Yahia Fofana', 'Yahia Fofana', 'GK', 'player', false),
  ( 372, 'CIV3', 'Ghislain Konan', 'Ghislain Konan', 'DEF', 'player', false),
  ( 373, 'CIV4', 'Wilfried Singo', 'Wilfried Singo', 'DEF', 'player', false),
  ( 374, 'CIV5', 'Odilon Kossounou', 'Odilon Kossounou', 'DEF', 'player', false),
  ( 375, 'CIV6', 'Evan Ndicka', 'Evan Ndicka', 'DEF', 'player', false),
  ( 376, 'CIV7', 'Willy Boly', 'Willy Boly', 'DEF', 'player', false),
  ( 377, 'CIV8', 'Emmanuel Agbadou', 'Emmanuel Agbadou', 'DEF', 'player', false),
  ( 378, 'CIV9', 'Ousmane Diomandé', 'Ousmane Diomandé', 'DEF', 'player', false),
  ( 379, 'CIV10', 'Franck Kessié', 'Franck Kessié', 'MID', 'player', false),
  ( 380, 'CIV11', 'Seko Fofana', 'Seko Fofana', 'MID', 'player', false),
  ( 381, 'CIV12', 'Ibrahim Sangaré', 'Ibrahim Sangaré', 'MID', 'player', false),
  ( 382, 'CIV13', NULL, 'Team Photo - Ivory Coast', NULL, 'team_photo', false),
  ( 383, 'CIV14', 'Jean-Philippe Gbamin', 'Jean-Philippe Gbamin', 'MID', 'player', false),
  ( 384, 'CIV15', 'Amad Diallo', 'Amad Diallo', 'FWD', 'player', false),
  ( 385, 'CIV16', 'Sébastien Haller', 'Sébastien Haller', 'FWD', 'player', false),
  ( 386, 'CIV17', 'Simon Adingra', 'Simon Adingra', 'FWD', 'player', false),
  ( 387, 'CIV18', 'Yan Diomande', 'Yan Diomande', 'MID', 'player', false),
  ( 388, 'CIV19', 'Evann Guessand', 'Evann Guessand', 'FWD', 'player', false),
  ( 389, 'CIV20', 'Oumar Diakité', 'Oumar Diakité', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP E — ECUADOR (stickers 390–409, ECU1–ECU20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'ECU'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 390, 'ECU1', NULL, 'Team Logo - Ecuador', NULL, 'badge', true),
  ( 391, 'ECU2', 'Hernán Galíndez', 'Hernán Galíndez', 'GK', 'player', false),
  ( 392, 'ECU3', 'Gonzalo Valle', 'Gonzalo Valle', 'DEF', 'player', false),
  ( 393, 'ECU4', 'Piero Hincapié', 'Piero Hincapié', 'DEF', 'player', false),
  ( 394, 'ECU5', 'Pervis Estupiñán', 'Pervis Estupiñán', 'DEF', 'player', false),
  ( 395, 'ECU6', 'Willian Pacho', 'Willian Pacho', 'DEF', 'player', false),
  ( 396, 'ECU7', 'Ángelo Preciado', 'Ángelo Preciado', 'DEF', 'player', false),
  ( 397, 'ECU8', 'Joel Ordóñez', 'Joel Ordóñez', 'DEF', 'player', false),
  ( 398, 'ECU9', 'Moisés Caicedo', 'Moisés Caicedo', 'MID', 'player', false),
  ( 399, 'ECU10', 'Alan Franco', 'Alan Franco', 'MID', 'player', false),
  ( 400, 'ECU11', 'Kendry Páez', 'Kendry Páez', 'MID', 'player', false),
  ( 401, 'ECU12', 'Pedro Vite', 'Pedro Vite', 'MID', 'player', false),
  ( 402, 'ECU13', NULL, 'Team Photo - Ecuador', NULL, 'team_photo', false),
  ( 403, 'ECU14', 'John Yeboah', 'John Yeboah', 'FWD', 'player', false),
  ( 404, 'ECU15', 'Leonardo Campana', 'Leonardo Campana', 'FWD', 'player', false),
  ( 405, 'ECU16', 'Gonzalo Plata', 'Gonzalo Plata', 'FWD', 'player', false),
  ( 406, 'ECU17', 'Nilson Angulo', 'Nilson Angulo', 'FWD', 'player', false),
  ( 407, 'ECU18', 'Alan Minda', 'Alan Minda', 'FWD', 'player', false),
  ( 408, 'ECU19', 'Kevin Rodríguez', 'Kevin Rodríguez', 'FWD', 'player', false),
  ( 409, 'ECU20', 'Enner Valencia', 'Enner Valencia', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP J — NETHERLANDS (stickers 410–429, NED1–NED20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'NED'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 410, 'NED1', NULL, 'Team Logo - Netherlands', NULL, 'badge', true),
  ( 411, 'NED2', 'Bart Verbruggen', 'Bart Verbruggen', 'GK', 'player', false),
  ( 412, 'NED3', 'Virgil van Dijk', 'Virgil van Dijk', 'DEF', 'player', false),
  ( 413, 'NED4', 'Micky van de Ven', 'Micky van de Ven', 'DEF', 'player', false),
  ( 414, 'NED5', 'Jurriën Timber', 'Jurriën Timber', 'DEF', 'player', false),
  ( 415, 'NED6', 'Denzel Dumfries', 'Denzel Dumfries', 'DEF', 'player', false),
  ( 416, 'NED7', 'Nathan Aké', 'Nathan Aké', 'DEF', 'player', false),
  ( 417, 'NED8', 'Jeremie Frimpong', 'Jeremie Frimpong', 'DEF', 'player', false),
  ( 418, 'NED9', 'Jan Paul van Hecke', 'Jan Paul van Hecke', 'DEF', 'player', false),
  ( 419, 'NED10', 'Tijjani Reijnders', 'Tijjani Reijnders', 'MID', 'player', false),
  ( 420, 'NED11', 'Ryan Gravenberch', 'Ryan Gravenberch', 'MID', 'player', false),
  ( 421, 'NED12', 'Teun Koopmeiners', 'Teun Koopmeiners', 'MID', 'player', false),
  ( 422, 'NED13', NULL, 'Team Photo - Netherlands', NULL, 'team_photo', false),
  ( 423, 'NED14', 'Frenkie de Jong', 'Frenkie de Jong', 'MID', 'player', false),
  ( 424, 'NED15', 'Xavi Simons', 'Xavi Simons', 'MID', 'player', false),
  ( 425, 'NED16', 'Justin Kluivert', 'Justin Kluivert', 'FWD', 'player', false),
  ( 426, 'NED17', 'Memphis Depay', 'Memphis Depay', 'FWD', 'player', false),
  ( 427, 'NED18', 'Donyell Malen', 'Donyell Malen', 'FWD', 'player', false),
  ( 428, 'NED19', 'Wout Weghorst', 'Wout Weghorst', 'FWD', 'player', false),
  ( 429, 'NED20', 'Cody Gakpo', 'Cody Gakpo', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP C — JAPAN (stickers 430–449, JPN1–JPN20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'JPN'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 430, 'JPN1', NULL, 'Team Logo - Japan', NULL, 'badge', true),
  ( 431, 'JPN2', 'Zion Suzuki', 'Zion Suzuki', 'GK', 'player', false),
  ( 432, 'JPN3', 'Henry Hiroki Mochizuki', 'Henry Hiroki Mochizuki', 'GK', 'player', false),
  ( 433, 'JPN4', 'Ayumu Seko', 'Ayumu Seko', 'DEF', 'player', false),
  ( 434, 'JPN5', 'Junnosuke Suzuki', 'Junnosuke Suzuki', 'DEF', 'player', false),
  ( 435, 'JPN6', 'Shogo Taniguchi', 'Shogo Taniguchi', 'DEF', 'player', false),
  ( 436, 'JPN7', 'Tsuyoshi Watanabe', 'Tsuyoshi Watanabe', 'DEF', 'player', false),
  ( 437, 'JPN8', 'Kaishu Sano', 'Kaishu Sano', 'DEF', 'player', false),
  ( 438, 'JPN9', 'Yuki Soma', 'Yuki Soma', 'MID', 'player', false),
  ( 439, 'JPN10', 'Ao Tanaka', 'Ao Tanaka', 'MID', 'player', false),
  ( 440, 'JPN11', 'Daichi Kamada', 'Daichi Kamada', 'MID', 'player', false),
  ( 441, 'JPN12', 'Takefusa Kubo', 'Takefusa Kubo', 'MID', 'player', false),
  ( 442, 'JPN13', NULL, 'Team Photo - Japan', NULL, 'team_photo', false),
  ( 443, 'JPN14', 'Ritsu Doan', 'Ritsu Doan', 'MID', 'player', false),
  ( 444, 'JPN15', 'Keito Nakamura', 'Keito Nakamura', 'MID', 'player', false),
  ( 445, 'JPN16', 'Takumi Minamino', 'Takumi Minamino', 'MID', 'player', false),
  ( 446, 'JPN17', 'Shuto Machino', 'Shuto Machino', 'FWD', 'player', false),
  ( 447, 'JPN18', 'Junya Ito', 'Junya Ito', 'FWD', 'player', false),
  ( 448, 'JPN19', 'Koki Ogawa', 'Koki Ogawa', 'FWD', 'player', false),
  ( 449, 'JPN20', 'Ayase Ueda', 'Ayase Ueda', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP E — SWEDEN (stickers 450–469, SWE1–SWE20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'SWE'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 450, 'SWE1', NULL, 'Team Logo - Sweden', NULL, 'badge', true),
  ( 451, 'SWE2', 'Victor Johansson', 'Victor Johansson', 'GK', 'player', false),
  ( 452, 'SWE3', 'Isak Hien', 'Isak Hien', 'DEF', 'player', false),
  ( 453, 'SWE4', 'Gabriel Gudmundsson', 'Gabriel Gudmundsson', 'DEF', 'player', false),
  ( 454, 'SWE5', 'Emil Holm', 'Emil Holm', 'DEF', 'player', false),
  ( 455, 'SWE6', 'Victor Nilsson Lindelöf', 'Victor Nilsson Lindelöf', 'DEF', 'player', false),
  ( 456, 'SWE7', 'Gustaf Lagerbielke', 'Gustaf Lagerbielke', 'DEF', 'player', false),
  ( 457, 'SWE8', 'Lucas Bergval', 'Lucas Bergval', 'MID', 'player', false),
  ( 458, 'SWE9', 'Hugo Larsson', 'Hugo Larsson', 'MID', 'player', false),
  ( 459, 'SWE10', 'Jesper Karlström', 'Jesper Karlström', 'MID', 'player', false),
  ( 460, 'SWE11', 'Yasin Ayari', 'Yasin Ayari', 'MID', 'player', false),
  ( 461, 'SWE12', 'Mattias Svanberg', 'Mattias Svanberg', 'MID', 'player', false),
  ( 462, 'SWE13', NULL, 'Team Photo - Sweden', NULL, 'team_photo', false),
  ( 463, 'SWE14', 'Daniel Svensson', 'Daniel Svensson', 'DEF', 'player', false),
  ( 464, 'SWE15', 'Ken Sema', 'Ken Sema', 'FWD', 'player', false),
  ( 465, 'SWE16', 'Roony Bardghji', 'Roony Bardghji', 'FWD', 'player', false),
  ( 466, 'SWE17', 'Dejan Kulusevski', 'Dejan Kulusevski', 'MID', 'player', false),
  ( 467, 'SWE18', 'Anthony Elanga', 'Anthony Elanga', 'FWD', 'player', false),
  ( 468, 'SWE19', 'Alexander Isak', 'Alexander Isak', 'FWD', 'player', false),
  ( 469, 'SWE20', 'Viktor Gyökeres', 'Viktor Gyökeres', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP J — TUNISIA (stickers 470–489, TUN1–TUN20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'TUN'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 470, 'TUN1', NULL, 'Team Logo - Tunisia', NULL, 'badge', true),
  ( 471, 'TUN2', 'Béchir Ben Saïd', 'Béchir Ben Saïd', 'GK', 'player', false),
  ( 472, 'TUN3', 'Aymen Dahmen', 'Aymen Dahmen', 'GK', 'player', false),
  ( 473, 'TUN4', 'Yan Valery', 'Yan Valery', 'DEF', 'player', false),
  ( 474, 'TUN5', 'Montassar Talbi', 'Montassar Talbi', 'DEF', 'player', false),
  ( 475, 'TUN6', 'Yassine Meriah', 'Yassine Meriah', 'DEF', 'player', false),
  ( 476, 'TUN7', 'Ali Abdi', 'Ali Abdi', 'DEF', 'player', false),
  ( 477, 'TUN8', 'Dylan Bronn', 'Dylan Bronn', 'DEF', 'player', false),
  ( 478, 'TUN9', 'Ellyes Skhiri', 'Ellyes Skhiri', 'MID', 'player', false),
  ( 479, 'TUN10', 'Aïssa Laïdouni', 'Aïssa Laïdouni', 'MID', 'player', false),
  ( 480, 'TUN11', 'Ferjani Sassi', 'Ferjani Sassi', 'MID', 'player', false),
  ( 481, 'TUN12', 'Mohamed Ali Ben Romdhane', 'Mohamed Ali Ben Romdhane', 'MID', 'player', false),
  ( 482, 'TUN13', NULL, 'Team Photo - Tunisia', NULL, 'team_photo', false),
  ( 483, 'TUN14', 'Hannibal Mejbri', 'Hannibal Mejbri', 'MID', 'player', false),
  ( 484, 'TUN15', 'Élias Achouri', 'Élias Achouri', 'MID', 'player', false),
  ( 485, 'TUN16', 'Élias Saad', 'Élias Saad', 'FWD', 'player', false),
  ( 486, 'TUN17', 'Hazem Mastouri', 'Hazem Mastouri', 'FWD', 'player', false),
  ( 487, 'TUN18', 'Ismaël Gharbi', 'Ismaël Gharbi', 'FWD', 'player', false),
  ( 488, 'TUN19', 'Sayfallah Ltaief', 'Sayfallah Ltaief', 'FWD', 'player', false),
  ( 489, 'TUN20', 'Naïm Sliti', 'Naïm Sliti', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP G — BELGIUM (stickers 490–509, BEL1–BEL20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'BEL'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 490, 'BEL1', NULL, 'Team Logo - Belgium', NULL, 'badge', true),
  ( 491, 'BEL2', 'Thibaut Courtois', 'Thibaut Courtois', 'GK', 'player', false),
  ( 492, 'BEL3', 'Arthur Theate', 'Arthur Theate', 'DEF', 'player', false),
  ( 493, 'BEL4', 'Timothy Castagne', 'Timothy Castagne', 'DEF', 'player', false),
  ( 494, 'BEL5', 'Zeno Debast', 'Zeno Debast', 'DEF', 'player', false),
  ( 495, 'BEL6', 'Brandon Mechele', 'Brandon Mechele', 'DEF', 'player', false),
  ( 496, 'BEL7', 'Maxim De Cuyper', 'Maxim De Cuyper', 'DEF', 'player', false),
  ( 497, 'BEL8', 'Thomas Meunier', 'Thomas Meunier', 'DEF', 'player', false),
  ( 498, 'BEL9', 'Youri Tielemans', 'Youri Tielemans', 'MID', 'player', false),
  ( 499, 'BEL10', 'Amadou Onana', 'Amadou Onana', 'MID', 'player', false),
  ( 500, 'BEL11', 'Nicolas Raskin', 'Nicolas Raskin', 'MID', 'player', false),
  ( 501, 'BEL12', 'Alexis Saelemaekers', 'Alexis Saelemaekers', 'MID', 'player', false),
  ( 502, 'BEL13', NULL, 'Team Photo - Belgium', NULL, 'team_photo', false),
  ( 503, 'BEL14', 'Hans Vanaken', 'Hans Vanaken', 'MID', 'player', false),
  ( 504, 'BEL15', 'Kevin De Bruyne', 'Kevin De Bruyne', 'MID', 'player', false),
  ( 505, 'BEL16', 'Jérémy Doku', 'Jérémy Doku', 'FWD', 'player', false),
  ( 506, 'BEL17', 'Charles De Ketelaere', 'Charles De Ketelaere', 'FWD', 'player', false),
  ( 507, 'BEL18', 'Leandro Trossard', 'Leandro Trossard', 'FWD', 'player', false),
  ( 508, 'BEL19', 'Loïs Openda', 'Loïs Openda', 'FWD', 'player', false),
  ( 509, 'BEL20', 'Romelu Lukaku', 'Romelu Lukaku', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP G — EGYPT (stickers 510–529, EGY1–EGY20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'EGY'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 510, 'EGY1', NULL, 'Team Logo - Egypt', NULL, 'badge', true),
  ( 511, 'EGY2', 'Mohamed El Shenawy', 'Mohamed El Shenawy', 'GK', 'player', false),
  ( 512, 'EGY3', 'Mohamed Hany', 'Mohamed Hany', 'DEF', 'player', false),
  ( 513, 'EGY4', 'Mohamed Hamdy', 'Mohamed Hamdy', 'DEF', 'player', false),
  ( 514, 'EGY5', 'Yasser Ibrahim', 'Yasser Ibrahim', 'DEF', 'player', false),
  ( 515, 'EGY6', 'Khaled Sobhi', 'Khaled Sobhi', 'DEF', 'player', false),
  ( 516, 'EGY7', 'Ramy Rabia', 'Ramy Rabia', 'DEF', 'player', false),
  ( 517, 'EGY8', 'Hossam Abdelmaguid', 'Hossam Abdelmaguid', 'DEF', 'player', false),
  ( 518, 'EGY9', 'Ahmed Fatouh', 'Ahmed Fatouh', 'MID', 'player', false),
  ( 519, 'EGY10', 'Marwan Attia', 'Marwan Attia', 'MID', 'player', false),
  ( 520, 'EGY11', 'Zizo', 'Zizo', 'MID', 'player', false),
  ( 521, 'EGY12', 'Hamdy Fathy', 'Hamdy Fathy', 'MID', 'player', false),
  ( 522, 'EGY13', NULL, 'Team Photo - Egypt', NULL, 'team_photo', false),
  ( 523, 'EGY14', 'Mohanad Lasheen', 'Mohanad Lasheen', 'MID', 'player', false),
  ( 524, 'EGY15', 'Emam Ashour', 'Emam Ashour', 'MID', 'player', false),
  ( 525, 'EGY16', 'Osama Faisal', 'Osama Faisal', 'FWD', 'player', false),
  ( 526, 'EGY17', 'Mohamed Salah', 'Mohamed Salah', 'FWD', 'player', false),
  ( 527, 'EGY18', 'Mostafa Mohamed', 'Mostafa Mohamed', 'FWD', 'player', false),
  ( 528, 'EGY19', 'Trezeguet', 'Trezeguet', 'FWD', 'player', false),
  ( 529, 'EGY20', 'Omar Marmoush', 'Omar Marmoush', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP F — IRAN (stickers 530–549, IRN1–IRN20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'IRN'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 530, 'IRN1', NULL, 'Team Logo - Iran', NULL, 'badge', true),
  ( 531, 'IRN2', 'Alireza Beiranvand', 'Alireza Beiranvand', 'GK', 'player', false),
  ( 532, 'IRN3', 'Morteza Pouraliganji', 'Morteza Pouraliganji', 'DEF', 'player', false),
  ( 533, 'IRN4', 'Ehsan Hajsafi', 'Ehsan Hajsafi', 'DEF', 'player', false),
  ( 534, 'IRN5', 'Milad Mohammadi', 'Milad Mohammadi', 'DEF', 'player', false),
  ( 535, 'IRN6', 'Shojae Khalilzadeh', 'Shojae Khalilzadeh', 'DEF', 'player', false),
  ( 536, 'IRN7', 'Ramin Rezaeian', 'Ramin Rezaeian', 'DEF', 'player', false),
  ( 537, 'IRN8', 'Hossein Kanaani', 'Hossein Kanaani', 'DEF', 'player', false),
  ( 538, 'IRN9', 'Sadegh Moharrami', 'Sadegh Moharrami', 'DEF', 'player', false),
  ( 539, 'IRN10', 'Saleh Hardani', 'Saleh Hardani', 'MID', 'player', false),
  ( 540, 'IRN11', 'Saeed Ezatolahi', 'Saeed Ezatolahi', 'MID', 'player', false),
  ( 541, 'IRN12', 'Saman Ghoddos', 'Saman Ghoddos', 'MID', 'player', false),
  ( 542, 'IRN13', NULL, 'Team Photo - Iran', NULL, 'team_photo', false),
  ( 543, 'IRN14', 'Omid Noorafkan', 'Omid Noorafkan', 'MID', 'player', false),
  ( 544, 'IRN15', 'Roozbeh Cheshmi', 'Roozbeh Cheshmi', 'MID', 'player', false),
  ( 545, 'IRN16', 'Mohammad Mohebi', 'Mohammad Mohebi', 'MID', 'player', false),
  ( 546, 'IRN17', 'Sardar Azmoun', 'Sardar Azmoun', 'FWD', 'player', false),
  ( 547, 'IRN18', 'Mehdi Taremi', 'Mehdi Taremi', 'FWD', 'player', false),
  ( 548, 'IRN19', 'Alireza Jahanbakhsh', 'Alireza Jahanbakhsh', 'FWD', 'player', false),
  ( 549, 'IRN20', 'Ali Gholizadeh', 'Ali Gholizadeh', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP C — NEW ZEALAND (stickers 550–569, NZL1–NZL20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'NZL'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 550, 'NZL1', NULL, 'Team Logo - New Zealand', NULL, 'badge', true),
  ( 551, 'NZL2', 'Max Crocombe', 'Max Crocombe', 'GK', 'player', false),
  ( 552, 'NZL3', 'Alex Paulsen', 'Alex Paulsen', 'GK', 'player', false),
  ( 553, 'NZL4', 'Michael Boxall', 'Michael Boxall', 'DEF', 'player', false),
  ( 554, 'NZL5', 'Liberato Cacace', 'Liberato Cacace', 'DEF', 'player', false),
  ( 555, 'NZL6', 'Tim Payne', 'Tim Payne', 'DEF', 'player', false),
  ( 556, 'NZL7', 'Tyler Bindon', 'Tyler Bindon', 'DEF', 'player', false),
  ( 557, 'NZL8', 'Francis de Vries', 'Francis de Vries', 'DEF', 'player', false),
  ( 558, 'NZL9', 'Finn Surman', 'Finn Surman', 'DEF', 'player', false),
  ( 559, 'NZL10', 'Joe Bell', 'Joe Bell', 'MID', 'player', false),
  ( 560, 'NZL11', 'Sarpreet Singh', 'Sarpreet Singh', 'MID', 'player', false),
  ( 561, 'NZL12', 'Ryan Thomas', 'Ryan Thomas', 'MID', 'player', false),
  ( 562, 'NZL13', NULL, 'Team Photo - New Zealand', NULL, 'team_photo', false),
  ( 563, 'NZL14', 'Matthew Garbett', 'Matthew Garbett', 'MID', 'player', false),
  ( 564, 'NZL15', 'Marko Stamenić', 'Marko Stamenić', 'MID', 'player', false),
  ( 565, 'NZL16', 'Ben Old', 'Ben Old', 'MID', 'player', false),
  ( 566, 'NZL17', 'Chris Wood', 'Chris Wood', 'FWD', 'player', false),
  ( 567, 'NZL18', 'Elijah Just', 'Elijah Just', 'FWD', 'player', false),
  ( 568, 'NZL19', 'Callum McCowatt', 'Callum McCowatt', 'FWD', 'player', false),
  ( 569, 'NZL20', 'Kosta Barbarouses', 'Kosta Barbarouses', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP C — SPAIN (stickers 570–589, ESP1–ESP20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'ESP'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 570, 'ESP1', NULL, 'Team Logo - Spain', NULL, 'badge', true),
  ( 571, 'ESP2', 'Unai Simón', 'Unai Simón', 'GK', 'player', false),
  ( 572, 'ESP3', 'Robin Le Normand', 'Robin Le Normand', 'DEF', 'player', false),
  ( 573, 'ESP4', 'Aymeric Laporte', 'Aymeric Laporte', 'DEF', 'player', false),
  ( 574, 'ESP5', 'Dean Huijsen', 'Dean Huijsen', 'DEF', 'player', false),
  ( 575, 'ESP6', 'Pedro Porro', 'Pedro Porro', 'DEF', 'player', false),
  ( 576, 'ESP7', 'Dani Carvajal', 'Dani Carvajal', 'DEF', 'player', false),
  ( 577, 'ESP8', 'Marc Cucurella', 'Marc Cucurella', 'DEF', 'player', false),
  ( 578, 'ESP9', 'Martín Zubimendi', 'Martín Zubimendi', 'MID', 'player', false),
  ( 579, 'ESP10', 'Rodri', 'Rodri', 'MID', 'player', false),
  ( 580, 'ESP11', 'Pedri', 'Pedri', 'MID', 'player', false),
  ( 581, 'ESP12', 'Fabián Ruiz', 'Fabián Ruiz', 'MID', 'player', false),
  ( 582, 'ESP13', NULL, 'Team Photo - Spain', NULL, 'team_photo', false),
  ( 583, 'ESP14', 'Mikel Merino', 'Mikel Merino', 'MID', 'player', false),
  ( 584, 'ESP15', 'Lamine Yamal', 'Lamine Yamal', 'FWD', 'player', false),
  ( 585, 'ESP16', 'Dani Olmo', 'Dani Olmo', 'MID', 'player', false),
  ( 586, 'ESP17', 'Nico Williams', 'Nico Williams', 'FWD', 'player', false),
  ( 587, 'ESP18', 'Ferran Torres', 'Ferran Torres', 'FWD', 'player', false),
  ( 588, 'ESP19', 'Álvaro Morata', 'Álvaro Morata', 'FWD', 'player', false),
  ( 589, 'ESP20', 'Mikel Oyarzabal', 'Mikel Oyarzabal', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP L — CAPE VERDE (stickers 590–609, CPV1–CPV20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'CPV'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 590, 'CPV1', NULL, 'Team Logo - Cape Verde', NULL, 'badge', true),
  ( 591, 'CPV2', 'Vozinha', 'Vozinha', 'GK', 'player', false),
  ( 592, 'CPV3', 'Logan Costa', 'Logan Costa', 'DEF', 'player', false),
  ( 593, 'CPV4', 'Pico', 'Pico', 'DEF', 'player', false),
  ( 594, 'CPV5', 'Diney', 'Diney', 'DEF', 'player', false),
  ( 595, 'CPV6', 'Steven Moreira', 'Steven Moreira', 'DEF', 'player', false),
  ( 596, 'CPV7', 'Wagner Pina', 'Wagner Pina', 'DEF', 'player', false),
  ( 597, 'CPV8', 'João Paulo', 'João Paulo', 'MID', 'player', false),
  ( 598, 'CPV9', 'Yannick Semedo', 'Yannick Semedo', 'DEF', 'player', false),
  ( 599, 'CPV10', 'Kevin Pina', 'Kevin Pina', 'MID', 'player', false),
  ( 600, 'CPV11', 'Patrick Andrade', 'Patrick Andrade', 'MID', 'player', false),
  ( 601, 'CPV12', 'Jamiro Monteiro', 'Jamiro Monteiro', 'MID', 'player', false),
  ( 602, 'CPV13', NULL, 'Team Photo - Cape Verde', NULL, 'team_photo', false),
  ( 603, 'CPV14', 'Deroy Duarte', 'Deroy Duarte', 'MID', 'player', false),
  ( 604, 'CPV15', 'Garry Rodrigues', 'Garry Rodrigues', 'FWD', 'player', false),
  ( 605, 'CPV16', 'Jovane Cabral', 'Jovane Cabral', 'FWD', 'player', false),
  ( 606, 'CPV17', 'Ryan Mendes', 'Ryan Mendes', 'FWD', 'player', false),
  ( 607, 'CPV18', 'Dailon Livramento', 'Dailon Livramento', 'FWD', 'player', false),
  ( 608, 'CPV19', 'Willy Semedo', 'Willy Semedo', 'FWD', 'player', false),
  ( 609, 'CPV20', 'Bebé', 'Bebé', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP K — SAUDI ARABIA (stickers 610–629, KSA1–KSA20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'KSA'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 610, 'KSA1', NULL, 'Team Logo - Saudi Arabia', NULL, 'badge', true),
  ( 611, 'KSA2', 'Nawaf Al-Aqidi', 'Nawaf Al-Aqidi', 'GK', 'player', false),
  ( 612, 'KSA3', 'Abdulrahman Al-Sanbi', 'Abdulrahman Al-Sanbi', 'DEF', 'player', false),
  ( 613, 'KSA4', 'Saud Abdulhamid', 'Saud Abdulhamid', 'DEF', 'player', false),
  ( 614, 'KSA5', 'Nawaf Boushal', 'Nawaf Boushal', 'DEF', 'player', false),
  ( 615, 'KSA6', 'Jihad Thakri', 'Jihad Thakri', 'DEF', 'player', false),
  ( 616, 'KSA7', 'Moteb Al-Harbi', 'Moteb Al-Harbi', 'DEF', 'player', false),
  ( 617, 'KSA8', 'Hassan Al-Tambakti', 'Hassan Al-Tambakti', 'DEF', 'player', false),
  ( 618, 'KSA9', 'Musab Al-Juwayr', 'Musab Al-Juwayr', 'MID', 'player', false),
  ( 619, 'KSA10', 'Ziyad Al-Johani', 'Ziyad Al-Johani', 'MID', 'player', false),
  ( 620, 'KSA11', 'Abdullah Al-Khaibari', 'Abdullah Al-Khaibari', 'MID', 'player', false),
  ( 621, 'KSA12', 'Nasser Al-Dawsari', 'Nasser Al-Dawsari', 'MID', 'player', false),
  ( 622, 'KSA13', NULL, 'Team Photo - Saudi Arabia', NULL, 'team_photo', false),
  ( 623, 'KSA14', 'Saleh Aboulshamat', 'Saleh Aboulshamat', 'MID', 'player', false),
  ( 624, 'KSA15', 'Marwan Al-Sahafi', 'Marwan Al-Sahafi', 'FWD', 'player', false),
  ( 625, 'KSA16', 'Salem Al-Dawsari', 'Salem Al-Dawsari', 'FWD', 'player', false),
  ( 626, 'KSA17', 'Abdulrahman Al-Aboud', 'Abdulrahman Al-Aboud', 'MID', 'player', false),
  ( 627, 'KSA18', 'Firas Al-Buraikan', 'Firas Al-Buraikan', 'FWD', 'player', false),
  ( 628, 'KSA19', 'Saleh Al-Shehri', 'Saleh Al-Shehri', 'FWD', 'player', false),
  ( 629, 'KSA20', 'Abdullah Al-Hamdan', 'Abdullah Al-Hamdan', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP L — URUGUAY (stickers 630–649, URU1–URU20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'URU'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 630, 'URU1', NULL, 'Team Logo - Uruguay', NULL, 'badge', true),
  ( 631, 'URU2', 'Sergio Rochet', 'Sergio Rochet', 'GK', 'player', false),
  ( 632, 'URU3', 'Santiago Mele', 'Santiago Mele', 'GK', 'player', false),
  ( 633, 'URU4', 'Ronald Araújo', 'Ronald Araújo', 'DEF', 'player', false),
  ( 634, 'URU5', 'José María Giménez', 'José María Giménez', 'DEF', 'player', false),
  ( 635, 'URU6', 'Sebastián Cáceres', 'Sebastián Cáceres', 'DEF', 'player', false),
  ( 636, 'URU7', 'Mathías Olivera', 'Mathías Olivera', 'DEF', 'player', false),
  ( 637, 'URU8', 'Guillermo Varela', 'Guillermo Varela', 'DEF', 'player', false),
  ( 638, 'URU9', 'Nahitan Nández', 'Nahitan Nández', 'MID', 'player', false),
  ( 639, 'URU10', 'Federico Valverde', 'Federico Valverde', 'MID', 'player', false),
  ( 640, 'URU11', 'Giorgian de Arrascaeta', 'Giorgian de Arrascaeta', 'MID', 'player', false),
  ( 641, 'URU12', 'Rodrigo Bentancur', 'Rodrigo Bentancur', 'MID', 'player', false),
  ( 642, 'URU13', NULL, 'Team Photo - Uruguay', NULL, 'team_photo', false),
  ( 643, 'URU14', 'Manuel Ugarte', 'Manuel Ugarte', 'MID', 'player', false),
  ( 644, 'URU15', 'Nicolás de la Cruz', 'Nicolás de la Cruz', 'MID', 'player', false),
  ( 645, 'URU16', 'Maxi Araújo', 'Maxi Araújo', 'DEF', 'player', false),
  ( 646, 'URU17', 'Darwin Núñez', 'Darwin Núñez', 'FWD', 'player', false),
  ( 647, 'URU18', 'Federico Viñas', 'Federico Viñas', 'FWD', 'player', false),
  ( 648, 'URU19', 'Rodrigo Aguirre', 'Rodrigo Aguirre', 'FWD', 'player', false),
  ( 649, 'URU20', 'Facundo Pellistri', 'Facundo Pellistri', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP I — FRANCE (stickers 650–669, FRA1–FRA20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'FRA'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 650, 'FRA1', NULL, 'Team Logo - France', NULL, 'badge', true),
  ( 651, 'FRA2', 'Mike Maignan', 'Mike Maignan', 'GK', 'player', false),
  ( 652, 'FRA3', 'Theo Hernández', 'Theo Hernández', 'DEF', 'player', false),
  ( 653, 'FRA4', 'William Saliba', 'William Saliba', 'DEF', 'player', false),
  ( 654, 'FRA5', 'Jules Koundé', 'Jules Koundé', 'DEF', 'player', false),
  ( 655, 'FRA6', 'Ibrahima Konaté', 'Ibrahima Konaté', 'DEF', 'player', false),
  ( 656, 'FRA7', 'Dayot Upamecano', 'Dayot Upamecano', 'DEF', 'player', false),
  ( 657, 'FRA8', 'Lucas Digne', 'Lucas Digne', 'DEF', 'player', false),
  ( 658, 'FRA9', 'Aurélien Tchouaméni', 'Aurélien Tchouaméni', 'MID', 'player', false),
  ( 659, 'FRA10', 'Eduardo Camavinga', 'Eduardo Camavinga', 'MID', 'player', false),
  ( 660, 'FRA11', 'Manu Koné', 'Manu Koné', 'MID', 'player', false),
  ( 661, 'FRA12', 'Adrien Rabiot', 'Adrien Rabiot', 'MID', 'player', false),
  ( 662, 'FRA13', NULL, 'Team Photo - France', NULL, 'team_photo', false),
  ( 663, 'FRA14', 'Michael Olise', 'Michael Olise', 'FWD', 'player', false),
  ( 664, 'FRA15', 'Ousmane Dembélé', 'Ousmane Dembélé', 'FWD', 'player', false),
  ( 665, 'FRA16', 'Bradley Barcola', 'Bradley Barcola', 'FWD', 'player', false),
  ( 666, 'FRA17', 'Désiré Doué', 'Désiré Doué', 'FWD', 'player', false),
  ( 667, 'FRA18', 'Kingsley Coman', 'Kingsley Coman', 'FWD', 'player', false),
  ( 668, 'FRA19', 'Hugo Ekitiké', 'Hugo Ekitiké', 'FWD', 'player', false),
  ( 669, 'FRA20', 'Kylian Mbappé', 'Kylian Mbappé', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP I — SENEGAL (stickers 670–689, SEN1–SEN20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'SEN'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 670, 'SEN1', NULL, 'Team Logo - Senegal', NULL, 'badge', true),
  ( 671, 'SEN2', 'Édouard Mendy', 'Édouard Mendy', 'GK', 'player', false),
  ( 672, 'SEN3', 'Yehvann Diouf', 'Yehvann Diouf', 'GK', 'player', false),
  ( 673, 'SEN4', 'Moussa Niakhaté', 'Moussa Niakhaté', 'DEF', 'player', false),
  ( 674, 'SEN5', 'Abdoulaye Seck', 'Abdoulaye Seck', 'DEF', 'player', false),
  ( 675, 'SEN6', 'Ismail Jakobs', 'Ismail Jakobs', 'DEF', 'player', false),
  ( 676, 'SEN7', 'El Hadji Malick Diouf', 'El Hadji Malick Diouf', 'DEF', 'player', false),
  ( 677, 'SEN8', 'Kalidou Koulibaly', 'Kalidou Koulibaly', 'DEF', 'player', false),
  ( 678, 'SEN9', 'Idrissa Gana Gueye', 'Idrissa Gana Gueye', 'MID', 'player', false),
  ( 679, 'SEN10', 'Pape Matar Sarr', 'Pape Matar Sarr', 'MID', 'player', false),
  ( 680, 'SEN11', 'Pape Gueye', 'Pape Gueye', 'MID', 'player', false),
  ( 681, 'SEN12', 'Habib Diarra', 'Habib Diarra', 'MID', 'player', false),
  ( 682, 'SEN13', NULL, 'Team Photo - Senegal', NULL, 'team_photo', false),
  ( 683, 'SEN14', 'Lamine Camara', 'Lamine Camara', 'MID', 'player', false),
  ( 684, 'SEN15', 'Sadio Mané', 'Sadio Mané', 'FWD', 'player', false),
  ( 685, 'SEN16', 'Ismaïla Sarr', 'Ismaïla Sarr', 'FWD', 'player', false),
  ( 686, 'SEN17', 'Boulaye Dia', 'Boulaye Dia', 'FWD', 'player', false),
  ( 687, 'SEN18', 'Iliman Ndiaye', 'Iliman Ndiaye', 'FWD', 'player', false),
  ( 688, 'SEN19', 'Nicolas Jackson', 'Nicolas Jackson', 'FWD', 'player', false),
  ( 689, 'SEN20', 'Krépin Diatta', 'Krépin Diatta', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP I — IRAQ (stickers 690–709, IRQ1–IRQ20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'IRQ'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 690, 'IRQ1', NULL, 'Team Logo - Iraq', NULL, 'badge', true),
  ( 691, 'IRQ2', 'Jalal Hassan', 'Jalal Hassan', 'GK', 'player', false),
  ( 692, 'IRQ3', 'Rebin Sulaka', 'Rebin Sulaka', 'DEF', 'player', false),
  ( 693, 'IRQ4', 'Hussein Ali', 'Hussein Ali', 'DEF', 'player', false),
  ( 694, 'IRQ5', 'Akam Hashem', 'Akam Hashem', 'DEF', 'player', false),
  ( 695, 'IRQ6', 'Merchas Doski', 'Merchas Doski', 'DEF', 'player', false),
  ( 696, 'IRQ7', 'Zaid Tahseen', 'Zaid Tahseen', 'DEF', 'player', false),
  ( 697, 'IRQ8', 'Manaf Younis', 'Manaf Younis', 'DEF', 'player', false),
  ( 698, 'IRQ9', 'Zidane Iqbal', 'Zidane Iqbal', 'MID', 'player', false),
  ( 699, 'IRQ10', 'Amir Al-Ammari', 'Amir Al-Ammari', 'MID', 'player', false),
  ( 700, 'IRQ11', 'Ibrahim Bayesh', 'Ibrahim Bayesh', 'MID', 'player', false),
  ( 701, 'IRQ12', 'Ali Jasim', 'Ali Jasim', 'MID', 'player', false),
  ( 702, 'IRQ13', NULL, 'Team Photo - Iraq', NULL, 'team_photo', false),
  ( 703, 'IRQ14', 'Youssef Amyn', 'Youssef Amyn', 'MID', 'player', false),
  ( 704, 'IRQ15', 'Aimar Sher', 'Aimar Sher', 'MID', 'player', false),
  ( 705, 'IRQ16', 'Marko Farji', 'Marko Farji', 'MID', 'player', false),
  ( 706, 'IRQ17', 'Osama Rashid', 'Osama Rashid', 'MID', 'player', false),
  ( 707, 'IRQ18', 'Ali Al-Hamadi', 'Ali Al-Hamadi', 'FWD', 'player', false),
  ( 708, 'IRQ19', 'Aymen Hussein', 'Aymen Hussein', 'FWD', 'player', false),
  ( 709, 'IRQ20', 'Mohanad Ali', 'Mohanad Ali', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP I — NORWAY (stickers 710–729, NOR1–NOR20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'NOR'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 710, 'NOR1', NULL, 'Team Logo - Norway', NULL, 'badge', true),
  ( 711, 'NOR2', 'Ørjan Nyland', 'Ørjan Nyland', 'GK', 'player', false),
  ( 712, 'NOR3', 'Julian Ryerson', 'Julian Ryerson', 'DEF', 'player', false),
  ( 713, 'NOR4', 'Leo Østigård', 'Leo Østigård', 'DEF', 'player', false),
  ( 714, 'NOR5', 'Kristoffer Ajer', 'Kristoffer Ajer', 'DEF', 'player', false),
  ( 715, 'NOR6', 'Marcus Holmgren Pedersen', 'Marcus Holmgren Pedersen', 'DEF', 'player', false),
  ( 716, 'NOR7', 'David Møller Wolfe', 'David Møller Wolfe', 'DEF', 'player', false),
  ( 717, 'NOR8', 'Torbjørn Heggem', 'Torbjørn Heggem', 'DEF', 'player', false),
  ( 718, 'NOR9', 'Morten Thorsby', 'Morten Thorsby', 'MID', 'player', false),
  ( 719, 'NOR10', 'Martin Ødegaard', 'Martin Ødegaard', 'MID', 'player', false),
  ( 720, 'NOR11', 'Sander Berge', 'Sander Berge', 'MID', 'player', false),
  ( 721, 'NOR12', 'Andreas Schjelderup', 'Andreas Schjelderup', 'FWD', 'player', false),
  ( 722, 'NOR13', NULL, 'Team Photo - Norway', NULL, 'team_photo', false),
  ( 723, 'NOR14', 'Patrick Berg', 'Patrick Berg', 'MID', 'player', false),
  ( 724, 'NOR15', 'Erling Haaland', 'Erling Haaland', 'FWD', 'player', false),
  ( 725, 'NOR16', 'Alexander Sørloth', 'Alexander Sørloth', 'FWD', 'player', false),
  ( 726, 'NOR17', 'Aron Dønnum', 'Aron Dønnum', 'FWD', 'player', false),
  ( 727, 'NOR18', 'Jørgen Strand Larsen', 'Jørgen Strand Larsen', 'FWD', 'player', false),
  ( 728, 'NOR19', 'Antonio Nusa', 'Antonio Nusa', 'FWD', 'player', false),
  ( 729, 'NOR20', 'Oscar Bobb', 'Oscar Bobb', 'MID', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP E — ARGENTINA (stickers 730–749, ARG1–ARG20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'ARG'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 730, 'ARG1', NULL, 'Team Logo - Argentina', NULL, 'badge', true),
  ( 731, 'ARG2', 'Emiliano Martínez', 'Emiliano Martínez', 'GK', 'player', false),
  ( 732, 'ARG3', 'Nahuel Molina', 'Nahuel Molina', 'DEF', 'player', false),
  ( 733, 'ARG4', 'Cristian Romero', 'Cristian Romero', 'DEF', 'player', false),
  ( 734, 'ARG5', 'Nicolás Otamendi', 'Nicolás Otamendi', 'DEF', 'player', false),
  ( 735, 'ARG6', 'Nicolás Tagliafico', 'Nicolás Tagliafico', 'DEF', 'player', false),
  ( 736, 'ARG7', 'Leonardo Balerdi', 'Leonardo Balerdi', 'DEF', 'player', false),
  ( 737, 'ARG8', 'Enzo Fernández', 'Enzo Fernández', 'MID', 'player', false),
  ( 738, 'ARG9', 'Alexis Mac Allister', 'Alexis Mac Allister', 'MID', 'player', false),
  ( 739, 'ARG10', 'Rodrigo De Paul', 'Rodrigo De Paul', 'MID', 'player', false),
  ( 740, 'ARG11', 'Exequiel Palacios', 'Exequiel Palacios', 'MID', 'player', false),
  ( 741, 'ARG12', 'Leandro Paredes', 'Leandro Paredes', 'MID', 'player', false),
  ( 742, 'ARG13', NULL, 'Team Photo - Argentina', NULL, 'team_photo', false),
  ( 743, 'ARG14', 'Nico Paz', 'Nico Paz', 'MID', 'player', false),
  ( 744, 'ARG15', 'Franco Mastantuono', 'Franco Mastantuono', 'MID', 'player', false),
  ( 745, 'ARG16', 'Nico González', 'Nico González', 'FWD', 'player', false),
  ( 746, 'ARG17', 'Lionel Messi', 'Lionel Messi', 'FWD', 'player', false),
  ( 747, 'ARG18', 'Lautaro Martínez', 'Lautaro Martínez', 'FWD', 'player', false),
  ( 748, 'ARG19', 'Julián Álvarez', 'Julián Álvarez', 'FWD', 'player', false),
  ( 749, 'ARG20', 'Giuliano Simeone', 'Giuliano Simeone', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP C — ALGERIA (stickers 750–769, ALG1–ALG20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'ALG'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 750, 'ALG1', NULL, 'Team Logo - Algeria', NULL, 'badge', true),
  ( 751, 'ALG2', 'Alexis Guendouz', 'Alexis Guendouz', 'GK', 'player', false),
  ( 752, 'ALG3', 'Ramy Bensebaïni', 'Ramy Bensebaïni', 'DEF', 'player', false),
  ( 753, 'ALG4', 'Youcef Atal', 'Youcef Atal', 'DEF', 'player', false),
  ( 754, 'ALG5', 'Rayan Aït-Nouri', 'Rayan Aït-Nouri', 'DEF', 'player', false),
  ( 755, 'ALG6', 'Amine Tougaï', 'Amine Tougaï', 'DEF', 'player', false),
  ( 756, 'ALG7', 'Aïssa Mandi', 'Aïssa Mandi', 'DEF', 'player', false),
  ( 757, 'ALG8', 'Ismaël Bennacer', 'Ismaël Bennacer', 'MID', 'player', false),
  ( 758, 'ALG9', 'Houssem Aouar', 'Houssem Aouar', 'MID', 'player', false),
  ( 759, 'ALG10', 'Hicham Boudaoui', 'Hicham Boudaoui', 'MID', 'player', false),
  ( 760, 'ALG11', 'Ramiz Zerrouki', 'Ramiz Zerrouki', 'MID', 'player', false),
  ( 761, 'ALG12', 'Nabil Bentaleb', 'Nabil Bentaleb', 'MID', 'player', false),
  ( 762, 'ALG13', NULL, 'Team Photo - Algeria', NULL, 'team_photo', false),
  ( 763, 'ALG14', 'Farès Chaïbi', 'Farès Chaïbi', 'MID', 'player', false),
  ( 764, 'ALG15', 'Riyad Mahrez', 'Riyad Mahrez', 'FWD', 'player', false),
  ( 765, 'ALG16', 'Saïd Benrahma', 'Saïd Benrahma', 'FWD', 'player', false),
  ( 766, 'ALG17', 'Anis Hadj Moussa', 'Anis Hadj Moussa', 'FWD', 'player', false),
  ( 767, 'ALG18', 'Amine Gouiri', 'Amine Gouiri', 'FWD', 'player', false),
  ( 768, 'ALG19', 'Baghdad Bounedjah', 'Baghdad Bounedjah', 'FWD', 'player', false),
  ( 769, 'ALG20', 'Mohammed Amoura', 'Mohammed Amoura', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP L — AUSTRIA (stickers 770–789, AUT1–AUT20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'AUT'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 770, 'AUT1', NULL, 'Team Logo - Austria', NULL, 'badge', true),
  ( 771, 'AUT2', 'Alexander Schlager', 'Alexander Schlager', 'GK', 'player', false),
  ( 772, 'AUT3', 'Patrick Pentz', 'Patrick Pentz', 'GK', 'player', false),
  ( 773, 'AUT4', 'David Alaba', 'David Alaba', 'DEF', 'player', false),
  ( 774, 'AUT5', 'Kevin Danso', 'Kevin Danso', 'DEF', 'player', false),
  ( 775, 'AUT6', 'Philipp Lienhart', 'Philipp Lienhart', 'DEF', 'player', false),
  ( 776, 'AUT7', 'Stefan Posch', 'Stefan Posch', 'DEF', 'player', false),
  ( 777, 'AUT8', 'Philipp Mwene', 'Philipp Mwene', 'DEF', 'player', false),
  ( 778, 'AUT9', 'Alexander Prass', 'Alexander Prass', 'MID', 'player', false),
  ( 779, 'AUT10', 'Xaver Schlager', 'Xaver Schlager', 'MID', 'player', false),
  ( 780, 'AUT11', 'Marcel Sabitzer', 'Marcel Sabitzer', 'MID', 'player', false),
  ( 781, 'AUT12', 'Konrad Laimer', 'Konrad Laimer', 'MID', 'player', false),
  ( 782, 'AUT13', NULL, 'Team Photo - Austria', NULL, 'team_photo', false),
  ( 783, 'AUT14', 'Florian Grillitsch', 'Florian Grillitsch', 'MID', 'player', false),
  ( 784, 'AUT15', 'Nicolas Seiwald', 'Nicolas Seiwald', 'MID', 'player', false),
  ( 785, 'AUT16', 'Romano Schmid', 'Romano Schmid', 'MID', 'player', false),
  ( 786, 'AUT17', 'Patrick Wimmer', 'Patrick Wimmer', 'FWD', 'player', false),
  ( 787, 'AUT18', 'Christoph Baumgartner', 'Christoph Baumgartner', 'MID', 'player', false),
  ( 788, 'AUT19', 'Michael Gregoritsch', 'Michael Gregoritsch', 'FWD', 'player', false),
  ( 789, 'AUT20', 'Marko Arnautović', 'Marko Arnautović', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP G — JORDAN (stickers 790–809, JOR1–JOR20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'JOR'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 790, 'JOR1', NULL, 'Team Logo - Jordan', NULL, 'badge', true),
  ( 791, 'JOR2', 'Yazeed Abulaila', 'Yazeed Abulaila', 'GK', 'player', false),
  ( 792, 'JOR3', 'Ihsan Haddad', 'Ihsan Haddad', 'DEF', 'player', false),
  ( 793, 'JOR4', 'Mohammad Abu Hashish', 'Mohammad Abu Hashish', 'DEF', 'player', false),
  ( 794, 'JOR5', 'Yazan Al-Arab', 'Yazan Al-Arab', 'DEF', 'player', false),
  ( 795, 'JOR6', 'Abdallah Nasib', 'Abdallah Nasib', 'DEF', 'player', false),
  ( 796, 'JOR7', 'Saleem Obaid', 'Saleem Obaid', 'DEF', 'player', false),
  ( 797, 'JOR8', 'Mohammad Abu Al-Nadi', 'Mohammad Abu Al-Nadi', 'DEF', 'player', false),
  ( 798, 'JOR9', 'Ibrahim Saadeh', 'Ibrahim Saadeh', 'MID', 'player', false),
  ( 799, 'JOR10', 'Nizar Al-Rashdan', 'Nizar Al-Rashdan', 'MID', 'player', false),
  ( 800, 'JOR11', 'Noor Al-Rawabdeh', 'Noor Al-Rawabdeh', 'MID', 'player', false),
  ( 801, 'JOR12', 'Mohannad Abu Taha', 'Mohannad Abu Taha', 'MID', 'player', false),
  ( 802, 'JOR13', NULL, 'Team Photo - Jordan', NULL, 'team_photo', false),
  ( 803, 'JOR14', 'Amer Jamous', 'Amer Jamous', 'MID', 'player', false),
  ( 804, 'JOR15', 'Musa Al-Taamari', 'Musa Al-Taamari', 'FWD', 'player', false),
  ( 805, 'JOR16', 'Yazan Al-Naimat', 'Yazan Al-Naimat', 'FWD', 'player', false),
  ( 806, 'JOR17', 'Mahmoud Al-Mardi', 'Mahmoud Al-Mardi', 'FWD', 'player', false),
  ( 807, 'JOR18', 'Ali Olwan', 'Ali Olwan', 'FWD', 'player', false),
  ( 808, 'JOR19', 'Mohammad Abu Zrayq', 'Mohammad Abu Zrayq', 'FWD', 'player', false),
  ( 809, 'JOR20', 'Ibrahim Sabra', 'Ibrahim Sabra', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP H — PORTUGAL (stickers 810–829, POR1–POR20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'POR'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 810, 'POR1', NULL, 'Team Logo - Portugal', NULL, 'badge', true),
  ( 811, 'POR2', 'Diogo Costa', 'Diogo Costa', 'GK', 'player', false),
  ( 812, 'POR3', 'José Sá', 'José Sá', 'GK', 'player', false),
  ( 813, 'POR4', 'Rúben Dias', 'Rúben Dias', 'DEF', 'player', false),
  ( 814, 'POR5', 'João Cancelo', 'João Cancelo', 'DEF', 'player', false),
  ( 815, 'POR6', 'Diogo Dalot', 'Diogo Dalot', 'DEF', 'player', false),
  ( 816, 'POR7', 'Nuno Mendes', 'Nuno Mendes', 'DEF', 'player', false),
  ( 817, 'POR8', 'Gonçalo Inácio', 'Gonçalo Inácio', 'DEF', 'player', false),
  ( 818, 'POR9', 'Bernardo Silva', 'Bernardo Silva', 'MID', 'player', false),
  ( 819, 'POR10', 'Bruno Fernandes', 'Bruno Fernandes', 'MID', 'player', false),
  ( 820, 'POR11', 'Rúben Neves', 'Rúben Neves', 'MID', 'player', false),
  ( 821, 'POR12', 'Vitinha', 'Vitinha', 'MID', 'player', false),
  ( 822, 'POR13', NULL, 'Team Photo - Portugal', NULL, 'team_photo', false),
  ( 823, 'POR14', 'João Neves', 'João Neves', 'MID', 'player', false),
  ( 824, 'POR15', 'Cristiano Ronaldo', 'Cristiano Ronaldo', 'FWD', 'player', false),
  ( 825, 'POR16', 'Francisco Trincão', 'Francisco Trincão', 'FWD', 'player', false),
  ( 826, 'POR17', 'João Félix', 'João Félix', 'FWD', 'player', false),
  ( 827, 'POR18', 'Gonçalo Ramos', 'Gonçalo Ramos', 'FWD', 'player', false),
  ( 828, 'POR19', 'Pedro Neto', 'Pedro Neto', 'FWD', 'player', false),
  ( 829, 'POR20', 'Rafael Leão', 'Rafael Leão', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP H — CONGO DR (stickers 830–849, COD1–COD20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'CGO'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 830, 'COD1', NULL, 'Team Logo - Congo DR', NULL, 'badge', true),
  ( 831, 'COD2', 'Lionel Mpasi', 'Lionel Mpasi', 'GK', 'player', false),
  ( 832, 'COD3', 'Aaron Wan-Bissaka', 'Aaron Wan-Bissaka', 'DEF', 'player', false),
  ( 833, 'COD4', 'Axel Tuanzebe', 'Axel Tuanzebe', 'DEF', 'player', false),
  ( 834, 'COD5', 'Arthur Masuaku', 'Arthur Masuaku', 'DEF', 'player', false),
  ( 835, 'COD6', 'Chancel Mbemba', 'Chancel Mbemba', 'DEF', 'player', false),
  ( 836, 'COD7', 'Joris Kayembe', 'Joris Kayembe', 'DEF', 'player', false),
  ( 837, 'COD8', 'Charles Pickel', 'Charles Pickel', 'MID', 'player', false),
  ( 838, 'COD9', 'Ngal''ayel Mukau', 'Ngal''ayel Mukau', 'MID', 'player', false),
  ( 839, 'COD10', 'Edo Kayembe', 'Edo Kayembe', 'MID', 'player', false),
  ( 840, 'COD11', 'Samuel Moutoussamy', 'Samuel Moutoussamy', 'MID', 'player', false),
  ( 841, 'COD12', 'Noah Sadiki', 'Noah Sadiki', 'MID', 'player', false),
  ( 842, 'COD13', NULL, 'Team Photo - Congo DR', NULL, 'team_photo', false),
  ( 843, 'COD14', 'Théo Bongonda', 'Théo Bongonda', 'MID', 'player', false),
  ( 844, 'COD15', 'Meschak Elia', 'Meschak Elia', 'FWD', 'player', false),
  ( 845, 'COD16', 'Yoane Wissa', 'Yoane Wissa', 'FWD', 'player', false),
  ( 846, 'COD17', 'Brian Cipenga', 'Brian Cipenga', 'FWD', 'player', false),
  ( 847, 'COD18', 'Fiston Mayele', 'Fiston Mayele', 'FWD', 'player', false),
  ( 848, 'COD19', 'Cédric Bakambu', 'Cédric Bakambu', 'FWD', 'player', false),
  ( 849, 'COD20', 'Nathanaël Mbuku', 'Nathanaël Mbuku', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP H — UZBEKISTAN (stickers 850–869, UZB1–UZB20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'UZB'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 850, 'UZB1', NULL, 'Team Logo - Uzbekistan', NULL, 'badge', true),
  ( 851, 'UZB2', 'Utkir Yusupov', 'Utkir Yusupov', 'GK', 'player', false),
  ( 852, 'UZB3', 'Farrukh Sayfiyev', 'Farrukh Sayfiyev', 'DEF', 'player', false),
  ( 853, 'UZB4', 'Sherzod Nasrullaev', 'Sherzod Nasrullaev', 'DEF', 'player', false),
  ( 854, 'UZB5', 'Umar Eshmurodov', 'Umar Eshmurodov', 'DEF', 'player', false),
  ( 855, 'UZB6', 'Husniddin Aliqulov', 'Husniddin Aliqulov', 'DEF', 'player', false),
  ( 856, 'UZB7', 'Rustamjon Ashurmatov', 'Rustamjon Ashurmatov', 'DEF', 'player', false),
  ( 857, 'UZB8', 'Khojiakbar Alijonov', 'Khojiakbar Alijonov', 'DEF', 'player', false),
  ( 858, 'UZB9', 'Abdukodir Khusanov', 'Abdukodir Khusanov', 'DEF', 'player', false),
  ( 859, 'UZB10', 'Odiljon Hamrobekov', 'Odiljon Hamrobekov', 'MID', 'player', false),
  ( 860, 'UZB11', 'Otabek Shukurov', 'Otabek Shukurov', 'MID', 'player', false),
  ( 861, 'UZB12', 'Jamshid Iskanderov', 'Jamshid Iskanderov', 'MID', 'player', false),
  ( 862, 'UZB13', NULL, 'Team Photo - Uzbekistan', NULL, 'team_photo', false),
  ( 863, 'UZB14', 'Azizbek Turgunboev', 'Azizbek Turgunboev', 'MID', 'player', false),
  ( 864, 'UZB15', 'Khojimat Erkinov', 'Khojimat Erkinov', 'MID', 'player', false),
  ( 865, 'UZB16', 'Eldor Shomurodov', 'Eldor Shomurodov', 'FWD', 'player', false),
  ( 866, 'UZB17', 'Oston Urunov', 'Oston Urunov', 'MID', 'player', false),
  ( 867, 'UZB18', 'Jaloliddin Masharipov', 'Jaloliddin Masharipov', 'FWD', 'player', false),
  ( 868, 'UZB19', 'Igor Sergeev', 'Igor Sergeev', 'FWD', 'player', false),
  ( 869, 'UZB20', 'Abbosbek Fayzullaev', 'Abbosbek Fayzullaev', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP H — COLOMBIA (stickers 870–889, COL1–COL20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'COL'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 870, 'COL1', NULL, 'Team Logo - Colombia', NULL, 'badge', true),
  ( 871, 'COL2', 'Camilo Vargas', 'Camilo Vargas', 'GK', 'player', false),
  ( 872, 'COL3', 'David Ospina', 'David Ospina', 'GK', 'player', false),
  ( 873, 'COL4', 'Dávinson Sánchez', 'Dávinson Sánchez', 'DEF', 'player', false),
  ( 874, 'COL5', 'Yerry Mina', 'Yerry Mina', 'DEF', 'player', false),
  ( 875, 'COL6', 'Daniel Muñoz', 'Daniel Muñoz', 'DEF', 'player', false),
  ( 876, 'COL7', 'Johan Mojica', 'Johan Mojica', 'DEF', 'player', false),
  ( 877, 'COL8', 'Jhon Lucumí', 'Jhon Lucumí', 'DEF', 'player', false),
  ( 878, 'COL9', 'Santiago Arias', 'Santiago Arias', 'DEF', 'player', false),
  ( 879, 'COL10', 'Jefferson Lerma', 'Jefferson Lerma', 'MID', 'player', false),
  ( 880, 'COL11', 'Kevin Castaño', 'Kevin Castaño', 'MID', 'player', false),
  ( 881, 'COL12', 'Richard Ríos', 'Richard Ríos', 'MID', 'player', false),
  ( 882, 'COL13', NULL, 'Team Photo - Colombia', NULL, 'team_photo', false),
  ( 883, 'COL14', 'James Rodríguez', 'James Rodríguez', 'MID', 'player', false),
  ( 884, 'COL15', 'Juan Fernando Quintero', 'Juan Fernando Quintero', 'MID', 'player', false),
  ( 885, 'COL16', 'Jorge Carrascal', 'Jorge Carrascal', 'MID', 'player', false),
  ( 886, 'COL17', 'Jhon Arias', 'Jhon Arias', 'FWD', 'player', false),
  ( 887, 'COL18', 'Jhon Córdoba', 'Jhon Córdoba', 'FWD', 'player', false),
  ( 888, 'COL19', 'Luis Suárez', 'Luis Suárez', 'FWD', 'player', false),
  ( 889, 'COL20', 'Luis Díaz', 'Luis Díaz', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP J — ENGLAND (stickers 890–909, ENG1–ENG20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'ENG'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 890, 'ENG1', NULL, 'Team Logo - England', NULL, 'badge', true),
  ( 891, 'ENG2', 'Jordan Pickford', 'Jordan Pickford', 'GK', 'player', false),
  ( 892, 'ENG3', 'John Stones', 'John Stones', 'DEF', 'player', false),
  ( 893, 'ENG4', 'Marc Guéhi', 'Marc Guéhi', 'DEF', 'player', false),
  ( 894, 'ENG5', 'Ezri Konsa', 'Ezri Konsa', 'DEF', 'player', false),
  ( 895, 'ENG6', 'Trent Alexander-Arnold', 'Trent Alexander-Arnold', 'DEF', 'player', false),
  ( 896, 'ENG7', 'Reece James', 'Reece James', 'DEF', 'player', false),
  ( 897, 'ENG8', 'Dan Burn', 'Dan Burn', 'DEF', 'player', false),
  ( 898, 'ENG9', 'Jordan Henderson', 'Jordan Henderson', 'MID', 'player', false),
  ( 899, 'ENG10', 'Declan Rice', 'Declan Rice', 'MID', 'player', false),
  ( 900, 'ENG11', 'Jude Bellingham', 'Jude Bellingham', 'MID', 'player', false),
  ( 901, 'ENG12', 'Cole Palmer', 'Cole Palmer', 'MID', 'player', false),
  ( 902, 'ENG13', NULL, 'Team Photo - England', NULL, 'team_photo', false),
  ( 903, 'ENG14', 'Morgan Rogers', 'Morgan Rogers', 'MID', 'player', false),
  ( 904, 'ENG15', 'Anthony Gordon', 'Anthony Gordon', 'FWD', 'player', false),
  ( 905, 'ENG16', 'Phil Foden', 'Phil Foden', 'MID', 'player', false),
  ( 906, 'ENG17', 'Bukayo Saka', 'Bukayo Saka', 'FWD', 'player', false),
  ( 907, 'ENG18', 'Harry Kane', 'Harry Kane', 'FWD', 'player', false),
  ( 908, 'ENG19', 'Marcus Rashford', 'Marcus Rashford', 'FWD', 'player', false),
  ( 909, 'ENG20', 'Ollie Watkins', 'Ollie Watkins', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP K — CROATIA (stickers 910–929, CRO1–CRO20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'CRO'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 910, 'CRO1', NULL, 'Team Logo - Croatia', NULL, 'badge', true),
  ( 911, 'CRO2', 'Dominik Livaković', 'Dominik Livaković', 'GK', 'player', false),
  ( 912, 'CRO3', 'Duje Ćaleta-Car', 'Duje Ćaleta-Car', 'DEF', 'player', false),
  ( 913, 'CRO4', 'Joško Gvardiol', 'Joško Gvardiol', 'DEF', 'player', false),
  ( 914, 'CRO5', 'Josip Stanišić', 'Josip Stanišić', 'DEF', 'player', false),
  ( 915, 'CRO6', 'Luka Vušković', 'Luka Vušković', 'DEF', 'player', false),
  ( 916, 'CRO7', 'Josip Šutalo', 'Josip Šutalo', 'DEF', 'player', false),
  ( 917, 'CRO8', 'Kristijan Jakić', 'Kristijan Jakić', 'MID', 'player', false),
  ( 918, 'CRO9', 'Luka Modrić', 'Luka Modrić', 'MID', 'player', false),
  ( 919, 'CRO10', 'Mateo Kovačić', 'Mateo Kovačić', 'MID', 'player', false),
  ( 920, 'CRO11', 'Martin Baturina', 'Martin Baturina', 'MID', 'player', false),
  ( 921, 'CRO12', 'Lovro Majer', 'Lovro Majer', 'MID', 'player', false),
  ( 922, 'CRO13', NULL, 'Team Photo - Croatia', NULL, 'team_photo', false),
  ( 923, 'CRO14', 'Mario Pašalić', 'Mario Pašalić', 'MID', 'player', false),
  ( 924, 'CRO15', 'Petar Sučić', 'Petar Sučić', 'MID', 'player', false),
  ( 925, 'CRO16', 'Ivan Perišić', 'Ivan Perišić', 'FWD', 'player', false),
  ( 926, 'CRO17', 'Marco Pašalić', 'Marco Pašalić', 'FWD', 'player', false),
  ( 927, 'CRO18', 'Ante Budimir', 'Ante Budimir', 'FWD', 'player', false),
  ( 928, 'CRO19', 'Andrej Kramarić', 'Andrej Kramarić', 'FWD', 'player', false),
  ( 929, 'CRO20', 'Franjo Ivanović', 'Franjo Ivanović', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP J — GHANA (stickers 930–949, GHA1–GHA20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'GHA'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 930, 'GHA1', NULL, 'Team Logo - Ghana', NULL, 'badge', true),
  ( 931, 'GHA2', 'Lawrence Ati-Zigi', 'Lawrence Ati-Zigi', 'GK', 'player', false),
  ( 932, 'GHA3', 'Tariq Lamptey', 'Tariq Lamptey', 'DEF', 'player', false),
  ( 933, 'GHA4', 'Mohammed Salisu', 'Mohammed Salisu', 'DEF', 'player', false),
  ( 934, 'GHA5', 'Alidu Seidu', 'Alidu Seidu', 'DEF', 'player', false),
  ( 935, 'GHA6', 'Alexander Djiku', 'Alexander Djiku', 'DEF', 'player', false),
  ( 936, 'GHA7', 'Gideon Mensah', 'Gideon Mensah', 'DEF', 'player', false),
  ( 937, 'GHA8', 'Caleb Yirenkyi', 'Caleb Yirenkyi', 'MID', 'player', false),
  ( 938, 'GHA9', 'Abdul Fatawu Issahaku', 'Abdul Fatawu Issahaku', 'MID', 'player', false),
  ( 939, 'GHA10', 'Thomas Partey', 'Thomas Partey', 'MID', 'player', false),
  ( 940, 'GHA11', 'Salis Abdul Samed', 'Salis Abdul Samed', 'MID', 'player', false),
  ( 941, 'GHA12', 'Kamaldeen Sulemana', 'Kamaldeen Sulemana', 'FWD', 'player', false),
  ( 942, 'GHA13', NULL, 'Team Photo - Ghana', NULL, 'team_photo', false),
  ( 943, 'GHA14', 'Mohammed Kudus', 'Mohammed Kudus', 'MID', 'player', false),
  ( 944, 'GHA15', 'Iñaki Williams', 'Iñaki Williams', 'FWD', 'player', false),
  ( 945, 'GHA16', 'Jordan Ayew', 'Jordan Ayew', 'FWD', 'player', false),
  ( 946, 'GHA17', 'André Ayew', 'André Ayew', 'FWD', 'player', false),
  ( 947, 'GHA18', 'Joseph Paintsil', 'Joseph Paintsil', 'FWD', 'player', false),
  ( 948, 'GHA19', 'Osman Bukari', 'Osman Bukari', 'FWD', 'player', false),
  ( 949, 'GHA20', 'Antoine Semenyo', 'Antoine Semenyo', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP L — PANAMA (stickers 950–969, PAN1–PAN20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'PAN'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 950, 'PAN1', NULL, 'Team Logo - Panama', NULL, 'badge', true),
  ( 951, 'PAN2', 'Orlando Mosquera', 'Orlando Mosquera', 'GK', 'player', false),
  ( 952, 'PAN3', 'Luis Mejía', 'Luis Mejía', 'GK', 'player', false),
  ( 953, 'PAN4', 'Fidel Escobar', 'Fidel Escobar', 'DEF', 'player', false),
  ( 954, 'PAN5', 'Andrés Andrade', 'Andrés Andrade', 'DEF', 'player', false),
  ( 955, 'PAN6', 'Michael Amir Murillo', 'Michael Amir Murillo', 'DEF', 'player', false),
  ( 956, 'PAN7', 'Eric Davis', 'Eric Davis', 'DEF', 'player', false),
  ( 957, 'PAN8', 'José Córdoba', 'José Córdoba', 'DEF', 'player', false),
  ( 958, 'PAN9', 'César Blackman', 'César Blackman', 'DEF', 'player', false),
  ( 959, 'PAN10', 'Cristian Martínez', 'Cristian Martínez', 'MID', 'player', false),
  ( 960, 'PAN11', 'Aníbal Godoy', 'Aníbal Godoy', 'MID', 'player', false),
  ( 961, 'PAN12', 'Adalberto Carrasquilla', 'Adalberto Carrasquilla', 'MID', 'player', false),
  ( 962, 'PAN13', NULL, 'Team Photo - Panama', NULL, 'team_photo', false),
  ( 963, 'PAN14', 'Édgar Bárcenas', 'Édgar Bárcenas', 'MID', 'player', false),
  ( 964, 'PAN15', 'Carlos Harvey', 'Carlos Harvey', 'MID', 'player', false),
  ( 965, 'PAN16', 'Ismael Díaz', 'Ismael Díaz', 'FWD', 'player', false),
  ( 966, 'PAN17', 'José Fajardo', 'José Fajardo', 'FWD', 'player', false),
  ( 967, 'PAN18', 'Cecilio Waterman', 'Cecilio Waterman', 'FWD', 'player', false),
  ( 968, 'PAN19', 'José Luis Rodríguez', 'José Luis Rodríguez', 'MID', 'player', false),
  ( 969, 'PAN20', 'Alberto Quintero', 'Alberto Quintero', 'FWD', 'player', false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_type_id, number) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;
