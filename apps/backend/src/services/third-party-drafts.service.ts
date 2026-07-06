import type { Pool } from 'pg';

/**
 * Third-party trade drafts — in-progress trade plans the user has parked
 * from the Third-Party tab. CRUD only; no Redis cache (drafts are small,
 * per-user, and read at most when the user opens the My Trades tab).
 *
 * The row IS the entire planning state — the editor re-runs `match-against-me`
 * against the partner's typed list to rebuild today's candidate pool, then
 * pre-checks any candidate whose stickerVariantId appears in the selection
 * array and restores its quantity stepper. A re-seed between save and resume
 * could swing variant IDs, but the partner list (album_code + variant token)
 * is stable across reseeds so the editor can always re-render the layout.
 */

export interface ListItemRow {
  albumCode: string;
  variantToken: string | null;
  quantity: number;
}

export interface SelectionRow {
  stickerVariantId: string;
  /** Copies to trade; null = the pool default (the matcher-capped maximum).
   *  Old drafts converted by migration 0025 carry null. */
  quantity: number | null;
}

export interface ThirdPartyDraft {
  id: string;
  userId: string;
  albumId: string;
  partnerName: string | null;
  theirOffered: ListItemRow[];
  theirWanted: ListItemRow[];
  selectionIReceive: SelectionRow[];
  selectionIGive: SelectionRow[];
  iReceiveCashCents: number;
  iGiveCashCents: number;
  createdAt: string;
  updatedAt: string;
}

interface DraftRow {
  id: string;
  user_id: string;
  album_id: string;
  partner_name: string | null;
  their_offered: ListItemRow[];
  their_wanted: ListItemRow[];
  selection_i_receive: SelectionRow[];
  selection_i_give: SelectionRow[];
  i_receive_cash_cents: number;
  i_give_cash_cents: number;
  created_at: Date;
  updated_at: Date;
}

function rowToDraft(r: DraftRow): ThirdPartyDraft {
  return {
    id: r.id,
    userId: r.user_id,
    albumId: r.album_id,
    partnerName: r.partner_name,
    theirOffered: r.their_offered ?? [],
    theirWanted: r.their_wanted ?? [],
    selectionIReceive: r.selection_i_receive ?? [],
    selectionIGive: r.selection_i_give ?? [],
    iReceiveCashCents: r.i_receive_cash_cents,
    iGiveCashCents: r.i_give_cash_cents,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export interface UpsertDraftInput {
  /** When set, update in place; otherwise insert. */
  id: string | null;
  userId: string;
  albumId: string;
  partnerName: string | null;
  theirOffered: ListItemRow[];
  theirWanted: ListItemRow[];
  selectionIReceive: SelectionRow[];
  selectionIGive: SelectionRow[];
  iReceiveCashCents: number;
  iGiveCashCents: number;
}

export async function upsertThirdPartyDraft(
  db: Pool,
  input: UpsertDraftInput,
): Promise<ThirdPartyDraft> {
  // Albums are user-scoped; rejecting cross-user album IDs here closes the
  // hole where a logged-in user could attach a draft to someone else's album.
  const { rows: albumRows } = await db.query<{ id: string }>(
    `SELECT id FROM user_albums WHERE id = $1 AND user_id = $2`,
    [input.albumId, input.userId],
  );
  if (albumRows.length === 0) {
    throw Object.assign(new Error('Album not found.'), { statusCode: 404 });
  }

  if (input.id) {
    const { rows } = await db.query<DraftRow>(
      `UPDATE third_party_trade_drafts
          SET album_id = $1,
              partner_name = $2,
              their_offered = $3::jsonb,
              their_wanted = $4::jsonb,
              selection_i_receive = $5::jsonb,
              selection_i_give = $6::jsonb,
              i_receive_cash_cents = $7,
              i_give_cash_cents = $8,
              updated_at = now()
        WHERE id = $9 AND user_id = $10
       RETURNING *`,
      [
        input.albumId,
        input.partnerName,
        JSON.stringify(input.theirOffered),
        JSON.stringify(input.theirWanted),
        JSON.stringify(input.selectionIReceive),
        JSON.stringify(input.selectionIGive),
        input.iReceiveCashCents,
        input.iGiveCashCents,
        input.id,
        input.userId,
      ],
    );
    if (rows.length === 0) {
      throw Object.assign(new Error('Draft not found.'), { statusCode: 404 });
    }
    return rowToDraft(rows[0]!);
  }

  const { rows } = await db.query<DraftRow>(
    `INSERT INTO third_party_trade_drafts
       (user_id, album_id, partner_name, their_offered, their_wanted,
        selection_i_receive, selection_i_give, i_receive_cash_cents, i_give_cash_cents)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9)
     RETURNING *`,
    [
      input.userId,
      input.albumId,
      input.partnerName,
      JSON.stringify(input.theirOffered),
      JSON.stringify(input.theirWanted),
      JSON.stringify(input.selectionIReceive),
      JSON.stringify(input.selectionIGive),
      input.iReceiveCashCents,
      input.iGiveCashCents,
    ],
  );
  return rowToDraft(rows[0]!);
}

export async function listThirdPartyDrafts(
  db: Pool,
  userId: string,
): Promise<ThirdPartyDraft[]> {
  const { rows } = await db.query<DraftRow>(
    `SELECT * FROM third_party_trade_drafts
      WHERE user_id = $1
      ORDER BY updated_at DESC
      LIMIT 100`,
    [userId],
  );
  return rows.map(rowToDraft);
}

export async function getThirdPartyDraft(
  db: Pool,
  userId: string,
  id: string,
): Promise<ThirdPartyDraft | null> {
  const { rows } = await db.query<DraftRow>(
    `SELECT * FROM third_party_trade_drafts WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return rows[0] ? rowToDraft(rows[0]) : null;
}

export async function deleteThirdPartyDraft(
  db: Pool,
  userId: string,
  id: string,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `DELETE FROM third_party_trade_drafts WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return (rowCount ?? 0) > 0;
}
