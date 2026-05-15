-- Migration 0011: Convert user_albums.settings JSONB keys from snake_case to camelCase
-- so the DB storage matches the canonical API wire format and @stickfolio/shared types.

UPDATE user_albums
SET settings = jsonb_strip_nulls(jsonb_build_object(
  'includeAllStickers',     settings->'include_all_stickers',
  'includeCocaCola',        settings->'include_coca_cola',
  'includeNonAlbumMuseum',  settings->'include_non_album_museum'
))
WHERE settings ? 'include_all_stickers'
   OR settings ? 'include_coca_cola'
   OR settings ? 'include_non_album_museum';

ALTER TABLE user_albums
  ALTER COLUMN settings SET DEFAULT
    '{"includeAllStickers":true,"includeCocaCola":true,"includeNonAlbumMuseum":true}'::jsonb;
