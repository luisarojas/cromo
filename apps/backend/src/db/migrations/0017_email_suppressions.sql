CREATE TABLE "email_suppressions" (
	"email" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"bounce_type" text,
	"bounce_subtype" text,
	"diagnostic_code" text,
	"notification_payload" jsonb,
	"suppressed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_suppressions_reason_check" CHECK ("reason" IN ('bounce', 'complaint', 'manual'))
);
--> statement-breakpoint
CREATE INDEX "idx_email_suppressions_suppressed_at" ON "email_suppressions" USING btree ("suppressed_at");
