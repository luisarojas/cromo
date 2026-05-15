-- Migration 0007: Add per-sticker trade visibility flags to user_stickers
-- trade_hidden: owner can suppress a duplicate from appearing in others' trade views
-- trade_forced: owner can make a single copy available for trading anyway

ALTER TABLE user_stickers
  ADD COLUMN IF NOT EXISTS trade_hidden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trade_forced boolean NOT NULL DEFAULT false;
