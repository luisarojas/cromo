-- Migration 0006: Add cash offer columns to trade_requests
-- Allows users to include a cash component (in cents) as part of a trade proposal.

ALTER TABLE trade_requests
  ADD COLUMN IF NOT EXISTS offer_cash INTEGER NOT NULL DEFAULT 0
    CHECK (offer_cash >= 0),
  ADD COLUMN IF NOT EXISTS want_cash INTEGER NOT NULL DEFAULT 0
    CHECK (want_cash >= 0);
