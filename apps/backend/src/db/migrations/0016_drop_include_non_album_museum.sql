-- Drop the deprecated includeNonAlbumMuseum key from user_albums.settings.
-- Museum stickers (FWC9–FWC19) now have real sticker_album_pages entries in
-- every edition, so they're always included via the standard page check. The
-- toggle showed "(0)" in the UI and gated nothing — removed from the codebase.

UPDATE user_albums
SET settings = settings - 'includeNonAlbumMuseum'
WHERE settings ? 'includeNonAlbumMuseum';

-- Reset the column default to the new shape.
ALTER TABLE user_albums
  ALTER COLUMN settings SET DEFAULT '{"includeAllStickers":true,"includeCocaCola":true}'::jsonb;
