CREATE TABLE "live_trade_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"action_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "live_trade_actions_type_check" CHECK ("live_trade_actions"."action_type" IN ('join','leave','message','stage_offer','unstage_offer','confirm','unconfirm','close'))
);
--> statement-breakpoint
CREATE TABLE "live_trade_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_user_id" uuid NOT NULL,
	"guest_user_id" uuid,
	"invite_token" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"host_confirmed_at" timestamp with time zone,
	"guest_confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '30 minutes' NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "live_trade_sessions_invite_token_unique" UNIQUE("invite_token"),
	CONSTRAINT "live_trade_sessions_status_check" CHECK ("live_trade_sessions"."status" IN ('open','joined','confirmed','closed','expired'))
);
--> statement-breakpoint
ALTER TABLE "live_trade_actions" ADD CONSTRAINT "live_trade_actions_session_id_live_trade_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."live_trade_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_trade_actions" ADD CONSTRAINT "live_trade_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_trade_sessions" ADD CONSTRAINT "live_trade_sessions_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "live_trade_sessions" ADD CONSTRAINT "live_trade_sessions_guest_user_id_users_id_fk" FOREIGN KEY ("guest_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "idx_live_trade_actions_session_created" ON "live_trade_actions" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_live_trade_sessions_host" ON "live_trade_sessions" USING btree ("host_user_id");--> statement-breakpoint
CREATE INDEX "idx_live_trade_sessions_guest" ON "live_trade_sessions" USING btree ("guest_user_id");