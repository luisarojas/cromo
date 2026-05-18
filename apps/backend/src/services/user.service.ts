import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import crypto from 'node:crypto';
import { enqueue } from './jobs.service.js';

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

  await db.query(
    `INSERT INTO audit_log (user_id, action, metadata)
     VALUES ($1, 'username_changed', $2::jsonb)`,
    [userId, JSON.stringify({ to: normalized })]
  );

  return { username: result.rows[0]!.username };
}

export async function updateEmail(
  db: Pool,
  redis: Redis,
  userId: string,
  newEmail: string,
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

    await client.query(
      `INSERT INTO audit_log (user_id, action, metadata)
       VALUES ($1, 'email_changed', $2::jsonb)`,
      [userId, JSON.stringify({ to: normalizedEmail })]
    );

    await client.query('COMMIT');

    await enqueue(redis, {
      type: 'email:verify',
      email: normalizedEmail,
      username,
      token,
    });

    return { email: normalizedEmail };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateDisplayName(
  db: Pool,
  userId: string,
  displayName: string | null
): Promise<{ displayName: string | null }> {
  const trimmed = displayName?.trim() || null;

  const result = await db.query<{ display_name: string | null }>(
    `UPDATE users SET display_name = $1, updated_at = now()
     WHERE id = $2 AND deleted_at IS NULL
     RETURNING display_name`,
    [trimmed, userId]
  );

  if ((result.rowCount ?? 0) === 0) {
    const err = new Error('User not found.') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  return { displayName: result.rows[0]!.display_name };
}

export async function updatePassword(db: Pool, userId: string): Promise<void> {
  // In local mode passwords are not stored — just audit-log the change.
  await db.query(
    `INSERT INTO audit_log (user_id, action) VALUES ($1, 'password_changed')`,
    [userId]
  );
}

// ─── Preferences ─────────────────────────────────────────────────────────────

export interface City {
  label: string;
  placeId: number;
}

export interface UserPreferences {
  duplicatesCountAllVariants: boolean;
  cities: City[];
}

export async function getPreferences(db: Pool, userId: string): Promise<UserPreferences> {
  const result = await db.query<{
    duplicates_count_all_variants: boolean;
    cities: City[];
  }>(
    `SELECT duplicates_count_all_variants, cities FROM user_settings WHERE user_id = $1`,
    [userId]
  );

  if ((result.rowCount ?? 0) === 0) {
    return { duplicatesCountAllVariants: false, cities: [] };
  }

  const row = result.rows[0]!;
  return {
    duplicatesCountAllVariants: row.duplicates_count_all_variants,
    cities: row.cities ?? [],
  };
}

export async function updatePreferences(
  db: Pool,
  userId: string,
  patch: Partial<UserPreferences>
): Promise<UserPreferences> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (patch.duplicatesCountAllVariants !== undefined) {
    setClauses.push(`duplicates_count_all_variants = $${idx++}`);
    values.push(patch.duplicatesCountAllVariants);
  }
  if (patch.cities !== undefined) {
    setClauses.push(`cities = $${idx++}::jsonb`);
    values.push(JSON.stringify(patch.cities));
  }

  if (setClauses.length === 0) return getPreferences(db, userId);

  values.push(userId);
  await db.query(
    `UPDATE user_settings SET ${setClauses.join(', ')} WHERE user_id = $${idx}`,
    values
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
