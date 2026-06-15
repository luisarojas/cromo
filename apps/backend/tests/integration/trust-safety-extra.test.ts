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

const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const ALICE_ID = '00000000-0000-0000-0000-000000000002';
const BOB_ID   = '00000000-0000-0000-0000-000000000003';
const EVAN_ID  = '00000000-0000-0000-0000-000000000006';

describe.skipIf(!shouldRun)('Trust & safety extra routes (integration)', () => {
  let app: FastifyInstance;
  let aliceToken: string;
  let adminToken: string;
  let initialFlagState: boolean;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app.js');
    const { signAccessToken } = await import('../../src/middleware/auth.js');
    app = await buildApp();
    await app.ready();
    aliceToken = signAccessToken({ sub: ALICE_ID, email: 'alice@test.local', role: 'user' });
    adminToken = signAccessToken({ sub: ADMIN_ID, email: 'admin@test.local', role: 'admin' });
    const { rows } = await app.db.query<{ enabled: boolean }>(
      `SELECT enabled FROM feature_flags WHERE key = 'FEATURE_TRUST_SAFETY'`,
    );
    initialFlagState = rows[0]?.enabled ?? true;
    await app.db.query(`UPDATE feature_flags SET enabled = true WHERE key = 'FEATURE_TRUST_SAFETY'`);
  });

  afterAll(async () => {
    await app.db.query(
      `UPDATE feature_flags SET enabled = $1 WHERE key = 'FEATURE_TRUST_SAFETY'`,
      [initialFlagState],
    );
    await app?.close();
  });

  beforeEach(async () => {
    // Clean any reports filed by alice during these tests so state is fresh.
    await app.db.query(`DELETE FROM user_reports WHERE reporter_id = $1`, [ALICE_ID]);
  });

  // ── GET /users/me/reports/submitted ─────────────────────────────────────────

  describe('GET /users/me/reports/submitted', () => {
    it('returns 401 without a token', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/users/me/reports/submitted' });
      expect(res.statusCode).toBe(401);
    });

    it('returns the caller\'s submitted reports', async () => {
      // Seed one report from alice → evan.
      await app.db.query(
        `INSERT INTO user_reports (id, reporter_id, reported_user_id, category, description, status)
           VALUES ('a0000000-0000-0000-0000-000000000088', $1, $2, 'spam', 'integration test', 'open')
           ON CONFLICT (id) DO NOTHING`,
        [ALICE_ID, EVAN_ID],
      );

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me/reports/submitted',
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ items: { id: string; reportedUsername: string }[] }>();
      const ours = body.items.find((r) => r.id === 'a0000000-0000-0000-0000-000000000088');
      expect(ours).toBeDefined();
      expect(ours!.reportedUsername).toBe('evan');

      // Clean up.
      await app.db.query(`DELETE FROM user_reports WHERE id = 'a0000000-0000-0000-0000-000000000088'`);
    });

    it('respects the limit query parameter', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me/reports/submitted?limit=5',
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ items: unknown[] }>();
      expect(body.items.length).toBeLessThanOrEqual(5);
    });
  });

  // ── GET /admin/reports ─────────────────────────────────────────────────────

  describe('GET /admin/reports', () => {
    it('returns 403 for non-admin tokens', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/reports',
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns the report list for an admin', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/reports',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ items: unknown[]; nextCursor: string | null }>();
      expect(Array.isArray(body.items)).toBe(true);
    });

    it('filters by status', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/reports?status=open',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ items: { status: string }[] }>();
      // Every returned row must match the requested filter.
      for (const item of body.items) expect(item.status).toBe('open');
    });

    it('filters by category', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/reports?category=spam',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ items: { category: string }[] }>();
      for (const item of body.items) expect(item.category).toBe('spam');
    });
  });

  // ── GET /admin/reports/:id ─────────────────────────────────────────────────

  describe('GET /admin/reports/:id', () => {
    it('returns 404 for an unknown report id', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/reports/00000000-0000-0000-0000-deadbeef0000',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns the report with attachments + message refs for a real id', async () => {
      // Insert a single report; assert the detail endpoint returns it.
      await app.db.query(
        `INSERT INTO user_reports (id, reporter_id, reported_user_id, category, description, status)
           VALUES ('a0000000-0000-0000-0000-000000000077', $1, $2, 'spam', 'detail test', 'open')
           ON CONFLICT (id) DO NOTHING`,
        [ALICE_ID, EVAN_ID],
      );
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/reports/a0000000-0000-0000-0000-000000000077',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ id: string; reportedUserId: string; attachments: unknown[]; messageRefs: unknown[] }>();
      expect(body.id).toBe('a0000000-0000-0000-0000-000000000077');
      expect(body.reportedUserId).toBe(EVAN_ID);
      expect(Array.isArray(body.attachments)).toBe(true);
      expect(Array.isArray(body.messageRefs)).toBe(true);
      await app.db.query(`DELETE FROM user_reports WHERE id = 'a0000000-0000-0000-0000-000000000077'`);
    });
  });

  // ── GET /users/:userId/ratings ─────────────────────────────────────────────

  describe('GET /users/:userId/ratings', () => {
    it('returns the public rating list for a user (no auth required)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${BOB_ID}/ratings`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{
        items: { isPositive: boolean }[];
        nextCursor: string | null;
        trustScore: {
          tier: string;
          totalRatings: number;
          positiveCount: number;
          negativeCount: number;
          positivePercent: number;
        };
      }>();
      expect(Array.isArray(body.items)).toBe(true);
      expect('nextCursor' in body).toBe(true);
      expect(body.trustScore).toBeDefined();
      expect(typeof body.trustScore.totalRatings).toBe('number');
      expect(typeof body.trustScore.positiveCount).toBe('number');
      expect(typeof body.trustScore.negativeCount).toBe('number');
      // Math holds: positive + negative = total (every rating is bipolar).
      expect(body.trustScore.positiveCount + body.trustScore.negativeCount).toBe(body.trustScore.totalRatings);
    });
  });

  // ── PATCH /admin/reports/:reportId — status changes ───────────────────────

  describe('PATCH /admin/reports/:reportId', () => {
    it('rejects non-admin tokens with 403', async () => {
      // Seed a report so the route has something to look up.
      await app.db.query(
        `INSERT INTO user_reports (id, reporter_id, reported_user_id, category, description, status)
           VALUES ('a0000000-0000-0000-0000-000000000066', $1, $2, 'spam', 'patch test', 'open')
           ON CONFLICT (id) DO NOTHING`,
        [ALICE_ID, EVAN_ID],
      );
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/admin/reports/a0000000-0000-0000-0000-000000000066',
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: { status: 'under_review' },
      });
      expect(res.statusCode).toBe(403);
      await app.db.query(`DELETE FROM user_reports WHERE id = 'a0000000-0000-0000-0000-000000000066'`);
    });

    it('updates the status field for an admin', async () => {
      await app.db.query(
        `INSERT INTO user_reports (id, reporter_id, reported_user_id, category, description, status)
           VALUES ('a0000000-0000-0000-0000-000000000055', $1, $2, 'spam', 'status flip', 'open')
           ON CONFLICT (id) DO NOTHING`,
        [ALICE_ID, EVAN_ID],
      );
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/admin/reports/a0000000-0000-0000-0000-000000000055',
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { status: 'under_review' },
      });
      // The route returns either 200 or 204 depending on the implementation;
      // verify the state changed in the DB regardless.
      expect([200, 204]).toContain(res.statusCode);
      const { rows } = await app.db.query<{ status: string }>(
        `SELECT status FROM user_reports WHERE id = 'a0000000-0000-0000-0000-000000000055'`,
      );
      expect(rows[0]?.status).toBe('under_review');
      await app.db.query(`DELETE FROM user_reports WHERE id = 'a0000000-0000-0000-0000-000000000055'`);
    });
  });
});
