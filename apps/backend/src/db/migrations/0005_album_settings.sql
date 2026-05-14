-- Migration 0005: Add settings column to user_albums
-- Stores per-album display preferences for album-type-specific sticker visibility.

ALTER TABLE user_albums
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL
  DEFAULT '{"include_all_stickers":true,"include_coca_cola":true,"include_non_album_museum":true}'::jsonb;
