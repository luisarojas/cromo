-- scripts/seeds/05_variants.sql
-- Generates variant records for all applicable stickers
-- Parallel variants apply to non-foil stickers only
-- Coca-Cola stickers are separate records, not variants — see notes below

-- Step 1: Base variant for ALL stickers (foil and non-foil)
INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id, 'base', 1, 'retail'
FROM stickers
ON CONFLICT (sticker_id, variant_type) DO NOTHING;

-- Step 2: Retail parallel variants — non-foil stickers only
INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id, unnest(ARRAY[
  'blue', 'red', 'purple', 'green', 'black_1of1'
]), unnest(ARRAY[2, 3, 4, 5, 6]), 'retail'
FROM stickers
WHERE is_foil = false
ON CONFLICT (sticker_id, variant_type) DO NOTHING;

-- Step 3: Amazon exclusive — non-foil only
INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id, 'orange_amazon', 7, 'amazon_exclusive'
FROM stickers WHERE is_foil = false
ON CONFLICT (sticker_id, variant_type) DO NOTHING;

-- Step 4: Panini iCollect Gold Flood Crumple — non-foil only
INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id, 'gold_crumple', 8, 'panini_online'
FROM stickers WHERE is_foil = false
ON CONFLICT (sticker_id, variant_type) DO NOTHING;

-- Step 5: Coca-Cola stickers are NOT variants of existing stickers.
-- They are separate sticker records with sticker_type = 'coca_cola_special'.
-- Each gets only a single 'base' variant (no parallels).
-- They are seeded separately once the official list is confirmed.
-- See docs/runbooks/update-sticker-database.md for instructions.
