-- Seed 14: sticker_album_pages
-- Per-edition page locations for non-team stickers (CC, intro/FWC).
-- Must run after 02_intro_stickers.sql and 08_coca_cola_stickers.sql.

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
ON CONFLICT (sticker_id, edition) DO UPDATE SET
  page_start  = EXCLUDED.page_start,
  page_end    = EXCLUDED.page_end,
  description = EXCLUDED.description;

-- Intro (FWC) stickers
-- '00' (We Are Panini) is included in all editions. For north_america it lives on
-- the inside front cover (page 1 spread, same page group as FWC1–FWC5).
INSERT INTO sticker_album_pages (sticker_id, edition, page_start, page_end, description)
SELECT s.id, v.edition, v.page_start::INTEGER, v.page_end::INTEGER, v.description
FROM stickers s
JOIN (VALUES
  ('00',   'north_america', '1',  '1',  'Inside Front Cover'),
  ('00',   'international', '1',  '1',  'Inside Front Cover'),
  ('00',   'swiss_gold',    '1',  '1',  'Inside Front Cover'),
  ('00',   'south_america', '1',  '1',  NULL),
  ('FWC1', 'north_america', '1',  '1',  NULL),
  ('FWC1', 'international', '1',  '1',  NULL),
  ('FWC1', 'swiss_gold',    '1',  '1',  NULL),
  ('FWC1', 'south_america', '1',  '1',  NULL),
  ('FWC2', 'north_america', '1',  '1',  NULL),
  ('FWC2', 'international', '1',  '1',  NULL),
  ('FWC2', 'swiss_gold',    '1',  '1',  NULL),
  ('FWC2', 'south_america', '1',  '1',  NULL),
  ('FWC3', 'north_america', '1',  '1',  NULL),
  ('FWC3', 'international', '1',  '1',  NULL),
  ('FWC3', 'swiss_gold',    '1',  '1',  NULL),
  ('FWC3', 'south_america', '1',  '1',  NULL),
  ('FWC4', 'north_america', '1',  '1',  NULL),
  ('FWC4', 'international', '1',  '1',  NULL),
  ('FWC4', 'swiss_gold',    '1',  '1',  NULL),
  ('FWC4', 'south_america', '1',  '1',  NULL),
  ('FWC5', 'north_america', '1',  '1',  NULL),
  ('FWC5', 'international', '1',  '1',  NULL),
  ('FWC5', 'swiss_gold',    '1',  '1',  NULL),
  ('FWC5', 'south_america', '1',  '1',  NULL),
  ('FWC6', 'north_america', '2',  '2',  NULL),
  ('FWC6', 'international', '2',  '2',  NULL),
  ('FWC6', 'swiss_gold',    '2',  '2',  NULL),
  ('FWC6', 'south_america', '2',  '2',  NULL),
  ('FWC7', 'north_america', '2',  '2',  NULL),
  ('FWC7', 'international', '2',  '2',  NULL),
  ('FWC7', 'swiss_gold',    '2',  '2',  NULL),
  ('FWC7', 'south_america', '2',  '2',  NULL),
  ('FWC8', 'north_america', '2',  '2',  NULL),
  ('FWC8', 'international', '2',  '2',  NULL),
  ('FWC8', 'swiss_gold',    '2',  '2',  NULL),
  ('FWC8', 'south_america', '2',  '2',  NULL)
) AS v(album_code, edition, page_start, page_end, description) ON s.album_code = v.album_code
ON CONFLICT (sticker_id, edition) DO UPDATE SET
  page_start  = EXCLUDED.page_start,
  page_end    = EXCLUDED.page_end,
  description = EXCLUDED.description;

-- Past-champion intro stickers (FWC9–FWC19) — back-of-album section.
-- These are real album slots present in every edition (sticker_type = 'intro').
-- Page numbers are approximate; exact placement shifts between regional editions.
-- NA teams start at p. 12 → champions occupy pp. 3–10.
-- Swiss gold teams start at p. 8 → champions occupy pp. 3–7.
-- International/South America teams start at p. 4 → champions occupy p. 3.
INSERT INTO sticker_album_pages (sticker_id, edition, page_start, page_end, description)
SELECT s.id, v.edition, v.page_start::INTEGER, v.page_end::INTEGER, v.description
FROM stickers s
JOIN (VALUES
  -- North America (teams start p. 12; champions pp. 3–10)
  ('FWC9',  'north_america',  '3',  '3',  NULL),
  ('FWC10', 'north_america',  '4',  '4',  NULL),
  ('FWC11', 'north_america',  '5',  '5',  NULL),
  ('FWC12', 'north_america',  '5',  '5',  NULL),
  ('FWC13', 'north_america',  '6',  '6',  NULL),
  ('FWC14', 'north_america',  '6',  '6',  NULL),
  ('FWC15', 'north_america',  '7',  '7',  NULL),
  ('FWC16', 'north_america',  '7',  '7',  NULL),
  ('FWC17', 'north_america',  '8',  '8',  NULL),
  ('FWC18', 'north_america',  '9',  '9',  NULL),
  ('FWC19', 'north_america', '10', '10',  NULL),
  -- International (teams start p. 4; champions p. 3)
  ('FWC9',  'international',  '3',  '3',  NULL),
  ('FWC10', 'international',  '3',  '3',  NULL),
  ('FWC11', 'international',  '3',  '3',  NULL),
  ('FWC12', 'international',  '3',  '3',  NULL),
  ('FWC13', 'international',  '3',  '3',  NULL),
  ('FWC14', 'international',  '3',  '3',  NULL),
  ('FWC15', 'international',  '3',  '3',  NULL),
  ('FWC16', 'international',  '3',  '3',  NULL),
  ('FWC17', 'international',  '3',  '3',  NULL),
  ('FWC18', 'international',  '3',  '3',  NULL),
  ('FWC19', 'international',  '3',  '3',  NULL),
  -- Swiss gold (teams start p. 8; champions pp. 3–7)
  ('FWC9',  'swiss_gold',     '3',  '3',  NULL),
  ('FWC10', 'swiss_gold',     '3',  '3',  NULL),
  ('FWC11', 'swiss_gold',     '4',  '4',  NULL),
  ('FWC12', 'swiss_gold',     '4',  '4',  NULL),
  ('FWC13', 'swiss_gold',     '5',  '5',  NULL),
  ('FWC14', 'swiss_gold',     '5',  '5',  NULL),
  ('FWC15', 'swiss_gold',     '6',  '6',  NULL),
  ('FWC16', 'swiss_gold',     '6',  '6',  NULL),
  ('FWC17', 'swiss_gold',     '7',  '7',  NULL),
  ('FWC18', 'swiss_gold',     '7',  '7',  NULL),
  ('FWC19', 'swiss_gold',     '7',  '7',  NULL),
  -- South America (teams start p. 4; champions p. 3)
  ('FWC9',  'south_america',  '3',  '3',  NULL),
  ('FWC10', 'south_america',  '3',  '3',  NULL),
  ('FWC11', 'south_america',  '3',  '3',  NULL),
  ('FWC12', 'south_america',  '3',  '3',  NULL),
  ('FWC13', 'south_america',  '3',  '3',  NULL),
  ('FWC14', 'south_america',  '3',  '3',  NULL),
  ('FWC15', 'south_america',  '3',  '3',  NULL),
  ('FWC16', 'south_america',  '3',  '3',  NULL),
  ('FWC17', 'south_america',  '3',  '3',  NULL),
  ('FWC18', 'south_america',  '3',  '3',  NULL),
  ('FWC19', 'south_america',  '3',  '3',  NULL)
) AS v(album_code, edition, page_start, page_end, description) ON s.album_code = v.album_code
ON CONFLICT (sticker_id, edition) DO UPDATE SET
  page_start  = EXCLUDED.page_start,
  page_end    = EXCLUDED.page_end,
  description = EXCLUDED.description;
