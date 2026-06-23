import crypto from 'node:crypto';
import { promisify } from 'node:util';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { env } from '../env.js';
import { withTx } from '../db/transaction.js';
import { enqueue } from './jobs.service.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../middleware/auth.js';
import { statusError } from '../utils/errors.js';
import { provisionUserProfile, hashEmail, hashEmailForBan, deriveUniqueUsernameFromEmail } from './user-provisioning.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RegisterInput {
  email: string;
  username?: string;
  password: string;
  displayName?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    username: string;
    displayName: string | null;
    role: string;
    emailVerifiedAt: Date | null;
  };
}

interface UserRow {
  id: string;
  email: string;
  username: string;
  display_name: string | null;
  role: string;
  email_verified_at: Date | null;
  deleted_at: Date | null;
  password_hash: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// 6-digit numeric code, used for email verification and password reset. The
// cloud environments delegate these flows to Cognito; this local-mode code
// keeps the same {email, code} contract the frontend expects.
function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

// Tokens are stored as sha256(cleartext) at rest so a DB read can't yield a
// usable token; the cleartext only exists in the outgoing email link.
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const scryptAsync = promisify(crypto.scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString('hex')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  const derived = (await scryptAsync(password, salt!, 64)) as Buffer;
  const expected = Buffer.from(hash!, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(expected, derived);
}

function toUserOutput(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    emailVerifiedAt: row.email_verified_at,
  };
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * register — creates a new user account.
 * Sends a verification email. Does not log the user in.
 */
export async function register(
  db: Pool,
  redis: Redis,
  input: RegisterInput,
): Promise<{ userId: string; email: string; username: string }> {
  const normalizedEmail = input.email.toLowerCase().trim();
  const hashedEmail = hashEmail(normalizedEmail);

  const { rows: existingEmail } = await db.query<{ id: string }>(
    `SELECT id FROM users WHERE email = $1 LIMIT 1`,
    [normalizedEmail],
  );
  if (existingEmail.length > 0) throw statusError('Email is already registered.', 409);

  const { rows: blocked } = await db.query<{ hashed_email: string }>(
    `SELECT hashed_email FROM banned_emails WHERE hashed_email = $1 LIMIT 1`,
    [hashEmailForBan(normalizedEmail)],
  );
  if (blocked.length > 0) throw statusError('This email address is not eligible for registration.', 403);

  const providedUsername = input.username?.trim();
  let normalizedUsername: string;
  if (providedUsername) {
    normalizedUsername = providedUsername.toLowerCase();
    const { rows: takenRows } = await db.query<{ id: string }>(
      `SELECT id FROM users WHERE username = $1 LIMIT 1`,
      [normalizedUsername],
    );
    if (takenRows.length > 0) throw statusError('Username is already taken.', 409);
  } else {
    normalizedUsername = await deriveUniqueUsernameFromEmail(db, normalizedEmail);
  }

  const verificationCode = generateCode();
  const passwordHash = await hashPassword(input.password);

  const userId = await withTx(db, async (tx) => {
    const { rows: insertedRows } = await tx.query<{ id: string }>(
      `INSERT INTO users (email, username, display_name, hashed_email, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [normalizedEmail, normalizedUsername, input.displayName ?? null, hashedEmail, passwordHash],
    );
    const id = insertedRows[0]!.id;

    await provisionUserProfile(tx, id);

    await tx.query(
      `INSERT INTO email_verification_tokens (token_hash, user_id) VALUES ($1, $2)`,
      [hashToken(verificationCode), id],
    );

    return id;
  });

  await enqueue(redis, {
    type: 'email:verify',
    email: normalizedEmail,
    username: normalizedUsername,
    code: verificationCode,
  });

  return { userId, email: normalizedEmail, username: normalizedUsername };
}

/**
 * login — authenticates a user.
 */
export async function login(db: Pool, input: LoginInput): Promise<AuthTokens> {
  const normalizedEmail = input.email.toLowerCase().trim();

  const { rows } = await db.query<UserRow>(
    `SELECT id, email, username, display_name, role, email_verified_at, deleted_at, password_hash
       FROM users WHERE email = $1 LIMIT 1`,
    [normalizedEmail],
  );
  const user = rows[0];

  if (!user) throw statusError('Invalid email or password.', 401);
  if (user.deleted_at) throw statusError('This account has been deactivated.', 403);

  const isLocalNoPassword = env.AUTH_MODE === 'local' && !user.password_hash;
  if (!isLocalNoPassword && !(user.password_hash && await verifyPassword(input.password, user.password_hash))) {
    throw statusError('Invalid email or password.', 401);
  }

  const tokenPayload = { sub: user.id, email: user.email, role: user.role };
  return {
    accessToken: signAccessToken(tokenPayload),
    refreshToken: signRefreshToken(tokenPayload),
    user: toUserOutput(user),
  };
}

/**
 * refresh — exchanges a valid refresh token for new access + refresh tokens.
 */
export async function refresh(db: Pool, refreshToken: string): Promise<AuthTokens> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw statusError('Invalid or expired refresh token.', 401);
  }

  const { rows } = await db.query<UserRow>(
    `SELECT id, email, username, display_name, role, email_verified_at, deleted_at, password_hash
       FROM users WHERE id = $1 LIMIT 1`,
    [payload.sub],
  );
  const user = rows[0];

  if (!user) throw statusError('User not found.', 401);
  if (user.deleted_at) throw statusError('This account has been deactivated.', 403);

  const tokenPayload = { sub: user.id, email: user.email, role: user.role };
  return {
    accessToken: signAccessToken(tokenPayload),
    refreshToken: signRefreshToken(tokenPayload),
    user: toUserOutput(user),
  };
}

/**
 * verifyEmail — marks email_verified_at when given a valid token.
 */
export async function verifyEmail(db: Pool, email: string, code: string): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();
  const codeHash = hashToken(code);

  const { rows } = await db.query<{ user_id: string; expires_at: Date }>(
    `SELECT evt.user_id, evt.expires_at
       FROM email_verification_tokens evt
       JOIN users u ON u.id = evt.user_id
      WHERE u.email = $1 AND evt.token_hash = $2
      LIMIT 1`,
    [normalizedEmail, codeHash],
  );
  const row = rows[0];

  if (!row) throw statusError('Invalid verification code.', 400);
  if (new Date() > row.expires_at) throw statusError('Verification code has expired.', 410);

  await withTx(db, async (tx) => {
    await tx.query(
      `UPDATE users SET email_verified_at = now(), updated_at = now() WHERE id = $1`,
      [row.user_id],
    );
    await tx.query(
      `DELETE FROM email_verification_tokens WHERE user_id = $1`,
      [row.user_id],
    );
  });
}

/**
 * resendVerification — deletes existing tokens for a user, creates a new one, re-sends email.
 */
export async function resendVerification(db: Pool, redis: Redis, email: string): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();

  const { rows } = await db.query<{
    id: string;
    username: string;
    email_verified_at: Date | null;
    deleted_at: Date | null;
  }>(
    `SELECT id, username, email_verified_at, deleted_at
       FROM users WHERE email = $1 LIMIT 1`,
    [normalizedEmail],
  );
  const user = rows[0];

  // Always respond 204 to avoid user enumeration
  if (!user || user.deleted_at) return;
  if (user.email_verified_at) return;

  const code = generateCode();
  await withTx(db, async (tx) => {
    await tx.query(
      `DELETE FROM email_verification_tokens WHERE user_id = $1`,
      [user.id],
    );
    await tx.query(
      `INSERT INTO email_verification_tokens (token_hash, user_id) VALUES ($1, $2)`,
      [hashToken(code), user.id],
    );
  });

  await enqueue(redis, {
    type: 'email:verify',
    email: normalizedEmail,
    username: user.username,
    code,
  });
}

/**
 * forgotPassword — generates a reset token and emails it.
 * Always responds the same way regardless of whether email exists (anti-enumeration).
 */
export async function forgotPassword(db: Pool, redis: Redis, email: string): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();

  const { rows } = await db.query<{ id: string; username: string; deleted_at: Date | null }>(
    `SELECT id, username, deleted_at FROM users WHERE email = $1 LIMIT 1`,
    [normalizedEmail],
  );
  const user = rows[0];

  if (!user || user.deleted_at) return;

  const code = generateCode();
  try {
    await withTx(db, async (tx) => {
      await tx.query(`DELETE FROM password_reset_tokens WHERE user_id = $1`, [user.id]);
      await tx.query(
        `INSERT INTO password_reset_tokens (token_hash, user_id) VALUES ($1, $2)`,
        [hashToken(code), user.id],
      );
    });
  } catch (err) {
    console.error('[auth] forgotPassword error:', err);
    return;
  }

  await enqueue(redis, {
    type: 'email:reset',
    email: normalizedEmail,
    username: user.username,
    code,
  });
}

/**
 * resetPassword — validates the reset token and updates the user's password.
 */
export async function resetPassword(
  db: Pool,
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();
  const codeHash = hashToken(code);

  const { rows } = await db.query<{ user_id: string; expires_at: Date }>(
    `SELECT prt.user_id, prt.expires_at
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
      WHERE u.email = $1 AND prt.token_hash = $2
      LIMIT 1`,
    [normalizedEmail, codeHash],
  );
  const row = rows[0];

  if (!row || new Date() > row.expires_at) {
    throw statusError('Reset code is invalid or has expired.', 400);
  }

  const passwordHash = await hashPassword(newPassword);

  await withTx(db, async (tx) => {
    await tx.query(
      `UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`,
      [row.user_id, passwordHash],
    );
    await tx.query(
      `DELETE FROM password_reset_tokens WHERE user_id = $1`,
      [row.user_id],
    );
    await tx.query(
      `INSERT INTO audit_log (user_id, action) VALUES ($1, 'password_reset_completed')`,
      [row.user_id],
    );
  });
}
