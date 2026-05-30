ALTER TABLE "trade_requests" ADD COLUMN "rating_eligible_at" timestamp with time zone;--> statement-breakpoint
UPDATE "trade_requests"
   SET "rating_eligible_at" = COALESCE("accepted_at", "completed_at", CASE WHEN "counter_count" >= 2 THEN "updated_at" END)
 WHERE "rating_eligible_at" IS NULL
   AND ("accepted_at" IS NOT NULL OR "completed_at" IS NOT NULL OR "counter_count" >= 2);--> statement-breakpoint
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_rollout_pct_check" CHECK ("feature_flags"."rollout_pct" BETWEEN 0 AND 100);--> statement-breakpoint
ALTER TABLE "stickers" ADD CONSTRAINT "stickers_number_check" CHECK ("stickers"."number" BETWEEN 0 AND 9999);--> statement-breakpoint
ALTER TABLE "trade_items" ADD CONSTRAINT "trade_items_quantity_check" CHECK ("trade_items"."quantity" > 0);--> statement-breakpoint
ALTER TABLE "trade_messages" ADD CONSTRAINT "trade_messages_body_check" CHECK (char_length("trade_messages"."body") BETWEEN 1 AND 2000);--> statement-breakpoint
ALTER TABLE "trade_ratings" ADD CONSTRAINT "trade_ratings_comment_check" CHECK (char_length("trade_ratings"."comment") <= 500);--> statement-breakpoint
ALTER TABLE "trade_ratings" ADD CONSTRAINT "trade_ratings_rater_check" CHECK ("trade_ratings"."rater_id" <> "trade_ratings"."rated_user_id");--> statement-breakpoint
ALTER TABLE "trade_requests" ADD CONSTRAINT "trade_requests_status_check" CHECK ("trade_requests"."status" IN ('pending','accepted','declined','cancelled','completed','expired'));--> statement-breakpoint
ALTER TABLE "trade_requests" ADD CONSTRAINT "trade_requests_counter_count_check" CHECK ("trade_requests"."counter_count" BETWEEN 0 AND 5);--> statement-breakpoint
ALTER TABLE "trade_requests" ADD CONSTRAINT "trade_requests_offer_cash_check" CHECK ("trade_requests"."offer_cash" >= 0);--> statement-breakpoint
ALTER TABLE "trade_requests" ADD CONSTRAINT "trade_requests_want_cash_check" CHECK ("trade_requests"."want_cash" >= 0);--> statement-breakpoint
ALTER TABLE "user_albums" ADD CONSTRAINT "user_albums_alias_length" CHECK ("user_albums"."alias" IS NULL OR (char_length("user_albums"."alias") BETWEEN 1 AND 100));--> statement-breakpoint
ALTER TABLE "user_albums" ADD CONSTRAINT "user_albums_notes_length" CHECK ("user_albums"."notes" IS NULL OR char_length("user_albums"."notes") <= 500);--> statement-breakpoint
ALTER TABLE "user_bans" ADD CONSTRAINT "user_bans_ban_type_check" CHECK ("user_bans"."ban_type" IN ('soft','hard'));--> statement-breakpoint
ALTER TABLE "user_bans" ADD CONSTRAINT "user_bans_reason_check" CHECK (char_length("user_bans"."reason") BETWEEN 5 AND 1000);--> statement-breakpoint
ALTER TABLE "user_bans" ADD CONSTRAINT "user_bans_lift_reason_check" CHECK (char_length("user_bans"."lift_reason") <= 500);--> statement-breakpoint
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_category_check" CHECK ("user_reports"."category" IN ('harassment','cancelled_after_accept','no_show','fake_stickers','damaged_stickers','spam','underage','other'));--> statement-breakpoint
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_status_check" CHECK ("user_reports"."status" IN ('open','under_review','resolved','dismissed'));--> statement-breakpoint
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_description_check" CHECK (char_length("user_reports"."description") BETWEEN 10 AND 2000);--> statement-breakpoint
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_resolution_note_check" CHECK (char_length("user_reports"."resolution_note") <= 1000);--> statement-breakpoint
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reporter_check" CHECK ("user_reports"."reporter_id" <> "user_reports"."reported_user_id");--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_profile_visibility_check" CHECK ("user_settings"."profile_visibility" IN ('private', 'public'));--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_default_base_variant_check" CHECK ("user_settings"."default_base_variant" IN ('base_border', 'base_borderless'));--> statement-breakpoint
ALTER TABLE "user_stickers" ADD CONSTRAINT "user_stickers_quantity_check" CHECK ("user_stickers"."quantity" >= 0);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("users"."role" IN ('user', 'admin'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_length" CHECK (char_length("users"."username") BETWEEN 3 AND 30);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_display_name_length" CHECK ("users"."display_name" IS NULL OR char_length("users"."display_name") BETWEEN 1 AND 100);