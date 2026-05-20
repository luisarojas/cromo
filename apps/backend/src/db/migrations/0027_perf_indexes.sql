-- Migration 0027: indexes for hot trade and catalog paths.
--
-- 1. sticker_variants(sticker_id) — every collection/trade/matching query joins
--    sticker_variants → stickers on sticker_id. The FK on this column does not
--    auto-create an index in Postgres, so all those joins fall back to seq
--    scans as the variant set grows.
--
-- 2. trade_requests by participant + status — the list-trades query filters by
--    `(requester_id = $1 OR recipient_id = $1) AND status = ?` and orders by
--    updated_at DESC. Two single-side composites let the planner BitmapOr the
--    two halves while still being able to seek on the sort.

CREATE INDEX IF NOT EXISTS idx_sticker_variants_sticker_id
  ON sticker_variants(sticker_id);

CREATE INDEX IF NOT EXISTS idx_trade_requests_requester_status_updated
  ON trade_requests(requester_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_trade_requests_recipient_status_updated
  ON trade_requests(recipient_id, status, updated_at DESC);
