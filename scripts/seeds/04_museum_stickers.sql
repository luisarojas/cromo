-- scripts/seeds/04_museum_stickers.sql
-- 11 FIFA Museum stickers — past World Cup champions
-- These appear at the back of the album, continuing the FWC series (FWC9–FWC19)
-- All are foil stickers with no team association
-- Source: paninitrade.com/checklist
-- NOTE: seed-data.md documented these as MUS1–MUS11 (provisional pre-release).
--       The actual album uses FWC9–FWC19.

INSERT INTO stickers (number, album_code, team_id, player_name, sticker_type, is_foil)
VALUES
  (970, 'FWC9',  NULL, 'FIFA World Cup Champion — Italy 1934',        'museum', true),
  (971, 'FWC10', NULL, 'FIFA World Cup Champion — Uruguay 1950',      'museum', true),
  (972, 'FWC11', NULL, 'FIFA World Cup Champion — West Germany 1954', 'museum', true),
  (973, 'FWC12', NULL, 'FIFA World Cup Champion — Brazil 1962',       'museum', true),
  (974, 'FWC13', NULL, 'FIFA World Cup Champion — West Germany 1974', 'museum', true),
  (975, 'FWC14', NULL, 'FIFA World Cup Champion — Argentina 1986',    'museum', true),
  (976, 'FWC15', NULL, 'FIFA World Cup Champion — Brazil 1994',       'museum', true),
  (977, 'FWC16', NULL, 'FIFA World Cup Champion — Brazil 2002',       'museum', true),
  (978, 'FWC17', NULL, 'FIFA World Cup Champion — Italy 2006',        'museum', true),
  (979, 'FWC18', NULL, 'FIFA World Cup Champion — Germany 2014',      'museum', true),
  (980, 'FWC19', NULL, 'FIFA World Cup Champion — Argentina 2022',    'museum', true)
ON CONFLICT (album_code) DO UPDATE SET
  player_name = EXCLUDED.player_name;
