-- Migration 0012: Public trading inventory cleanup
--   1. Promote user_albums.settings.tradeInventoryPublic to a real column so we
--      can index it and query without JSONB extraction.
--   2. Drop the unused user_settings.collection_visibility column (replaced by
--      the per-album visibility flag above).

ALTER TABLE user_albums
  ADD COLUMN IF NOT EXISTS is_trade_inventory_public BOOLEAN NOT NULL DEFAULT false;

-- Backfill from the legacy JSONB key, then strip it.
UPDATE user_albums
SET is_trade_inventory_public = COALESCE((settings->>'tradeInventoryPublic')::boolean, false)
WHERE settings ? 'tradeInventoryPublic';

UPDATE user_albums
SET settings = settings - 'tradeInventoryPublic'
WHERE settings ? 'tradeInventoryPublic';

ALTER TABLE user_albums
  ALTER COLUMN settings SET DEFAULT
    '{"includeAllStickers":true,"includeCocaCola":true,"includeNonAlbumMuseum":true}'::jsonb;

-- Partial index: most albums are private, so only index the public ones.
CREATE INDEX IF NOT EXISTS idx_user_albums_public_trade_inventory
  ON user_albums (user_id)
  WHERE is_trade_inventory_public;

ALTER TABLE user_settings
  DROP CONSTRAINT IF EXISTS user_settings_collection_visibility_check;

ALTER TABLE user_settings
  DROP COLUMN IF EXISTS collection_visibility;
