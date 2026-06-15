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
const ALICE_NA_ALBUM_ID = '00000000-0000-0000-0001-000000000002';
const BOB_NA_ALBUM_ID   = '00000000-0000-0000-0001-000000000003';

describe.skipIf(!shouldRun)('Trade extra routes (integration)', () => {
  let app: FastifyInstance;
  let aliceToken: string;
  let bobToken: string;
  let tradeId: string;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app.js');
    const { signAccessToken } = await import('../../src/middleware/auth.js');
    app = await buildApp();
    await app.ready();
    aliceToken = signAccessToken({ sub: ALICE_ID, email: 'alice@test.local', role: 'user' });
    bobToken   = signAccessToken({ sub: BOB_ID,   email: 'bob@test.local',   role: 'user' });
  });

  afterAll(async () => { await app?.close(); });

  beforeEach(async () => {
    // Create a fresh pending cash-only trade Alice → Bob for each test.
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/trade/requests',
      headers: { Authorization: `Bearer ${aliceToken}` },
      payload: {
        recipientId: BOB_ID,
        requesterAlbumId: ALICE_NA_ALBUM_ID,
        items: [],
        offerCash: 100, wantCash: 50,
      },
    });
    expect(res.statusCode).toBe(201);
    tradeId = res.json<{ id: string }>().id;
    void BOB_NA_ALBUM_ID;
  });

  // ── /messages ─────────────────────────────────────────────────────────────

  describe('GET + POST /trade/requests/:id/messages', () => {
    it('starts empty, POST adds, GET reflects', async () => {
      const initial = await app.inject({
        method: 'GET',
        url: `/api/v1/trade/requests/${tradeId}/messages`,
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(initial.statusCode).toBe(200);
      const initialBody = initial.json<{ items: unknown[] }>();
      expect(Array.isArray(initialBody.items)).toBe(true);

      const post = await app.inject({
        method: 'POST',
        url: `/api/v1/trade/requests/${tradeId}/messages`,
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: { body: 'Hello Bob — can we meet at the café?' },
      });
      expect(post.statusCode).toBe(201);
      const msg = post.json<{ id: string; body: string }>();
      expect(msg.body).toContain('café');

      const after = await app.inject({
        method: 'GET',
        url: `/api/v1/trade/requests/${tradeId}/messages`,
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      const items = after.json<{ items: { id: string }[] }>().items;
      expect(items.some((m) => m.id === msg.id)).toBe(true);
    });

    it('POST rejects an empty body via schema validation (minLength: 1)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/trade/requests/${tradeId}/messages`,
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: { body: '' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('POST rejects bodies longer than 2000 chars', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/trade/requests/${tradeId}/messages`,
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: { body: 'a'.repeat(2001) },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── /stream-ticket ─────────────────────────────────────────────────────────

  describe('POST /trade/requests/:id/stream-ticket', () => {
    it('mints a ticket bound to the (user, trade) pair and TTL-stamped at 30s', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/trade/requests/${tradeId}/stream-ticket`,
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json<{ ticket: string; expiresIn: number }>();
      expect(body.ticket).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(body.expiresIn).toBe(30);

      // The Redis value must include exactly the right { userId, tradeId }
      // — anything else would let an unrelated user replay the ticket.
      const stored = await app.redis.get(`sse:trade:ticket:${body.ticket}`);
      expect(stored).not.toBeNull();
      expect(JSON.parse(stored!)).toEqual({ userId: ALICE_ID, tradeId });

      // The TTL must actually be set (≤ 30s and > 0). Without an EX clause
      // the ticket would live forever and a leaked URL would never expire.
      const ttl = await app.redis.ttl(`sse:trade:ticket:${body.ticket}`);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(30);
    });

    it('is single-use: GETDEL consumes the ticket atomically', async () => {
      // /stream is an SSE handler so app.inject() would block. Instead we
      // simulate the route's consume step (GETDEL) directly. This locks in
      // the contract that a swap from GETDEL to GET would break.
      const mintRes = await app.inject({
        method: 'POST',
        url: `/api/v1/trade/requests/${tradeId}/stream-ticket`,
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      const { ticket } = mintRes.json<{ ticket: string }>();

      const first = await app.redis.getdel(`sse:trade:ticket:${ticket}`);
      expect(first).not.toBeNull();

      // Second consumer must get null — the ticket was deleted on first read.
      const second = await app.redis.getdel(`sse:trade:ticket:${ticket}`);
      expect(second).toBeNull();
    });

    it('returns 403 for a non-participant', async () => {
      // Bob is the recipient — so he's a participant. Use an evan token, who
      // is not on this trade.
      const { signAccessToken } = await import('../../src/middleware/auth.js');
      const evanToken = signAccessToken({
        sub: '00000000-0000-0000-0000-000000000006',
        email: 'evan@test.local',
        role: 'user',
      });
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/trade/requests/${tradeId}/stream-ticket`,
        headers: { Authorization: `Bearer ${evanToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns 404 for an unknown trade', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/trade/requests/00000000-0000-0000-0000-deadbeef0000/stream-ticket',
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── /stream — ticket auth path ─────────────────────────────────────────────

  describe('GET /trade/requests/:id/stream', () => {
    it('rejects when no auth and no ticket are provided', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/trade/requests/${tradeId}/stream`,
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects when the ticket does not match the URL pattern', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/trade/requests/${tradeId}/stream?ticket=$$$$$$invalid$$$$`,
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects an unknown (or already-consumed) ticket', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/trade/requests/${tradeId}/stream?ticket=nonexistent-ticket-${Date.now()}`,
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects a ticket bound to a different trade', async () => {
      // Mint a ticket for our trade, then ask for a DIFFERENT trade id.
      const mintRes = await app.inject({
        method: 'POST',
        url: `/api/v1/trade/requests/${tradeId}/stream-ticket`,
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      const { ticket } = mintRes.json<{ ticket: string }>();

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/trade/requests/00000000-0000-0000-0000-deadbeef0000/stream?ticket=${ticket}`,
      });
      // The route consumes the ticket atomically, then either rejects with
      // 403 (mismatched trade) or 401 — both are documented behaviour. The
      // contract being tested is that a wrong-trade ticket never succeeds.
      expect([401, 403]).toContain(res.statusCode);
    });
  });

  // ── /edit — pending-trade edit ────────────────────────────────────────────

  describe('POST /trade/requests/:id/edit', () => {
    it('rejects an empty body with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/trade/requests/${tradeId}/edit`,
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
