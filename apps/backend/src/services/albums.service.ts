import type { Pool } from 'pg';
import type { Redis } from 'ioredis';

export interface UserAlbum {
  id: string;
  user_id: string;
  album_type_key: string;
  alias: string | null;
  edition: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

async function invalidateUserCaches(redis: Redis, userId: string): Promise<void> {
  const patterns = [
    `user:${userId}:collection:*`,
    `user:${userId}:missing:*`,
    `user:${userId}:summary:*`,
    `user:${userId}:duplicates:*`,
  ];
  for (const pattern of patterns) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  }
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function listAlbums(db: Pool, userId: string): Promise<UserAlbum[]> {
  const { rows } = await db.query<UserAlbum>(
    `SELECT id, user_id, album_type_key, alias, edition, is_default, created_at, updated_at
     FROM user_albums
     WHERE user_id = $1
     ORDER BY is_default DESC, created_at ASC`,
    [userId]
  );
  return rows;
}

export async function getAlbum(
  db: Pool,
  userId: string,
  albumId: string
): Promise<UserAlbum | null> {
  const { rows } = await db.query<UserAlbum>(
    `SELECT id, user_id, album_type_key, alias, edition, is_default, created_at, updated_at
     FROM user_albums
     WHERE id = $1 AND user_id = $2`,
    [albumId, userId]
  );
  return rows[0] ?? null;
}

export async function getDefaultAlbumId(db: Pool, userId: string): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM user_albums WHERE user_id = $1 AND is_default = true LIMIT 1`,
    [userId]
  );
  return rows[0]?.id ?? null;
}

/**
 * Resolves an album ID for the given user. If albumId is provided, verifies it
 * belongs to the user. Otherwise returns the user's default album ID.
 */
export async function resolveAlbumId(
  db: Pool,
  userId: string,
  albumId?: string
): Promise<string | null> {
  if (albumId) {
    const { rows } = await db.query<{ id: string }>(
      `SELECT id FROM user_albums WHERE id = $1 AND user_id = $2`,
      [albumId, userId]
    );
    return rows[0]?.id ?? null;
  }
  return getDefaultAlbumId(db, userId);
}

export async function createAlbum(
  db: Pool,
  userId: string,
  input: { alias?: string | null; edition?: string }
): Promise<UserAlbum> {
  const edition = input.edition ?? 'north_america';
  const alias = input.alias ?? null;

  const { rows } = await db.query<UserAlbum>(
    `INSERT INTO user_albums (user_id, album_type_key, alias, edition, is_default)
     VALUES ($1, 'fifa_world_cup_2026', $2, $3, false)
     RETURNING id, user_id, album_type_key, alias, edition, is_default, created_at, updated_at`,
    [userId, alias, edition]
  );
  return rows[0]!;
}

export async function createDefaultAlbum(
  db: Pool,
  userId: string,
  edition = 'north_america'
): Promise<UserAlbum> {
  const { rows } = await db.query<UserAlbum>(
    `INSERT INTO user_albums (user_id, album_type_key, edition, is_default)
     VALUES ($1, 'fifa_world_cup_2026', $2, true)
     RETURNING id, user_id, album_type_key, alias, edition, is_default, created_at, updated_at`,
    [userId, edition]
  );
  return rows[0]!;
}

export async function updateAlbum(
  db: Pool,
  userId: string,
  albumId: string,
  patch: { alias?: string | null; edition?: string }
): Promise<UserAlbum | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [albumId, userId];

  if ('alias' in patch) {
    values.push(patch.alias);
    setClauses.push(`alias = $${values.length}`);
  }
  if (patch.edition !== undefined) {
    values.push(patch.edition);
    setClauses.push(`edition = $${values.length}`);
  }

  if (setClauses.length === 0) return getAlbum(db, userId, albumId);

  setClauses.push('updated_at = NOW()');

  const { rows } = await db.query<UserAlbum>(
    `UPDATE user_albums SET ${setClauses.join(', ')} WHERE id = $1 AND user_id = $2
     RETURNING id, user_id, album_type_key, alias, edition, is_default, created_at, updated_at`,
    values
  );
  return rows[0] ?? null;
}

export async function deleteAlbum(
  db: Pool,
  redis: Redis,
  userId: string,
  albumId: string
): Promise<void> {
  const { rows } = await db.query<{ is_default: boolean; sticker_count: string }>(
    `SELECT ua.is_default,
            (SELECT COUNT(*) FROM user_stickers us WHERE us.album_id = ua.id) AS sticker_count
     FROM user_albums ua
     WHERE ua.id = $1 AND ua.user_id = $2`,
    [albumId, userId]
  );

  if (rows.length === 0) {
    const err = new Error('Album not found.') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  if (rows[0]!.is_default) {
    const err = new Error('Cannot delete the default album.') as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  if (parseInt(rows[0]!.sticker_count, 10) > 0) {
    const err = new Error(
      'Cannot delete an album that still contains stickers. Move or remove them first.'
    ) as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  await db.query('DELETE FROM user_albums WHERE id = $1 AND user_id = $2', [albumId, userId]);
  await invalidateUserCaches(redis, userId);
}

export async function moveSticker(
  db: Pool,
  redis: Redis,
  userId: string,
  sourceAlbumId: string,
  targetAlbumId: string,
  variantId: string,
  quantity: number
): Promise<void> {
  if (sourceAlbumId === targetAlbumId) {
    const err = new Error('Source and target albums must be different.') as Error & {
      statusCode: number;
    };
    err.statusCode = 400;
    throw err;
  }

  const { rows: albumRows } = await db.query<{ id: string }>(
    `SELECT id FROM user_albums WHERE id = ANY($1) AND user_id = $2`,
    [[sourceAlbumId, targetAlbumId], userId]
  );

  if (albumRows.length !== 2) {
    const err = new Error('One or both albums not found.') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: sourceRows } = await client.query<{ quantity: number }>(
      `SELECT quantity FROM user_stickers WHERE album_id = $1 AND sticker_variant_id = $2`,
      [sourceAlbumId, variantId]
    );

    const sourceQty = sourceRows[0]?.quantity ?? 0;
    if (sourceQty < quantity) {
      const err = new Error(
        `Source album only has ${sourceQty} of this sticker.`
      ) as Error & { statusCode: number };
      err.statusCode = 400;
      throw err;
    }

    if (sourceQty - quantity <= 0) {
      await client.query(
        `DELETE FROM user_stickers WHERE album_id = $1 AND sticker_variant_id = $2`,
        [sourceAlbumId, variantId]
      );
    } else {
      await client.query(
        `UPDATE user_stickers SET quantity = quantity - $3, updated_at = NOW()
         WHERE album_id = $1 AND sticker_variant_id = $2`,
        [sourceAlbumId, variantId, quantity]
      );
    }

    await client.query(
      `INSERT INTO user_stickers (user_id, album_id, sticker_variant_id, quantity)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (album_id, sticker_variant_id)
       DO UPDATE SET quantity = user_stickers.quantity + EXCLUDED.quantity, updated_at = NOW()`,
      [userId, targetAlbumId, variantId, quantity]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await invalidateUserCaches(redis, userId);
}
