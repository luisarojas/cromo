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
  ('FEATURE_TRUST_SAFETY',       false, 0,   'Post-trade ratings, user reporting, and moderation system'),
  ('FEATURE_WEB_PUSH',           false, 0,   'Web push notifications for installed PWA'),
  ('MAINTENANCE_MODE',           false, 0,   'Redirect all users to maintenance page'),
  -- Scheduled-job kill switches. Each row gates a §34 cron job; flip to false
  -- to pause without redeploying. See docs/runbooks/scheduled-jobs.md.
  ('JOB_EXPIRE_PENDING_TRADES',     true, 100, 'Daily: marks 30-day-stale pending trades as expired'),
  ('JOB_EXPIRE_ACCEPTED_TRADES',    true, 100, 'Daily: marks accepted trades past expires_at as expired'),
  ('JOB_PURGE_TRADE_MESSAGES',      true, 100, 'Weekly: deletes trade_messages 90 days after trade closed'),
  ('JOB_REDACT_OLD_REPORTS',        true, 100, 'Weekly: redacts user_reports.description after 2 years'),
  ('JOB_AUTO_FLAG_SWEEP',           true, 100, 'Hourly: re-evaluates 3-reports-in-30-days auto soft-ban threshold'),
  ('JOB_RATING_REMINDER_EMAIL',     true, 100, 'Daily: queues a reminder 24h after a completed unrated trade'),
  ('JOB_TRUNCATE_AUDIT_LOG_IPS',    true, 100, 'Daily: truncates audit_log IPs older than 90 days (/24 v4, /48 v6)'),
  ('JOB_HARD_DELETE_USERS',         true, 100, 'Daily: hard-deletes users 14 days after deleted_at'),
  ('JOB_PURGE_VERIFICATION_TOKENS', true, 100, 'Daily: deletes email_verification_tokens 7 days past expiry'),
  ('JOB_PURGE_SHARE_TOKENS',        true, 100, 'Daily: deletes expired public_lists rows'),
  ('JOB_PURGE_PUSH_SUBSCRIPTIONS',  true, 100, 'Daily: deletes push_subscriptions not seen for 90 days'),
  ('JOB_CACHE_WARM_STICKERS',       true, 100, 'Every 50 min: repopulates stickers:all before the 1h TTL'),
  ('JOB_DMARC_REPORT_AGG',          false, 0,  'Cloud-only weekly: aggregates DMARC reports from SES inbox'),
  ('JOB_SYNTHETIC_CANARY',          false, 0,  'Cloud-only every 4 min: pings DB + Redis to verify connectivity')
ON CONFLICT (key) DO UPDATE SET
  enabled     = EXCLUDED.enabled,
  rollout_pct = EXCLUDED.rollout_pct;
