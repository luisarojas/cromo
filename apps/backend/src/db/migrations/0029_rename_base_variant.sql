-- Rename the 'base' variant type to 'base_border' to distinguish it from
-- the borderless base variant. Both are valid base variants going forward.
UPDATE sticker_variants
SET variant_type = 'base_border'
WHERE variant_type = 'base';
