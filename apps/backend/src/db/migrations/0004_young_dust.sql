-- Move "default base variant" from user_settings to user_albums.settings JSONB.
-- The preference is naturally per-album (a user can collect NA and Intl albums
-- side by side with different defaults), so the global setting goes away.

-- 1. Drop the CHECK that pinned the column to two enum values.
ALTER TABLE "user_settings" DROP CONSTRAINT "user_settings_default_base_variant_check";--> statement-breakpoint

-- 2. New default for fresh albums includes the field. Existing rows handled below.
ALTER TABLE "user_albums" ALTER COLUMN "settings" SET DEFAULT '{"includeExtras":true,"includeCocaCola":true,"defaultBaseVariant":"base_borderless"}'::jsonb;--> statement-breakpoint

-- 3. Backfill existing albums with the owner's previous user_settings value, so
--    the migration is invisible to users who already picked one.
UPDATE "user_albums" ua
SET settings = ua.settings || jsonb_build_object('defaultBaseVariant', us.default_base_variant)
FROM "user_settings" us
WHERE ua.user_id = us.user_id
  AND NOT (ua.settings ? 'defaultBaseVariant');--> statement-breakpoint

-- 4. Belt-and-braces: any albums whose owner has no user_settings row (shouldn't
--    happen — user_settings is created on signup — but the join in step 3 would
--    skip them) fall back to the global default.
UPDATE "user_albums"
SET settings = settings || '{"defaultBaseVariant":"base_borderless"}'::jsonb
WHERE NOT (settings ? 'defaultBaseVariant');--> statement-breakpoint

-- 5. Drop the now-unused column.
ALTER TABLE "user_settings" DROP COLUMN "default_base_variant";
