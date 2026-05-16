-- Seed 14: sticker_album_pages
-- Per-edition page locations for non-team stickers (CC, intro/FWC, HC, Swiss Legends).
-- Must run after 02_intro_stickers.sql, 08_coca_cola_stickers.sql, 11_host_city_stickers.sql,
-- and 12_swiss_legend_stickers.sql.

-- Coca-Cola stickers (all CC stickers share the same spread per edition)
INSERT INTO sticker_album_pages (sticker_id, edition, page_start, page_end, description)
SELECT s.id, v.edition, v.page_start::INTEGER, v.page_end::INTEGER, v.description
FROM stickers s
CROSS JOIN (VALUES
  ('north_america', NULL,  NULL,  'Inside Back Cover (after p. 112)'),
  ('international', '56',  '57',  NULL),
  ('swiss_gold',    '56',  '57',  NULL),
  ('south_america', '112', '112', NULL)
) AS v(edition, page_start, page_end, description)
WHERE s.sticker_type = 'coca_cola_special'
ON CONFLICT (sticker_id, edition) DO NOTHING;

-- Intro (FWC) stickers
INSERT INTO sticker_album_pages (sticker_id, edition, page_start, page_end, description)
SELECT s.id, v.edition, v.page_start::INTEGER, v.page_end::INTEGER, v.description
FROM stickers s
JOIN (VALUES
  ('00',   'north_america', NULL, NULL, 'Not included in this edition'),
  ('00',   'international', NULL, NULL, 'Inside Front Cover'),
  ('00',   'swiss_gold',    NULL, NULL, 'Inside Front Cover'),
  ('00',   'south_america', '1',  '1',  NULL),
  ('FWC1', 'north_america', '1', '1', NULL),
  ('FWC1', 'international', '1', '1', NULL),
  ('FWC1', 'swiss_gold',    '1', '1', NULL),
  ('FWC1', 'south_america', '1', '1', NULL),
  ('FWC2', 'north_america', '1', '1', NULL),
  ('FWC2', 'international', '1', '1', NULL),
  ('FWC2', 'swiss_gold',    '1', '1', NULL),
  ('FWC2', 'south_america', '1', '1', NULL),
  ('FWC3', 'north_america', '1', '1', NULL),
  ('FWC3', 'international', '1', '1', NULL),
  ('FWC3', 'swiss_gold',    '1', '1', NULL),
  ('FWC3', 'south_america', '1', '1', NULL),
  ('FWC4', 'north_america', '1', '1', NULL),
  ('FWC4', 'international', '1', '1', NULL),
  ('FWC4', 'swiss_gold',    '1', '1', NULL),
  ('FWC4', 'south_america', '1', '1', NULL),
  ('FWC5', 'north_america', '1', '1', NULL),
  ('FWC5', 'international', '1', '1', NULL),
  ('FWC5', 'swiss_gold',    '1', '1', NULL),
  ('FWC5', 'south_america', '1', '1', NULL),
  ('FWC6', 'north_america', '2', '2', NULL),
  ('FWC6', 'international', '2', '2', NULL),
  ('FWC6', 'swiss_gold',    '2', '2', NULL),
  ('FWC6', 'south_america', '2', '2', NULL),
  ('FWC7', 'north_america', '2', '2', NULL),
  ('FWC7', 'international', '2', '2', NULL),
  ('FWC7', 'swiss_gold',    '2', '2', NULL),
  ('FWC7', 'south_america', '2', '2', NULL),
  ('FWC8', 'north_america', '2', '2', NULL),
  ('FWC8', 'international', '2', '2', NULL),
  ('FWC8', 'swiss_gold',    '2', '2', NULL),
  ('FWC8', 'south_america', '2', '2', NULL)
) AS v(album_code, edition, page_start, page_end, description) ON s.album_code = v.album_code
ON CONFLICT (sticker_id, edition) DO NOTHING;

-- Swiss Legends (L1–L10) — exclusive to swiss_gold edition, pages 104–105.
-- Not included in north_america, international, or south_america.
INSERT INTO sticker_album_pages (sticker_id, edition, page_start, page_end, description)
SELECT s.id, 'swiss_gold', 104, 105, NULL
FROM stickers s
WHERE s.album_code LIKE 'L%'
  AND s.sticker_type = 'museum'
  AND s.is_foil = true
  AND s.album_type_id = (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026')
ON CONFLICT (sticker_id, edition) DO NOTHING;

-- Host City stickers (HC1–HC16)
-- north_america and swiss_gold: dedicated collectible boxes (page numbers TBD — add when confirmed).
-- international and south_america: artwork printed directly on album background; no sticker slot.
