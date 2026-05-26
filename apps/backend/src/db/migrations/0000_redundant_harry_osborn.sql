CREATE TABLE IF NOT EXISTS "album_edition_formats" (
	"album_type_id" uuid NOT NULL,
	"album_edition_id" uuid NOT NULL,
	"album_format_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "album_edition_formats_album_edition_id_album_format_id_pk" PRIMARY KEY("album_edition_id","album_format_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "album_editions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"album_type_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "album_editions_album_type_id_key_unique" UNIQUE("album_type_id","key"),
	CONSTRAINT "album_editions_id_album_type_id_unique" UNIQUE("id","album_type_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "album_formats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"album_type_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "album_formats_album_type_id_key_unique" UNIQUE("album_type_id","key"),
	CONSTRAINT "album_formats_id_album_type_id_unique" UNIQUE("id","album_type_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "album_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"guide_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "album_types_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"ip_address" "inet",
	"user_agent" text,
	"metadata" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"consent_type" text NOT NULL,
	"granted" boolean NOT NULL,
	"policy_version" text NOT NULL,
	"ip_address" "inet",
	"user_agent" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_verification_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + INTERVAL '24 hours' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"rollout_pct" integer DEFAULT 0 NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + INTERVAL '1 hour' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "public_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"list_type" text NOT NULL,
	"share_token" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_lists_share_token_unique" UNIQUE("share_token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sticker_album_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sticker_id" uuid NOT NULL,
	"edition" text NOT NULL,
	"page_start" integer,
	"page_end" integer,
	"description" text,
	CONSTRAINT "sticker_album_pages_sticker_id_edition_unique" UNIQUE("sticker_id","edition")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sticker_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sticker_id" uuid NOT NULL,
	"variant_type" text NOT NULL,
	"rarity_rank" integer NOT NULL,
	"availability" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stickers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"album_type_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"album_code" text NOT NULL,
	"team_id" uuid,
	"player_name" text,
	"position" text,
	"sticker_type" text NOT NULL,
	"is_foil" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stickers_album_type_id_number_unique" UNIQUE("album_type_id","number"),
	CONSTRAINT "stickers_album_type_id_album_code_unique" UNIQUE("album_type_id","album_code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_album_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"edition" text NOT NULL,
	"page_start" integer NOT NULL,
	"page_end" integer NOT NULL,
	CONSTRAINT "team_album_pages_team_id_edition_unique" UNIQUE("team_id","edition")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fifa_code" text NOT NULL,
	"name" text NOT NULL,
	"group_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_fifa_code_unique" UNIQUE("fifa_code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trade_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade_id" uuid NOT NULL,
	"sticker_variant_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trade_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"body" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trade_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade_id" uuid NOT NULL,
	"rater_id" uuid NOT NULL,
	"rated_user_id" uuid NOT NULL,
	"is_positive" boolean NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trade_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"requester_album_id" uuid NOT NULL,
	"recipient_album_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"counter_count" integer DEFAULT 0 NOT NULL,
	"offer_cash" integer DEFAULT 0 NOT NULL,
	"want_cash" integer DEFAULT 0 NOT NULL,
	"accepted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"requester_completed_at" timestamp with time zone,
	"recipient_completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_albums" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"album_type_id" uuid NOT NULL,
	"album_edition_id" uuid NOT NULL,
	"album_format_id" uuid NOT NULL,
	"alias" text,
	"notes" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"settings" jsonb DEFAULT '{"includeExtras":true,"includeCocaCola":true}'::jsonb NOT NULL,
	"is_trade_inventory_public" boolean DEFAULT false NOT NULL,
	"owned_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_bans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"ban_type" text NOT NULL,
	"reason" text NOT NULL,
	"report_id" uuid,
	"banned_by" uuid NOT NULL,
	"expires_at" timestamp with time zone,
	"lifted_at" timestamp with time zone,
	"lifted_by" uuid,
	"lift_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reported_user_id" uuid NOT NULL,
	"trade_id" uuid,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"profile_visibility" text DEFAULT 'public' NOT NULL,
	"trade_matching_enabled" boolean DEFAULT true NOT NULL,
	"email_trade_requests" boolean DEFAULT true NOT NULL,
	"email_trade_messages" boolean DEFAULT true NOT NULL,
	"email_marketing" boolean DEFAULT false NOT NULL,
	"marketing_consent_at" timestamp with time zone,
	"marketing_consent_version" text,
	"show_trust_score_public" boolean DEFAULT true NOT NULL,
	"duplicates_count_all_variants" boolean DEFAULT false NOT NULL,
	"cities" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_sticker_favourites" (
	"album_id" uuid NOT NULL,
	"sticker_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_stickers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"album_id" uuid NOT NULL,
	"sticker_variant_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"trade_hidden" boolean DEFAULT false NOT NULL,
	"trade_forced" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_wanted_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"sticker_variant_id" uuid NOT NULL,
	"album_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_wanted_variants_user_id_sticker_variant_id_album_id_key" UNIQUE("user_id","sticker_variant_id","album_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"username" text NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"role" text DEFAULT 'user' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"email_verified_at" timestamp with time zone,
	"hashed_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "album_edition_formats" ADD CONSTRAINT "album_edition_formats_album_type_id_album_types_id_fk" FOREIGN KEY ("album_type_id") REFERENCES "public"."album_types"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "album_edition_formats" ADD CONSTRAINT "album_edition_formats_edition_matches_type" FOREIGN KEY ("album_edition_id","album_type_id") REFERENCES "public"."album_editions"("id","album_type_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "album_edition_formats" ADD CONSTRAINT "album_edition_formats_format_matches_type" FOREIGN KEY ("album_format_id","album_type_id") REFERENCES "public"."album_formats"("id","album_type_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "album_editions" ADD CONSTRAINT "album_editions_album_type_id_album_types_id_fk" FOREIGN KEY ("album_type_id") REFERENCES "public"."album_types"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "album_formats" ADD CONSTRAINT "album_formats_album_type_id_album_types_id_fk" FOREIGN KEY ("album_type_id") REFERENCES "public"."album_types"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "public_lists" ADD CONSTRAINT "public_lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sticker_album_pages" ADD CONSTRAINT "sticker_album_pages_sticker_id_stickers_id_fk" FOREIGN KEY ("sticker_id") REFERENCES "public"."stickers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sticker_variants" ADD CONSTRAINT "sticker_variants_sticker_id_stickers_id_fk" FOREIGN KEY ("sticker_id") REFERENCES "public"."stickers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stickers" ADD CONSTRAINT "stickers_album_type_id_album_types_id_fk" FOREIGN KEY ("album_type_id") REFERENCES "public"."album_types"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stickers" ADD CONSTRAINT "stickers_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_album_pages" ADD CONSTRAINT "team_album_pages_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trade_items" ADD CONSTRAINT "trade_items_trade_id_trade_requests_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trade_requests"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trade_items" ADD CONSTRAINT "trade_items_sticker_variant_id_sticker_variants_id_fk" FOREIGN KEY ("sticker_variant_id") REFERENCES "public"."sticker_variants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trade_messages" ADD CONSTRAINT "trade_messages_trade_id_trade_requests_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trade_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trade_messages" ADD CONSTRAINT "trade_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trade_ratings" ADD CONSTRAINT "trade_ratings_trade_id_trade_requests_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trade_requests"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trade_ratings" ADD CONSTRAINT "trade_ratings_rater_id_users_id_fk" FOREIGN KEY ("rater_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trade_ratings" ADD CONSTRAINT "trade_ratings_rated_user_id_users_id_fk" FOREIGN KEY ("rated_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trade_requests" ADD CONSTRAINT "trade_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trade_requests" ADD CONSTRAINT "trade_requests_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trade_requests" ADD CONSTRAINT "trade_requests_requester_album_id_user_albums_id_fk" FOREIGN KEY ("requester_album_id") REFERENCES "public"."user_albums"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trade_requests" ADD CONSTRAINT "trade_requests_recipient_album_id_user_albums_id_fk" FOREIGN KEY ("recipient_album_id") REFERENCES "public"."user_albums"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_albums" ADD CONSTRAINT "user_albums_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_albums" ADD CONSTRAINT "user_albums_album_type_id_album_types_id_fk" FOREIGN KEY ("album_type_id") REFERENCES "public"."album_types"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_albums" ADD CONSTRAINT "user_albums_edition_matches_type" FOREIGN KEY ("album_edition_id","album_type_id") REFERENCES "public"."album_editions"("id","album_type_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_albums" ADD CONSTRAINT "user_albums_format_matches_type" FOREIGN KEY ("album_format_id","album_type_id") REFERENCES "public"."album_formats"("id","album_type_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_albums" ADD CONSTRAINT "user_albums_edition_format_valid" FOREIGN KEY ("album_edition_id","album_format_id") REFERENCES "public"."album_edition_formats"("album_edition_id","album_format_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_bans" ADD CONSTRAINT "user_bans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_bans" ADD CONSTRAINT "user_bans_report_id_user_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."user_reports"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_bans" ADD CONSTRAINT "user_bans_banned_by_users_id_fk" FOREIGN KEY ("banned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_bans" ADD CONSTRAINT "user_bans_lifted_by_users_id_fk" FOREIGN KEY ("lifted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reported_user_id_users_id_fk" FOREIGN KEY ("reported_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_trade_id_trade_requests_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trade_requests"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_sticker_favourites" ADD CONSTRAINT "user_sticker_favourites_album_id_user_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."user_albums"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_sticker_favourites" ADD CONSTRAINT "user_sticker_favourites_sticker_id_stickers_id_fk" FOREIGN KEY ("sticker_id") REFERENCES "public"."stickers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_stickers" ADD CONSTRAINT "user_stickers_album_id_user_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."user_albums"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_stickers" ADD CONSTRAINT "user_stickers_sticker_variant_id_sticker_variants_id_fk" FOREIGN KEY ("sticker_variant_id") REFERENCES "public"."sticker_variants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_wanted_variants" ADD CONSTRAINT "user_wanted_variants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_wanted_variants" ADD CONSTRAINT "user_wanted_variants_sticker_variant_id_sticker_variants_id_fk" FOREIGN KEY ("sticker_variant_id") REFERENCES "public"."sticker_variants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_wanted_variants" ADD CONSTRAINT "user_wanted_variants_album_id_user_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."user_albums"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_album_edition_formats_edition_id" ON "album_edition_formats" USING btree ("album_edition_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_album_edition_formats_format_id" ON "album_edition_formats" USING btree ("album_format_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_album_edition_formats_type_id" ON "album_edition_formats" USING btree ("album_type_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_album_editions_album_type_id" ON "album_editions" USING btree ("album_type_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_album_formats_album_type_id" ON "album_formats" USING btree ("album_type_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_log_user_id_occurred_at" ON "audit_log" USING btree ("user_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_consent_records_user_id_type" ON "consent_records" USING btree ("user_id","consent_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_email_verification_tokens_user_id" ON "email_verification_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_password_reset_tokens_user_id" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sticker_album_pages_sticker_id" ON "sticker_album_pages" USING btree ("sticker_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sticker_variants_sticker_id_variant_type_unique" ON "sticker_variants" USING btree ("sticker_id","variant_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sticker_variants_sticker_id" ON "sticker_variants" USING btree ("sticker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stickers_album_type_id" ON "stickers" USING btree ("album_type_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stickers_team_id" ON "stickers" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_team_album_pages_team_id" ON "team_album_pages" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trade_items_trade_id" ON "trade_items" USING btree ("trade_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trade_items_sticker_variant_id" ON "trade_items" USING btree ("sticker_variant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trade_messages_trade_id" ON "trade_messages" USING btree ("trade_id","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "trade_ratings_trade_id_rater_id_unique" ON "trade_ratings" USING btree ("trade_id","rater_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trade_ratings_rated_user_id" ON "trade_ratings" USING btree ("rated_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trade_requests_requester_status_updated" ON "trade_requests" USING btree ("requester_id","status","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trade_requests_recipient_status_updated" ON "trade_requests" USING btree ("recipient_id","status","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_albums_user_id" ON "user_albums" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_albums_album_type_id" ON "user_albums" USING btree ("album_type_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_albums_album_edition_id" ON "user_albums" USING btree ("album_edition_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_albums_album_format_id" ON "user_albums" USING btree ("album_format_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_albums_public_trade_inventory" ON "user_albums" USING btree ("user_id") WHERE is_trade_inventory_public;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_reports_reported_user_id_status" ON "user_reports" USING btree ("reported_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_sticker_favourites_pkey" ON "user_sticker_favourites" USING btree ("album_id","sticker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_sticker_favourites_album_id" ON "user_sticker_favourites" USING btree ("album_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_stickers_album_id_sticker_variant_id_unique" ON "user_stickers" USING btree ("album_id","sticker_variant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_stickers_sticker_variant_id" ON "user_stickers" USING btree ("sticker_variant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_stickers_duplicates" ON "user_stickers" USING btree ("album_id") WHERE quantity > 1;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_wanted_variants_user_album" ON "user_wanted_variants" USING btree ("user_id","album_id");