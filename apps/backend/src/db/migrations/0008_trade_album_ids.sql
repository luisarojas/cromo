-- Migration 0008: Add per-album columns to trade_requests for album-aware trading
ALTER TABLE trade_requests
  ADD COLUMN IF NOT EXISTS requester_album_id uuid REFERENCES user_albums(id),
  ADD COLUMN IF NOT EXISTS recipient_album_id uuid REFERENCES user_albums(id);
