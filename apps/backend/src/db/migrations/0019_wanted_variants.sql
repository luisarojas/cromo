CREATE TABLE IF NOT EXISTS user_wanted_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sticker_variant_id UUID NOT NULL REFERENCES sticker_variants(id),
  album_id UUID NOT NULL REFERENCES user_albums(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, sticker_variant_id, album_id)
);

CREATE INDEX IF NOT EXISTS idx_user_wanted_variants_user_album
  ON user_wanted_variants(user_id, album_id);
