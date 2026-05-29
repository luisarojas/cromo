import crypto from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { Drizzle } from '../db/index.js';
import {
  users,
  userSettings,
  userAlbums,
  albumTypes,
  albumEditions,
  albumFormats,
} from '../db/schema.js';
import {
  DEFAULT_ALBUM_TYPE_KEY,
  DEFAULT_ALBUM_EDITION_KEY,
  DEFAULT_ALBUM_FORMAT_KEY,
} from '../constants.js';
import { statusError } from '../utils/errors.js';

// Any drizzle transaction or the root db handle.
type Executor = Drizzle | Parameters<Parameters<Drizzle['transaction']>[0]>[0];

export function hashEmail(email: string): string {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

export interface UserDto {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  role: string;
  emailVerifiedAt: Date | null;
}

/**
 * Creates the per-user side tables (settings + default album) for a freshly
 * inserted user. Idempotent: settings use ON CONFLICT DO NOTHING and the
 * default album is only created when the user has none yet. Safe to call
 * inside an existing transaction.
 */
export async function provisionUserProfile(tx: Executor, userId: string): Promise<void> {
  await tx.insert(userSettings).values({ userId }).onConflictDoNothing();

  const [existingAlbum] = await tx
    .select({ id: userAlbums.id })
    .from(userAlbums)
    .where(eq(userAlbums.userId, userId))
    .limit(1);
  if (existingAlbum) return;

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
    userId,
    albumTypeId: albumIds.typeId,
    albumEditionId: albumIds.editionId,
    albumFormatId: albumIds.formatId,
    isDefault: true,
  });
}

/**
 * Just-in-time provisioning for Cognito-authenticated users: the Cognito `sub`
 * is the canonical user id, so we upsert a users row keyed by that id and then
 * ensure its profile rows exist. Called on the first brokered login/refresh.
 * The `role` argument comes from the token's `cognito:groups` claim and is the
 * authority for authorization; the stored column is kept in sync for display.
 */
export async function ensureUser(
  db: Drizzle,
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

  const row = await db.transaction(async (tx) => {
    // Insert for users who reach the broker without a row yet (e.g. the
    // Terraform-bootstrapped admin). For self-registered users the row already
    // exists from createUser(), so this is a no-op.
    await tx
      .insert(users)
      .values({
        id: params.id,
        email,
        username,
        displayName: params.displayName ?? null,
        hashedEmail: hashEmail(email),
        emailVerifiedAt: params.emailVerified ? sql`now()` : null,
        ...(params.role ? { role: params.role } : {}),
      })
      .onConflictDoNothing({ target: users.id });

    // Sync the columns Cognito owns on every login: role from cognito:groups,
    // and email verification (a row created NULL at register flips once the
    // user confirms). COALESCE means we set verified once and never clear it.
    const updates: Record<string, unknown> = {};
    if (params.role) updates.role = params.role;
    if (params.emailVerified) updates.emailVerifiedAt = sql`COALESCE(${users.emailVerifiedAt}, now())`;
    if (Object.keys(updates).length > 0) {
      updates.updatedAt = sql`now()`;
      await tx.update(users).set(updates).where(eq(users.id, params.id));
    }

    const [u] = await tx.select().from(users).where(eq(users.id, params.id)).limit(1);
    if (u!.deletedAt) {
      throw statusError('This account has been deactivated.', 403);
    }

    await provisionUserProfile(tx, params.id);
    return u!;
  });

  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.displayName,
    role: params.role ?? row.role,
    emailVerifiedAt: row.emailVerifiedAt,
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
  db: Drizzle,
  params: { id: string; email: string; username: string; displayName?: string | null },
): Promise<void> {
  const email = params.email.toLowerCase().trim();
  const username = params.username.toLowerCase().trim();

  await db.transaction(async (tx) => {
    await tx.insert(users).values({
      id: params.id,
      email,
      username,
      displayName: params.displayName ?? null,
      hashedEmail: hashEmail(email),
    });
    await provisionUserProfile(tx, params.id);
  });
}
