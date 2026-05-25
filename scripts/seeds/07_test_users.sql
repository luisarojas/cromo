-- scripts/seeds/07_test_users.sql
-- DEV AND LOCAL ONLY — never runs in production (see seed-database.sh)
-- Provides ready-to-use accounts for testing all features

-- In local mode, auth is bypassed; passwords are irrelevant.
-- In dev cloud, Cognito accounts are created separately with these UUIDs mapped.

-- ─── Fixed UUIDs ──────────────────────────────────────────────────────────────
-- Users:         00000000-0000-0000-0000-0000000000xx
-- Albums:        00000000-0000-0000-0001-0000000000xx
-- Trade requests:00000000-0000-0000-0002-0000000000xx
-- Trade messages:00000000-0000-0000-0003-0000000000xx
-- Trade items:   00000000-0000-0000-0004-0000000000xx

INSERT INTO users (id, email, username, display_name, role, email_verified_at) VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin@test.local',            'admin_user', 'Admin User', 'admin', now()),
  ('00000000-0000-0000-0000-000000000002', 'alice@test.local',            'alice',      'Alice',      'user',  now()),
  ('00000000-0000-0000-0000-000000000003', 'bob@test.local',              'bob',        'Bob',        'user',  now()),
  ('00000000-0000-0000-0000-000000000004', 'charlie@test.local',          'charlie',    'Charlie',    'user',  now()),
  ('00000000-0000-0000-0000-000000000005', 'diana@test.local',            'diana',      'Diana',      'user',  now()),
  ('00000000-0000-0000-0000-000000000006', 'evan@test.local',             'evan',       'Evan',       'user',  now()),
  ('00000000-0000-0000-0000-000000000099', 'system@cromo.internal',  '_system',    'System',     'admin', now())
ON CONFLICT (email) DO NOTHING;

INSERT INTO user_settings (user_id) VALUES
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-000000000004'),
  ('00000000-0000-0000-0000-000000000005'),
  ('00000000-0000-0000-0000-000000000006')
ON CONFLICT (user_id) DO NOTHING;

-- ─── Primary albums (North American edition) ──────────────────────────────────

INSERT INTO user_albums (id, user_id, album_type_id, album_edition_id, album_format_id, is_default)
WITH album_ids AS (
  SELECT
    (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026') AS type_id,
    (SELECT ae.id FROM album_editions ae
     JOIN album_types at ON at.id = ae.album_type_id
     WHERE at.key = 'fifa_world_cup_2026' AND ae.key = 'north_america') AS edition_id,
    (SELECT af.id FROM album_formats af
     JOIN album_types at ON at.id = af.album_type_id
     WHERE at.key = 'fifa_world_cup_2026' AND af.key = 'softcover_standard') AS format_id
)
SELECT
  id::UUID, user_id::UUID, type_id, edition_id, format_id, true
FROM (
  VALUES
    ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-000000000001'),
    ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-000000000002'),
    ('00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-000000000003'),
    ('00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0000-000000000004'),
    ('00000000-0000-0000-0001-000000000005', '00000000-0000-0000-0000-000000000005')
) AS t(id, user_id), album_ids
ON CONFLICT (id) DO NOTHING;

-- ─── Second albums (International edition) ────────────────────────────────────
-- Alice and Bob each own two albums to exercise multi-album workflows.

INSERT INTO user_albums (id, user_id, album_type_id, album_edition_id, album_format_id, is_default, alias)
WITH album_ids AS (
  SELECT
    (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026') AS type_id,
    (SELECT ae.id FROM album_editions ae
     JOIN album_types at ON at.id = ae.album_type_id
     WHERE at.key = 'fifa_world_cup_2026' AND ae.key = 'international') AS edition_id,
    (SELECT af.id FROM album_formats af
     JOIN album_types at ON at.id = af.album_type_id
     WHERE at.key = 'fifa_world_cup_2026' AND af.key = 'softcover_standard') AS format_id
)
SELECT id::UUID, user_id::UUID, type_id, edition_id, format_id, false, alias
FROM (
  VALUES
    ('00000000-0000-0000-0001-000000000012', '00000000-0000-0000-0000-000000000002', 'Alice International'),
    ('00000000-0000-0000-0001-000000000013', '00000000-0000-0000-0000-000000000003', 'Bob International')
) AS t(id, user_id, alias), album_ids
ON CONFLICT (id) DO NOTHING;

-- ─── Sticker collections ──────────────────────────────────────────────────────

-- Alice (north_america): stickers 1–200, every 7th is a duplicate.
-- Overlap with Bob in 150–200 enables trade-match testing.
INSERT INTO user_stickers (album_id, sticker_variant_id, quantity)
SELECT
  '00000000-0000-0000-0001-000000000002'::UUID,
  sv.id,
  CASE WHEN ROW_NUMBER() OVER () % 7 = 0 THEN 2 ELSE 1 END
FROM sticker_variants sv
JOIN stickers s ON sv.sticker_id = s.id
WHERE sv.variant_type = 'base_border'
  AND s.number BETWEEN 1 AND 200
ON CONFLICT (album_id, sticker_variant_id) DO NOTHING;

-- Bob (north_america): stickers 150–400, every 5th is a duplicate.
INSERT INTO user_stickers (album_id, sticker_variant_id, quantity)
SELECT
  '00000000-0000-0000-0001-000000000003'::UUID,
  sv.id,
  CASE WHEN ROW_NUMBER() OVER () % 5 = 0 THEN 2 ELSE 1 END
FROM sticker_variants sv
JOIN stickers s ON sv.sticker_id = s.id
WHERE sv.variant_type = 'base_border'
  AND s.number BETWEEN 150 AND 400
ON CONFLICT (album_id, sticker_variant_id) DO NOTHING;

-- Charlie (north_america): stickers 1–100, every 3rd is a duplicate.
-- Overlaps with Alice; exercises three-way matching scenarios.
INSERT INTO user_stickers (album_id, sticker_variant_id, quantity)
SELECT
  '00000000-0000-0000-0001-000000000004'::UUID,
  sv.id,
  CASE WHEN ROW_NUMBER() OVER () % 3 = 0 THEN 2 ELSE 1 END
FROM sticker_variants sv
JOIN stickers s ON sv.sticker_id = s.id
WHERE sv.variant_type = 'base_border'
  AND s.number BETWEEN 1 AND 100
ON CONFLICT (album_id, sticker_variant_id) DO NOTHING;

-- Diana (north_america): stickers 250–400, every 4th is a duplicate.
-- Overlaps with Bob; enables Charlie↔Diana trade scenario.
INSERT INTO user_stickers (album_id, sticker_variant_id, quantity)
SELECT
  '00000000-0000-0000-0001-000000000005'::UUID,
  sv.id,
  CASE WHEN ROW_NUMBER() OVER () % 4 = 0 THEN 2 ELSE 1 END
FROM sticker_variants sv
JOIN stickers s ON sv.sticker_id = s.id
WHERE sv.variant_type = 'base_border'
  AND s.number BETWEEN 250 AND 400
ON CONFLICT (album_id, sticker_variant_id) DO NOTHING;

-- Alice (international): stickers 1–50, every 5th is a duplicate.
-- Distinct collection to exercise per-album stats and filtering.
INSERT INTO user_stickers (album_id, sticker_variant_id, quantity)
SELECT
  '00000000-0000-0000-0001-000000000012'::UUID,
  sv.id,
  CASE WHEN ROW_NUMBER() OVER () % 5 = 0 THEN 2 ELSE 1 END
FROM sticker_variants sv
JOIN stickers s ON sv.sticker_id = s.id
WHERE sv.variant_type = 'base_border'
  AND s.number BETWEEN 1 AND 50
ON CONFLICT (album_id, sticker_variant_id) DO NOTHING;

-- Bob (international): stickers 300–400, every 8th is a duplicate.
INSERT INTO user_stickers (album_id, sticker_variant_id, quantity)
SELECT
  '00000000-0000-0000-0001-000000000013'::UUID,
  sv.id,
  CASE WHEN ROW_NUMBER() OVER () % 8 = 0 THEN 2 ELSE 1 END
FROM sticker_variants sv
JOIN stickers s ON sv.sticker_id = s.id
WHERE sv.variant_type = 'base_border'
  AND s.number BETWEEN 300 AND 400
ON CONFLICT (album_id, sticker_variant_id) DO NOTHING;

-- ─── Trade flags ──────────────────────────────────────────────────────────────

-- Alice hides two of her duplicate stickers from trade view (trade_hidden).
-- Stickers 7 and 14 are duplicates (7 % 7 = 0, 14 % 7 = 0) in her north_america album.
UPDATE user_stickers
SET trade_hidden = true
WHERE album_id = '00000000-0000-0000-0001-000000000002'
  AND sticker_variant_id IN (
    SELECT sv.id FROM sticker_variants sv
    JOIN stickers s ON sv.sticker_id = s.id
    WHERE s.number IN (7, 14)
      AND sv.variant_type = 'base_border'
      AND s.album_type_id = (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026')
  );

-- Bob forces two non-duplicate stickers into his trade view (trade_forced).
-- Stickers 151 and 156 are singles for Bob (151 % 5 = 1, 156 % 5 = 1).
UPDATE user_stickers
SET trade_forced = true
WHERE album_id = '00000000-0000-0000-0001-000000000003'
  AND sticker_variant_id IN (
    SELECT sv.id FROM sticker_variants sv
    JOIN stickers s ON sv.sticker_id = s.id
    WHERE s.number IN (151, 156)
      AND sv.variant_type = 'base_border'
      AND s.album_type_id = (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026')
  );

-- ─── Seeded trade requests ────────────────────────────────────────────────────

-- Trade A: Alice → Bob (pending) — used to test messaging and trade display.
-- Trade B: Charlie → Diana (accepted) — used to test accepted-trade messaging.
INSERT INTO trade_requests (id, requester_id, recipient_id, requester_album_id, recipient_album_id, status)
VALUES
  ('00000000-0000-0000-0002-000000000001',
   '00000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0001-000000000002',
   '00000000-0000-0000-0001-000000000003',
   'pending'),
  ('00000000-0000-0000-0002-000000000002',
   '00000000-0000-0000-0000-000000000004',
   '00000000-0000-0000-0000-000000000005',
   '00000000-0000-0000-0001-000000000004',
   '00000000-0000-0000-0001-000000000005',
   'accepted')
ON CONFLICT (id) DO NOTHING;

-- Trade A items: Alice offers sticker #35 (one of her duplicates; 35 % 7 = 0),
-- wants sticker #180 (Bob has it, Alice is missing it).
INSERT INTO trade_items (id, trade_id, sticker_variant_id, direction, quantity)
SELECT
  '00000000-0000-0000-0004-000000000001'::UUID,
  '00000000-0000-0000-0002-000000000001',
  sv.id,
  'offer',
  1
FROM sticker_variants sv
JOIN stickers s ON sv.sticker_id = s.id
WHERE s.number = 35
  AND sv.variant_type = 'base_border'
  AND s.album_type_id = (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026')
ON CONFLICT (id) DO NOTHING;

INSERT INTO trade_items (id, trade_id, sticker_variant_id, direction, quantity)
SELECT
  '00000000-0000-0000-0004-000000000002'::UUID,
  '00000000-0000-0000-0002-000000000001',
  sv.id,
  'want',
  1
FROM sticker_variants sv
JOIN stickers s ON sv.sticker_id = s.id
WHERE s.number = 180
  AND sv.variant_type = 'base_border'
  AND s.album_type_id = (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026')
ON CONFLICT (id) DO NOTHING;

-- Trade B items: Charlie offers sticker #33 (duplicate; 33 % 3 = 0),
-- wants sticker #270 (Diana has it, Charlie is missing it).
INSERT INTO trade_items (id, trade_id, sticker_variant_id, direction, quantity)
SELECT
  '00000000-0000-0000-0004-000000000003'::UUID,
  '00000000-0000-0000-0002-000000000002',
  sv.id,
  'offer',
  1
FROM sticker_variants sv
JOIN stickers s ON sv.sticker_id = s.id
WHERE s.number = 33
  AND sv.variant_type = 'base_border'
  AND s.album_type_id = (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026')
ON CONFLICT (id) DO NOTHING;

INSERT INTO trade_items (id, trade_id, sticker_variant_id, direction, quantity)
SELECT
  '00000000-0000-0000-0004-000000000004'::UUID,
  '00000000-0000-0000-0002-000000000002',
  sv.id,
  'want',
  1
FROM sticker_variants sv
JOIN stickers s ON sv.sticker_id = s.id
WHERE s.number = 270
  AND sv.variant_type = 'base_border'
  AND s.album_type_id = (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026')
ON CONFLICT (id) DO NOTHING;

-- ─── Trade messages ───────────────────────────────────────────────────────────
-- Populated even if FEATURE_TRADE_MESSAGING is disabled, so tests can exercise
-- the messaging service directly without toggling the feature flag.

INSERT INTO trade_messages (id, trade_id, sender_id, body)
VALUES
  ('00000000-0000-0000-0003-000000000001',
   '00000000-0000-0000-0002-000000000001',
   '00000000-0000-0000-0000-000000000002',
   'Hey Bob! I have a spare #35 you might want.'),
  ('00000000-0000-0000-0003-000000000002',
   '00000000-0000-0000-0002-000000000001',
   '00000000-0000-0000-0000-000000000003',
   'Looks fair! Could you throw in a cash bonus?'),
  ('00000000-0000-0000-0003-000000000003',
   '00000000-0000-0000-0002-000000000002',
   '00000000-0000-0000-0000-000000000004',
   'This trade looks good to me, Diana!'),
  ('00000000-0000-0000-0003-000000000004',
   '00000000-0000-0000-0002-000000000002',
   '00000000-0000-0000-0000-000000000005',
   'Agreed — let''s meet up this weekend.')
ON CONFLICT (id) DO NOTHING;

-- ─── Feature flags ────────────────────────────────────────────────────────────
-- Enable trade messaging so tests can exercise the full SSE flow locally.

UPDATE feature_flags
SET enabled = true, rollout_pct = 100
WHERE key = 'FEATURE_TRADE_MESSAGING';
