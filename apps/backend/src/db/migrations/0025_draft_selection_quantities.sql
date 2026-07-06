-- Third-party draft selections carry per-row copy counts.
--
-- selection_i_receive / selection_i_give change from uuid[] (tick-state only)
-- to jsonb arrays of { "stickerVariantId": uuid, "quantity": int | null } so
-- a resumed draft restores the editor's quantity steppers, not just the
-- checkboxes. quantity null = "use the pool default" — the shape existing
-- rows convert to, and what the editor treats as the matcher-capped maximum.
--
-- uuid[] → jsonb needs a per-row aggregate, which ALTER ... USING can't
-- express (no subqueries), hence the add/update/drop column swap.

ALTER TABLE "third_party_trade_drafts"
  ADD COLUMN "selection_i_receive_v2" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "selection_i_give_v2" jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
UPDATE "third_party_trade_drafts" SET
  "selection_i_receive_v2" = COALESCE(
    (SELECT jsonb_agg(jsonb_build_object('stickerVariantId', t.v, 'quantity', NULL))
       FROM unnest("selection_i_receive") AS t(v)),
    '[]'::jsonb
  ),
  "selection_i_give_v2" = COALESCE(
    (SELECT jsonb_agg(jsonb_build_object('stickerVariantId', t.v, 'quantity', NULL))
       FROM unnest("selection_i_give") AS t(v)),
    '[]'::jsonb
  );
--> statement-breakpoint
ALTER TABLE "third_party_trade_drafts"
  DROP COLUMN "selection_i_receive",
  DROP COLUMN "selection_i_give";
--> statement-breakpoint
ALTER TABLE "third_party_trade_drafts" RENAME COLUMN "selection_i_receive_v2" TO "selection_i_receive";
--> statement-breakpoint
ALTER TABLE "third_party_trade_drafts" RENAME COLUMN "selection_i_give_v2" TO "selection_i_give";
