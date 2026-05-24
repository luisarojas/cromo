-- scripts/seeds/05_variants.sql
-- Generates variant records for all applicable stickers
-- Parallel variants apply to non-foil stickers only
-- Coca-Cola stickers are separate records, not variants — see notes below

-- Step 1: Base variant for ALL CORE stickers (foil and non-foil).
-- Coca-Cola stickers get their own base_borderless variant in 08_coca_cola_stickers.sql;
-- Extra stickers get their own extra_* variants in 10_extra_stickers.sql.
INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id, 'base_border', 1, 'retail'
FROM stickers
WHERE sticker_type NOT IN ('coca_cola_special', 'extra')
ON CONFLICT (sticker_id, variant_type) DO NOTHING;

-- Step 2: Retail parallel variants — non-foil CORE stickers only
INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id, unnest(ARRAY[
  'blue', 'red', 'purple', 'green', 'black_1of1'
]), unnest(ARRAY[2, 3, 4, 5, 6]), 'retail'
FROM stickers
WHERE is_foil = false AND sticker_type NOT IN ('coca_cola_special', 'extra')
ON CONFLICT (sticker_id, variant_type) DO NOTHING;

-- Step 3: Amazon exclusive — non-foil CORE only
INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id, 'orange_amazon', 7, 'amazon_exclusive'
FROM stickers WHERE is_foil = false AND sticker_type NOT IN ('coca_cola_special', 'extra')
ON CONFLICT (sticker_id, variant_type) DO NOTHING;

-- Step 4: Panini iCollect crumple variants — non-foil CORE only, online-exclusive
INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id,
       unnest(ARRAY['gold_crumple', 'blue_crumple', 'red_crumple', 'purple_crumple', 'green_crumple', 'black_crumple_1of1']),
       unnest(ARRAY[8, 9, 10, 11, 12, 13]),
       'panini_online'
FROM stickers WHERE is_foil = false AND sticker_type NOT IN ('coca_cola_special', 'extra')
ON CONFLICT (sticker_id, variant_type) DO NOTHING;

-- Step 5: Switzerland United Edition green parallel — non-foil CORE only
INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id, 'swiss_green', 19, 'swiss_edition'
FROM stickers WHERE is_foil = false AND sticker_type NOT IN ('coca_cola_special', 'extra')
ON CONFLICT (sticker_id, variant_type) DO NOTHING;

-- Step 6: Coca-Cola stickers are NOT variants of existing stickers.
-- They are separate sticker records with sticker_type = 'coca_cola_special'.
-- Each gets only a single 'base_borderless' variant (full-bleed action photo, no border).
-- They are seeded separately once the official list is confirmed.
-- See docs/runbooks/update-sticker-database.md for instructions.
