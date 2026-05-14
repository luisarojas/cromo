-- Migration: 0001_initial
-- Description: Initial schema for Stickfolio

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  locale TEXT NOT NULL DEFAULT 'en',
  email_verified_at TIMESTAMPTZ,
  hashed_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  collection_visibility TEXT DEFAULT 'private'
    CHECK (collection_visibility IN ('private', 'friends', 'public')),
  profile_visibility TEXT DEFAULT 'public'
    CHECK (profile_visibility IN ('private', 'public')),
  trade_matching_enabled BOOLEAN DEFAULT true,
  email_trade_requests BOOLEAN DEFAULT true,
  email_trade_messages BOOLEAN DEFAULT true,
  email_marketing BOOLEAN DEFAULT false,
  marketing_consent_at TIMESTAMPTZ,
  marketing_consent_version TEXT,
  show_trust_score_public BOOLEAN DEFAULT true,
  duplicates_count_all_variants BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  consent_type TEXT NOT NULL,
  granted BOOLEAN NOT NULL,
  policy_version TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consent_records_user_id ON consent_records(user_id);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(32), 'hex'),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '24 hours',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id ON email_verification_tokens(user_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(32), 'hex'),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '1 hour',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);

-- ─── Album catalog ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS album_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS album_editions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_type_id UUID NOT NULL REFERENCES album_types(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_album_editions_album_type_key ON album_editions(album_type_id, key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_album_editions_id_album_type_id ON album_editions(id, album_type_id);
CREATE INDEX IF NOT EXISTS idx_album_editions_album_type_id ON album_editions(album_type_id);

CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fifa_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  group_name TEXT NOT NULL,
  flag_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_type_id UUID NOT NULL REFERENCES album_types(id),
  number INT NOT NULL CHECK (number BETWEEN 0 AND 9999),
  album_code TEXT NOT NULL,
  team_id UUID REFERENCES teams(id),
  player_name TEXT,
  position TEXT,
  sticker_type TEXT NOT NULL,
  is_foil BOOLEAN NOT NULL DEFAULT false,
  album_page INT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (album_type_id, number),
  UNIQUE (album_type_id, album_code)
);

CREATE INDEX IF NOT EXISTS idx_stickers_album_type_id ON stickers(album_type_id);
CREATE INDEX IF NOT EXISTS idx_stickers_team_id ON stickers(team_id);

CREATE TABLE IF NOT EXISTS sticker_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sticker_id UUID NOT NULL REFERENCES stickers(id),
  variant_type TEXT NOT NULL,
  rarity_rank INT NOT NULL,
  availability TEXT NOT NULL,
  UNIQUE (sticker_id, variant_type)
);

CREATE TABLE IF NOT EXISTS user_albums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  album_type_id UUID NOT NULL REFERENCES album_types(id),
  album_edition_id UUID NOT NULL,
  alias TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_albums_alias_length CHECK (alias IS NULL OR (char_length(alias) BETWEEN 1 AND 100)),
  -- Composite FK ensures the chosen edition belongs to the chosen album type.
  CONSTRAINT user_albums_edition_matches_type
    FOREIGN KEY (album_edition_id, album_type_id)
    REFERENCES album_editions(id, album_type_id)
);

CREATE INDEX IF NOT EXISTS idx_user_albums_user_id ON user_albums(user_id);
CREATE INDEX IF NOT EXISTS idx_user_albums_album_type_id ON user_albums(album_type_id);
CREATE INDEX IF NOT EXISTS idx_user_albums_album_edition_id ON user_albums(album_edition_id);

-- Enforces at most one default album per user
CREATE UNIQUE INDEX idx_user_albums_single_default
  ON user_albums(user_id) WHERE is_default = true;

CREATE TABLE IF NOT EXISTS user_stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id UUID NOT NULL REFERENCES user_albums(id) ON DELETE CASCADE,
  sticker_variant_id UUID NOT NULL REFERENCES sticker_variants(id),
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (album_id, sticker_variant_id)
);

CREATE INDEX IF NOT EXISTS idx_user_stickers_duplicates ON user_stickers(album_id) WHERE quantity > 1;
CREATE INDEX IF NOT EXISTS idx_user_stickers_sticker_variant_id ON user_stickers(sticker_variant_id);

CREATE TABLE IF NOT EXISTS trade_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES users(id),
  recipient_id UUID NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled','completed','expired')),
  counter_count INT NOT NULL DEFAULT 0 CHECK (counter_count BETWEEN 0 AND 5),
  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trade_requests_requester_id ON trade_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_trade_requests_recipient_id ON trade_requests(recipient_id);

CREATE TABLE IF NOT EXISTS trade_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES trade_requests(id),
  sticker_variant_id UUID NOT NULL REFERENCES sticker_variants(id),
  direction TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_trade_items_trade_id ON trade_items(trade_id);

CREATE TABLE IF NOT EXISTS trade_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES trade_requests(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trade_messages_trade_id ON trade_messages(trade_id, sent_at);

CREATE TABLE IF NOT EXISTS public_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  list_type TEXT NOT NULL,
  share_token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_public_lists_user_id ON public_lists(user_id);

CREATE TABLE IF NOT EXISTS feature_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  rollout_pct INT NOT NULL DEFAULT 0 CHECK (rollout_pct BETWEEN 0 AND 100),
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);

CREATE TABLE IF NOT EXISTS trade_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES trade_requests(id),
  rater_id UUID NOT NULL REFERENCES users(id),
  rated_user_id UUID NOT NULL REFERENCES users(id),
  is_positive BOOLEAN NOT NULL,
  comment TEXT CHECK (char_length(comment) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trade_id, rater_id),
  CHECK (rater_id <> rated_user_id)
);

CREATE INDEX IF NOT EXISTS idx_trade_ratings_trade_id ON trade_ratings(trade_id);
CREATE INDEX IF NOT EXISTS idx_trade_ratings_rater_id ON trade_ratings(rater_id);
CREATE INDEX IF NOT EXISTS idx_trade_ratings_rated_user_id ON trade_ratings(rated_user_id);

CREATE TABLE IF NOT EXISTS user_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES users(id),
  reported_user_id UUID NOT NULL REFERENCES users(id),
  trade_id UUID REFERENCES trade_requests(id),
  category TEXT NOT NULL CHECK (category IN ('harassment','cancelled_after_accept','no_show','fake_stickers','damaged_stickers','spam','underage','other')),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','under_review','resolved','dismissed')),
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT CHECK (char_length(resolution_note) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (reporter_id <> reported_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_reports_reporter_id ON user_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_reported_user_id ON user_reports(reported_user_id);

CREATE TABLE IF NOT EXISTS user_bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  ban_type TEXT NOT NULL CHECK (ban_type IN ('soft','hard')),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 5 AND 1000),
  report_id UUID REFERENCES user_reports(id),
  banned_by UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ,
  lifted_at TIMESTAMPTZ,
  lifted_by UUID REFERENCES users(id),
  lift_reason TEXT CHECK (char_length(lift_reason) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_bans_user_id ON user_bans(user_id);

-- ─── Seed: album catalog ──────────────────────────────────────────────────────

INSERT INTO album_types (key, name) VALUES
  ('fifa_world_cup_2026', 'FIFA World Cup 2026')
ON CONFLICT (key) DO NOTHING;

INSERT INTO album_editions (album_type_id, key, name)
SELECT t.id, e.key, e.name
FROM album_types t
CROSS JOIN (VALUES
  ('north_america', 'North America'),
  ('international', 'International'),
  ('swiss_gold', 'Swiss Gold'),
  ('south_america', 'South America')
) AS e(key, name)
WHERE t.key = 'fifa_world_cup_2026'
ON CONFLICT (album_type_id, key) DO NOTHING;
