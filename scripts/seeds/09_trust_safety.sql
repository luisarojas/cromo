-- scripts/seeds/09_trust_safety.sql
-- DEV AND LOCAL ONLY — never runs in production (see seed-database.sh)
-- Sample data for testing the trust & safety / moderation admin UI
-- Depends on 07_test_users.sql having run first

-- ─────────────────────────────────────────────────────────
-- Sample completed and cancelled trades
-- ─────────────────────────────────────────────────────────
INSERT INTO trade_requests (id, requester_id, recipient_id, status, accepted_at, completed_at)
VALUES
  (
    'a0000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',  -- Alice
    '00000000-0000-0000-0000-000000000003',  -- Bob
    'completed',
    now() - INTERVAL '10 days',
    now() - INTERVAL '8 days'
  ),
  (
    'a0000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002',  -- Alice
    '00000000-0000-0000-0000-000000000004',  -- Charlie
    'completed',
    now() - INTERVAL '5 days',
    now() - INTERVAL '3 days'
  ),
  (
    'a0000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000003',  -- Bob
    '00000000-0000-0000-0000-000000000004',  -- Charlie
    'cancelled',
    now() - INTERVAL '7 days',
    NULL
  )
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────
-- Trade ratings for completed trades
-- ─────────────────────────────────────────────────────────
INSERT INTO trade_ratings (trade_id, rater_id, rated_user_id, is_positive, comment)
VALUES
  -- Alice rates Bob (positive)
  ('a0000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000003',
   true, 'Quick and easy trade, Bob was great!'),

  -- Bob rates Alice (positive)
  ('a0000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000002',
   true, 'Friendly and reliable, would trade again.'),

  -- Alice rates Charlie (negative)
  ('a0000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000004',
   false, 'Agreed to meet but did not show up initially.'),

  -- Charlie rates Alice (positive)
  ('a0000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000004',
   '00000000-0000-0000-0000-000000000002',
   true, 'Trade eventually completed fine.')
ON CONFLICT (trade_id, rater_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────
-- User reports
-- ─────────────────────────────────────────────────────────
INSERT INTO user_reports
  (id, reporter_id, reported_user_id, trade_id, category, description, status,
   resolved_by, resolved_at, resolution_note)
VALUES
  -- Bob reports Charlie (no_show — resolved by admin)
  (
    'b0000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000003',  -- Bob
    '00000000-0000-0000-0000-000000000004',  -- Charlie
    'a0000000-0000-0000-0000-000000000003',  -- cancelled trade
    'no_show',
    'Charlie accepted the trade and then went silent for 5 days. No response to messages.',
    'resolved',
    '00000000-0000-0000-0000-000000000001',  -- admin
    now() - INTERVAL '2 days',
    'Issued a warning. First offence — no further action at this time.'
  ),
  -- Diana reports Charlie (spam — still open)
  (
    'b0000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000005',  -- Diana
    '00000000-0000-0000-0000-000000000004',  -- Charlie
    NULL,
    'spam',
    'Received multiple unsolicited trade requests from this user in quick succession despite declining.',
    'open',
    NULL, NULL, NULL
  )
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────
-- User bans
-- ─────────────────────────────────────────────────────────
INSERT INTO user_bans (id, user_id, ban_type, reason, report_id, banned_by, expires_at)
VALUES
  (
    'c0000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000004',  -- Charlie
    'soft',
    'Two reports within 7 days (no_show, spam). Temporarily restricted from initiating new trades.',
    'b0000000-0000-0000-0000-000000000001',  -- linked to the resolved report
    '00000000-0000-0000-0000-000000000001',  -- banned by admin
    now() + INTERVAL '7 days'
  )
ON CONFLICT (id) DO NOTHING;
