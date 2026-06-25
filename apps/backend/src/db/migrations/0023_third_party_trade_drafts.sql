-- third_party_trade_drafts — in-progress third-party trade plans the user can
-- park and resume later (or record as a completed trade) from the Third-Party
-- tab. Independent of trade_requests (no counterparty user) and live trades
-- (no Redis session) — this row IS the entire state of the planning UI.
--
-- The two list_jsonb fields are the partner's typed offered/wanted (so the
-- editor can re-resolve against the catalog on open without asking the user
-- to re-type). The two selection arrays hold the user's tick-state at save
-- time. Cash is stored in cents to match the rest of the trade system.
--
-- Hand-written because `pnpm db:generate` currently blocks on an interactive
-- prompt triggered by snapshot drift in prior migrations (placeholder
-- snapshots from 0009+ don't reflect those migrations' schema changes).
-- Once the broader project rebases its snapshots, regenerate this via
-- `pnpm db:generate` so the snapshot reflects reality.

CREATE TABLE "third_party_trade_drafts" (
  "id"                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"                 uuid NOT NULL,
  "album_id"                uuid NOT NULL,
  "partner_name"            text,
  "their_offered"           jsonb NOT NULL DEFAULT '[]'::jsonb,
  "their_wanted"            jsonb NOT NULL DEFAULT '[]'::jsonb,
  "selection_i_receive"     uuid[] NOT NULL DEFAULT '{}'::uuid[],
  "selection_i_give"        uuid[] NOT NULL DEFAULT '{}'::uuid[],
  "i_receive_cash_cents"    integer NOT NULL DEFAULT 0,
  "i_give_cash_cents"       integer NOT NULL DEFAULT 0,
  "created_at"              timestamptz NOT NULL DEFAULT now(),
  "updated_at"              timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "third_party_trade_drafts"
  ADD CONSTRAINT "third_party_trade_drafts_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "third_party_trade_drafts"
  ADD CONSTRAINT "third_party_trade_drafts_album_id_user_albums_id_fk"
  FOREIGN KEY ("album_id") REFERENCES "public"."user_albums"("id")
  ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "third_party_trade_drafts"
  ADD CONSTRAINT "third_party_trade_drafts_cash_nonneg"
  CHECK ("i_receive_cash_cents" >= 0 AND "i_give_cash_cents" >= 0);
--> statement-breakpoint
CREATE INDEX "idx_third_party_trade_drafts_user_updated"
  ON "third_party_trade_drafts" ("user_id", "updated_at" DESC);
