-- Track when the last rating reminder was sent for each completed trade so
-- the daily cron doesn't re-send the same reminder every 24h until the
-- rating window closes. Without this, an unrated trade triggered up to 13
-- reminders across the 14-day window, which generates complaint signals
-- and erodes SES reputation.

ALTER TABLE "trade_requests" ADD COLUMN "last_reminded_at" timestamp with time zone;
