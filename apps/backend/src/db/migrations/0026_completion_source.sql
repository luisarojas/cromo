-- live_trade_completions is shared by two flows: in-person Live Room sessions
-- and off-platform "third-party" trades a user logs after the fact. Until now
-- the rows were indistinguishable, so My Trades mislabelled every third-party
-- trade with a "Live" badge. Add an explicit discriminator.
--
-- Existing rows predate the third-party logging feature landing on this column,
-- so 'live' is the correct backfill default. New third-party completions write
-- 'third_party' explicitly (see recordThirdPartyCompletion).

ALTER TABLE "live_trade_completions"
  ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'live';

-- Retroactively re-label the completions that were actually third-party trades.
-- recordThirdPartyCompletion wrote a `third_party_trade_completed` audit row
-- carrying the completionId, so past rows can be identified precisely rather
-- than left mislabelled as "Live" in My Trades.
UPDATE "live_trade_completions" c
   SET "source" = 'third_party'
  FROM "audit_log" a
 WHERE a."action" = 'third_party_trade_completed'
   AND (a."metadata" ->> 'completionId')::uuid = c."id";
