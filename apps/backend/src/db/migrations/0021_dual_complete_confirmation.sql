ALTER TABLE trade_requests
  ADD COLUMN requester_completed_at TIMESTAMPTZ,
  ADD COLUMN recipient_completed_at TIMESTAMPTZ;
