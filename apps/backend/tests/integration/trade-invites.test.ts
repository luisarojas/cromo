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
const BOB_ID   = '00000000-0000-0000-0000-000000000003';

describe.skipIf(!shouldRun)('Trade invites routes (integration)', () => {
  let app: FastifyInstance;
  let aliceToken: string;
  let bobToken: string;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app.js');
    const { signAccessToken } = await import('../../src/middleware/auth.js');
    app = await buildApp();
    await app.ready();
    aliceToken = signAccessToken({ sub: ALICE_ID, email: 'alice@test.local', role: 'user' });
    bobToken   = signAccessToken({ sub: BOB_ID,   email: 'bob@test.local',   role: 'user' });
  });

  afterAll(async () => {
    // Clean up our own invites; leave any others a different test created.
    await app.db.query(`DELETE FROM trade_invites WHERE host_user_id IN ($1, $2)`, [
      ALICE_ID, BOB_ID,
    ]);
    await app?.close();
  });

  beforeEach(async () => {
    await app.db.query(`DELETE FROM trade_invites WHERE host_user_id IN ($1, $2)`, [
      ALICE_ID, BOB_ID,
    ]);
  });

  describe('POST /api/v1/trade/invites', () => {
    it('returns 401 without auth', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/trade/invites' });
      expect(res.statusCode).toBe(401);
    });

    it('mints a token, persists the invite row, and returns a URL the frontend can open', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/trade/invites',
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json<{ invite: { id: string; token: string; expiresAt: string; url: string } }>();
      expect(body.invite.token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(body.invite.url).toMatch(/\/trade\/invite\/[A-Za-z0-9_-]+$/);
      expect(Number.isNaN(Date.parse(body.invite.expiresAt))).toBe(false);

      // Verify the row was actually persisted and tied to alice.
      const { rows } = await app.db.query<{ host_user_id: string }>(
        `SELECT host_user_id FROM trade_invites WHERE token = $1`,
        [body.invite.token],
      );
      expect(rows[0]?.host_user_id).toBe(ALICE_ID);
    });
  });

  describe('POST /api/v1/trade/invites/:token/redeem', () => {
    it('returns 404 for an unknown token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/trade/invites/no-such-token/redeem',
        headers: { Authorization: `Bearer ${bobToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 when the host tries to redeem their own invite', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/trade/invites',
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      const { token } = created.json<{ invite: { token: string } }>().invite;

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/trade/invites/${token}/redeem`,
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(res.statusCode).toBe(400);
    });

    it('claims the invite, returns the host\'s username, and stamps redeemed_at', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/trade/invites',
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      const { token } = created.json<{ invite: { token: string } }>().invite;

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/trade/invites/${token}/redeem`,
        headers: { Authorization: `Bearer ${bobToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ hostUserId: string; hostUsername: string }>();
      expect(body.hostUserId).toBe(ALICE_ID);
      expect(body.hostUsername).toBe('alice');

      // Direct-DB proof that the invite was atomically claimed.
      const { rows } = await app.db.query<{ redeemed_at: Date | null; redeemed_by_user_id: string | null }>(
        `SELECT redeemed_at, redeemed_by_user_id FROM trade_invites WHERE token = $1`,
        [token],
      );
      expect(rows[0]?.redeemed_at).not.toBeNull();
      expect(rows[0]?.redeemed_by_user_id).toBe(BOB_ID);
    });

    it('a second redeem of the same token returns 409 "already used"', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/trade/invites',
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      const { token } = created.json<{ invite: { token: string } }>().invite;

      // First redeem succeeds.
      const first = await app.inject({
        method: 'POST',
        url: `/api/v1/trade/invites/${token}/redeem`,
        headers: { Authorization: `Bearer ${bobToken}` },
      });
      expect(first.statusCode).toBe(200);

      // Second redeem fails.
      const second = await app.inject({
        method: 'POST',
        url: `/api/v1/trade/invites/${token}/redeem`,
        headers: { Authorization: `Bearer ${bobToken}` },
      });
      expect(second.statusCode).toBe(409);
    });

    it('an expired invite returns 409 even before anyone has redeemed it', async () => {
      // Insert an already-expired invite directly so we don't have to wait
      // for the 30-minute default TTL.
      const expiredToken = 'expired-test-token-' + Date.now();
      await app.db.query(
        `INSERT INTO trade_invites (host_user_id, token, expires_at)
         VALUES ($1, $2, now() - INTERVAL '1 hour')`,
        [ALICE_ID, expiredToken],
      );
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/trade/invites/${expiredToken}/redeem`,
        headers: { Authorization: `Bearer ${bobToken}` },
      });
      expect(res.statusCode).toBe(409);
    });
  });
});
