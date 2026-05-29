import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { and, eq, sql } from 'drizzle-orm';
import { env } from '../env.js';
import type { Drizzle } from '../db/index.js';
import {
  users,
  emailVerificationTokens,
  passwordResetTokens,
  auditLog,
} from '../db/schema.js';
import type { Redis } from 'ioredis';
import { enqueue } from './jobs.service.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../middleware/auth.js';
import { statusError } from '../utils/errors.js';
import { provisionUserProfile, hashEmail, deriveUniqueUsernameFromEmail } from './user-provisioning.js';

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

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * register — creates a new user account.
 * Sends a verification email. Does not log the user in.
 */
export async function register(
  db: Drizzle,
  redis: Redis,
  input: RegisterInput,
): Promise<{ userId: string; email: string; username: string }> {
  const normalizedEmail = input.email.toLowerCase().trim();
  const hashedEmail = hashEmail(normalizedEmail);

  const [existingEmail] = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail)).limit(1);
  if (existingEmail) throw statusError('Email is already registered.', 409);

  const providedUsername = input.username?.trim();
  let normalizedUsername: string;
  if (providedUsername) {
    normalizedUsername = providedUsername.toLowerCase();
    const [existingUsername] = await db.select({ id: users.id }).from(users).where(eq(users.username, normalizedUsername)).limit(1);
    if (existingUsername) throw statusError('Username is already taken.', 409);
  } else {
    normalizedUsername = await deriveUniqueUsernameFromEmail(db, normalizedEmail);
  }

  const verificationCode = generateCode();
  const passwordHash = await hashPassword(input.password);

  const userId = await db.transaction(async (tx) => {
    const [newUser] = await tx
      .insert(users)
      .values({
        email: normalizedEmail,
        username: normalizedUsername,
        displayName: input.displayName ?? null,
        hashedEmail,
        passwordHash,
      })
      .returning({ id: users.id });

    const id = newUser!.id;

    await provisionUserProfile(tx, id);

    await tx.insert(emailVerificationTokens).values({
      tokenHash: hashToken(verificationCode),
      userId: id,
    });

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
export async function login(db: Drizzle, input: LoginInput): Promise<AuthTokens> {
  const normalizedEmail = input.email.toLowerCase().trim();

  const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);

  if (!user) throw statusError('Invalid email or password.', 401);
  if (user.deletedAt) throw statusError('This account has been deactivated.', 403);

  const isLocalNoPassword = env.AUTH_MODE === 'local' && !user.passwordHash;
  if (!isLocalNoPassword && !(user.passwordHash && await verifyPassword(input.password, user.passwordHash))) {
    throw statusError('Invalid email or password.', 401);
  }

  const tokenPayload = { sub: user.id, email: user.email, role: user.role };
  const accessToken = signAccessToken(tokenPayload);
  const refreshToken = signRefreshToken(tokenPayload);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      emailVerifiedAt: user.emailVerifiedAt,
    },
  };
}

/**
 * refresh — exchanges a valid refresh token for new access + refresh tokens.
 */
export async function refresh(db: Drizzle, refreshToken: string): Promise<AuthTokens> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw statusError('Invalid or expired refresh token.', 401);
  }

  const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);

  if (!user) throw statusError('User not found.', 401);
  if (user.deletedAt) throw statusError('This account has been deactivated.', 403);

  const tokenPayload = { sub: user.id, email: user.email, role: user.role };
  return {
    accessToken: signAccessToken(tokenPayload),
    refreshToken: signRefreshToken(tokenPayload),
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      emailVerifiedAt: user.emailVerifiedAt,
    },
  };
}

/**
 * verifyEmail — marks email_verified_at when given a valid token.
 */
export async function verifyEmail(db: Drizzle, email: string, code: string): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();
  const codeHash = hashToken(code);

  const [row] = await db
    .select({ userId: emailVerificationTokens.userId, expiresAt: emailVerificationTokens.expiresAt })
    .from(emailVerificationTokens)
    .innerJoin(users, eq(users.id, emailVerificationTokens.userId))
    .where(and(eq(users.email, normalizedEmail), eq(emailVerificationTokens.tokenHash, codeHash)))
    .limit(1);

  if (!row) throw statusError('Invalid verification code.', 400);
  if (new Date() > row.expiresAt) throw statusError('Verification code has expired.', 410);

  await db.transaction(async (tx) => {
    await tx.update(users).set({ emailVerifiedAt: sql`now()`, updatedAt: sql`now()` }).where(eq(users.id, row.userId));
    await tx.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, row.userId));
  });
}

/**
 * resendVerification — deletes existing tokens for a user, creates a new one, re-sends email.
 */
export async function resendVerification(db: Drizzle, redis: Redis, email: string): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();

  const [user] = await db
    .select({ id: users.id, username: users.username, emailVerifiedAt: users.emailVerifiedAt, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  // Always respond 204 to avoid user enumeration
  if (!user || user.deletedAt) return;
  if (user.emailVerifiedAt) return;

  const code = generateCode();
  await db.transaction(async (tx) => {
    await tx.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, user.id));
    await tx.insert(emailVerificationTokens).values({ tokenHash: hashToken(code), userId: user.id });
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
export async function forgotPassword(db: Drizzle, redis: Redis, email: string): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();

  const [user] = await db
    .select({ id: users.id, username: users.username, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (!user || user.deletedAt) return;

  const code = generateCode();
  try {
    await db.transaction(async (tx) => {
      await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
      await tx.insert(passwordResetTokens).values({ tokenHash: hashToken(code), userId: user.id });
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
  db: Drizzle,
  email: string,
  code: string,
  newPassword: string
): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();
  const codeHash = hashToken(code);

  const [row] = await db
    .select({ userId: passwordResetTokens.userId, expiresAt: passwordResetTokens.expiresAt })
    .from(passwordResetTokens)
    .innerJoin(users, eq(users.id, passwordResetTokens.userId))
    .where(and(eq(users.email, normalizedEmail), eq(passwordResetTokens.tokenHash, codeHash)))
    .limit(1);

  if (!row || new Date() > row.expiresAt) {
    throw statusError('Reset code is invalid or has expired.', 400);
  }

  const passwordHash = await hashPassword(newPassword);

  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, updatedAt: sql`now()` }).where(eq(users.id, row.userId));
    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, row.userId));
    await tx.insert(auditLog).values({ userId: row.userId, action: 'password_reset_completed' });
  });
}
