import type { Pool } from 'pg';
import crypto from 'node:crypto';
import { sendVerificationEmail } from './email.service.js';

function hashEmail(email: string): string {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function updateUsername(
  db: Pool,
  userId: string,
  newUsername: string
): Promise<{ username: string }> {
  const normalized = newUsername.toLowerCase().trim();

  const existing = await db.query<{ id: string }>(
    'SELECT id FROM users WHERE username = $1 AND id != $2 LIMIT 1',
    [normalized, userId]
  );
  if ((existing.rowCount ?? 0) > 0) {
    const err = new Error('Username is already taken.') as Error & { statusCode: number };
    err.statusCode = 409;
    throw err;
  }

  const result = await db.query<{ username: string }>(
    `UPDATE users SET username = $1, updated_at = now()
     WHERE id = $2 AND deleted_at IS NULL
     RETURNING username`,
    [normalized, userId]
  );

  if ((result.rowCount ?? 0) === 0) {
    const err = new Error('User not found.') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  return { username: result.rows[0]!.username };
}

export async function updateEmail(
  db: Pool,
  userId: string,
  newEmail: string
): Promise<{ email: string }> {
  const normalizedEmail = newEmail.toLowerCase().trim();
  const hashedEmail = hashEmail(normalizedEmail);

  const existing = await db.query<{ id: string }>(
    'SELECT id FROM users WHERE email = $1 AND id != $2 LIMIT 1',
    [normalizedEmail, userId]
  );
  if ((existing.rowCount ?? 0) > 0) {
    const err = new Error('Email is already registered.') as Error & { statusCode: number };
    err.statusCode = 409;
    throw err;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const userResult = await client.query<{ username: string }>(
      `UPDATE users
       SET email = $1, hashed_email = $2, email_verified_at = NULL, updated_at = now()
       WHERE id = $3 AND deleted_at IS NULL
       RETURNING username`,
      [normalizedEmail, hashedEmail, userId]
    );

    if ((userResult.rowCount ?? 0) === 0) {
      await client.query('ROLLBACK');
      const err = new Error('User not found.') as Error & { statusCode: number };
      err.statusCode = 404;
      throw err;
    }

    const { username } = userResult.rows[0]!;

    await client.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [userId]);
    const token = generateToken();
    await client.query(
      'INSERT INTO email_verification_tokens (token, user_id) VALUES ($1, $2)',
      [token, userId]
    );

    await client.query('COMMIT');

    sendVerificationEmail(normalizedEmail, username, token).catch((e) => {
      console.error('[user] Failed to send verification email after email change:', e);
    });

    return { email: normalizedEmail };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updatePassword(db: Pool, userId: string): Promise<void> {
  // In local mode passwords are not stored — just audit-log the change.
  await db.query(
    `INSERT INTO audit_log (user_id, action) VALUES ($1, 'password_changed')`,
    [userId]
  );
}

// ─── Preferences ─────────────────────────────────────────────────────────────

export interface UserPreferences {
  duplicatesCountAllVariants: boolean;
}

export async function getPreferences(db: Pool, userId: string): Promise<UserPreferences> {
  const result = await db.query<{ duplicates_count_all_variants: boolean }>(
    `SELECT duplicates_count_all_variants FROM user_settings WHERE user_id = $1`,
    [userId]
  );

  if ((result.rowCount ?? 0) === 0) {
    return { duplicatesCountAllVariants: false };
  }

  return { duplicatesCountAllVariants: result.rows[0]!.duplicates_count_all_variants };
}

export async function updatePreferences(
  db: Pool,
  userId: string,
  patch: Partial<UserPreferences>
): Promise<UserPreferences> {
  if (patch.duplicatesCountAllVariants === undefined) return getPreferences(db, userId);

  await db.query(
    `UPDATE user_settings SET duplicates_count_all_variants = $1 WHERE user_id = $2`,
    [patch.duplicatesCountAllVariants, userId]
  );

  return getPreferences(db, userId);
}

export async function deleteAccount(db: Pool, userId: string): Promise<void> {
  const result = await db.query(
    `UPDATE users SET deleted_at = now(), updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL`,
    [userId]
  );

  if ((result.rowCount ?? 0) === 0) {
    const err = new Error('User not found or already deleted.') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  await db.query(
    `INSERT INTO audit_log (user_id, action) VALUES ($1, 'account_deleted')`,
    [userId]
  );
}
