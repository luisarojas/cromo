-- 0028_trust_safety.sql
-- Creates the three Trust & Safety tables: trade_ratings, user_reports, user_bans.

CREATE TABLE IF NOT EXISTS trade_ratings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id       UUID NOT NULL REFERENCES trade_requests(id),
  rater_id       UUID NOT NULL REFERENCES users(id),
  rated_user_id  UUID NOT NULL REFERENCES users(id),
  is_positive    BOOLEAN NOT NULL,
  comment        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT trade_ratings_trade_id_rater_id_unique UNIQUE (trade_id, rater_id),
  CONSTRAINT trade_ratings_comment_check CHECK (char_length(comment) <= 500),
  CONSTRAINT trade_ratings_rater_check CHECK (rater_id <> rated_user_id)
);
CREATE INDEX IF NOT EXISTS idx_trade_ratings_rated_user_id ON trade_ratings(rated_user_id);
CREATE INDEX IF NOT EXISTS idx_trade_ratings_trade_id ON trade_ratings(trade_id);

CREATE TABLE IF NOT EXISTS user_reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      UUID NOT NULL REFERENCES users(id),
  reported_user_id UUID NOT NULL REFERENCES users(id),
  trade_id         UUID REFERENCES trade_requests(id),
  category         TEXT NOT NULL,
  description      TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'open',
  resolved_by      UUID REFERENCES users(id),
  resolved_at      TIMESTAMPTZ,
  resolution_note  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_reports_category_check CHECK (category IN ('harassment','cancelled_after_accept','no_show','fake_stickers','damaged_stickers','spam','underage','other')),
  CONSTRAINT user_reports_status_check CHECK (status IN ('open','under_review','resolved','dismissed')),
  CONSTRAINT user_reports_description_check CHECK (char_length(description) BETWEEN 10 AND 2000),
  CONSTRAINT user_reports_resolution_note_check CHECK (char_length(resolution_note) <= 1000),
  CONSTRAINT user_reports_reporter_check CHECK (reporter_id <> reported_user_id)
);
CREATE INDEX IF NOT EXISTS idx_user_reports_reported_user_id_status ON user_reports(reported_user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_reports_status ON user_reports(status, created_at ASC) WHERE status IN ('open','under_review');
CREATE INDEX IF NOT EXISTS idx_user_reports_reporter_id ON user_reports(reporter_id);

CREATE TABLE IF NOT EXISTS user_bans (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  ban_type    TEXT NOT NULL,
  reason      TEXT NOT NULL,
  report_id   UUID REFERENCES user_reports(id),
  banned_by   UUID NOT NULL REFERENCES users(id),
  expires_at  TIMESTAMPTZ,
  lifted_at   TIMESTAMPTZ,
  lifted_by   UUID REFERENCES users(id),
  lift_reason TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_bans_ban_type_check CHECK (ban_type IN ('soft','hard')),
  CONSTRAINT user_bans_reason_check CHECK (char_length(reason) BETWEEN 5 AND 1000),
  CONSTRAINT user_bans_lift_reason_check CHECK (char_length(lift_reason) <= 500)
);
CREATE INDEX IF NOT EXISTS idx_user_bans_user_id ON user_bans(user_id, created_at DESC);
