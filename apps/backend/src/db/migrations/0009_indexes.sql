-- Migration 0009: Add missing indexes for query patterns that will dominate at scale.

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id_occurred_at
  ON audit_log (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_trade_ratings_rated_user_id
  ON trade_ratings (rated_user_id);

CREATE INDEX IF NOT EXISTS idx_user_reports_reported_user_id_status
  ON user_reports (reported_user_id, status);

CREATE INDEX IF NOT EXISTS idx_consent_records_user_id_type
  ON consent_records (user_id, consent_type);
