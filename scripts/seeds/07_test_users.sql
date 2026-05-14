-- scripts/seeds/07_test_users.sql
-- DEV AND LOCAL ONLY — never runs in production (see seed-database.sh)
-- Provides ready-to-use accounts for testing all features

-- In local mode, auth is bypassed; passwords are irrelevant.
-- In dev cloud, Cognito accounts are created separately with these UUIDs mapped.

INSERT INTO users (id, email, username, display_name, role, email_verified_at) VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin@test.local',            'admin_user', 'Admin User', 'admin', now()),
  ('00000000-0000-0000-0000-000000000002', 'alice@test.local',            'alice',      'Alice',      'user',  now()),
  ('00000000-0000-0000-0000-000000000003', 'bob@test.local',              'bob',        'Bob',        'user',  now()),
  ('00000000-0000-0000-0000-000000000004', 'charlie@test.local',          'charlie',    'Charlie',    'user',  now()),
  ('00000000-0000-0000-0000-000000000005', 'diana@test.local',            'diana',      'Diana',      'user',  now()),
  ('00000000-0000-0000-0000-000000000099', 'system@stickfolio.internal',  '_system',    'System',     'admin', now())
ON CONFLICT (email) DO NOTHING;

INSERT INTO user_settings (user_id) VALUES
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-000000000004'),
  ('00000000-0000-0000-0000-000000000005')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO user_albums (id, user_id, album_type_id, album_edition_id, is_default)
WITH album_ids AS (
  SELECT
    (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026') AS type_id,
    (SELECT ae.id FROM album_editions ae
     JOIN album_types at ON at.id = ae.album_type_id
     WHERE at.key = 'fifa_world_cup_2026' AND ae.key = 'north_america') AS edition_id
)
SELECT
  id, user_id, type_id, edition_id, true
FROM (
  VALUES
    ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-000000000001'),
    ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-000000000002'),
    ('00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-000000000003'),
    ('00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0000-000000000004'),
    ('00000000-0000-0000-0001-000000000005', '00000000-0000-0000-0000-000000000005')
) AS t(id, user_id), album_ids
ON CONFLICT (id) DO NOTHING;

-- Give Alice a partial collection (first 200 base stickers, every 7th is a duplicate)
INSERT INTO user_stickers (album_id, sticker_variant_id, quantity)
SELECT
  '00000000-0000-0000-0001-000000000002',
  sv.id,
  CASE WHEN ROW_NUMBER() OVER () % 7 = 0 THEN 2 ELSE 1 END
FROM sticker_variants sv
JOIN stickers s ON sv.sticker_id = s.id
WHERE sv.variant_type = 'base'
  AND s.number BETWEEN 1 AND 200
ON CONFLICT (album_id, sticker_variant_id) DO NOTHING;

-- Give Bob a different partial collection (stickers 150–400, every 5th is a duplicate)
-- Overlap with Alice in 150–200 range enables trade match testing
INSERT INTO user_stickers (album_id, sticker_variant_id, quantity)
SELECT
  '00000000-0000-0000-0001-000000000003',
  sv.id,
  CASE WHEN ROW_NUMBER() OVER () % 5 = 0 THEN 2 ELSE 1 END
FROM sticker_variants sv
JOIN stickers s ON sv.sticker_id = s.id
WHERE sv.variant_type = 'base'
  AND s.number BETWEEN 150 AND 400
ON CONFLICT (album_id, sticker_variant_id) DO NOTHING;
