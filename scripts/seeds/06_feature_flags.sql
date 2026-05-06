-- scripts/seeds/06_feature_flags.sql
-- Initial feature flag state — all features disabled at launch
-- Enable per-feature via the admin interface or a targeted UPDATE

INSERT INTO feature_flags (key, enabled, rollout_pct, description)
VALUES
  ('FEATURE_AI_SCANNING',        false, 0, 'AI sticker identification via camera/image upload'),
  ('FEATURE_BATCH_SCANNING',     false, 0, 'Scan multiple stickers from one photo'),
  ('FEATURE_TRADE_MESSAGING',    false, 0, 'In-app messaging within trade requests (SSE-backed)'),
  ('FEATURE_PUBLIC_LEADERBOARD', false, 0, 'Public leaderboard of top collectors'),
  ('FEATURE_COCA_COLA_STICKERS', false, 0, 'Coca-Cola bottle sticker section in album'),
  ('FEATURE_TRUST_SAFETY',       false, 0, 'Post-trade ratings, user reporting, and moderation system'),
  ('FEATURE_WEB_PUSH',           false, 0, 'Web push notifications for installed PWA'),
  ('MAINTENANCE_MODE',           false, 0, 'Redirect all users to maintenance page')
ON CONFLICT (key) DO NOTHING;
