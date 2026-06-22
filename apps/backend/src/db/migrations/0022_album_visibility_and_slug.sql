-- Replace the binary is_trade_inventory_public flag with a 3-tier visibility
-- enum (private / unlisted / public). Private = owner-only (default).
-- Unlisted = accessible only via the per-album URL, hidden from profile
-- listings and trade matchmaker. Public = on profile and matchable.
--
-- Also add a stable user-scoped slug so per-album URLs are human-readable
-- (e.g. /profile/luisa/fwc-2026-intl-softcover) instead of opaque UUIDs.
-- Slugs are unique per (user_id, slug); UUIDs remain the API identity.

ALTER TABLE "user_albums"
  ADD COLUMN "trade_inventory_visibility" text NOT NULL DEFAULT 'private';

UPDATE "user_albums"
   SET "trade_inventory_visibility" = CASE WHEN "is_trade_inventory_public" THEN 'public' ELSE 'private' END;

ALTER TABLE "user_albums"
  ADD CONSTRAINT "user_albums_trade_inventory_visibility_check"
  CHECK ("trade_inventory_visibility" IN ('private', 'unlisted', 'public'));

DROP INDEX IF EXISTS "idx_user_albums_public_trade_inventory";
ALTER TABLE "user_albums" DROP COLUMN "is_trade_inventory_public";

CREATE INDEX "idx_user_albums_trade_inventory_visibility"
  ON "user_albums" ("user_id", "trade_inventory_visibility")
  WHERE "trade_inventory_visibility" != 'private';

-- Slug column. Backfilled below from {album_type_key}-{edition_key}-{format_key}
-- with a -N suffix on collision; the NOT NULL constraint is added after the
-- backfill so the migration is replayable on a non-empty database.
ALTER TABLE "user_albums" ADD COLUMN "slug" text;

WITH slug_components AS (
  SELECT ua.id,
         regexp_replace(lower(at.key), '[^a-z0-9]+', '-', 'g') AS type_key,
         regexp_replace(lower(ae.key), '[^a-z0-9]+', '-', 'g') AS edition_key,
         regexp_replace(lower(af.key), '[^a-z0-9]+', '-', 'g') AS format_key,
         ua.user_id,
         ua.created_at
  FROM user_albums ua
  JOIN album_types at    ON at.id = ua.album_type_id
  JOIN album_editions ae ON ae.id = ua.album_edition_id
  JOIN album_formats af  ON af.id = ua.album_format_id
), numbered AS (
  SELECT id,
         user_id,
         CONCAT_WS('-', type_key, edition_key, format_key) AS base,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, type_key, edition_key, format_key
           ORDER BY created_at, id
         ) AS rn
  FROM slug_components
)
UPDATE user_albums ua
   SET slug = CASE
     WHEN n.rn = 1 THEN n.base
     ELSE n.base || '-' || n.rn
   END
  FROM numbered n
 WHERE n.id = ua.id;

ALTER TABLE "user_albums" ALTER COLUMN "slug" SET NOT NULL;

ALTER TABLE "user_albums"
  ADD CONSTRAINT "user_albums_user_id_slug_unique" UNIQUE ("user_id", "slug");

ALTER TABLE "user_albums"
  ADD CONSTRAINT "user_albums_slug_format_check"
  CHECK ("slug" ~ '^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$');
