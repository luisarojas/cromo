-- Rename user_albums.settings key includeAllStickers → includeExtras.
-- The setting only gated the 20 "extra" stickers (EX1–EX20); every other
-- sticker now has proper page data and is always included. The old name was
-- misleading.

UPDATE user_albums
SET settings =
  (settings - 'includeAllStickers')
  || jsonb_build_object('includeExtras', settings->'includeAllStickers')
WHERE settings ? 'includeAllStickers';

ALTER TABLE user_albums
  ALTER COLUMN settings SET DEFAULT '{"includeExtras":true,"includeCocaCola":true}'::jsonb;
