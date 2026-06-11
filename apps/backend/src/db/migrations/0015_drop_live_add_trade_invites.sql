DROP TABLE "live_trade_actions" CASCADE;--> statement-breakpoint
DROP TABLE "live_trade_sessions" CASCADE;--> statement-breakpoint
CREATE TABLE "trade_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '30 minutes' NOT NULL,
	"redeemed_at" timestamp with time zone,
	"redeemed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trade_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "trade_invites" ADD CONSTRAINT "trade_invites_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "trade_invites" ADD CONSTRAINT "trade_invites_redeemed_by_user_id_users_id_fk" FOREIGN KEY ("redeemed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "idx_trade_invites_host_user_id" ON "trade_invites" USING btree ("host_user_id");--> statement-breakpoint
CREATE INDEX "idx_trade_invites_expires_at" ON "trade_invites" USING btree ("expires_at");
