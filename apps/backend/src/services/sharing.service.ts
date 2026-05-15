import type { Pool } from 'pg';
import crypto from 'node:crypto';
import { env } from '../env.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ShareLinkRow {
  id: string;
  user_id: string;
  list_type: string;
  share_token: string;
  expires_at: string | null;
  created_at: string;
  url: string;
}

export interface PublicListItem {
  sticker_variant_id: string;
  number: number;
  album_code: string;
  player_name: string | null;
  sticker_type: string;
  team_name: string | null;
  variant_type: string;
  quantity: number | null;
}

export interface PublicListResult {
  owner: {
    username: string;
    display_name: string | null;
  };
  list_type: string;
  items: PublicListItem[];
  created_at: string;
}

export interface PublicProfile {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  member_since: string;
  collection_stats: {
    total: number;
    owned: number;
    missing: number;
    duplicates: number;
    percentage: number;
  } | null;
}

type ListType = 'missing' | 'duplicates' | 'full_collection';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildShareUrl(token: string): string {
  return `${env.FRONTEND_URL}/share/${token}`;
}

function makeError(message: string, statusCode: number): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * createShareLink — insert a new share link row for the user.
 */
export async function createShareLink(
  db: Pool,
  userId: string,
  listType: ListType,
  _albumId: string
): Promise<ShareLinkRow> {
  const token = crypto.randomBytes(24).toString('base64url');
  const id = crypto.randomUUID();

  const { rows } = await db.query<{
    id: string;
    user_id: string;
    list_type: string;
    share_token: string;
    expires_at: string | null;
    created_at: string;
  }>(
    `INSERT INTO public_lists (id, user_id, list_type, share_token, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     RETURNING id, user_id, list_type, share_token, expires_at, created_at`,
    [id, userId, listType, token]
  );

  const row = rows[0]!;
  return { ...row, url: buildShareUrl(row.share_token) };
}

/**
 * listShareLinks — return all share links owned by the user.
 */
export async function listShareLinks(db: Pool, userId: string): Promise<ShareLinkRow[]> {
  const { rows } = await db.query<{
    id: string;
    user_id: string;
    list_type: string;
    share_token: string;
    expires_at: string | null;
    created_at: string;
  }>(
    `SELECT id, user_id, list_type, share_token, expires_at, created_at
     FROM public_lists
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );

  return rows.map((r) => ({ ...r, url: buildShareUrl(r.share_token) }));
}

/**
 * revokeShareLink — delete a share link by token, only if owned by userId.
 */
export async function revokeShareLink(
  db: Pool,
  userId: string,
  token: string
): Promise<void> {
  const result = await db.query(
    `DELETE FROM public_lists WHERE share_token = $1 AND user_id = $2`,
    [token, userId]
  );

  if ((result.rowCount ?? 0) === 0) {
    throw makeError('Share link not found.', 404);
  }
}

/**
 * getPublicList — fetch sticker list for a share token (no auth required).
 * Returns null if token doesn't exist or has expired.
 */
export async function getPublicList(
  db: Pool,
  token: string
): Promise<PublicListResult | null> {
  const { rows: linkRows } = await db.query<{
    id: string;
    user_id: string;
    list_type: string;
    expires_at: string | null;
    created_at: string;
    username: string;
    display_name: string | null;
  }>(
    `SELECT
       pl.id,
       pl.user_id,
       pl.list_type,
       pl.expires_at,
       pl.created_at,
       u.username,
       u.display_name
     FROM public_lists pl
     JOIN users u ON u.id = pl.user_id
     WHERE pl.share_token = $1
       AND u.deleted_at IS NULL`,
    [token]
  );

  if (linkRows.length === 0) return null;

  const link = linkRows[0]!;

  // Check expiry
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return null;
  }

  // Get owner's default album
  const { rows: albumRows } = await db.query<{ id: string }>(
    `SELECT id FROM user_albums WHERE user_id = $1 AND is_default = true LIMIT 1`,
    [link.user_id]
  );

  if (albumRows.length === 0) {
    return {
      owner: { username: link.username, display_name: link.display_name },
      list_type: link.list_type,
      items: [],
      created_at: link.created_at,
    };
  }

  const albumId = albumRows[0]!.id;
  let items: PublicListItem[] = [];

  if (link.list_type === 'missing') {
    const { rows } = await db.query<PublicListItem>(
      `SELECT
         COALESCE(sv.id, s.id) AS sticker_variant_id,
         s.number,
         s.album_code,
         s.player_name,
         s.sticker_type,
         t.name AS team_name,
         COALESCE(sv.variant_type, 'base') AS variant_type,
         NULL::int AS quantity
       FROM stickers s
       LEFT JOIN teams t ON t.id = s.team_id
       LEFT JOIN sticker_variants sv ON sv.sticker_id = s.id AND sv.variant_type = 'base'
       WHERE NOT EXISTS (
         SELECT 1 FROM user_stickers us
         JOIN sticker_variants sv2 ON sv2.id = us.sticker_variant_id
         WHERE sv2.sticker_id = s.id
           AND us.album_id = $1
           AND us.quantity > 0
       )
       ORDER BY s.number`,
      [albumId]
    );
    items = rows;
  } else if (link.list_type === 'duplicates') {
    const { rows } = await db.query<PublicListItem>(
      `SELECT
         us.sticker_variant_id,
         s.number,
         s.album_code,
         s.player_name,
         s.sticker_type,
         t.name AS team_name,
         sv.variant_type,
         us.quantity
       FROM user_stickers us
       JOIN sticker_variants sv ON sv.id = us.sticker_variant_id
       JOIN stickers s ON s.id = sv.sticker_id
       LEFT JOIN teams t ON t.id = s.team_id
       WHERE us.album_id = $1
         AND us.quantity > 1
       ORDER BY s.number`,
      [albumId]
    );
    items = rows;
  } else {
    // full_collection
    const { rows } = await db.query<PublicListItem>(
      `SELECT
         us.sticker_variant_id,
         s.number,
         s.album_code,
         s.player_name,
         s.sticker_type,
         t.name AS team_name,
         sv.variant_type,
         us.quantity
       FROM user_stickers us
       JOIN sticker_variants sv ON sv.id = us.sticker_variant_id
       JOIN stickers s ON s.id = sv.sticker_id
       LEFT JOIN teams t ON t.id = s.team_id
       WHERE us.album_id = $1
         AND us.quantity > 0
       ORDER BY s.number`,
      [albumId]
    );
    items = rows;
  }

  return {
    owner: { username: link.username, display_name: link.display_name },
    list_type: link.list_type,
    items,
    created_at: link.created_at,
  };
}

/**
 * getPublicProfile — fetch a user's public profile by username.
 * Returns null if not found or profile_visibility is 'private'.
 */
export async function getPublicProfile(
  db: Pool,
  username: string
): Promise<PublicProfile | null> {
  const { rows } = await db.query<{
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    created_at: string;
    profile_visibility: string | null;
    collection_visibility: string | null;
  }>(
    `SELECT
       u.id,
       u.username,
       u.display_name,
       u.avatar_url,
       u.created_at,
       us.profile_visibility,
       us.collection_visibility
     FROM users u
     LEFT JOIN user_settings us ON us.user_id = u.id
     WHERE u.username = $1
       AND u.deleted_at IS NULL`,
    [username]
  );

  if (rows.length === 0) return null;

  const user = rows[0]!;

  // Respect privacy settings
  if (user.profile_visibility === 'private') return null;

  let collection_stats: PublicProfile['collection_stats'] = null;

  if (user.collection_visibility === 'public') {
    const { rows: statRows } = await db.query<{
      total: string;
      owned: string;
      duplicates: string;
    }>(
      `WITH default_album AS (
         SELECT id FROM user_albums WHERE user_id = $1 AND is_default = true LIMIT 1
       ),
       album_stats AS (
         SELECT
           COUNT(DISTINCT sv.sticker_id) FILTER (WHERE us.quantity > 0) AS owned,
           COUNT(*) FILTER (WHERE us.quantity > 1) AS duplicates
         FROM user_stickers us
         JOIN sticker_variants sv ON sv.id = us.sticker_variant_id
         WHERE us.album_id = (SELECT id FROM default_album)
       )
       SELECT
         (SELECT COUNT(*) FROM stickers)::text AS total,
         owned::text,
         duplicates::text
       FROM album_stats`,
      [user.id]
    );

    if (statRows.length > 0) {
      const stat = statRows[0]!;
      const total = parseInt(stat.total, 10);
      const owned = parseInt(stat.owned, 10);
      const duplicates = parseInt(stat.duplicates, 10);
      collection_stats = {
        total,
        owned,
        missing: total - owned,
        duplicates,
        percentage: total > 0 ? parseFloat(((owned / total) * 100).toFixed(2)) : 0,
      };
    }
  }

  return {
    username: user.username,
    display_name: user.display_name,
    avatar_url: user.avatar_url,
    member_since: user.created_at,
    collection_stats,
  };
}
