import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * Integration tests for collection endpoints.
 *
 * These tests require a real PostgreSQL database and Redis instance.
 * They are skipped when DATABASE_URL does not point to a real server.
 *
 * Seeded test users (from seed-database):
 *   admin  — 00000000-0000-0000-0000-000000000001  admin@test.local
 *   alice  — 00000000-0000-0000-0000-000000000002  alice@test.local  (stickers 1-200, every 7th is duplicate)
 *   bob    — 00000000-0000-0000-0000-000000000003  bob@test.local
 */

const HAS_REAL_DB =
  typeof process.env['DATABASE_URL'] === 'string' &&
  process.env['DATABASE_URL'].includes('@') &&
  !process.env['DATABASE_URL'].includes('placeholder');

const HAS_REAL_REDIS =
  typeof process.env['REDIS_URL'] === 'string' &&
  process.env['REDIS_URL'].startsWith('redis://');

const shouldRun = HAS_REAL_DB && HAS_REAL_REDIS;

const ALICE_ID = '00000000-0000-0000-0000-000000000002';
const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const BOB_ID   = '00000000-0000-0000-0000-000000000003';

// ─── Integration tests (require real DB + Redis) ──────────────────────────────

describe.skipIf(!shouldRun)('Collection routes (integration)', () => {
  let app: FastifyInstance;
  let aliceToken: string;
  let adminToken: string;
  let bobToken: string;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app.js');
    const { signAccessToken } = await import('../../src/middleware/auth.js');

    app = await buildApp();
    await app.ready();

    aliceToken = signAccessToken({ sub: ALICE_ID, email: 'alice@test.local', role: 'user' });
    adminToken = signAccessToken({ sub: ADMIN_ID, email: 'admin@test.local', role: 'admin' });
    bobToken   = signAccessToken({ sub: BOB_ID,   email: 'bob@test.local',   role: 'user' });
  });

  afterAll(async () => {
    await app?.close();
  });

  // ── GET /collection ──────────────────────────────────────────────────────────

  describe(`GET /api/v1/users/${ALICE_ID}/collection`, () => {
    it('returns 200 with { items, nextCursor, total } for the owner', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${ALICE_ID}/collection`,
        headers: { Authorization: `Bearer ${aliceToken}` },
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
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{ items: unknown[]; total: number }>();
      expect(Array.isArray(body.items)).toBe(true);
    });
  });

  // ── GET /collection/stats ────────────────────────────────────────────────────

  describe(`GET /api/v1/users/${ALICE_ID}/collection/stats`, () => {
    it('returns 200 with { total, owned, missing, duplicates, percentage }', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${ALICE_ID}/collection/stats`,
        headers: { Authorization: `Bearer ${aliceToken}` },
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
  });

  // ── GET /missing ─────────────────────────────────────────────────────────────

  describe(`GET /api/v1/users/${ALICE_ID}/missing`, () => {
    it('returns 200 with missing sticker items', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${ALICE_ID}/missing`,
        headers: { Authorization: `Bearer ${aliceToken}` },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        items: { id: string; album_code: string; base_variant_id: string | null }[];
        total: number;
      }>();

      expect(Array.isArray(body.items)).toBe(true);
      expect(typeof body.total).toBe('number');
    });
  });

  // ── GET /duplicates ──────────────────────────────────────────────────────────

  describe(`GET /api/v1/users/${ALICE_ID}/duplicates`, () => {
    it('returns 200 with Alice\'s duplicate stickers (every 7th seeded as duplicate)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${ALICE_ID}/duplicates`,
        headers: { Authorization: `Bearer ${aliceToken}` },
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        items: { quantity: number; sticker_variant_id: string }[];
        total: number;
      }>();

      expect(Array.isArray(body.items)).toBe(true);
      // Every duplicate must have quantity > 1
      for (const item of body.items) {
        expect(item.quantity).toBeGreaterThan(1);
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

    it(`POST /api/v1/users/${ALICE_ID}/stickers returns 204`, async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/users/${ALICE_ID}/stickers`,
        headers: {
          Authorization: `Bearer ${aliceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ variantId }),
      });

      expect(response.statusCode).toBe(204);
    });

    it(`DELETE /api/v1/users/${ALICE_ID}/stickers/:variantId returns 204`, async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/users/${ALICE_ID}/stickers/${variantId}`,
        headers: { Authorization: `Bearer ${aliceToken}` },
      });

      expect(response.statusCode).toBe(204);
    });
  });
});
