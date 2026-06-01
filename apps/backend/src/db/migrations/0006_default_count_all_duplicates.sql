-- Flip the duplicates_count_all_variants preference default to true so new
-- users see the "any extra copy is a duplicate" rule out of the box. Existing
-- rows are migrated to true as well (in active-dev mode we don't preserve the
-- old default for already-provisioned accounts), and every album's denormalised
-- duplicate_count is recomputed so it matches the new effective rule.

ALTER TABLE "user_settings"
  ALTER COLUMN "duplicates_count_all_variants" SET DEFAULT true;
--> statement-breakpoint

UPDATE "user_settings"
   SET duplicates_count_all_variants = true
 WHERE duplicates_count_all_variants = false;
--> statement-breakpoint

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN SELECT id FROM user_albums LOOP
    PERFORM _sync_user_album_counts(rec.id);
  END LOOP;
END;
$$;
