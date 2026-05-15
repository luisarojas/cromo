import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * Integration tests for trade messaging endpoints.
 *
 * Requires a real PostgreSQL database and Redis instance.
 * Skipped when DATABASE_URL does not point to a real server.
 *
 * Depends on seeded data from 07_test_users.sql:
 *   Trade A (Alice → Bob, pending):      00000000-0000-0000-0002-000000000001
 *   Trade B (Charlie → Diana, accepted): 00000000-0000-0000-0002-000000000002
 *
 *   Both trades have pre-seeded messages; FEATURE_TRADE_MESSAGING is enabled.
 *
 * Routes under test: /api/v1/trade/requests/:id/messages
 */

const HAS_REAL_DB =
  typeof process.env['DATABASE_URL'] === 'string' &&
  process.env['DATABASE_URL'].includes('@') &&
  !process.env['DATABASE_URL'].includes('placeholder');

const HAS_REAL_REDIS =
  typeof process.env['REDIS_URL'] === 'string' &&
  process.env['REDIS_URL'].startsWith('redis://');

const shouldRun = HAS_REAL_DB && HAS_REAL_REDIS;

const ALICE_ID   = '00000000-0000-0000-0000-000000000002';
const BOB_ID     = '00000000-0000-0000-0000-000000000003';
const CHARLIE_ID = '00000000-0000-0000-0000-000000000004';
const DIANA_ID   = '00000000-0000-0000-0000-000000000005';

const TRADE_A = '00000000-0000-0000-0002-000000000001'; // Alice → Bob, pending
const TRADE_B = '00000000-0000-0000-0002-000000000002'; // Charlie → Diana, accepted

const MSG_URL = (tradeId: string) => `/api/v1/trade/requests/${tradeId}/messages`;

describe.skipIf(!shouldRun)('Trade messaging routes (integration)', () => {
  let app: FastifyInstance;
  let aliceToken: string;
  let bobToken: string;
  let charlieToken: string;
  let dianaToken: string;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app.js');
    const { signAccessToken } = await import('../../src/middleware/auth.js');

    app = await buildApp();
    await app.ready();

    aliceToken   = signAccessToken({ sub: ALICE_ID,   email: 'alice@test.local',   role: 'user' });
    bobToken     = signAccessToken({ sub: BOB_ID,     email: 'bob@test.local',     role: 'user' });
    charlieToken = signAccessToken({ sub: CHARLIE_ID, email: 'charlie@test.local', role: 'user' });
    dianaToken   = signAccessToken({ sub: DIANA_ID,   email: 'diana@test.local',   role: 'user' });
  });

  afterAll(async () => {
    await app?.close();
  });

  // ── GET messages ──────────────────────────────────────────────────────────────

  describe('GET /api/v1/trade/requests/:id/messages', () => {
    it('Alice can fetch messages from Trade A (she is the requester)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: MSG_URL(TRADE_A),
        headers: { Authorization: `Bearer ${aliceToken}` },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        items: {
          id: string;
          trade_id: string;
          sender_id: string;
          sender_username: string;
          body: string;
          sent_at: string;
        }[];
        nextCursor: string | null;
      }>();

      expect(Array.isArray(body.items)).toBe(true);
      expect('nextCursor' in body).toBe(true);
      // Trade A has 2 seeded messages
      expect(body.items.length).toBeGreaterThanOrEqual(2);
      for (const msg of body.items) {
        expect(typeof msg.id).toBe('string');
        expect(typeof msg.body).toBe('string');
        expect(typeof msg.sender_username).toBe('string');
        expect(msg.trade_id).toBe(TRADE_A);
      }
    });

    it('Bob can fetch messages from Trade A (he is the recipient)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: MSG_URL(TRADE_A),
        headers: { Authorization: `Bearer ${bobToken}` },
      });

      expect(response.statusCode).toBe(200);
    });

    it('Charlie is denied access to Trade A messages (not a participant)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: MSG_URL(TRADE_A),
        headers: { Authorization: `Bearer ${charlieToken}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 401 without an Authorization header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: MSG_URL(TRADE_A),
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 404 for a non-existent trade', async () => {
      const response = await app.inject({
        method: 'GET',
        url: MSG_URL('00000000-0000-0000-9999-000000000000'),
        headers: { Authorization: `Bearer ${aliceToken}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('Charlie and Diana can fetch messages from Trade B (accepted trade)', async () => {
      const [charlieRes, dianaRes] = await Promise.all([
        app.inject({
          method: 'GET',
          url: MSG_URL(TRADE_B),
          headers: { Authorization: `Bearer ${charlieToken}` },
        }),
        app.inject({
          method: 'GET',
          url: MSG_URL(TRADE_B),
          headers: { Authorization: `Bearer ${dianaToken}` },
        }),
      ]);

      expect(charlieRes.statusCode).toBe(200);
      expect(dianaRes.statusCode).toBe(200);

      const charlieBody = charlieRes.json<{ items: unknown[] }>();
      expect(charlieBody.items.length).toBeGreaterThanOrEqual(2);
    });

    it('returns messages in ascending sent_at order', async () => {
      const response = await app.inject({
        method: 'GET',
        url: MSG_URL(TRADE_A),
        headers: { Authorization: `Bearer ${aliceToken}` },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{ items: { sent_at: string }[] }>();
      const timestamps = body.items.map((m) => new Date(m.sent_at).getTime());

      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]!);
      }
    });
  });

  // ── POST messages ─────────────────────────────────────────────────────────────

  describe('POST /api/v1/trade/requests/:id/messages', () => {
    it('Alice can send a message on Trade A (pending trade)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: MSG_URL(TRADE_A),
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body: 'Testing messaging from integration test.' }),
      });

      expect(response.statusCode).toBe(201);

      const msg = response.json<{
        id: string;
        trade_id: string;
        sender_id: string;
        body: string;
      }>();

      expect(msg.trade_id).toBe(TRADE_A);
      expect(msg.sender_id).toBe(ALICE_ID);
      expect(msg.body).toBe('Testing messaging from integration test.');
    });

    it('Bob can send a message on Trade A (recipient)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: MSG_URL(TRADE_A),
        headers: {
          Authorization: `Bearer ${bobToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body: 'Bob reply from integration test.' }),
      });

      expect(response.statusCode).toBe(201);
    });

    it('non-participant (Charlie) cannot send a message on Trade A', async () => {
      const response = await app.inject({
        method: 'POST',
        url: MSG_URL(TRADE_A),
        headers: {
          Authorization: `Bearer ${charlieToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body: 'Trying to sneak in.' }),
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 401 without an Authorization header', async () => {
      const response = await app.inject({
        method: 'POST',
        url: MSG_URL(TRADE_A),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: 'No auth.' }),
      });

      expect(response.statusCode).toBe(401);
    });

    it('rejects an empty body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: MSG_URL(TRADE_A),
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body: '' }),
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('rejects a body exceeding 2000 characters', async () => {
      const response = await app.inject({
        method: 'POST',
        url: MSG_URL(TRADE_A),
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body: 'x'.repeat(2001) }),
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('idempotency key prevents duplicate message insertion', async () => {
      const idempotencyKey = `test-idem-${Date.now()}`;

      const payload = {
        method: 'POST' as const,
        url: MSG_URL(TRADE_A),
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ body: 'Idempotent message.' }),
      };

      const first  = await app.inject(payload);
      const second = await app.inject(payload);

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);

      const firstMsg  = first.json<{ id: string }>();
      const secondMsg = second.json<{ id: string }>();

      // Same idempotency key → same message id returned
      expect(firstMsg.id).toBe(secondMsg.id);
    });

    it('Charlie can still message on Trade B (accepted status allows messaging)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: MSG_URL(TRADE_B),
        headers: {
          Authorization: `Bearer ${charlieToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body: 'Still negotiating details.' }),
      });

      // accepted trades are in activeStatuses — messaging allowed
      expect(response.statusCode).toBe(201);
    });
  });
});
