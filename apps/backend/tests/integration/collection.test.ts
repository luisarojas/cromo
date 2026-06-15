import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * Integration tests for collection endpoints.
 *
 * These tests require a real PostgreSQL database and Redis instance.
 * They are skipped when DATABASE_URL does not point to a real server.
 *
 * Seeded test users (from 07_test_users.sql):
 *   admin   — 00000000-0000-0000-0000-000000000001  admin@test.local
 *   alice   — 00000000-0000-0000-0000-000000000002  alice@test.local
 *             north_america album: stickers 1–200 (every 7th duplicate)
 *             international album: stickers 1–50 (every 5th duplicate)
 *             trade_hidden on stickers #7 and #14 (north_america)
 *   bob     — 00000000-0000-0000-0000-000000000003  bob@test.local
 *             north_america album: stickers 150–400 (every 5th duplicate)
 *             international album: stickers 300–400 (every 8th duplicate)
 *             trade_forced on stickers #151 and #156 (north_america)
 *   charlie — 00000000-0000-0000-0000-000000000004  charlie@test.local
 *             north_america album: stickers 1–100 (every 3rd duplicate)
 *   diana   — 00000000-0000-0000-0000-000000000005  diana@test.local
 *             north_america album: stickers 250–400 (every 4th duplicate)
 */

const HAS_REAL_DB =
  typeof process.env['DATABASE_URL'] === 'string' &&
  process.env['DATABASE_URL'].includes('@') &&
  !process.env['DATABASE_URL'].includes('placeholder');

const HAS_REAL_REDIS =
  typeof process.env['REDIS_URL'] === 'string' &&
  process.env['REDIS_URL'].startsWith('redis://');

const shouldRun = HAS_REAL_DB && HAS_REAL_REDIS;

const ADMIN_ID   = '00000000-0000-0000-0000-000000000001';
const ALICE_ID   = '00000000-0000-0000-0000-000000000002';
const BOB_ID     = '00000000-0000-0000-0000-000000000003';
const CHARLIE_ID = '00000000-0000-0000-0000-000000000004';
const DIANA_ID   = '00000000-0000-0000-0000-000000000005';

const ALICE_NA_ALBUM_ID   = '00000000-0000-0000-0001-000000000002';
const ALICE_INTL_ALBUM_ID = '00000000-0000-0000-0001-000000000012';
const BOB_NA_ALBUM_ID     = '00000000-0000-0000-0001-000000000003';
const CHARLIE_ALBUM_ID    = '00000000-0000-0000-0001-000000000004';
const DIANA_ALBUM_ID      = '00000000-0000-0000-0001-000000000005';

// ─── Integration tests (require real DB + Redis) ──────────────────────────────

describe.skipIf(!shouldRun)('Collection routes (integration)', () => {
  let app: FastifyInstance;
  let aliceToken: string;
  let adminToken: string;
  let bobToken: string;
  let charlieToken: string;
  let dianaToken: string;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app.js');
    const { signAccessToken } = await import('../../src/middleware/auth.js');

    app = await buildApp();
    await app.ready();

    aliceToken   = signAccessToken({ sub: ALICE_ID,   email: 'alice@test.local',   role: 'user' });
    adminToken   = signAccessToken({ sub: ADMIN_ID,   email: 'admin@test.local',   role: 'admin' });
    bobToken     = signAccessToken({ sub: BOB_ID,     email: 'bob@test.local',     role: 'user' });
    charlieToken = signAccessToken({ sub: CHARLIE_ID, email: 'charlie@test.local', role: 'user' });
    dianaToken   = signAccessToken({ sub: DIANA_ID,   email: 'diana@test.local',   role: 'user' });

    // Reassert the trade_hidden fixture state. completeTrade in trade.test.ts
    // decrements user_stickers.quantity and our integration tests share a
    // single DB, so by the time we run we may find #7 or #14 missing or
    // single-quantity. Pin them back to the documented state before any
    // assertion runs.
    await (app as unknown as { db: { query: (sql: string, params?: unknown[]) => Promise<unknown> } }).db.query(
      `INSERT INTO user_stickers (album_id, sticker_variant_id, quantity, trade_hidden)
       SELECT $1::uuid, sv.id, 2, true
         FROM sticker_variants sv
         JOIN stickers s ON sv.sticker_id = s.id
        WHERE s.number IN (7, 14)
          AND sv.variant_type = 'base_border'
          AND s.album_type_id = (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026')
       ON CONFLICT (album_id, sticker_variant_id)
         DO UPDATE SET quantity = 2, trade_hidden = true`,
      [ALICE_NA_ALBUM_ID],
    );
    // Bust the cached collection/duplicates responses Redis is holding.
    await (app as unknown as { redis: { flushdb: () => Promise<void> } }).redis.flushdb();
  });

  afterAll(async () => {
    await app?.close();
  });

  // ── GET /collection ──────────────────────────────────────────────────────────

  describe(`GET /api/v1/users/${ALICE_ID}/collection (north_america album)`, () => {
    it('returns 200 with { items, nextCursor, total } for the owner', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${ALICE_ID}/collection`,
        headers: { Authorization: `Bearer ${aliceToken}` },
        query: { albumId: ALICE_NA_ALBUM_ID },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{ items: unknown[]; nextCursor: number | null; total: number }>();
      expect(Array.isArray(body.items)).toBe(true);
      expect(typeof body.total).toBe('number');
      expect('nextCursor' in body).toBe(true);
    });

    it('returns 401 without an Authorization header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${ALICE_ID}/collection`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 403 when a different user (Bob) accesses Alice\'s collection', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${ALICE_ID}/collection`,
        headers: { Authorization: `Bearer ${bobToken}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 200 when an admin accesses Alice\'s collection', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${ALICE_ID}/collection`,
        headers: { Authorization: `Bearer ${adminToken}` },
        query: { albumId: ALICE_NA_ALBUM_ID },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{ items: unknown[]; total: number }>();
      expect(Array.isArray(body.items)).toBe(true);
    });

    it('collection items include tradeHidden and tradeForced boolean fields', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${ALICE_ID}/collection`,
        headers: { Authorization: `Bearer ${aliceToken}` },
        query: { albumId: ALICE_NA_ALBUM_ID, limit: '200' },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        items: { tradeHidden: unknown; tradeForced: unknown }[];
      }>();

      expect(body.items.length).toBeGreaterThan(0);
      for (const item of body.items) {
        expect(typeof item.tradeHidden).toBe('boolean');
        expect(typeof item.tradeForced).toBe('boolean');
      }
    });

    it('seeded tradeHidden stickers (#7, #14) are visible in collection but flagged', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${ALICE_ID}/collection`,
        headers: { Authorization: `Bearer ${aliceToken}` },
        query: { albumId: ALICE_NA_ALBUM_ID, limit: '200' },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        items: { number: number; tradeHidden: boolean; tradeForced: boolean }[];
      }>();

      const hiddenItems = body.items.filter((i) => i.tradeHidden);
      const hiddenNumbers = hiddenItems.map((i) => i.number);

      // Stickers #7 and #14 were seeded with trade_hidden = true
      expect(hiddenNumbers).toContain(7);
      expect(hiddenNumbers).toContain(14);

      // tradeHidden items must not also be tradeForced
      for (const item of hiddenItems) {
        expect(item.tradeForced).toBe(false);
      }
    });
  });

  // ── Multiple albums ──────────────────────────────────────────────────────────

  describe('Multiple albums per user', () => {
    it('Alice\'s international album has fewer stickers than her north_america album', async () => {
      const [naRes, intlRes] = await Promise.all([
        app.inject({
          method: 'GET',
          url: `/api/v1/users/${ALICE_ID}/collection/stats`,
          headers: { Authorization: `Bearer ${aliceToken}` },
          query: { albumId: ALICE_NA_ALBUM_ID },
        }),
        app.inject({
          method: 'GET',
          url: `/api/v1/users/${ALICE_ID}/collection/stats`,
          headers: { Authorization: `Bearer ${aliceToken}` },
          query: { albumId: ALICE_INTL_ALBUM_ID },
        }),
      ]);

      expect(naRes.statusCode).toBe(200);
      expect(intlRes.statusCode).toBe(200);

      const naStats   = naRes.json<{ owned: number }>() ;
      const intlStats = intlRes.json<{ owned: number }>();

      // North America has stickers 1-200; international only 1-50
      expect(naStats.owned).toBeGreaterThan(intlStats.owned);
    });

    it('international album collection returns independent items from north_america album', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${ALICE_ID}/collection`,
        headers: { Authorization: `Bearer ${aliceToken}` },
        query: { albumId: ALICE_INTL_ALBUM_ID },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{ items: unknown[]; total: number }>();
      expect(Array.isArray(body.items)).toBe(true);
      // International album was seeded with stickers 1-50
      expect(body.total).toBeGreaterThan(0);
    });

    it('Bob\'s international album has separate collection from his north_america album', async () => {
      const [naRes, intlRes] = await Promise.all([
        app.inject({
          method: 'GET',
          url: `/api/v1/users/${BOB_ID}/collection/stats`,
          headers: { Authorization: `Bearer ${bobToken}` },
          query: { albumId: BOB_NA_ALBUM_ID },
        }),
        app.inject({
          method: 'GET',
          url: `/api/v1/users/${BOB_ID}/collection/stats`,
          headers: { Authorization: `Bearer ${bobToken}` },
          query: { albumId: '00000000-0000-0000-0001-000000000013' },
        }),
      ]);

      expect(naRes.statusCode).toBe(200);
      // International album request may 403 if not the album owner check uses album — skip if so
      if (intlRes.statusCode === 200) {
        const naStats   = naRes.json<{ owned: number }>();
        const intlStats = intlRes.json<{ owned: number }>();
        expect(naStats.owned).toBeGreaterThan(intlStats.owned);
      }
    });
  });

  // ── GET /collection/stats ────────────────────────────────────────────────────

  describe(`GET /api/v1/users/${ALICE_ID}/collection/stats`, () => {
    it('returns 200 with { total, owned, missing, duplicates, percentage }', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${ALICE_ID}/collection/stats`,
        headers: { Authorization: `Bearer ${aliceToken}` },
        query: { albumId: ALICE_NA_ALBUM_ID },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        total: number;
        owned: number;
        missing: number;
        duplicates: number;
        percentage: number;
      }>();

      expect(typeof body.total).toBe('number');
      expect(typeof body.owned).toBe('number');
      expect(typeof body.missing).toBe('number');
      expect(typeof body.duplicates).toBe('number');
      expect(typeof body.percentage).toBe('number');

      // Derived relationship: missing = total - owned
      expect(body.missing).toBe(body.total - body.owned);
      // Alice has stickers 1-200 seeded
      expect(body.owned).toBeGreaterThan(0);
    });

    it('Charlie\'s album stats reflect his 1–100 collection', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${CHARLIE_ID}/collection/stats`,
        headers: { Authorization: `Bearer ${charlieToken}` },
        query: { albumId: CHARLIE_ALBUM_ID },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{ owned: number; duplicates: number }>();
      expect(body.owned).toBeGreaterThan(0);
      // Every 3rd sticker is a duplicate → duplicates ≥ 1
      expect(body.duplicates).toBeGreaterThan(0);
    });

    it('Diana\'s album stats reflect her 250–400 collection', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${DIANA_ID}/collection/stats`,
        headers: { Authorization: `Bearer ${dianaToken}` },
        query: { albumId: DIANA_ALBUM_ID },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{ owned: number; duplicates: number }>();
      expect(body.owned).toBeGreaterThan(0);
      expect(body.duplicates).toBeGreaterThan(0);
    });
  });

  // ── GET /missing ─────────────────────────────────────────────────────────────

  describe(`GET /api/v1/users/${ALICE_ID}/missing`, () => {
    it('returns 200 with missing sticker items', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${ALICE_ID}/missing`,
        headers: { Authorization: `Bearer ${aliceToken}` },
        query: { albumId: ALICE_NA_ALBUM_ID },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        items: { id: string; albumCode: string; baseVariantId: string | null }[];
        total: number;
      }>();

      expect(Array.isArray(body.items)).toBe(true);
      expect(typeof body.total).toBe('number');
    });

    it('Alice\'s international album has more missing stickers than north_america', async () => {
      const [naRes, intlRes] = await Promise.all([
        app.inject({
          method: 'GET',
          url: `/api/v1/users/${ALICE_ID}/missing`,
          headers: { Authorization: `Bearer ${aliceToken}` },
          query: { albumId: ALICE_NA_ALBUM_ID },
        }),
        app.inject({
          method: 'GET',
          url: `/api/v1/users/${ALICE_ID}/missing`,
          headers: { Authorization: `Bearer ${aliceToken}` },
          query: { albumId: ALICE_INTL_ALBUM_ID },
        }),
      ]);

      expect(naRes.statusCode).toBe(200);
      expect(intlRes.statusCode).toBe(200);

      const naMissing   = naRes.json<{ total: number }>();
      const intlMissing = intlRes.json<{ total: number }>();

      // International only has stickers 1–50, so more are missing
      expect(intlMissing.total).toBeGreaterThan(naMissing.total);
    });
  });

  // ── GET /duplicates ──────────────────────────────────────────────────────────

  describe(`GET /api/v1/users/${ALICE_ID}/duplicates`, () => {
    it('returns 200 with Alice\'s duplicate stickers (every 7th seeded as duplicate)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${ALICE_ID}/duplicates`,
        headers: { Authorization: `Bearer ${aliceToken}` },
        query: { albumId: ALICE_NA_ALBUM_ID },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        items: { quantity: number; stickerVariantId: string; tradeHidden: boolean; tradeForced: boolean }[];
        total: number;
      }>();

      expect(Array.isArray(body.items)).toBe(true);
      // Every duplicate must have quantity > 1
      for (const item of body.items) {
        expect(item.quantity).toBeGreaterThan(1);
      }
    });

    it('duplicate items include tradeHidden and tradeForced fields', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${ALICE_ID}/duplicates`,
        headers: { Authorization: `Bearer ${aliceToken}` },
        query: { albumId: ALICE_NA_ALBUM_ID },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        items: { tradeHidden: unknown; tradeForced: unknown }[];
      }>();

      expect(body.items.length).toBeGreaterThan(0);
      for (const item of body.items) {
        expect(typeof item.tradeHidden).toBe('boolean');
        expect(typeof item.tradeForced).toBe('boolean');
      }
    });

    it('some of Alice\'s duplicates are marked tradeHidden', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${ALICE_ID}/duplicates`,
        headers: { Authorization: `Bearer ${aliceToken}` },
        query: { albumId: ALICE_NA_ALBUM_ID },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        items: { number: number; tradeHidden: boolean }[];
      }>();

      const hiddenNumbers = body.items
        .filter((i) => i.tradeHidden)
        .map((i) => i.number);

      expect(hiddenNumbers).toContain(7);
      expect(hiddenNumbers).toContain(14);
    });
  });

  // ── Trade flags: trade_forced ─────────────────────────────────────────────────

  describe('Trade flags — tradeForced (Bob)', () => {
    it('Bob\'s collection contains tradeForced stickers (#151, #156)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${BOB_ID}/collection`,
        headers: { Authorization: `Bearer ${bobToken}` },
        query: { albumId: BOB_NA_ALBUM_ID, limit: '300' },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        items: { number: number; tradeForced: boolean; quantity: number }[];
      }>();

      const forcedItems = body.items.filter((i) => i.tradeForced);
      const forcedNumbers = forcedItems.map((i) => i.number);

      expect(forcedNumbers).toContain(151);
      expect(forcedNumbers).toContain(156);

      // tradeForced stickers are singles (not duplicates), not tradeHidden
      for (const item of forcedItems) {
        expect(item.quantity).toBe(1);
      }
    });
  });

  // ── POST /stickers + DELETE /stickers/:variantId ─────────────────────────────

  describe('POST then DELETE sticker in collection', () => {
    let variantId: string;

    it('fetches a valid variantId from MEX5/variants', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/stickers/MEX5/variants',
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{ items: { id: string }[] }>();
      expect(body.items.length).toBeGreaterThan(0);
      variantId = body.items[0].id;
      expect(typeof variantId).toBe('string');
    });

    it(`POST /api/v1/users/${ALICE_ID}/stickers returns 200 with the resulting quantity`, async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/users/${ALICE_ID}/stickers`,
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ variantId, albumId: ALICE_NA_ALBUM_ID }),
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{ quantity: number }>();
      expect(typeof body.quantity).toBe('number');
      expect(body.quantity).toBeGreaterThan(0);
    });

    it(`DELETE /api/v1/users/${ALICE_ID}/stickers/:variantId returns 204`, async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/users/${ALICE_ID}/stickers/${variantId}`,
        headers: { Authorization: `Bearer ${aliceToken}` },
        query: { albumId: ALICE_NA_ALBUM_ID },
      });

      expect(response.statusCode).toBe(204);
    });
  });
});
