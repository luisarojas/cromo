-- Migration 0023: extend the user_albums count-sync trigger to fire on INSERT
-- as well as UPDATE. Without this a freshly-created album starts with the
-- default total_count = 0 and stays that way until something else mutates it,
-- which is why services/albums.service.ts:createAlbum currently calls
-- recomputeAlbumStats by hand. With the INSERT trigger in place the DB owns
-- the entire count lifecycle and the app-side helper is removed.

CREATE OR REPLACE FUNCTION _trg_user_albums_sync_counts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM _sync_user_album_counts(NEW.id);
    RETURN NEW;
  END IF;

  IF NEW.settings IS DISTINCT FROM OLD.settings
     OR NEW.album_type_id IS DISTINCT FROM OLD.album_type_id THEN
    PERFORM _sync_user_album_counts(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_albums_sync_counts ON user_albums;
CREATE TRIGGER trg_user_albums_sync_counts
  AFTER INSERT OR UPDATE ON user_albums
  FOR EACH ROW EXECUTE FUNCTION _trg_user_albums_sync_counts();
