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

const ALICE_ID = '00000000-0000-0000-0000-000000000002';

describe.skipIf(!shouldRun)('Push routes (integration)', () => {
  let app: FastifyInstance;
  let aliceToken: string;
  let initialFlagState: boolean;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app.js');
    const { signAccessToken } = await import('../../src/middleware/auth.js');
    app = await buildApp();
    await app.ready();
    aliceToken = signAccessToken({ sub: ALICE_ID, email: 'alice@test.local', role: 'user' });
    const { rows } = await app.db.query<{ enabled: boolean }>(
      `SELECT enabled FROM feature_flags WHERE key = 'FEATURE_WEB_PUSH'`,
    );
    initialFlagState = rows[0]?.enabled ?? false;
  });

  afterAll(async () => {
    // Restore the flag to whatever the dev DB had before this suite ran
    // (the seed default is false, but dev may have it on locally).
    await app.db.query(
      `UPDATE feature_flags SET enabled = $1 WHERE key = 'FEATURE_WEB_PUSH'`,
      [initialFlagState],
    );
    await app.db.query(`DELETE FROM push_subscriptions WHERE user_id = $1`, [ALICE_ID]);
    await app?.close();
  });

  beforeEach(async () => {
    await app.db.query(`DELETE FROM push_subscriptions WHERE user_id = $1`, [ALICE_ID]);
  });

  describe('when FEATURE_WEB_PUSH is disabled', () => {
    beforeAll(async () => {
      await app.db.query(`UPDATE feature_flags SET enabled = false WHERE key = 'FEATURE_WEB_PUSH'`);
    });

    it('returns 404 on GET /vapid-public-key', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/push/vapid-public-key' });
      expect(res.statusCode).toBe(404);
    });

    it('returns 404 on POST /subscribe even with valid auth', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/push/subscribe',
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: { endpoint: 'https://e', keys: { p256dh: 'p', auth: 'a' } },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('when FEATURE_WEB_PUSH is enabled', () => {
    beforeAll(async () => {
      await app.db.query(`UPDATE feature_flags SET enabled = true WHERE key = 'FEATURE_WEB_PUSH'`);
    });

    it('GET /vapid-public-key returns the configured key OR 404 in degraded mode', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/push/vapid-public-key' });
      // Local dev runs without VAPID configured by default, so a 404 with the
      // expected message is the right response. If a developer has VAPID
      // configured locally, 200 + {publicKey} is also acceptable.
      expect([200, 404].includes(res.statusCode)).toBe(true);
      if (res.statusCode === 404) {
        expect(res.json<{ message: string }>().message).toMatch(/Push is not configured/);
      } else {
        expect(typeof res.json<{ publicKey: string }>().publicKey).toBe('string');
      }
    });

    it('POST /subscribe without auth returns 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/push/subscribe',
        payload: { endpoint: 'https://e', keys: { p256dh: 'p', auth: 'a' } },
      });
      expect(res.statusCode).toBe(401);
    });

    it('POST /subscribe with invalid body returns 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/push/subscribe',
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: { endpoint: 'not-a-url', keys: { p256dh: 'p', auth: 'a' } },
      });
      expect(res.statusCode).toBe(400);
    });

    it('POST /subscribe upserts a row and is idempotent', async () => {
      const body = {
        endpoint: 'https://push.example.com/endpoint-1',
        keys: { p256dh: 'pubkey', auth: 'authkey' },
      };
      const first = await app.inject({
        method: 'POST',
        url: '/api/v1/push/subscribe',
        headers: { Authorization: `Bearer ${aliceToken}`, 'user-agent': 'Cromo-Test/1' },
        payload: body,
      });
      expect(first.statusCode).toBe(204);

      // Verify the row landed.
      let { rows } = await app.db.query<{ endpoint: string; p256dh: string; user_agent: string }>(
        `SELECT endpoint, p256dh, user_agent FROM push_subscriptions WHERE user_id = $1`,
        [ALICE_ID],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ endpoint: body.endpoint, p256dh: 'pubkey', user_agent: 'Cromo-Test/1' });

      // Re-subscribe with the same endpoint but a refreshed key — ON CONFLICT
      // must update, not duplicate.
      const second = await app.inject({
        method: 'POST',
        url: '/api/v1/push/subscribe',
        headers: { Authorization: `Bearer ${aliceToken}`, 'user-agent': 'Cromo-Test/2' },
        payload: { endpoint: body.endpoint, keys: { p256dh: 'newpub', auth: 'newauth' } },
      });
      expect(second.statusCode).toBe(204);

      ({ rows } = await app.db.query<{ endpoint: string; p256dh: string; user_agent: string }>(
        `SELECT endpoint, p256dh, user_agent FROM push_subscriptions WHERE user_id = $1`,
        [ALICE_ID],
      ));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ p256dh: 'newpub', user_agent: 'Cromo-Test/2' });
    });

    it('POST /unsubscribe removes the matching endpoint and is a no-op for unknown endpoints', async () => {
      // Seed two subscriptions; remove one; assert the other survives.
      await app.inject({
        method: 'POST',
        url: '/api/v1/push/subscribe',
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: { endpoint: 'https://e1', keys: { p256dh: 'p1', auth: 'a1' } },
      });
      await app.inject({
        method: 'POST',
        url: '/api/v1/push/subscribe',
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: { endpoint: 'https://e2', keys: { p256dh: 'p2', auth: 'a2' } },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/push/unsubscribe',
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: { endpoint: 'https://e1' },
      });
      expect(res.statusCode).toBe(204);

      const { rows } = await app.db.query<{ endpoint: string }>(
        `SELECT endpoint FROM push_subscriptions WHERE user_id = $1 ORDER BY endpoint`,
        [ALICE_ID],
      );
      expect(rows.map((r) => r.endpoint)).toEqual(['https://e2']);

      // Unsubscribing an unknown endpoint is a 204 no-op — never 404.
      const noop = await app.inject({
        method: 'POST',
        url: '/api/v1/push/unsubscribe',
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: { endpoint: 'https://never-subscribed' },
      });
      expect(noop.statusCode).toBe(204);
    });

    it('POST /unsubscribe rejects invalid body shape with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/push/unsubscribe',
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: { endpoint: 'not-a-url' },
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
