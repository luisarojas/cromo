ALTER TABLE "user_settings" ADD COLUMN "search_radius_km" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_search_radius_check" CHECK ("search_radius_km" BETWEEN 5 AND 1000);
