-- scripts/seeds/06_feature_flags.sql
-- Initial feature flag state — all features disabled at launch
-- Enable per-feature via the admin interface or a targeted UPDATE

INSERT INTO feature_flags (key, enabled, rollout_pct, description)
VALUES
  ('FEATURE_AI_SCANNING',        true,  100, 'AI sticker identification via camera/image upload'),
  ('FEATURE_BATCH_SCANNING',     true,  100, 'Scan multiple stickers from one photo'),
  ('FEATURE_TRADE_MESSAGING',    true,  100, 'In-app messaging within trade requests (SSE-backed)'),
  ('FEATURE_PUBLIC_LEADERBOARD', false, 0,   'Public leaderboard of top collectors'),
  ('FEATURE_COCA_COLA_STICKERS', true,  100, 'Coca-Cola bottle sticker section in album'),
  ('FEATURE_EXTRA_STICKERS',     true,  100, 'Panini Extra Sticker inserts — 20-player foil set (4 rarities)'),
  ('FEATURE_TRUST_SAFETY',       true,  100, 'Post-trade ratings, user reporting, and moderation system'),
  ('FEATURE_WEB_PUSH',           false, 0,   'Web push notifications for installed PWA'),
  ('MAINTENANCE_MODE',           false, 0,   'Redirect all users to maintenance page')
ON CONFLICT (key) DO UPDATE SET
  enabled     = EXCLUDED.enabled,
  rollout_pct = EXCLUDED.rollout_pct;
