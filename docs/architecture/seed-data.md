# Database Seed Data — 2026 FIFA World Cup

> **Parent document:** [`overview.md`](overview.md#document-map) — this file is the detailed expansion of the seed-data scripts. `overview.md` covers cross-cutting context (product, architecture, phases, cost, glossary); this file is the canonical reference for compiling and running seeds.

## 1. Overview

Seeding is the process of loading the database with real, accurate data before any user signs up. Without correct seed data, the application has nothing to display. This section defines exactly what gets seeded and how.

The seed data covers:
1. All 48 teams with their groups
2. All 980 sticker records (full album checklist)
3. All sticker variants (13 variant types per applicable sticker)
4. Initial feature flags
5. Development test users (local/dev only — never in production)
6. Trust & Safety sample data for the moderation UI (local/dev only — never in production)

## 2. Seed Script Architecture

```
scripts/
  seed-database.sh          # master script — runs all seeds in order
  seeds/
    01_teams.sql            # 48 teams with FIFA codes and group assignments
    02_intro_stickers.sql   # 20 intro/FWC stickers — Panini logo, FWC1–FWC8 (front), FWC9–FWC19 (back / past champions)
    03_team_stickers.sql    # all 960 team stickers (MEX1–MEX20, etc.)
    05_variants.sql         # generates all variant records per sticker
    06_feature_flags.sql    # initial feature flag state
    07_test_users.sql       # DEV/LOCAL ONLY — 6 pre-verified test accounts
    08_coca_cola_stickers.sql  # 12 Coca-Cola bottle stickers (CC1–CC12)
    09_trust_safety.sql     # DEV/LOCAL ONLY — sample ratings/reports for admin UI
    10_extra_stickers.sql   # 20 Panini Extra Sticker inserts (EX1–EX20, 4 rarities each)
    13_team_album_pages.sql    # Team-level album page assignments
    14_sticker_album_pages.sql # Per-sticker album page assignments

Core album = 980 stickers (20 intro/FWC + 960 team). Beyond the core, the album also tracks
12 Coca-Cola stickers and 20 Extra stickers.
```

The master script checks the `NODE_ENV` environment variable. If it is `production`, it refuses to run seed files 07 and 09 (test users and trust & safety sample data). Feature flags (file 06) are required in every environment, so they are not gated. This is a safety guard.

All seed scripts use `INSERT ... ON CONFLICT DO UPDATE` (upsert), making them safe to re-run. Running the seed twice produces the same result.

## 3. Seed File 01: Teams

All 48 qualified teams with their FIFA codes, full names, and group assignments based on the confirmed draw.

```sql
-- scripts/seeds/01_teams.sql
-- 48 qualified teams for FIFA World Cup 2026
-- Groups confirmed from the December 5, 2025 draw at the Kennedy Center

INSERT INTO teams (fifa_code, name, group_name) VALUES
-- Group A
('MEX', 'Mexico',              'A'),
('CZE', 'Czech Republic',      'A'),
('RSA', 'South Africa',        'A'),
('KOR', 'South Korea',         'A'),

-- Group B
('CAN', 'Canada',              'B'),
('BIH', 'Bosnia & Herzegovina','B'),
('QAT', 'Qatar',               'B'),
('SUI', 'Switzerland',         'B'),

-- Group C
('ESP', 'Spain',               'C'),
('ALG', 'Algeria',             'C'),
('JPN', 'Japan',               'C'),
('NZL', 'New Zealand',         'C'),

-- Group D
('USA', 'USA',                 'D'),
('PAR', 'Paraguay',            'D'),
('AUS', 'Australia',           'D'),
('TUR', 'Türkiye',             'D'),

-- Group E
('ARG', 'Argentina',           'E'),
('ECU', 'Ecuador',             'E'),
('SWE', 'Sweden',              'E'),
('CIV', 'Ivory Coast',         'E'),

-- Group F
('GER', 'Germany',             'F'),
('SCO', 'Scotland',            'F'),
('CUW', 'Curaçao',             'F'),
('IRN', 'Iran',                'F'),

-- Group G
('BEL', 'Belgium',             'G'),
('EGY', 'Egypt',               'G'),
('JOR', 'Jordan',              'G'),
('HAI', 'Haiti',               'G'),

-- Group H
('POR', 'Portugal',            'H'),
('COL', 'Colombia',            'H'),
('UZB', 'Uzbekistan',          'H'),
('CGO', 'Congo DR',            'H'),

-- Group I
('FRA', 'France',              'I'),
('NOR', 'Norway',              'I'),
('SEN', 'Senegal',             'I'),
('IRQ', 'Iraq',                'I'),

-- Group J
('ENG', 'England',             'J'),
('NED', 'Netherlands',         'J'),
('GHA', 'Ghana',               'J'),
('TUN', 'Tunisia',             'J'),

-- Group K
('BRA', 'Brazil',              'K'),
('MAR', 'Morocco',             'K'),
('CRO', 'Croatia',             'K'),
('KSA', 'Saudi Arabia',        'K'),

-- Group L
('URU', 'Uruguay',             'L'),
('AUT', 'Austria',             'L'),
('PAN', 'Panama',              'L'),
('CPV', 'Cape Verde',          'L')

ON CONFLICT (fifa_code) DO UPDATE SET
  name       = EXCLUDED.name,
  group_name = EXCLUDED.group_name;
```

## 4. Seed File 02: Introduction Stickers

The opening pages of the album before team sections begin.

```sql
-- scripts/seeds/02_intro_stickers.sql
-- Stickers 00 and FWC1-FWC8 (introduction / emblem pages)
-- These have no team association

INSERT INTO stickers
  (number, album_code, team_id, player_name, sticker_type, is_foil, album_page)
VALUES
  -- Panini logo sticker (album position 00)
  (0,   '00',   NULL, NULL, 'intro', true,  1),

  -- FWC series: official emblem, mascots, slogan, ball, host nation pages
  (1,   'FWC1', NULL, 'Official Emblem',                  'intro', true,  2),
  (2,   'FWC2', NULL, 'Official Emblem',                  'intro', true,  2),
  (3,   'FWC3', NULL, 'Official Mascots',                 'intro', true,  3),
  (4,   'FWC4', NULL, 'Official Slogan',                  'intro', true,  3),
  (5,   'FWC5', NULL, 'Official Ball',                    'intro', true,  4),
  (6,   'FWC6', NULL, 'Canada - Host Countries & Cities', 'intro', true,  5),
  (7,   'FWC7', NULL, 'Mexico - Host Countries & Cities', 'intro', true,  5),
  (8,   'FWC8', NULL, 'USA - Host Countries & Cities',    'intro', true,  6)

ON CONFLICT (album_code) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  sticker_type = EXCLUDED.sticker_type,
  is_foil      = EXCLUDED.is_foil;
```

## 5. Seed File 03: Team Stickers (Excerpt — Full File)

> **Note:** This section shows only 2 of 48 teams as examples. The complete `03_team_stickers.sql` file with all 960 records (48 teams × 20 stickers each) is in the repository. Sources used to compile it:
> 1. https://www.checklistinsider.com/2026-panini-fifa-world-cup-sticker — complete numbered checklist
> 2. https://fandom.com/wiki/2026_FIFA_World_Cup_(Panini) — player details cross-reference
> 3. Sticker `number` values (1–980) are assigned sequentially in album order
> 4. The `album_code` (e.g., `MEX1`, `CAN3`) is the stable identifier used by the AI scan feature

This is the largest seed file. Each team contributes 20 stickers. Below is the complete structure shown for two teams (Mexico and South Africa) to demonstrate the pattern. The full file in the repository covers all 48 teams × 20 stickers = 960 records.

**Sticker numbering convention:** Stickers are numbered sequentially in album order. The album code (e.g., `MEX1`, `CAN3`) maps to the team FIFA code + position within the team's 20-sticker block.

```sql
-- scripts/seeds/03_team_stickers.sql
-- 960 team stickers — all 48 teams × 20 stickers each
-- Ordered by album order (Group A → Group L)
-- Source: checklistinsider.com/2026-panini-fifa-world-cup-sticker
--         verified against fandom.com/wiki/2026_FIFA_World_Cup_(Panini)
-- SUBJECT TO CHANGE as Panini may issue corrections post-release.

-- ─────────────────────────────────────────────────────────
-- GROUP A — MEXICO (stickers 9–28, album codes MEX1–MEX20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'MEX'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 9,  'MEX1',  NULL,                'Team Logo - Mexico',    NULL,  'badge',      true),
  (10,  'MEX2',  'Luis Malagón',      'Luis Malagón',          'GK',  'player',     false),
  (11,  'MEX3',  'Johan Vasquez',     'Johan Vasquez',         'DEF', 'player',     false),
  (12,  'MEX4',  'Jorge Sánchez',     'Jorge Sánchez',         'DEF', 'player',     false),
  (13,  'MEX5',  'Cesar Montes',      'Cesar Montes',          'DEF', 'player',     false),
  (14,  'MEX6',  'Jesus Gallardo',    'Jesus Gallardo',        'DEF', 'player',     false),
  (15,  'MEX7',  'Israel Reyes',      'Israel Reyes',          'DEF', 'player',     false),
  (16,  'MEX8',  'Diego Lainez',      'Diego Lainez',          'MID', 'player',     false),
  (17,  'MEX9',  'Carlos Rodriguez',  'Carlos Rodriguez',      'MID', 'player',     false),
  (18,  'MEX10', 'Edson Alvarez',     'Edson Alvarez',         'MID', 'player',     false),
  (19,  'MEX11', 'Orbelin Pineda',    'Orbelin Pineda',        'MID', 'player',     false),
  (20,  'MEX12', 'Marcel Ruiz',       'Marcel Ruiz',           'MID', 'player',     false),
  (21,  'MEX13', NULL,                'Team Photo - Mexico',   NULL,  'team_photo', false),
  (22,  'MEX14', 'Érick Sánchez',     'Érick Sánchez',         'MID', 'player',     false),
  (23,  'MEX15', 'Hirving Lozano',    'Hirving Lozano',        'FWD', 'player',     false),
  (24,  'MEX16', 'Santiago Giménez',  'Santiago Giménez',      'FWD', 'player',     false),
  (25,  'MEX17', 'Raúl Jiménez',      'Raúl Jiménez',          'FWD', 'player',     false),
  (26,  'MEX18', 'Alexis Vega',       'Alexis Vega',           'FWD', 'player',     false),
  (27,  'MEX19', 'Roberto Alvarado',  'Roberto Alvarado',      'FWD', 'player',     false),
  (28,  'MEX20', 'Cesar Huerta',      'Cesar Huerta',          'FWD', 'player',     false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_code) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP A — SOUTH AFRICA (stickers 29–48, RSA1–RSA20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'RSA'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  (29,  'RSA1',  NULL,                   'Team Logo - South Africa',  NULL,  'badge',      true),
  (30,  'RSA2',  'Ronwen Williams',       'Ronwen Williams',           'GK',  'player',     false),
  (31,  'RSA3',  'Sipho Chaine',          'Sipho Chaine',              'GK',  'player',     false),
  (32,  'RSA4',  'Aubrey Modiba',         'Aubrey Modiba',             'DEF', 'player',     false),
  (33,  'RSA5',  'Samukele Kabini',       'Samukele Kabini',           'DEF', 'player',     false),
  (34,  'RSA6',  'Mbekezeli Mbokazi',     'Mbekezeli Mbokazi',         'DEF', 'player',     false),
  (35,  'RSA7',  'Khulumani Ndamane',     'Khulumani Ndamane',         'DEF', 'player',     false),
  (36,  'RSA8',  'Siyabonga Ngezana',     'Siyabonga Ngezana',         'DEF', 'player',     false),
  (37,  'RSA9',  'Khuliso Mudau',         'Khuliso Mudau',             'MID', 'player',     false),
  (38,  'RSA10', 'Nkosinathi Sibisi',     'Nkosinathi Sibisi',         'MID', 'player',     false),
  (39,  'RSA11', 'Teboho Mokoena',        'Teboho Mokoena',            'MID', 'player',     false),
  (40,  'RSA12', 'Thalente Mbatha',       'Thalente Mbatha',           'MID', 'player',     false),
  (41,  'RSA13', NULL,                   'Team Photo - South Africa',  NULL,  'team_photo', false),
  (42,  'RSA14', 'Bathasi Aubaas',        'Bathasi Aubaas',            'MID', 'player',     false),
  (43,  'RSA15', 'Yaya Sithole',          'Yaya Sithole',              'FWD', 'player',     false),
  (44,  'RSA16', 'Sipho Mbule',           'Sipho Mbule',               'FWD', 'player',     false),
  (45,  'RSA17', 'Lyle Foster',           'Lyle Foster',               'FWD', 'player',     false),
  (46,  'RSA18', 'Iqraam Rayners',        'Iqraam Rayners',            'FWD', 'player',     false),
  (47,  'RSA19', 'Mohau Nkota',           'Mohau Nkota',               'FWD', 'player',     false),
  (48,  'RSA20', 'Oswin Appollis',        'Oswin Appollis',            'FWD', 'player',     false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_code) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position;

-- [... South Korea, Canada, Bosnia & Herzegovina, Qatar, Switzerland,
--      Spain, Algeria, Japan, New Zealand, USA, Paraguay, Australia,
--      Türkiye, Argentina, Ecuador, Sweden, Ivory Coast, Germany,
--      Scotland, Curaçao, Iran, Belgium, Egypt, Jordan, Haiti,
--      Portugal, Colombia, Uzbekistan, Congo DR, France, Norway,
--      Senegal, Iraq, England, Netherlands, Ghana, Tunisia, Brazil,
--      Morocco, Croatia, Saudi Arabia, Uruguay, Austria, Panama,
--      Cape Verde — all follow the same pattern above]
--
-- NOTE TO DEVELOPER: The complete list of all 960 team sticker records
-- with verified player names is available at:
-- https://www.checklistinsider.com/2026-panini-fifa-world-cup-sticker
-- Cross-reference with fandom.com/wiki/2026_FIFA_World_Cup_(Panini)
-- The USA checklist (USA1–USA20) is already confirmed in full from the
-- source data and is included in the repository's complete seed file.
```

**USA Team (confirmed from source, shown as an additional example):**

```sql
-- USA (stickers in Group D section, codes USA1–USA20)
INSERT INTO stickers
  (number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'USA'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  -- Numbers assigned based on album order position in Group D section
  (NULL, 'USA1',  NULL,                 'Team Logo - USA',       NULL,  'badge',      true),
  (NULL, 'USA2',  'Matt Freese',        'Matt Freese',           'GK',  'player',     false),
  (NULL, 'USA3',  'Chris Richards',     'Chris Richards',        'DEF', 'player',     false),
  (NULL, 'USA4',  'Tim Ream',           'Tim Ream',              'DEF', 'player',     false),
  (NULL, 'USA5',  'Mark McKenzie',      'Mark McKenzie',         'DEF', 'player',     false),
  (NULL, 'USA6',  'Alex Freeman',       'Alex Freeman',          'DEF', 'player',     false),
  (NULL, 'USA7',  'Antonee Robinson',   'Antonee Robinson',      'DEF', 'player',     false),
  (NULL, 'USA8',  'Tyler Adams',        'Tyler Adams',           'MID', 'player',     false),
  (NULL, 'USA9',  'Tanner Tessmann',    'Tanner Tessmann',       'MID', 'player',     false),
  (NULL, 'USA10', 'Weston McKennie',    'Weston McKennie',       'MID', 'player',     false),
  (NULL, 'USA11', 'Christian Roldan',   'Christian Roldan',      'MID', 'player',     false),
  (NULL, 'USA12', 'Timothy Weah',       'Timothy Weah',          'MID', 'player',     false),
  (NULL, 'USA13', NULL,                 'Team Photo - USA',      NULL,  'team_photo', false),
  (NULL, 'USA14', 'Diego Luna',         'Diego Luna',            'MID', 'player',     false),
  (NULL, 'USA15', 'Malik Tillman',      'Malik Tillman',         'FWD', 'player',     false),
  (NULL, 'USA16', 'Christian Pulisic',  'Christian Pulisic',     'FWD', 'player',     false),
  (NULL, 'USA17', 'Brenden Aaronson',   'Brenden Aaronson',      'FWD', 'player',     false),
  (NULL, 'USA18', 'Ricardo Pepi',       'Ricardo Pepi',          'FWD', 'player',     false),
  (NULL, 'USA19', 'Haji Wright',        'Haji Wright',           'FWD', 'player',     false),
  (NULL, 'USA20', 'Folarin Balogun',    'Folarin Balogun',       'FWD', 'player',     false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_code) DO UPDATE SET
  player_name = EXCLUDED.player_name,
  position    = EXCLUDED.position;
```

> **Note on `album_page`:** The `album_page` field is **not used** and should be ignored. Page numbers vary depending on the regional edition of the album purchased, making them unreliable as a stable data point. Displaying sticker page numbers is a feature that may be added in a future release once a reliable approach is determined.

> **Important note on sequential numbers:** The exact sequential integer numbers (1–980) for stickers beyond the confirmed checklist entries are derived from album page order. The developer should assign these sequentially when loading the complete data. The `album_code` (e.g., `MEX1`) is the stable identifier; the `number` is just a display convenience. The `album_code` is what the AI scan uses for identification.

## 6. Intro / Back-of-Album Past-Champion Stickers

The 11 past-champion stickers (FWC9–FWC19) live in the back of the album and are part of
the FWC intro series. They are seeded inside `02_intro_stickers.sql` with
`sticker_type = 'intro'` and `is_foil = true`. There is no separate seed file or
sticker-type value for them.

```sql
-- excerpt from scripts/seeds/02_intro_stickers.sql
(970, 'FWC9',  NULL, 'FIFA World Cup Champion — Italy 1934',        'intro', true),
(971, 'FWC10', NULL, 'FIFA World Cup Champion — Uruguay 1950',      'intro', true),
(972, 'FWC11', NULL, 'FIFA World Cup Champion — West Germany 1954', 'intro', true),
-- … FWC12–FWC19 continue the series …
(980, 'FWC19', NULL, 'FIFA World Cup Champion — Argentina 2022',    'intro', true)
```

## 7. Seed File 05: Sticker Variants

This file generates a `sticker_variants` record for every valid variant type. Not every variant applies to every sticker — foil/badge stickers do not have parallels (parallels only apply to non-foil base stickers, consistent with the Panini statement that Crumple parallels apply to non-foil stickers).

```sql
-- scripts/seeds/05_variants.sql
-- Generates variant records for all applicable stickers
-- Parallel variants apply to non-foil stickers only
-- Coca-Cola variant applies to a specific subset (tracked separately)

-- Step 1a: North American Base — white-bordered base sticker (Common, every NA pack).
INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id, 'base_border', 1, 'retail'
FROM stickers
WHERE sticker_type NOT IN ('coca_cola_special', 'extra')
ON CONFLICT (sticker_id, variant_type) DO NOTHING;

-- Step 1b: International Base — borderless base sticker (Common, every international pack).
-- Same photo/name layout as the NA base, but with no outer rim. Coca-Cola stickers
-- reuse the base_borderless variant type and are distinguished by sticker_type.
INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id, 'base_borderless', 1, 'retail'
FROM stickers
WHERE sticker_type NOT IN ('coca_cola_special', 'extra')
ON CONFLICT (sticker_id, variant_type) DO NOTHING;

-- Step 2: Retail parallel variants — non-foil stickers only
INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id, unnest(ARRAY[
  'blue', 'red', 'purple', 'green', 'black'
]), unnest(ARRAY[2, 3, 4, 5, 6]), 'retail'
FROM stickers
WHERE is_foil = false
ON CONFLICT (sticker_id, variant_type) DO NOTHING;

-- Step 3: Amazon exclusive (orange border) — non-foil only
INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id, 'orange_amazon', 7, 'amazon_exclusive'
FROM stickers WHERE is_foil = false
ON CONFLICT (sticker_id, variant_type) DO NOTHING;

-- Step 4: Panini iCollect Crumple variants — non-foil only
-- gold_crumple replaces the base sticker in iCollect online packs (6 per pack)
-- and is the only "gold" finish in the main set — there is no smooth gold border.
INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id, unnest(ARRAY[
  'gold_crumple', 'blue_crumple', 'red_crumple',
  'purple_crumple', 'green_crumple', 'black_crumple'
]), unnest(ARRAY[8, 9, 10, 11, 12, 13]), 'panini_online'
FROM stickers WHERE is_foil = false
ON CONFLICT (sticker_id, variant_type) DO NOTHING;

-- Step 5: Switzerland "United Edition" (light green border) — non-foil only
INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id, 'swiss_green', 19, 'swiss_edition'
FROM stickers WHERE is_foil = false
ON CONFLICT (sticker_id, variant_type) DO NOTHING;

-- Extra stickers (EX1–EX20) and Coca-Cola stickers (CC1–CC12) are entirely separate
-- sticker records seeded by 10_extra_stickers.sql and 08_coca_cola_stickers.sql:
--   • Extras get four background-rarity variants: extra_purple (Base), extra_bronze
--     (Uncommon), extra_silver (Rare), extra_gold (Ultra Rare). Their outer border
--     is always white; rarity is the BACKGROUND colour behind the action shot.
--     Extras have NO Crumple variants.
--   • Coca-Cola stickers get only a single 'base_borderless' variant — every
--     physical Coca-Cola sticker looks identical, with no parallels or Crumples.
```

## 8. Seed File 06: Feature Flags

```sql
-- scripts/seeds/06_feature_flags.sql

INSERT INTO feature_flags (key, enabled, rollout_pct, description)
VALUES
  ('FEATURE_AI_SCANNING',        false, 0,   'AI sticker identification via camera/image upload'),
  ('FEATURE_BATCH_SCANNING',     false, 0,   'Scan multiple stickers from one photo'),
  ('FEATURE_TRADE_MESSAGING',    false, 0,   'In-app messaging within trade requests (SSE-backed)'),
  ('FEATURE_COCA_COLA_STICKERS', true,  100, 'Coca-Cola bottle sticker section in album'),
  ('FEATURE_EXTRA_STICKERS',     true,  100, 'Panini Extra Sticker inserts — 20-player foil set (4 rarities)'),
  ('FEATURE_TRUST_SAFETY',       false, 0,   'Post-trade ratings, user reporting, and moderation system'),
  ('FEATURE_WEB_PUSH',           false, 0,   'Web push notifications for installed PWA'),
  ('MAINTENANCE_MODE',           false, 0,   'Redirect all users to maintenance page')
ON CONFLICT (key) DO NOTHING;
```

## 9. Seed File 07: Test Users (Non-Production Only)

```sql
-- scripts/seeds/07_test_users.sql
-- DEV AND LOCAL ONLY — never runs in production
-- Provides ready-to-use accounts for testing all features

-- Note: In local mode, auth is bypassed. These passwords are
-- irrelevant locally. In dev cloud, Cognito accounts are
-- created separately with these UUIDs mapped.

INSERT INTO users (id, email, username, display_name, role) VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin@test.local',   'admin_user',   'Admin User',    'admin'),
  ('00000000-0000-0000-0000-000000000002', 'alice@test.local',   'alice',        'Alice',         'user'),
  ('00000000-0000-0000-0000-000000000003', 'bob@test.local',     'bob',          'Bob',           'user'),
  ('00000000-0000-0000-0000-000000000004', 'charlie@test.local', 'charlie',      'Charlie',       'user'),
  ('00000000-0000-0000-0000-000000000005', 'diana@test.local',   'diana',        'Diana',         'user'),
  ('00000000-0000-0000-0000-000000000099', 'system@cromo.internal', '_system', 'System', 'admin')
ON CONFLICT (email) DO NOTHING;

INSERT INTO user_settings (user_id) VALUES
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-000000000004'),
  ('00000000-0000-0000-0000-000000000005')
ON CONFLICT (user_id) DO NOTHING;

-- Give Alice a partial collection (useful for UI testing)
INSERT INTO user_stickers (user_id, sticker_variant_id, quantity)
SELECT
  '00000000-0000-0000-0000-000000000002',
  sv.id,
  CASE WHEN ROW_NUMBER() OVER () % 7 = 0 THEN 2 ELSE 1 END  -- every 7th = duplicate
FROM sticker_variants sv
JOIN stickers s ON sv.sticker_id = s.id
WHERE sv.variant_type = 'base'
  AND s.number BETWEEN 1 AND 200   -- Alice has first 200 base stickers
ON CONFLICT (user_id, sticker_variant_id) DO NOTHING;

-- Give Bob a different partial collection (enables trade match testing)
INSERT INTO user_stickers (user_id, sticker_variant_id, quantity)
SELECT
  '00000000-0000-0000-0000-000000000003',
  sv.id,
  CASE WHEN ROW_NUMBER() OVER () % 5 = 0 THEN 2 ELSE 1 END
FROM sticker_variants sv
JOIN stickers s ON sv.sticker_id = s.id
WHERE sv.variant_type = 'base'
  AND s.number BETWEEN 150 AND 400  -- Bob has stickers 150–400 (overlaps with Alice)
ON CONFLICT (user_id, sticker_variant_id) DO NOTHING;
```

The `_system` pseudo-user (UUID `…000099`) is used as the actor for automated moderation actions (overview.md § 25.1, § 33).

## 10. Seed File 09: Trust & Safety Sample Data (Non-Production Only)

```sql
-- scripts/seeds/09_trust_safety.sql
-- DEV AND LOCAL ONLY — never runs in production (see seed-database.sh)
-- Sample data for testing the trust & safety / moderation admin UI
-- Depends on 07_test_users.sql having run first

-- Sample completed and cancelled trades
INSERT INTO trade_requests (id, requester_id, recipient_id, status, accepted_at, completed_at)
VALUES
  ('a0000000-...001', '<alice-id>', '<bob-id>',     'completed', now() - INTERVAL '10 days', now() - INTERVAL '8 days'),
  ('a0000000-...002', '<alice-id>', '<charlie-id>', 'completed', now() - INTERVAL '5 days',  now() - INTERVAL '3 days'),
  ('a0000000-...003', '<bob-id>',   '<charlie-id>', 'cancelled', now() - INTERVAL '7 days',  NULL)
ON CONFLICT (id) DO NOTHING;

-- Trade ratings for the completed trades
INSERT INTO trade_ratings (trade_id, rater_id, rated_user_id, is_positive, comment)
VALUES ...
ON CONFLICT (trade_id, rater_id) DO NOTHING;

-- User reports (one resolved by admin, one still open)
INSERT INTO user_reports (id, reporter_id, reported_user_id, trade_id, category, description, status, ...)
VALUES ...
ON CONFLICT (id) DO NOTHING;

-- Soft ban for Charlie — links to the resolved report
INSERT INTO user_bans (id, user_id, ban_type, reason, report_id, banned_by, expires_at)
VALUES (...)
ON CONFLICT (id) DO NOTHING;
```

This file seeds enough state to exercise every panel of the moderation admin UI: trade history, ratings, open and resolved reports, and an active ban. All records use the hardcoded UUIDs from `07_test_users.sql`.

## 11. Data Maintenance: Handling Panini Corrections

Panini occasionally corrects player names or sticker details after release. In Phase A the
flow is:

1. Update the relevant row in the seed file (e.g. `03_team_stickers.sql`)
2. Re-run `pnpm db:seed` — every seed uses `ON CONFLICT DO UPDATE`, so the correction is
   applied to local/dev without re-running the full schema
3. For urgent fixes in production, use the admin sticker-correction interface
   (`PATCH /api/v1/admin/stickers/:id`), which busts the catalog-version cache key so
   every browser picks up the change on next page load
4. In Phase B (Drizzle migrations), one-off SQL corrections will become numbered migration
   files alongside the regular schema migrations

## 12. How to Verify the Seed Ran Correctly

After running `pnpm db:seed`, verify with these queries in pgAdmin (`localhost:5050`) or any SQL client:

```sql
-- Should return 48
SELECT COUNT(*) FROM teams;

-- Should return 12 distinct groups: A through L
SELECT DISTINCT group_name FROM teams ORDER BY group_name;

-- Should return approximately 980
SELECT COUNT(*) FROM stickers;

-- Should return counts per team (all should be 20)
SELECT t.fifa_code, t.name, COUNT(s.id) AS sticker_count
FROM teams t
LEFT JOIN stickers s ON s.team_id = t.id
GROUP BY t.fifa_code, t.name
ORDER BY t.group_name, t.name;

-- Should return variant counts (non-foil stickers × 14 variants each)
SELECT variant_type, COUNT(*) FROM sticker_variants
GROUP BY variant_type ORDER BY COUNT(*) DESC;

-- Should show 5 test users + the _system pseudo-user (local/dev only)
SELECT username, role FROM users ORDER BY role, username;
```
