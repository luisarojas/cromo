ALTER TABLE "user_settings" ADD COLUMN "default_base_variant" text DEFAULT 'base_border' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_default_base_variant_check" CHECK ("user_settings"."default_base_variant" IN ('base_border', 'base_borderless'));
