import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import crypto from 'node:crypto';
import { withTx } from '../db/transaction.js';
import { enqueue } from './jobs.service.js';
import { recordAudit } from '../utils/audit.js';
import { statusError } from '../utils/errors.js';

function hashEmail(email: string): string {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
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
    throw statusError('Username is already taken.', 409);
  }

  const result = await db.query<{ username: string }>(
    `UPDATE users SET username = $1, updated_at = now()
     WHERE id = $2 AND deleted_at IS NULL
     RETURNING username`,
    [normalized, userId]
  );

  if ((result.rowCount ?? 0) === 0) {
    throw statusError('User not found.', 404);
  }

  await recordAudit(db, userId, 'username_changed', { to: normalized });

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
    throw statusError('Email is already registered.', 409);
  }

  const { username, code } = await withTx(db, async (client) => {
    const userResult = await client.query<{ username: string }>(
      `UPDATE users
       SET email = $1, hashed_email = $2, email_verified_at = NULL, updated_at = now()
       WHERE id = $3 AND deleted_at IS NULL
       RETURNING username`,
      [normalizedEmail, hashedEmail, userId]
    );

    if ((userResult.rowCount ?? 0) === 0) {
      throw statusError('User not found.', 404);
    }

    const { username: u } = userResult.rows[0]!;

    await client.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [userId]);
    const c = generateCode();
    await client.query(
      'INSERT INTO email_verification_tokens (token_hash, user_id) VALUES ($1, $2)',
      [hashToken(c), userId]
    );

    await recordAudit(client, userId, 'email_changed', { to: normalizedEmail });

    return { username: u, code: c };
  });

  await enqueue(redis, {
    type: 'email:verify',
    email: normalizedEmail,
    username,
    code,
  });

  return { email: normalizedEmail };
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
    throw statusError('User not found.', 404);
  }

  return { displayName: result.rows[0]!.display_name };
}

export async function updatePassword(db: Pool, userId: string): Promise<void> {
  // In local mode passwords are not stored — just audit-log the change.
  await recordAudit(db, userId, 'password_changed', null);
}

// ─── Preferences ─────────────────────────────────────────────────────────────

export interface City {
  label: string;
  placeId: number;
}

export type BaseVariantPreference = 'base_border' | 'base_borderless';
export type ProfileVisibility = 'public' | 'private';

export interface UserPreferences {
  duplicatesCountAllVariants: boolean;
  defaultBaseVariant: BaseVariantPreference;
  cities: City[];
  profileVisibility: ProfileVisibility;
  tradeMatchingEnabled: boolean;
}

export async function getPreferences(db: Pool, userId: string): Promise<UserPreferences> {
  const result = await db.query<{
    duplicates_count_all_variants: boolean;
    default_base_variant: BaseVariantPreference;
    cities: City[];
    profile_visibility: ProfileVisibility;
    trade_matching_enabled: boolean;
  }>(
    `SELECT duplicates_count_all_variants, default_base_variant, cities,
            profile_visibility, trade_matching_enabled
     FROM user_settings WHERE user_id = $1`,
    [userId]
  );

  if ((result.rowCount ?? 0) === 0) {
    return {
      duplicatesCountAllVariants: false,
      defaultBaseVariant: 'base_border',
      cities: [],
      profileVisibility: 'public',
      tradeMatchingEnabled: true,
    };
  }

  const row = result.rows[0]!;
  return {
    duplicatesCountAllVariants: row.duplicates_count_all_variants,
    defaultBaseVariant: row.default_base_variant,
    cities: row.cities ?? [],
    profileVisibility: row.profile_visibility,
    tradeMatchingEnabled: row.trade_matching_enabled,
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
  if (patch.defaultBaseVariant !== undefined) {
    setClauses.push(`default_base_variant = $${idx++}`);
    values.push(patch.defaultBaseVariant);
  }
  if (patch.cities !== undefined) {
    setClauses.push(`cities = $${idx++}::jsonb`);
    values.push(JSON.stringify(patch.cities));
  }
  if (patch.profileVisibility !== undefined) {
    setClauses.push(`profile_visibility = $${idx++}`);
    values.push(patch.profileVisibility);
  }
  if (patch.tradeMatchingEnabled !== undefined) {
    setClauses.push(`trade_matching_enabled = $${idx++}`);
    values.push(patch.tradeMatchingEnabled);
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
    throw statusError('User not found or already deleted.', 404);
  }

  await recordAudit(db, userId, 'account_deleted', null);
}
