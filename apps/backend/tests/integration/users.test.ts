import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';

const HAS_REAL_DB =
  typeof process.env['DATABASE_URL'] === 'string' &&
  process.env['DATABASE_URL'].includes('@') &&
  !process.env['DATABASE_URL'].includes('placeholder');
const HAS_REAL_REDIS =
  typeof process.env['REDIS_URL'] === 'string' &&
  process.env['REDIS_URL'].startsWith('redis://');
const shouldRun = HAS_REAL_DB && HAS_REAL_REDIS;

// Use Evan — he's seeded with no albums and no trades, so we can mutate his
// settings, username, and display name without affecting the other tests.
const EVAN_ID = '00000000-0000-0000-0000-000000000006';
const ALICE_ID = '00000000-0000-0000-0000-000000000002';

describe.skipIf(!shouldRun)('Users routes (integration)', () => {
  let app: FastifyInstance;
  let evanToken: string;
  let aliceToken: string;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app.js');
    const { signAccessToken } = await import('../../src/middleware/auth.js');
    app = await buildApp();
    await app.ready();
    evanToken  = signAccessToken({ sub: EVAN_ID,  email: 'evan@test.local',  role: 'user' });
    aliceToken = signAccessToken({ sub: ALICE_ID, email: 'alice@test.local', role: 'user' });
  });

  afterAll(async () => {
    // Reset Evan's mutated identity so other test runs see the original seed.
    await app.db.query(
      `UPDATE users
          SET username = 'evan', display_name = 'Evan', email = 'evan@test.local'
        WHERE id = $1`,
      [EVAN_ID],
    );
    await app.db.query(
      `INSERT INTO user_settings (user_id)
         VALUES ($1)
         ON CONFLICT (user_id) DO UPDATE SET
           duplicates_count_all_variants = TRUE,
           profile_visibility = 'public',
           trade_matching_enabled = TRUE,
           search_radius_km = 50,
           email_trade_requests = TRUE,
           email_trade_messages = TRUE,
           email_marketing = FALSE,
           cities = '[]'::jsonb`,
      [EVAN_ID],
    );
    await app?.close();
  });

  beforeEach(async () => {
    // Reset Evan's user_settings between tests so order independence is
    // guaranteed — patch-then-read tests must see a known baseline.
    await app.db.query(
      `INSERT INTO user_settings (user_id) VALUES ($1)
         ON CONFLICT (user_id) DO UPDATE SET
           duplicates_count_all_variants = TRUE,
           profile_visibility = 'public',
           trade_matching_enabled = TRUE,
           search_radius_km = 50,
           email_trade_requests = TRUE,
           email_trade_messages = TRUE,
           email_marketing = FALSE,
           cities = '[]'::jsonb`,
      [EVAN_ID],
    );
  });

  // ── /me/preferences ────────────────────────────────────────────────────────

  describe('GET /me/preferences', () => {
    it('returns 401 without a token', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/users/me/preferences' });
      expect(res.statusCode).toBe(401);
    });

    it('returns the user\'s preferences', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me/preferences',
        headers: { Authorization: `Bearer ${evanToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{
        duplicatesCountAllVariants: boolean;
        profileVisibility: string;
        searchRadiusKm: number;
        emailMarketing: boolean;
      }>();
      expect(body).toMatchObject({
        duplicatesCountAllVariants: true,
        profileVisibility: 'public',
        searchRadiusKm: 50,
        emailMarketing: false,
      });
    });
  });

  describe('PATCH /me/preferences', () => {
    it('rejects unknown profileVisibility with 400', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me/preferences',
        headers: { Authorization: `Bearer ${evanToken}` },
        payload: { profileVisibility: 'galactic' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('updates a subset of fields and returns the new preferences', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me/preferences',
        headers: { Authorization: `Bearer ${evanToken}` },
        payload: {
          profileVisibility: 'private',
          searchRadiusKm: 200,
          emailMarketing: true,
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{
        profileVisibility: string;
        searchRadiusKm: number;
        emailMarketing: boolean;
        duplicatesCountAllVariants: boolean;
      }>();
      expect(body.profileVisibility).toBe('private');
      expect(body.searchRadiusKm).toBe(200);
      expect(body.emailMarketing).toBe(true);
      // Untouched fields keep their previous value.
      expect(body.duplicatesCountAllVariants).toBe(true);

      // Confirm via direct DB read — proves the patch persisted, not just the
      // response shape.
      const { rows } = await app.db.query<{ profile_visibility: string; search_radius_km: string | number }>(
        `SELECT profile_visibility, search_radius_km FROM user_settings WHERE user_id = $1`,
        [EVAN_ID],
      );
      expect(rows[0]?.profile_visibility).toBe('private');
      expect(Number(rows[0]?.search_radius_km)).toBe(200);
    });

    it('accepts an empty patch and just echoes the current preferences', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me/preferences',
        headers: { Authorization: `Bearer ${evanToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ profileVisibility: string }>();
      expect(body.profileVisibility).toBe('public');
    });
  });

  // ── /me/username ───────────────────────────────────────────────────────────

  describe('PATCH /me/username', () => {
    it('rejects usernames shorter than 3 chars with 400', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me/username',
        headers: { Authorization: `Bearer ${evanToken}` },
        payload: { username: 'ab' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 409 when the requested username is taken', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me/username',
        headers: { Authorization: `Bearer ${evanToken}` },
        payload: { username: 'alice' },
      });
      expect(res.statusCode).toBe(409);
    });

    it('updates the username and persists it to the users row', async () => {
      const newName = 'evan_' + Date.now().toString(36);
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me/username',
        headers: { Authorization: `Bearer ${evanToken}` },
        payload: { username: newName },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ username: string }>().username).toBe(newName);

      const { rows } = await app.db.query<{ username: string }>(
        `SELECT username FROM users WHERE id = $1`,
        [EVAN_ID],
      );
      expect(rows[0]?.username).toBe(newName);
    });
  });

  // ── /me/display-name ──────────────────────────────────────────────────────

  describe('PATCH /me/display-name', () => {
    it('updates the display name and trims whitespace', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me/display-name',
        headers: { Authorization: `Bearer ${evanToken}` },
        payload: { displayName: '   Evan the Tester   ' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ displayName: string }>().displayName).toBe('Evan the Tester');
    });

    it('accepts null to clear the display name', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me/display-name',
        headers: { Authorization: `Bearer ${evanToken}` },
        payload: { displayName: null },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ displayName: string | null }>().displayName).toBeNull();
    });
  });

  // ── /me/password ──────────────────────────────────────────────────────────

  describe('PATCH /me/password', () => {
    it('rejects newPassword shorter than 8 chars', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me/password',
        headers: { Authorization: `Bearer ${evanToken}` },
        payload: { currentPassword: 'whatever', newPassword: 'short' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('records a password-changed audit row on success (local mode)', async () => {
      const before = await app.db.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM audit_log WHERE user_id = $1 AND action = 'password_changed'`,
        [EVAN_ID],
      );
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me/password',
        headers: { Authorization: `Bearer ${evanToken}` },
        payload: { currentPassword: 'anything', newPassword: 'long-enough-pw' },
      });
      expect(res.statusCode).toBe(200);
      const after = await app.db.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM audit_log WHERE user_id = $1 AND action = 'password_changed'`,
        [EVAN_ID],
      );
      expect(Number(after.rows[0]!.n)).toBe(Number(before.rows[0]!.n) + 1);
    });
  });

  // ── /me/email ─────────────────────────────────────────────────────────────

  describe('PATCH /me/email', () => {
    it('rejects malformed emails via the Fastify schema (format: email)', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me/email',
        headers: { Authorization: `Bearer ${evanToken}` },
        payload: { email: 'definitely-not-an-email' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 409 when the requested email is already taken', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/me/email',
        headers: { Authorization: `Bearer ${evanToken}` },
        payload: { email: 'alice@test.local' },
      });
      expect(res.statusCode).toBe(409);
    });

    it('updates the email and resets email_verified_at on success', async () => {
      const newEmail = `evan-${Date.now()}@test.local`;
      try {
        const res = await app.inject({
          method: 'PATCH',
          url: '/api/v1/users/me/email',
          headers: { Authorization: `Bearer ${evanToken}` },
          payload: { email: newEmail },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json<{ email: string }>().email).toBe(newEmail);

        // Verified-at must reset so the user re-confirms.
        const { rows } = await app.db.query<{ email: string; email_verified_at: Date | null }>(
          `SELECT email, email_verified_at FROM users WHERE id = $1`,
          [EVAN_ID],
        );
        expect(rows[0]?.email).toBe(newEmail);
        expect(rows[0]?.email_verified_at).toBeNull();
      } finally {
        // Restore canonical email.
        await app.db.query(
          `UPDATE users SET email = 'evan@test.local' WHERE id = $1`,
          [EVAN_ID],
        );
      }
    });
  });

  // ── /me/ban-status ────────────────────────────────────────────────────────

  describe('GET /me/ban-status', () => {
    it('returns the caller\'s ban status', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me/ban-status',
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ banned: boolean }>();
      expect(typeof body.banned).toBe('boolean');
    });
  });

  // ── /me/achievements/evaluate ──────────────────────────────────────────────

  describe('POST /me/achievements/evaluate', () => {
    it('returns the current achievement set (possibly empty) for the caller', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/users/me/achievements/evaluate',
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ items: { key: string; unlockedAt: string }[] }>();
      expect(Array.isArray(body.items)).toBe(true);
      for (const item of body.items) {
        expect(typeof item.key).toBe('string');
        expect(new Date(item.unlockedAt).toISOString()).toBe(item.unlockedAt);
      }
    });
  });
});
