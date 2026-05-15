-- Migration 0010: Backfill NULL requester_album_id / recipient_album_id with each user's
-- default album, then make the columns NOT NULL. completeTrade no longer falls back to
-- a default-album lookup; album IDs are pinned at trade creation.

UPDATE trade_requests tr
SET requester_album_id = (
  SELECT id FROM user_albums
  WHERE user_id = tr.requester_id AND is_default = true
  LIMIT 1
)
WHERE tr.requester_album_id IS NULL;

UPDATE trade_requests tr
SET recipient_album_id = (
  SELECT id FROM user_albums
  WHERE user_id = tr.recipient_id AND is_default = true
  LIMIT 1
)
WHERE tr.recipient_album_id IS NULL;

ALTER TABLE trade_requests
  ALTER COLUMN requester_album_id SET NOT NULL,
  ALTER COLUMN recipient_album_id SET NOT NULL;
