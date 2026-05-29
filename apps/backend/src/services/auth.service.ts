import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { eq, sql } from 'drizzle-orm';
import { env } from '../env.js';
import type { Drizzle } from '../db/index.js';
import {
  users,
  userSettings,
  userAlbums,
  albumTypes,
  albumEditions,
  albumFormats,
  emailVerificationTokens,
  passwordResetTokens,
  auditLog,
} from '../db/schema.js';
import { DEFAULT_ALBUM_TYPE_KEY, DEFAULT_ALBUM_EDITION_KEY, DEFAULT_ALBUM_FORMAT_KEY } from '../constants.js';
import type { Redis } from 'ioredis';
import { enqueue } from './jobs.service.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../middleware/auth.js';
import { statusError } from '../utils/errors.js';

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
  const normalizedUsername = input.username.toLowerCase().trim();
  const hashedEmail = hashEmail(normalizedEmail);

  const [existingEmail] = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail)).limit(1);
  if (existingEmail) throw statusError('Email is already registered.', 409);

  const [existingUsername] = await db.select({ id: users.id }).from(users).where(eq(users.username, normalizedUsername)).limit(1);
  if (existingUsername) throw statusError('Username is already taken.', 409);

  const verificationToken = generateToken();
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

    await tx.insert(userSettings).values({ userId: id });

    // Look up album_type_id, album_edition_id, and album_format_id for the default album
    const [albumIds] = await tx
      .select({
        typeId: albumTypes.id,
        editionId: albumEditions.id,
        formatId: albumFormats.id,
      })
      .from(albumEditions)
      .innerJoin(albumTypes, eq(albumTypes.id, albumEditions.albumTypeId))
      .innerJoin(albumFormats, eq(albumFormats.albumTypeId, albumTypes.id))
      .where(sql`${albumTypes.key} = ${DEFAULT_ALBUM_TYPE_KEY}
              AND ${albumEditions.key} = ${DEFAULT_ALBUM_EDITION_KEY}
              AND ${albumFormats.key}  = ${DEFAULT_ALBUM_FORMAT_KEY}`)
      .limit(1);

    if (!albumIds) {
      throw new Error('Default album type/edition/format not found — did migrations + seeds run?');
    }

    await tx.insert(userAlbums).values({
      userId: id,
      albumTypeId: albumIds.typeId,
      albumEditionId: albumIds.editionId,
      albumFormatId: albumIds.formatId,
      isDefault: true,
    });

    await tx.insert(emailVerificationTokens).values({
      tokenHash: hashToken(verificationToken),
      userId: id,
    });

    return id;
  });

  await enqueue(redis, {
    type: 'email:verify',
    email: normalizedEmail,
    username: normalizedUsername,
    token: verificationToken,
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
export async function verifyEmail(db: Drizzle, token: string): Promise<void> {
  const tokenHash = hashToken(token);
  const [row] = await db
    .select({ userId: emailVerificationTokens.userId, expiresAt: emailVerificationTokens.expiresAt })
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.tokenHash, tokenHash))
    .limit(1);

  if (!row) throw statusError('Verification token not found.', 404);
  if (new Date() > row.expiresAt) throw statusError('Verification token has expired.', 410);

  await db.transaction(async (tx) => {
    await tx.update(users).set({ emailVerifiedAt: sql`now()`, updatedAt: sql`now()` }).where(eq(users.id, row.userId));
    await tx.delete(emailVerificationTokens).where(eq(emailVerificationTokens.tokenHash, tokenHash));
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

  const token = generateToken();
  await db.transaction(async (tx) => {
    await tx.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, user.id));
    await tx.insert(emailVerificationTokens).values({ tokenHash: hashToken(token), userId: user.id });
  });

  await enqueue(redis, {
    type: 'email:verify',
    email: normalizedEmail,
    username: user.username,
    token,
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

  const token = generateToken();
  try {
    await db.transaction(async (tx) => {
      await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
      await tx.insert(passwordResetTokens).values({ tokenHash: hashToken(token), userId: user.id });
    });
  } catch (err) {
    console.error('[auth] forgotPassword error:', err);
    return;
  }

  await enqueue(redis, {
    type: 'email:reset',
    email: normalizedEmail,
    username: user.username,
    token,
  });
}

/**
 * resetPassword — validates the reset token and updates the user's password.
 */
export async function resetPassword(
  db: Drizzle,
  token: string,
  newPassword: string
): Promise<void> {
  const tokenHash = hashToken(token);
  const [row] = await db
    .select({ userId: passwordResetTokens.userId, expiresAt: passwordResetTokens.expiresAt })
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);

  if (!row || new Date() > row.expiresAt) {
    throw statusError('Reset token is invalid or has expired.', 400);
  }

  const passwordHash = await hashPassword(newPassword);

  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, updatedAt: sql`now()` }).where(eq(users.id, row.userId));
    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, tokenHash));
    await tx.insert(auditLog).values({ userId: row.userId, action: 'password_reset_completed' });
  });
}
