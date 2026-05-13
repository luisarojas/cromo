-- Migration: 0002_user_preferences
-- Adds synced per-user album preferences to user_settings

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS album_edition TEXT NOT NULL DEFAULT 'north_america'
    CHECK (album_edition IN ('north_america', 'international', 'swiss_gold', 'south_america')),
  ADD COLUMN IF NOT EXISTS duplicates_count_all_variants BOOLEAN NOT NULL DEFAULT false;
