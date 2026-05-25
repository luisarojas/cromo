-- scripts/seeds/02_intro_stickers.sql
-- Intro / FWC stickers (20 total).
--   Front section: Panini logo + FWC1–FWC8 (emblem, mascots, ball, host countries).
--   Back section:  FWC9–FWC19 (past FIFA World Cup champions).
-- All intro stickers are foil and have no team association.
-- Source: paninitrade.com/checklist

INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code, s.team_id::UUID, s.player_name, s.sticker_type, s.is_foil
FROM (VALUES
  -- Front-of-album intro
  (  1, '00',    NULL, 'Panini Logo - We Are Panini',                  'intro', true),
  (  2, 'FWC1',  NULL, 'FIFA World Cup 2026 Official Emblem',           'intro', true),
  (  3, 'FWC2',  NULL, 'FIFA World Cup 2026 Official Emblem (Variant)', 'intro', true),
  (  4, 'FWC3',  NULL, 'FIFA World Cup 2026 Official Mascots',          'intro', true),
  (  5, 'FWC4',  NULL, 'FIFA World Cup 2026 Official Slogan',           'intro', true),
  (  6, 'FWC5',  NULL, 'FIFA World Cup 2026 Official Match Ball',       'intro', true),
  (  7, 'FWC6',  NULL, 'Canada — Host Country',                         'intro', true),
  (  8, 'FWC7',  NULL, 'Mexico — Host Country',                         'intro', true),
  (  9, 'FWC8',  NULL, 'United States — Host Country',                  'intro', true),
  -- Back-of-album past champions (continue the FWC series)
  (970, 'FWC9',  NULL, 'FIFA World Cup Champion — Italy 1934',          'intro', true),
  (971, 'FWC10', NULL, 'FIFA World Cup Champion — Uruguay 1950',        'intro', true),
  (972, 'FWC11', NULL, 'FIFA World Cup Champion — West Germany 1954',   'intro', true),
  (973, 'FWC12', NULL, 'FIFA World Cup Champion — Brazil 1962',         'intro', true),
  (974, 'FWC13', NULL, 'FIFA World Cup Champion — West Germany 1974',   'intro', true),
  (975, 'FWC14', NULL, 'FIFA World Cup Champion — Argentina 1986',      'intro', true),
  (976, 'FWC15', NULL, 'FIFA World Cup Champion — Brazil 1994',         'intro', true),
  (977, 'FWC16', NULL, 'FIFA World Cup Champion — Brazil 2002',         'intro', true),
  (978, 'FWC17', NULL, 'FIFA World Cup Champion — Italy 2006',          'intro', true),
  (979, 'FWC18', NULL, 'FIFA World Cup Champion — Germany 2014',        'intro', true),
  (980, 'FWC19', NULL, 'FIFA World Cup Champion — Argentina 2022',      'intro', true)
) AS s(number, album_code, team_id, player_name, sticker_type, is_foil)
ON CONFLICT (album_type_id, album_code) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  sticker_type = EXCLUDED.sticker_type,
  is_foil      = EXCLUDED.is_foil;
