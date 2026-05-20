-- Migration 0026: enforce NOT NULL on user_settings columns that have a
-- DEFAULT and are read as if non-null everywhere. profile_visibility in
-- particular is filter-checked as `!= 'private'`, which treats NULL as visible
-- and so silently leaks profiles that were never seeded properly.

UPDATE user_settings SET profile_visibility       = 'public' WHERE profile_visibility IS NULL;
UPDATE user_settings SET trade_matching_enabled   = TRUE     WHERE trade_matching_enabled IS NULL;
UPDATE user_settings SET email_trade_requests     = TRUE     WHERE email_trade_requests IS NULL;
UPDATE user_settings SET email_trade_messages     = TRUE     WHERE email_trade_messages IS NULL;
UPDATE user_settings SET email_marketing          = FALSE    WHERE email_marketing IS NULL;
UPDATE user_settings SET show_trust_score_public  = TRUE     WHERE show_trust_score_public IS NULL;

ALTER TABLE user_settings
  ALTER COLUMN profile_visibility      SET NOT NULL,
  ALTER COLUMN trade_matching_enabled  SET NOT NULL,
  ALTER COLUMN email_trade_requests    SET NOT NULL,
  ALTER COLUMN email_trade_messages    SET NOT NULL,
  ALTER COLUMN email_marketing         SET NOT NULL,
  ALTER COLUMN show_trust_score_public SET NOT NULL;
