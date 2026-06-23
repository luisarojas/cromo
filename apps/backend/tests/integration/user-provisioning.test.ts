import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  hashEmail,
  hashEmailForBan,
  canonicalizeEmailForBan,
  deriveUniqueUsernameFromEmail,
  provisionUserProfile,
  ensureUser,
  createUser,
} from '../../src/services/user-provisioning.js';
const HAS_REAL_DB =
  typeof process.env['DATABASE_URL'] === 'string' &&
  process.env['DATABASE_URL'].includes('@') &&
  !process.env['DATABASE_URL'].includes('placeholder');
const HAS_REAL_REDIS =
  typeof process.env['REDIS_URL'] === 'string' &&
  process.env['REDIS_URL'].startsWith('redis://');
const shouldRun = HAS_REAL_DB && HAS_REAL_REDIS;

const NEW_USER_ID    = '00000000-0000-0000-0000-aaaaaaaaaaaa';
const SECOND_USER_ID = '00000000-0000-0000-0000-bbbbbbbbbbbb';
const NEW_EMAIL    = 'provision-test@cromo.test';
const SECOND_EMAIL = 'second-test@cromo.test';

describe.skipIf(!shouldRun)('user-provisioning (integration, real DB)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app.js');
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.db.query(`DELETE FROM users WHERE id IN ($1, $2)`, [NEW_USER_ID, SECOND_USER_ID]);
    await app.db.query(`DELETE FROM banned_emails WHERE hashed_email = $1`, [hashEmailForBan(NEW_EMAIL)]);
    await app?.close();
  });

  beforeEach(async () => {
    // Wipe to a clean slate so order independence is guaranteed.
    await app.db.query(`DELETE FROM users WHERE id IN ($1, $2)`, [NEW_USER_ID, SECOND_USER_ID]);
    await app.db.query(`DELETE FROM banned_emails WHERE hashed_email = $1`, [hashEmailForBan(NEW_EMAIL)]);
  });

  // ── Pure helpers ──────────────────────────────────────────────────────────

  describe('hashEmail / canonicalizeEmailForBan / hashEmailForBan', () => {
    it('hashEmail is case- and whitespace-insensitive', () => {
      expect(hashEmail(' Foo@BAR.com  ')).toBe(hashEmail('foo@bar.com'));
    });

    it('canonicalizeEmailForBan strips +tags so plus-addressing collapses', () => {
      expect(canonicalizeEmailForBan('foo+spam@host.com')).toBe('foo@host.com');
      expect(canonicalizeEmailForBan('FOO+a+b@host.com')).toBe('foo@host.com');
    });

    it('hashEmailForBan treats plus-addressed variants as the same hash', () => {
      expect(hashEmailForBan('foo+a@host.com')).toBe(hashEmailForBan('foo@host.com'));
      // …but two different local parts must hash differently.
      expect(hashEmailForBan('foo@host.com')).not.toBe(hashEmailForBan('bar@host.com'));
    });
  });

  describe('deriveUniqueUsernameFromEmail', () => {
    it('returns the email local-part when it is available', async () => {
      // alice@test.local exists; a brand-new email's local-part should be free.
      const out = await deriveUniqueUsernameFromEmail(app.db, 'noone-' + Date.now() + '@x.com');
      expect(out).toMatch(/^noone-/);
    });

    it('appends a numeric suffix when the base is taken', async () => {
      const out = await deriveUniqueUsernameFromEmail(app.db, 'alice@x.com');
      expect(out).not.toBe('alice');
      expect(out.startsWith('alice')).toBe(true);
      // Suffix is digits-only.
      expect(/^alice\d+$/.test(out)).toBe(true);
    });

    it('pads short local-parts to ≥3 chars before checking uniqueness', async () => {
      const out = await deriveUniqueUsernameFromEmail(app.db, 'a@x.com');
      expect(out.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ── Provisioning helpers ─────────────────────────────────────────────────

  describe('provisionUserProfile (called inside ensureUser/createUser)', () => {
    it('creates user_settings and a default user_albums row, idempotently', async () => {
      // First, insert the bare users row so provisionUserProfile has a parent.
      await app.db.query(
        `INSERT INTO users (id, email, username, hashed_email)
           VALUES ($1, $2, 'provtest', $3)`,
        [NEW_USER_ID, NEW_EMAIL, hashEmail(NEW_EMAIL)],
      );

      await provisionUserProfile(app.db, NEW_USER_ID);

      const { rowCount: settingsCount } = await app.db.query(
        `SELECT 1 FROM user_settings WHERE user_id = $1`,
        [NEW_USER_ID],
      );
      expect(settingsCount).toBe(1);

      const { rowCount: albumCount } = await app.db.query(
        `SELECT 1 FROM user_albums WHERE user_id = $1 AND is_default = TRUE`,
        [NEW_USER_ID],
      );
      expect(albumCount).toBe(1);

      // Re-running must NOT create a second album.
      await provisionUserProfile(app.db, NEW_USER_ID);
      const { rowCount: stillOne } = await app.db.query(
        `SELECT 1 FROM user_albums WHERE user_id = $1`,
        [NEW_USER_ID],
      );
      expect(stillOne).toBe(1);
    });
  });

  describe('createUser (self-register)', () => {
    it('inserts the user + provisions side tables in one transaction', async () => {
      await createUser(app.db, {
        id: NEW_USER_ID,
        email: NEW_EMAIL,
        username: 'newself',
      });

      const { rows } = await app.db.query<{ email: string; username: string }>(
        `SELECT email, username FROM users WHERE id = $1`,
        [NEW_USER_ID],
      );
      expect(rows[0]).toEqual({ email: NEW_EMAIL.toLowerCase(), username: 'newself' });

      const { rowCount: albumCount } = await app.db.query(
        `SELECT 1 FROM user_albums WHERE user_id = $1 AND is_default = TRUE`,
        [NEW_USER_ID],
      );
      expect(albumCount).toBe(1);
    });

    it('a duplicate username surfaces the unique-constraint violation', async () => {
      await createUser(app.db, { id: NEW_USER_ID,    email: NEW_EMAIL,    username: 'dupuname' });
      await expect(
        createUser(app.db, { id: SECOND_USER_ID, email: SECOND_EMAIL, username: 'dupuname' }),
      ).rejects.toThrow();
    });
  });

  describe('ensureUser (Cognito JIT)', () => {
    it('inserts on first call, no-ops on second call (idempotent)', async () => {
      const first = await ensureUser(app.db, {
        id: NEW_USER_ID,
        email: NEW_EMAIL,
        username: 'jitone',
        role: 'user',
        emailVerified: true,
      });
      expect(first.id).toBe(NEW_USER_ID);
      expect(first.emailVerifiedAt).not.toBeNull();

      const second = await ensureUser(app.db, {
        id: NEW_USER_ID,
        email: NEW_EMAIL,
        username: 'jitone',
        role: 'user',
        emailVerified: true,
      });
      expect(second.id).toBe(NEW_USER_ID);

      // Still exactly one row.
      const { rowCount } = await app.db.query(`SELECT 1 FROM users WHERE id = $1`, [NEW_USER_ID]);
      expect(rowCount).toBe(1);
    });

    it('promotes role on subsequent ensureUser when cognito:groups change', async () => {
      await ensureUser(app.db, { id: NEW_USER_ID, email: NEW_EMAIL, username: 'jitrole', role: 'user' });
      await ensureUser(app.db, { id: NEW_USER_ID, email: NEW_EMAIL, username: 'jitrole', role: 'admin' });

      const { rows } = await app.db.query<{ role: string }>(
        `SELECT role FROM users WHERE id = $1`,
        [NEW_USER_ID],
      );
      expect(rows[0]?.role).toBe('admin');
    });

    it('blocks first-time provisioning when the email is hard-banned', async () => {
      // Pre-ban the email.
      await app.db.query(
        `INSERT INTO banned_emails (hashed_email) VALUES ($1)`,
        [hashEmailForBan(NEW_EMAIL)],
      );

      await expect(
        ensureUser(app.db, { id: NEW_USER_ID, email: NEW_EMAIL, username: 'jitban' }),
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('rejects a soft-deleted user with 403', async () => {
      // Seed a deleted-at row directly, then try ensureUser with the same id.
      await app.db.query(
        `INSERT INTO users (id, email, username, hashed_email, deleted_at)
           VALUES ($1, $2, 'deletedtest', $3, now())`,
        [NEW_USER_ID, NEW_EMAIL, hashEmail(NEW_EMAIL)],
      );
      await expect(
        ensureUser(app.db, { id: NEW_USER_ID, email: NEW_EMAIL, username: 'deletedtest' }),
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });
});
