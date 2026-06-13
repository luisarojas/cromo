-- Foil stickers (team logos sticker_type='badge', FWC intro sticker_type='intro')
-- only ship in the white-bordered foil layout. The original seed gave every
-- non-CC/non-Extra sticker both base_border and base_borderless; drop the
-- borderless variant for foil stickers and migrate any references onto the
-- corresponding base_border row.

-- Step 1a: merge owned counts onto base_border (sum on collision).
INSERT INTO user_stickers (album_id, sticker_variant_id, quantity, trade_hidden, trade_forced, created_at, updated_at)
SELECT us.album_id, br.id, us.quantity, us.trade_hidden, us.trade_forced, us.created_at, now()
FROM user_stickers us
JOIN sticker_variants bl ON bl.id = us.sticker_variant_id
JOIN stickers s         ON s.id  = bl.sticker_id
JOIN sticker_variants br ON br.sticker_id = bl.sticker_id AND br.variant_type = 'base_border'
WHERE bl.variant_type = 'base_borderless'
  AND s.is_foil = true
ON CONFLICT (album_id, sticker_variant_id) DO UPDATE
  SET quantity     = user_stickers.quantity + EXCLUDED.quantity,
      trade_hidden = user_stickers.trade_hidden OR EXCLUDED.trade_hidden,
      trade_forced = user_stickers.trade_forced OR EXCLUDED.trade_forced,
      updated_at   = now();

-- Step 1b: drop the now-migrated borderless rows.
DELETE FROM user_stickers
WHERE sticker_variant_id IN (
  SELECT bl.id
  FROM sticker_variants bl
  JOIN stickers s ON s.id = bl.sticker_id
  WHERE bl.variant_type = 'base_borderless' AND s.is_foil = true
);

-- Step 2a: migrate wanted records onto base_border.
INSERT INTO user_wanted_variants (user_id, sticker_variant_id, album_id, created_at)
SELECT uwv.user_id, br.id, uwv.album_id, uwv.created_at
FROM user_wanted_variants uwv
JOIN sticker_variants bl ON bl.id = uwv.sticker_variant_id
JOIN stickers s         ON s.id  = bl.sticker_id
JOIN sticker_variants br ON br.sticker_id = bl.sticker_id AND br.variant_type = 'base_border'
WHERE bl.variant_type = 'base_borderless'
  AND s.is_foil = true
ON CONFLICT (user_id, sticker_variant_id, album_id) DO NOTHING;

-- Step 2b: drop the borderless wanted rows.
DELETE FROM user_wanted_variants
WHERE sticker_variant_id IN (
  SELECT bl.id
  FROM sticker_variants bl
  JOIN stickers s ON s.id = bl.sticker_id
  WHERE bl.variant_type = 'base_borderless' AND s.is_foil = true
);

-- Step 3: trade_items references — in-progress trades. Per project policy
-- (No Backward Compatibility Required) drop any line item that pointed at a
-- soon-deleted variant; the host trade row stays intact.
DELETE FROM trade_items
WHERE sticker_variant_id IN (
  SELECT bl.id
  FROM sticker_variants bl
  JOIN stickers s ON s.id = bl.sticker_id
  WHERE bl.variant_type = 'base_borderless' AND s.is_foil = true
);

-- Step 4: drop the foil base_borderless variants themselves.
DELETE FROM sticker_variants
WHERE variant_type = 'base_borderless'
  AND sticker_id IN (SELECT id FROM stickers WHERE is_foil = true);
