-- Migration 0025: cover trade_items foreign keys.
--
-- PostgreSQL does NOT auto-create indexes for foreign keys. Trade detail
-- queries (`SELECT ... FROM trade_items WHERE trade_id = $1`) and the
-- "is this variant offered in any accepted/pending trade?" guards both
-- hit this table by FK alone, so without these indexes they fall back
-- to sequential scans.

CREATE INDEX IF NOT EXISTS idx_trade_items_trade_id
  ON trade_items(trade_id);

CREATE INDEX IF NOT EXISTS idx_trade_items_sticker_variant_id
  ON trade_items(sticker_variant_id);
