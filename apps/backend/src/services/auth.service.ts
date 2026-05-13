import type { Pool } from 'pg';
import crypto from 'node:crypto';
import { env } from '../env.js';
import { sendVerificationEmail, sendPasswordResetEmail } from './email.service.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../middleware/auth.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RegisterInput {
  email: string;
  username: string;
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hashEmail(email: string): string {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * register — creates a new user account.
 * Sends a verification email. Does not log the user in.
 */
export async function register(
  db: Pool,
  input: RegisterInput
): Promise<{ userId: string; email: string; username: string }> {
  const { email, username, displayName } = input;
  const normalizedEmail = email.toLowerCase().trim();
  const hashedEmail = hashEmail(normalizedEmail);

  // Check for existing email
  const existingEmail = await db.query<{ id: string }>(
    'SELECT id FROM users WHERE email = $1 LIMIT 1',
    [normalizedEmail]
  );
  if ((existingEmail.rowCount ?? 0) > 0) {
    const err = new Error('Email is already registered.') as Error & { statusCode: number };
    err.statusCode = 409;
    throw err;
  }

  // Check for existing username
  const existingUsername = await db.query<{ id: string }>(
    'SELECT id FROM users WHERE username = $1 LIMIT 1',
    [username.toLowerCase().trim()]
  );
  if ((existingUsername.rowCount ?? 0) > 0) {
    const err = new Error('Username is already taken.') as Error & { statusCode: number };
    err.statusCode = 409;
    throw err;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Insert user (no password_hash — local mode accepts any password)
    const userResult = await client.query<{ id: string }>(
      `INSERT INTO users (email, username, display_name, hashed_email)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [normalizedEmail, username.toLowerCase().trim(), displayName ?? null, hashedEmail]
    );

    const userId = userResult.rows[0]!.id;

    // Insert default settings
    await client.query(
      'INSERT INTO user_settings (user_id) VALUES ($1)',
      [userId]
    );

    // Create default album
    await client.query(
      `INSERT INTO user_albums (user_id, album_type_key, edition, is_default)
       VALUES ($1, 'fifa_world_cup_2026', 'north_america', true)`,
      [userId]
    );

    // Create verification token
    const token = generateToken();
    await client.query(
      `INSERT INTO email_verification_tokens (token, user_id)
       VALUES ($1, $2)`,
      [token, userId]
    );

    await client.query('COMMIT');

    // Send verification email (don't block registration if email fails)
    sendVerificationEmail(normalizedEmail, username, token).catch((err) => {
      console.error('[auth] Failed to send verification email:', err);
    });

    return { userId, email: normalizedEmail, username: username.toLowerCase().trim() };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * login — authenticates a user.
 * In AUTH_MODE=local: any password is accepted; user must exist.
 * Returns access + refresh tokens.
 */
export async function login(db: Pool, input: LoginInput): Promise<AuthTokens> {
  const { email, password: _password } = input;  // _password unused in local mode
  const normalizedEmail = email.toLowerCase().trim();

  const result = await db.query<{
    id: string;
    email: string;
    username: string;
    display_name: string | null;
    role: string;
    email_verified_at: Date | null;
    deleted_at: Date | null;
  }>(
    `SELECT id, email, username, display_name, role, email_verified_at, deleted_at
     FROM users
     WHERE email = $1
     LIMIT 1`,
    [normalizedEmail]
  );

  if ((result.rowCount ?? 0) === 0) {
    const err = new Error('Invalid email or password.') as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }

  const user = result.rows[0]!;

  if (user.deleted_at) {
    const err = new Error('This account has been deactivated.') as Error & { statusCode: number };
    err.statusCode = 403;
    throw err;
  }

  // In AUTH_MODE=local: skip password verification entirely
  if (env.AUTH_MODE !== 'local') {
    // Phase B: Cognito validation would go here
    const err = new Error('AUTH_MODE not supported.') as Error & { statusCode: number };
    err.statusCode = 501;
    throw err;
  }

  const tokenPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
  };

  const accessToken = signAccessToken(tokenPayload);
  const refreshToken = signRefreshToken(tokenPayload);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      emailVerifiedAt: user.email_verified_at,
    },
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
    const err = new Error('Invalid or expired refresh token.') as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }

  const result = await db.query<{
    id: string;
    email: string;
    username: string;
    display_name: string | null;
    role: string;
    email_verified_at: Date | null;
    deleted_at: Date | null;
  }>(
    `SELECT id, email, username, display_name, role, email_verified_at, deleted_at
     FROM users WHERE id = $1 LIMIT 1`,
    [payload.sub]
  );

  if ((result.rowCount ?? 0) === 0) {
    const err = new Error('User not found.') as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }

  const user = result.rows[0]!;

  if (user.deleted_at) {
    const err = new Error('This account has been deactivated.') as Error & { statusCode: number };
    err.statusCode = 403;
    throw err;
  }

  const tokenPayload = { sub: user.id, email: user.email, role: user.role };
  const newAccessToken = signAccessToken(tokenPayload);
  const newRefreshToken = signRefreshToken(tokenPayload);

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      emailVerifiedAt: user.email_verified_at,
    },
  };
}

/**
 * verifyEmail — marks email_verified_at when given a valid token.
 */
export async function verifyEmail(db: Pool, token: string): Promise<void> {
  const result = await db.query<{ user_id: string; expires_at: Date }>(
    'SELECT user_id, expires_at FROM email_verification_tokens WHERE token = $1 LIMIT 1',
    [token]
  );

  if ((result.rowCount ?? 0) === 0) {
    const err = new Error('Verification token not found.') as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  const row = result.rows[0]!;

  if (new Date() > row.expires_at) {
    const err = new Error('Verification token has expired.') as Error & { statusCode: number };
    err.statusCode = 410;
    throw err;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE users SET email_verified_at = now(), updated_at = now() WHERE id = $1',
      [row.user_id]
    );
    await client.query(
      'DELETE FROM email_verification_tokens WHERE token = $1',
      [token]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * resendVerification — deletes existing tokens for a user, creates a new one, re-sends email.
 */
export async function resendVerification(db: Pool, email: string): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();

  const userResult = await db.query<{
    id: string;
    username: string;
    email_verified_at: Date | null;
  }>(
    'SELECT id, username, email_verified_at FROM users WHERE email = $1 AND deleted_at IS NULL LIMIT 1',
    [normalizedEmail]
  );

  // Always respond 204 to avoid user enumeration
  if ((userResult.rowCount ?? 0) === 0) return;

  const user = userResult.rows[0]!;

  if (user.email_verified_at) return; // Already verified — silently succeed

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM email_verification_tokens WHERE user_id = $1',
      [user.id]
    );
    const token = generateToken();
    await client.query(
      'INSERT INTO email_verification_tokens (token, user_id) VALUES ($1, $2)',
      [token, user.id]
    );
    await client.query('COMMIT');

    sendVerificationEmail(normalizedEmail, user.username, token).catch((err) => {
      console.error('[auth] Failed to resend verification email:', err);
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * forgotPassword — generates a reset token and emails it.
 * Always responds the same way regardless of whether email exists (anti-enumeration).
 */
export async function forgotPassword(db: Pool, email: string): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();

  const userResult = await db.query<{ id: string; username: string }>(
    'SELECT id, username FROM users WHERE email = $1 AND deleted_at IS NULL LIMIT 1',
    [normalizedEmail]
  );

  if ((userResult.rowCount ?? 0) === 0) return; // Silently succeed

  const user = userResult.rows[0]!;
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour

  // Store token in Redis with TTL
  // Key: pwd_reset:<token> → userId
  // We use Redis here to avoid adding a separate DB table for Phase A1.
  // If Redis is unavailable, fall through gracefully.
  try {
    const redisKey = `pwd_reset:${token}`;
    // We store via raw query to db since we may not have the fastify instance here.
    // Alternative: caller passes redis client. For simplicity, store in DB.
    await db.query(
      `INSERT INTO audit_log (user_id, action, metadata)
       VALUES ($1, 'password_reset_requested', $2)`,
      [user.id, JSON.stringify({ token, expires_at: expiresAt.toISOString() })]
    );

    sendPasswordResetEmail(normalizedEmail, user.username, token).catch((err) => {
      console.error('[auth] Failed to send password reset email:', err);
    });

    void redisKey; // suppress unused warning — used in Phase B Redis integration
  } catch (err) {
    console.error('[auth] forgotPassword error:', err);
  }
}

/**
 * resetPassword — in local mode, this is a no-op (passwords not validated).
 * Logs the action for audit purposes.
 */
export async function resetPassword(
  db: Pool,
  token: string,
  _newPassword: string
): Promise<void> {
  if (env.AUTH_MODE === 'local') {
    // In local mode, any password is accepted — just validate the token exists in audit_log
    const result = await db.query<{ user_id: string }>(
      `SELECT user_id FROM audit_log
       WHERE action = 'password_reset_requested'
         AND metadata->>'token' = $1
         AND occurred_at > now() - INTERVAL '1 hour'
       ORDER BY occurred_at DESC
       LIMIT 1`,
      [token]
    );

    if ((result.rowCount ?? 0) === 0) {
      const err = new Error('Reset token is invalid or has expired.') as Error & {
        statusCode: number;
      };
      err.statusCode = 400;
      throw err;
    }

    await db.query(
      `INSERT INTO audit_log (user_id, action, metadata)
       VALUES ($1, 'password_reset_completed', $2)`,
      [result.rows[0]!.user_id, JSON.stringify({ token })]
    );

    return;
  }

  const err = new Error('AUTH_MODE not supported for password reset.') as Error & {
    statusCode: number;
  };
  err.statusCode = 501;
  throw err;
}
