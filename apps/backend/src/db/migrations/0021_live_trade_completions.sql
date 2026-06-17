-- live_trade_completions — host-only history of an in-person live trade with
-- a non-registered visitor. Session state lives in Redis; this table records
-- only the deltas applied to the host's inventory on "complete", so trade
-- history can show them and a 60-second "undo" can reverse them.

CREATE TABLE "live_trade_completions" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "host_user_id"   uuid NOT NULL,
  "host_album_id"  uuid NOT NULL,
  "guest_label"    text,
  "host_gave"      jsonb NOT NULL DEFAULT '[]'::jsonb,
  "host_received"  jsonb NOT NULL DEFAULT '[]'::jsonb,
  "completed_at"   timestamptz NOT NULL DEFAULT now(),
  "undone_at"      timestamptz,
  "created_at"     timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "live_trade_completions"
  ADD CONSTRAINT "live_trade_completions_host_user_id_users_id_fk"
  FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "live_trade_completions"
  ADD CONSTRAINT "live_trade_completions_host_album_id_user_albums_id_fk"
  FOREIGN KEY ("host_album_id") REFERENCES "public"."user_albums"("id")
  ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
CREATE INDEX "idx_live_trade_completions_host_completed"
  ON "live_trade_completions" ("host_user_id", "completed_at");
