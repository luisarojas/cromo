import crypto from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { withTx } from '../db/transaction.js';
import {
  DEFAULT_ALBUM_TYPE_KEY,
  DEFAULT_ALBUM_EDITION_KEY,
  DEFAULT_ALBUM_FORMAT_KEY,
} from '../constants.js';
import { statusError } from '../utils/errors.js';

// Any pg connection — either a pool or an in-progress transaction client.
type Executor = Pool | PoolClient;

export function hashEmail(email: string): string {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

/**
 * Strips any `+variation` tag from the local part so plus-addressing variants
 * collapse onto the same key. Used only for the banned_emails lookup — the
 * user's stored `hashedEmail` still hashes the literal address. This is what
 * makes a hard ban on `foo@host` also block `foo+anything@host` from creating
 * a fresh account.
 */
export function canonicalizeEmailForBan(email: string): string {
  return email.toLowerCase().trim().replace(/\+[^@]*@/, '@');
}

export function hashEmailForBan(email: string): string {
  return hashEmail(canonicalizeEmailForBan(email));
}

/**
 * Derives a username from the email local-part, then appends a numeric suffix
 * (`2`, `3`, …) until the result is free. Used when the register form omits
 * the username field. The user can rename later in settings.
 */
export async function deriveUniqueUsernameFromEmail(
  db: Executor,
  email: string,
): Promise<string> {
  const local = email.split('@')[0] ?? '';
  const cleaned = local.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const base = (cleaned.length >= 3 ? cleaned : cleaned.padEnd(3, '0')).slice(0, 30);

  for (let i = 1; i <= 999; i++) {
    const suffix = i === 1 ? '' : String(i);
    const candidate = `${base.slice(0, 30 - suffix.length)}${suffix}`;
    const { rows } = await db.query<{ id: string }>(
      `SELECT id FROM users WHERE username = $1 LIMIT 1`,
      [candidate],
    );
    if (rows.length === 0) return candidate;
  }

  const random = crypto.randomBytes(3).toString('hex');
  return `${base.slice(0, 30 - random.length)}${random}`;
}

export interface UserDto {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  role: string;
  emailVerifiedAt: Date | null;
}

interface UserRow {
  id: string;
  email: string;
  username: string;
  display_name: string | null;
  role: string;
  email_verified_at: Date | null;
  deleted_at: Date | null;
}

/**
 * Creates the per-user side tables (settings + default album) for a freshly
 * inserted user. Idempotent: settings use ON CONFLICT DO NOTHING and the
 * default album is only created when the user has none yet. Safe to call
 * inside an existing transaction.
 */
export async function provisionUserProfile(tx: Executor, userId: string): Promise<void> {
  await tx.query(
    `INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
    [userId],
  );

  const existing = await tx.query<{ id: string }>(
    `SELECT id FROM user_albums WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  if (existing.rows.length > 0) return;

  const { rows: catalogRows } = await tx.query<{
    type_id: string;
    edition_id: string;
    format_id: string;
  }>(
    `SELECT
       at.id  AS type_id,
       ae.id  AS edition_id,
       af.id  AS format_id
     FROM album_editions ae
     JOIN album_types  at ON at.id = ae.album_type_id
     JOIN album_formats af ON af.album_type_id = at.id
     WHERE at.key = $1
       AND ae.key = $2
       AND af.key = $3
     LIMIT 1`,
    [DEFAULT_ALBUM_TYPE_KEY, DEFAULT_ALBUM_EDITION_KEY, DEFAULT_ALBUM_FORMAT_KEY],
  );

  if (catalogRows.length === 0) {
    throw new Error('Default album type/edition/format not found — did migrations + seeds run?');
  }
  const { type_id, edition_id, format_id } = catalogRows[0]!;

  // Provisioning runs once per user with a fixed catalog tuple, so the first
  // slug never collides — derive it directly without a uniqueness probe.
  const slug = `${DEFAULT_ALBUM_TYPE_KEY}-${DEFAULT_ALBUM_EDITION_KEY}-${DEFAULT_ALBUM_FORMAT_KEY}`
    .toLowerCase().replace(/_/g, '-');

  await tx.query(
    `INSERT INTO user_albums
       (user_id, album_type_id, album_edition_id, album_format_id,
        is_default, trade_inventory_visibility, slug)
     VALUES ($1, $2, $3, $4, TRUE, 'public', $5)`,
    [userId, type_id, edition_id, format_id, slug],
  );
}

/**
 * Just-in-time provisioning for Cognito-authenticated users: the Cognito `sub`
 * is the canonical user id, so we upsert a users row keyed by that id and then
 * ensure its profile rows exist. Called on the first brokered login/refresh.
 * The `role` argument comes from the token's `cognito:groups` claim and is the
 * authority for authorization; the stored column is kept in sync for display.
 */
export async function ensureUser(
  db: Pool,
  params: {
    id: string;
    email: string;
    username: string;
    displayName?: string | null;
    role?: string;
    emailVerified?: boolean;
  },
): Promise<UserDto> {
  const email = params.email.toLowerCase().trim();
  const username = params.username.toLowerCase().trim();

  // Safety net: block new Cognito identities whose email was hard-banned.
  // Returning users (row already exists) are handled by the existing ban-check
  // middleware; this only gates first-ever provisioning.
  const { rows: existingRows } = await db.query<{ id: string }>(
    `SELECT id FROM users WHERE id = $1 LIMIT 1`,
    [params.id],
  );
  if (existingRows.length === 0) {
    const { rows: blockedRows } = await db.query<{ hashed_email: string }>(
      `SELECT hashed_email FROM banned_emails WHERE hashed_email = $1 LIMIT 1`,
      [hashEmailForBan(email)],
    );
    if (blockedRows.length > 0) {
      throw statusError('This email address is not eligible for registration.', 403);
    }
  }

  const row = await withTx(db, async (tx) => {
    // Insert for users who reach the broker without a row yet (e.g. the
    // Terraform-bootstrapped admin). For self-registered users the row already
    // exists from createUser(), so this is a no-op via ON CONFLICT.
    await tx.query(
      `INSERT INTO users (id, email, username, display_name, hashed_email, email_verified_at, role)
       VALUES ($1, $2, $3, $4, $5,
               CASE WHEN $6::boolean THEN now() ELSE NULL END,
               COALESCE($7, 'user'))
       ON CONFLICT (id) DO NOTHING`,
      [
        params.id,
        email,
        username,
        params.displayName ?? null,
        hashEmail(email),
        params.emailVerified === true,
        params.role ?? null,
      ],
    );

    // Sync the columns Cognito owns on every login: role from cognito:groups,
    // and email verification (a row created NULL at register flips once the
    // user confirms). COALESCE means we set verified once and never clear it.
    if (params.role || params.emailVerified) {
      await tx.query(
        `UPDATE users
            SET role = COALESCE($2, role),
                email_verified_at = CASE WHEN $3::boolean
                                          THEN COALESCE(email_verified_at, now())
                                          ELSE email_verified_at END,
                updated_at = now()
          WHERE id = $1`,
        [params.id, params.role ?? null, params.emailVerified === true],
      );
    }

    const { rows: userRows } = await tx.query<UserRow>(
      `SELECT id, email, username, display_name, role, email_verified_at, deleted_at
         FROM users WHERE id = $1 LIMIT 1`,
      [params.id],
    );
    const u = userRows[0]!;
    if (u.deleted_at) {
      throw statusError('This account has been deactivated.', 403);
    }

    await provisionUserProfile(tx, params.id);
    return u;
  });

  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.display_name,
    role: params.role ?? row.role,
    emailVerifiedAt: row.email_verified_at,
  };
}

/**
 * Creates the DB row + profile for a self-registered Cognito user, keyed by
 * the Cognito `sub`. Unlike ensureUser this does a plain insert (no ON
 * CONFLICT), so a duplicate username surfaces the unique-constraint violation
 * to the caller — that's how the username is reserved atomically at register
 * time rather than racily at first login. email_verified_at stays NULL until
 * the user confirms; ensureUser flips it on the first post-confirmation login.
 */
export async function createUser(
  db: Pool,
  params: { id: string; email: string; username: string; displayName?: string | null },
): Promise<void> {
  const email = params.email.toLowerCase().trim();
  const username = params.username.toLowerCase().trim();

  await withTx(db, async (tx) => {
    await tx.query(
      `INSERT INTO users (id, email, username, display_name, hashed_email)
       VALUES ($1, $2, $3, $4, $5)`,
      [params.id, email, username, params.displayName ?? null, hashEmail(email)],
    );
    await provisionUserProfile(tx, params.id);
  });
}
