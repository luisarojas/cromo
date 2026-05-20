import type { Pool } from 'pg';
import { withTx } from '../db/transaction.js';

export async function listFavourites(db: Pool, albumId: string): Promise<string[]> {
  const { rows } = await db.query<{ album_code: string }>(
    `SELECT s.album_code
     FROM user_sticker_favourites f
     JOIN stickers s ON s.id = f.sticker_id
     WHERE f.album_id = $1
     ORDER BY s.album_code`,
    [albumId],
  );
  return rows.map((r) => r.album_code);
}

/**
 * setFavourites — replace the favourite set for an album in one statement.
 * Replaces the per-toggle localStorage write the frontend used to do.
 */
export async function setFavourites(
  db: Pool,
  albumId: string,
  stickerIds: string[],
): Promise<void> {
  await withTx(db, async (client) => {
    await client.query(
      `DELETE FROM user_sticker_favourites WHERE album_id = $1`,
      [albumId],
    );
    if (stickerIds.length > 0) {
      await client.query(
        `INSERT INTO user_sticker_favourites (album_id, sticker_id)
         SELECT $1, UNNEST($2::uuid[])
         ON CONFLICT DO NOTHING`,
        [albumId, stickerIds],
      );
    }
  });
}

export async function toggleFavourite(
  db: Pool,
  albumId: string,
  stickerId: string,
): Promise<{ favourited: boolean }> {
  const { rows } = await db.query<{ inserted: boolean }>(
    `WITH del AS (
       DELETE FROM user_sticker_favourites
       WHERE album_id = $1 AND sticker_id = $2
       RETURNING 1
     ),
     ins AS (
       INSERT INTO user_sticker_favourites (album_id, sticker_id)
       SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM del)
       RETURNING 1
     )
     SELECT EXISTS (SELECT 1 FROM ins) AS inserted`,
    [albumId, stickerId],
  );
  return { favourited: rows[0]?.inserted ?? false };
}
