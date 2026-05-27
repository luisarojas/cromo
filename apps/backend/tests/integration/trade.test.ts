import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * Integration tests for trade request endpoints.
 *
 * Requires a real PostgreSQL database and Redis instance.
 * Skipped when DATABASE_URL does not point to a real server.
 *
 * Depends on seeded data from 07_test_users.sql:
 *   Trade A (Alice → Bob, pending):      00000000-0000-0000-0002-000000000001
 *   Trade B (Charlie → Diana, accepted): 00000000-0000-0000-0002-000000000002
 *
 *   Alice:   stickers 1–200, every 7th a duplicate; trade_hidden on #7 and #14
 *   Bob:     stickers 150–400, every 5th a duplicate; trade_forced on #151 and #156
 *   Charlie: stickers 1–100, every 3rd a duplicate
 *   Diana:   stickers 250–400, every 4th a duplicate
 *
 * Routes under test:
 *   GET    /api/v1/trade/matches
 *   GET    /api/v1/trade/requests
 *   GET    /api/v1/trade/requests/:id
 *   POST   /api/v1/trade/requests
 *   POST   /api/v1/trade/requests/:id/accept
 *   POST   /api/v1/trade/requests/:id/decline
 *   POST   /api/v1/trade/requests/:id/counter
 *   POST   /api/v1/trade/requests/:id/cancel
 *   POST   /api/v1/trade/requests/:id/complete
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

const ALICE_NA_ALBUM_ID   = '00000000-0000-0000-0001-000000000002';
const BOB_NA_ALBUM_ID     = '00000000-0000-0000-0001-000000000003';
const CHARLIE_ALBUM_ID    = '00000000-0000-0000-0001-000000000004';
const DIANA_ALBUM_ID      = '00000000-0000-0000-0001-000000000005';

// Seeded trades
const TRADE_A = '00000000-0000-0000-0002-000000000001'; // Alice → Bob, pending
const TRADE_B = '00000000-0000-0000-0002-000000000002'; // Charlie → Diana, accepted

const TRADES_URL = '/api/v1/trade/requests';
const TRADE_URL  = (id: string) => `/api/v1/trade/requests/${id}`;
const ACTION_URL = (id: string, action: string) => `/api/v1/trade/requests/${id}/${action}`;
const MATCHES_URL = '/api/v1/trade/matches';

describe.skipIf(!shouldRun)('Trade routes (integration)', () => {
  let app: FastifyInstance;
  let aliceToken: string;
  let bobToken: string;
  let charlieToken: string;
  let dianaToken: string;

  // Sticker variant IDs looked up from the DB (base_border variants in the 2026 album)
  let variantId35:  string; // sticker #35 — in Alice's duplicates (35 % 7 = 0)
  let variantId180: string; // sticker #180 — Alice is missing, Bob has it

  // Track trades created during tests so we can clean them up
  const createdTradeIds: string[] = [];

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app.js');
    const { signAccessToken } = await import('../../src/middleware/auth.js');

    app = await buildApp();
    await app.ready();

    aliceToken   = signAccessToken({ sub: ALICE_ID,   email: 'alice@test.local',   role: 'user' });
    bobToken     = signAccessToken({ sub: BOB_ID,     email: 'bob@test.local',     role: 'user' });
    charlieToken = signAccessToken({ sub: CHARLIE_ID, email: 'charlie@test.local', role: 'user' });
    dianaToken   = signAccessToken({ sub: DIANA_ID,   email: 'diana@test.local',   role: 'user' });

    const { rows } = await app.db.query<{ number: number; id: string }>(
      `SELECT s.number, sv.id
       FROM sticker_variants sv
       JOIN stickers s ON s.id = sv.sticker_id
       WHERE s.number = ANY(ARRAY[35, 180])
         AND sv.variant_type = 'base_border'
         AND s.album_type_id = (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026')`,
    );
    for (const row of rows) {
      if (row.number === 35)  variantId35  = row.id;
      if (row.number === 180) variantId180 = row.id;
    }
  });

  afterAll(async () => {
    if (createdTradeIds.length > 0) {
      await app.db.query(
        `DELETE FROM trade_items WHERE trade_id = ANY($1::uuid[])`,
        [createdTradeIds],
      );
      await app.db.query(
        `DELETE FROM trade_requests WHERE id = ANY($1::uuid[])`,
        [createdTradeIds],
      );
    }
    await app?.close();
  });

  // ── GET /trade/matches ────────────────────────────────────────────────────────

  describe('GET /api/v1/trade/matches', () => {
    it('returns 400 when albumId is missing', async () => {
      const res = await app.inject({
        method: 'GET',
        url: MATCHES_URL,
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 401 when unauthenticated', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `${MATCHES_URL}?albumId=${ALICE_NA_ALBUM_ID}`,
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 200 with a paginated matches list for a valid album', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `${MATCHES_URL}?albumId=${ALICE_NA_ALBUM_ID}`,
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ items: unknown[]; nextCursor: string | null }>();
      expect(Array.isArray(body.items)).toBe(true);
      expect('nextCursor' in body).toBe(true);
    });
  });

  // ── GET /trade/requests (list) ────────────────────────────────────────────────

  describe('GET /api/v1/trade/requests', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await app.inject({ method: 'GET', url: TRADES_URL });
      expect(res.statusCode).toBe(401);
    });

    it('returns 200 with items and nextCursor for Alice', async () => {
      const res = await app.inject({
        method: 'GET',
        url: TRADES_URL,
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ items: unknown[]; nextCursor: string | null }>();
      expect(Array.isArray(body.items)).toBe(true);
      expect('nextCursor' in body).toBe(true);
      // Alice is part of Trade A (seeded), so at least one trade is returned
      expect(body.items.length).toBeGreaterThanOrEqual(1);
    });

    it('filters by status', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `${TRADES_URL}?status=pending`,
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ items: { status: string }[] }>();
      for (const item of body.items) {
        expect(item.status).toBe('pending');
      }
    });
  });

  // ── GET /trade/requests/:id (detail) ─────────────────────────────────────────

  describe('GET /api/v1/trade/requests/:id', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await app.inject({ method: 'GET', url: TRADE_URL(TRADE_A) });
      expect(res.statusCode).toBe(401);
    });

    it('returns 200 with full trade detail for a participant', async () => {
      const res = await app.inject({
        method: 'GET',
        url: TRADE_URL(TRADE_A),
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{
        id: string;
        status: string;
        requesterId: string;
        recipientId: string;
        items: unknown[];
      }>();
      expect(body.id).toBe(TRADE_A);
      expect(body.status).toBe('pending');
      expect(body.requesterId).toBe(ALICE_ID);
      expect(body.recipientId).toBe(BOB_ID);
      expect(Array.isArray(body.items)).toBe(true);
    });

    it('returns 403 when the user is not a participant', async () => {
      // Charlie is not in Trade A (Alice ↔ Bob)
      const res = await app.inject({
        method: 'GET',
        url: TRADE_URL(TRADE_A),
        headers: { Authorization: `Bearer ${charlieToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns 404 for a nonexistent trade', async () => {
      const res = await app.inject({
        method: 'GET',
        url: TRADE_URL('00000000-0000-0000-0000-000000000000'),
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── POST /trade/requests (create) ─────────────────────────────────────────────

  describe('POST /api/v1/trade/requests', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await app.inject({
        method: 'POST',
        url: TRADES_URL,
        payload: { recipientId: BOB_ID, items: [], offerCash: 1, wantCash: 1 },
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 400 when the trade has no offer side', async () => {
      const res = await app.inject({
        method: 'POST',
        url: TRADES_URL,
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: {
          recipientId: BOB_ID,
          items: [{ variantId: variantId180, direction: 'want', quantity: 1 }],
          offerCash: 0,
          wantCash: 0,
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when the trade has no want side', async () => {
      const res = await app.inject({
        method: 'POST',
        url: TRADES_URL,
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: {
          recipientId: BOB_ID,
          items: [{ variantId: variantId35, direction: 'offer', quantity: 1 }],
          offerCash: 0,
          wantCash: 0,
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when the user tries to trade with themselves', async () => {
      const res = await app.inject({
        method: 'POST',
        url: TRADES_URL,
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: {
          recipientId: ALICE_ID,
          items: [],
          offerCash: 1,
          wantCash: 1,
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('creates a cash-only trade and returns 201 with an id', async () => {
      const res = await app.inject({
        method: 'POST',
        url: TRADES_URL,
        headers: { Authorization: `Bearer ${bobToken}` },
        payload: {
          recipientId: ALICE_ID,
          requesterAlbumId: BOB_NA_ALBUM_ID,
          items: [],
          offerCash: 100,
          wantCash: 50,
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json<{ id: string }>();
      expect(typeof body.id).toBe('string');
      createdTradeIds.push(body.id);
    });

    it('creates a sticker trade and returns 201 with an id', async () => {
      const res = await app.inject({
        method: 'POST',
        url: TRADES_URL,
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: {
          recipientId: BOB_ID,
          requesterAlbumId: ALICE_NA_ALBUM_ID,
          items: [
            { variantId: variantId35,  direction: 'offer', quantity: 1 },
            { variantId: variantId180, direction: 'want',  quantity: 1 },
          ],
          offerCash: 0,
          wantCash: 0,
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json<{ id: string }>();
      expect(typeof body.id).toBe('string');
      createdTradeIds.push(body.id);
    });

    it('returns 201 on duplicate request with an idempotency key', async () => {
      const idempotencyKey = `test-idem-${Date.now()}`;
      const payload = {
        recipientId: ALICE_ID,
        requesterAlbumId: BOB_NA_ALBUM_ID,
        items: [],
        offerCash: 10,
        wantCash: 5,
      };
      const first = await app.inject({
        method: 'POST',
        url: TRADES_URL,
        headers: { Authorization: `Bearer ${bobToken}`, 'idempotency-key': idempotencyKey },
        payload,
      });
      expect(first.statusCode).toBe(201);
      createdTradeIds.push(first.json<{ id: string }>().id);

      const second = await app.inject({
        method: 'POST',
        url: TRADES_URL,
        headers: { Authorization: `Bearer ${bobToken}`, 'idempotency-key': idempotencyKey },
        payload,
      });
      expect(second.statusCode).toBe(201);
      // Same trade ID returned for the duplicate request
      expect(second.json<{ id: string }>().id).toBe(first.json<{ id: string }>().id);
    });
  });

  // ── POST /trade/requests/:id/decline ──────────────────────────────────────────

  describe('POST /api/v1/trade/requests/:id/decline', () => {
    let tradeIdToDecline: string;

    beforeAll(async () => {
      // Alice creates a trade for Bob to decline
      const res = await app.inject({
        method: 'POST',
        url: TRADES_URL,
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: {
          recipientId: BOB_ID,
          requesterAlbumId: ALICE_NA_ALBUM_ID,
          items: [],
          offerCash: 5,
          wantCash: 5,
        },
      });
      tradeIdToDecline = res.json<{ id: string }>().id;
      createdTradeIds.push(tradeIdToDecline);
    });

    it('returns 403 when a non-participant tries to decline', async () => {
      const res = await app.inject({
        method: 'POST',
        url: ACTION_URL(tradeIdToDecline, 'decline'),
        headers: { Authorization: `Bearer ${charlieToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns 204 when Bob declines the trade', async () => {
      const res = await app.inject({
        method: 'POST',
        url: ACTION_URL(tradeIdToDecline, 'decline'),
        headers: { Authorization: `Bearer ${bobToken}` },
      });
      expect(res.statusCode).toBe(204);
    });

    it('returns an error when trying to decline an already-declined trade', async () => {
      const res = await app.inject({
        method: 'POST',
        url: ACTION_URL(tradeIdToDecline, 'decline'),
        headers: { Authorization: `Bearer ${bobToken}` },
      });
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  // ── POST /trade/requests/:id/accept ──────────────────────────────────────────

  describe('POST /api/v1/trade/requests/:id/accept', () => {
    let tradeIdToAccept: string;

    beforeAll(async () => {
      // Alice creates a trade for Bob to accept
      const res = await app.inject({
        method: 'POST',
        url: TRADES_URL,
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: {
          recipientId: BOB_ID,
          requesterAlbumId: ALICE_NA_ALBUM_ID,
          items: [],
          offerCash: 5,
          wantCash: 5,
        },
      });
      tradeIdToAccept = res.json<{ id: string }>().id;
      createdTradeIds.push(tradeIdToAccept);
    });

    it('returns 403 when the requester tries to accept their own trade', async () => {
      const res = await app.inject({
        method: 'POST',
        url: ACTION_URL(tradeIdToAccept, 'accept'),
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns 204 when the recipient accepts', async () => {
      const res = await app.inject({
        method: 'POST',
        url: ACTION_URL(tradeIdToAccept, 'accept'),
        headers: { Authorization: `Bearer ${bobToken}` },
      });
      expect(res.statusCode).toBe(204);
    });

    it('trade status is now accepted', async () => {
      const res = await app.inject({
        method: 'GET',
        url: TRADE_URL(tradeIdToAccept),
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ status: string }>().status).toBe('accepted');
    });
  });

  // ── POST /trade/requests/:id/cancel ──────────────────────────────────────────

  describe('POST /api/v1/trade/requests/:id/cancel', () => {
    let tradeIdToCancel: string;

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: TRADES_URL,
        headers: { Authorization: `Bearer ${bobToken}` },
        payload: {
          recipientId: ALICE_ID,
          requesterAlbumId: BOB_NA_ALBUM_ID,
          items: [],
          offerCash: 1,
          wantCash: 1,
        },
      });
      tradeIdToCancel = res.json<{ id: string }>().id;
      createdTradeIds.push(tradeIdToCancel);
    });

    it('returns 403 when a non-participant tries to cancel', async () => {
      const res = await app.inject({
        method: 'POST',
        url: ACTION_URL(tradeIdToCancel, 'cancel'),
        headers: { Authorization: `Bearer ${charlieToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns 204 when the requester cancels their own trade', async () => {
      const res = await app.inject({
        method: 'POST',
        url: ACTION_URL(tradeIdToCancel, 'cancel'),
        headers: { Authorization: `Bearer ${bobToken}` },
      });
      expect(res.statusCode).toBe(204);
    });

    it('trade status is now cancelled', async () => {
      const res = await app.inject({
        method: 'GET',
        url: TRADE_URL(tradeIdToCancel),
        headers: { Authorization: `Bearer ${bobToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ status: string }>().status).toBe('cancelled');
    });
  });

  // ── POST /trade/requests/:id/counter ─────────────────────────────────────────

  describe('POST /api/v1/trade/requests/:id/counter', () => {
    let tradeIdToCounter: string;

    beforeAll(async () => {
      // Alice creates; Bob will counter
      const res = await app.inject({
        method: 'POST',
        url: TRADES_URL,
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: {
          recipientId: BOB_ID,
          requesterAlbumId: ALICE_NA_ALBUM_ID,
          items: [],
          offerCash: 10,
          wantCash: 5,
        },
      });
      tradeIdToCounter = res.json<{ id: string }>().id;
      createdTradeIds.push(tradeIdToCounter);
    });

    it('returns 204 when the recipient counters the trade', async () => {
      const res = await app.inject({
        method: 'POST',
        url: ACTION_URL(tradeIdToCounter, 'counter'),
        headers: { Authorization: `Bearer ${bobToken}` },
        payload: { items: [], offerCash: 7, wantCash: 3 },
      });
      expect(res.statusCode).toBe(204);
    });

    it('counter_count increments after each counter', async () => {
      const res = await app.inject({
        method: 'GET',
        url: TRADE_URL(tradeIdToCounter),
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ counterCount: number }>().counterCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ── POST /trade/requests/:id/complete ────────────────────────────────────────

  describe('POST /api/v1/trade/requests/:id/complete (two-step confirmation)', () => {
    let tradeIdToComplete: string;

    beforeAll(async () => {
      // Create and accept a new trade so we have a clean accepted trade.
      // Use Alice → Bob (neither is soft-banned).
      const createRes = await app.inject({
        method: 'POST',
        url: TRADES_URL,
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: {
          recipientId: BOB_ID,
          requesterAlbumId: ALICE_NA_ALBUM_ID,
          items: [],
          offerCash: 1,
          wantCash: 1,
        },
      });
      tradeIdToComplete = createRes.json<{ id: string }>().id;
      createdTradeIds.push(tradeIdToComplete);

      // Bob accepts
      await app.inject({
        method: 'POST',
        url: ACTION_URL(tradeIdToComplete, 'accept'),
        headers: { Authorization: `Bearer ${bobToken}` },
      });
    });

    it('returns 403 when a non-participant tries to complete', async () => {
      const res = await app.inject({
        method: 'POST',
        url: ACTION_URL(tradeIdToComplete, 'complete'),
        headers: { Authorization: `Bearer ${charlieToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns 204 when one side confirms (status stays accepted — waiting for other side)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: ACTION_URL(tradeIdToComplete, 'complete'),
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(res.statusCode).toBe(204);

      const detail = await app.inject({
        method: 'GET',
        url: TRADE_URL(tradeIdToComplete),
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      // After first confirm, status is still accepted (waiting for Bob)
      expect(detail.json<{ status: string }>().status).toBe('accepted');
    });

    it('returns 204 for the second confirmation, and status becomes completed', async () => {
      const res = await app.inject({
        method: 'POST',
        url: ACTION_URL(tradeIdToComplete, 'complete'),
        headers: { Authorization: `Bearer ${bobToken}` },
      });
      expect(res.statusCode).toBe(204);

      const detail = await app.inject({
        method: 'GET',
        url: TRADE_URL(tradeIdToComplete),
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(detail.json<{ status: string }>().status).toBe('completed');
    });
  });
});
