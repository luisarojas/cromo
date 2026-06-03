-- Auto-bump stickers.updated_at on every row update so the catalog version
-- (MAX(updated_at) FROM stickers) reflects edits made by seeds, scripts, or
-- any future write path — not just the admin PATCH route, which was the only
-- caller previously setting it explicitly. Without this, reseeded player
-- names left the catalog version unchanged and clients kept serving the
-- per-version HTTP-cached /api/v1/stickers responses with stale data.

CREATE OR REPLACE FUNCTION _trg_stickers_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS trg_stickers_set_updated_at ON stickers;
--> statement-breakpoint
CREATE TRIGGER trg_stickers_set_updated_at
  BEFORE UPDATE ON stickers
  FOR EACH ROW EXECUTE FUNCTION _trg_stickers_set_updated_at();
--> statement-breakpoint

-- One-time backfill so the catalog version bumps immediately on deploy and
-- already-cached client URLs become misses. Without this, browsers that have
-- the pre-fix version pinned in HTTP cache would keep serving the stale rows
-- until something else triggered an UPDATE.
UPDATE stickers SET updated_at = NOW();
