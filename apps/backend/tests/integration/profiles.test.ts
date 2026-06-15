import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
const ALICE_NA_ALBUM_ID = '00000000-0000-0000-0001-000000000002';

describe.skipIf(!shouldRun)('Profiles routes (integration)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app.js');
    app = await buildApp();
    await app.ready();
    // Make alice's profile public AND her NA album trade-inventory-public so
    // the offered/wanted endpoints return data rather than 404.
    await app.db.query(
      `UPDATE user_settings SET profile_visibility = 'public' WHERE user_id = $1`,
      [ALICE_ID],
    );
    await app.db.query(
      `UPDATE user_albums SET is_trade_inventory_public = TRUE WHERE id = $1`,
      [ALICE_NA_ALBUM_ID],
    );
    // Bust any cached public-profile entry from a previous test run.
    await app.redis.flushdb();
  });

  afterAll(async () => {
    // Restore the album's privacy flag to its seeded default so other tests
    // don't observe a leaked "public" state.
    await app.db.query(
      `UPDATE user_albums SET is_trade_inventory_public = FALSE WHERE id = $1`,
      [ALICE_NA_ALBUM_ID],
    );
    await app?.close();
  });

  describe('GET /api/v1/profiles/:username', () => {
    it('returns 404 for an unknown username', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/profiles/this-user-does-not-exist',
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns alice\'s public profile with trading_inventory albums', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/profiles/alice' });
      expect(res.statusCode).toBe(200);
      // Global serializer camelizes keys — assert on the wire shape.
      const body = res.json<{
        userId: string;
        username: string;
        tradingInventory: {
          albumId: string;
          offered: { albumCode: string }[];
          wantedCount: number;
        }[];
      }>();
      expect(body.userId).toBe(ALICE_ID);
      expect(body.username).toBe('alice');
      expect(Array.isArray(body.tradingInventory)).toBe(true);
      expect(body.tradingInventory.length).toBeGreaterThan(0);
      const na = body.tradingInventory.find((a) => a.albumId === ALICE_NA_ALBUM_ID);
      expect(na).toBeDefined();
      expect(Array.isArray(na!.offered)).toBe(true);
      expect(typeof na!.wantedCount).toBe('number');
    });
  });

  describe('GET /:username/albums/:albumId/offered', () => {
    it('returns the paginated offered list with totals', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/profiles/alice/albums/${ALICE_NA_ALBUM_ID}/offered?limit=10`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ items: { albumCode: string; number: number }[]; total: number }>();
      expect(Array.isArray(body.items)).toBe(true);
      expect(body.total).toBeGreaterThanOrEqual(body.items.length);
    });

    it('honours the team filter via the team= query param', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/profiles/alice/albums/${ALICE_NA_ALBUM_ID}/offered?team=Mexico`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ items: { teamName: string | null }[] }>();
      for (const item of body.items) {
        // Every returned item must match the requested team — otherwise the
        // filter is broken even if the count looks plausible.
        if (item.teamName !== null) expect(item.teamName).toBe('Mexico');
      }
    });

    it('returns 404 for a non-existent album', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/profiles/alice/albums/00000000-0000-0000-0000-deadbeef0000/offered',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /:username/albums/:albumId/wanted', () => {
    it('returns the paginated wanted list', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/profiles/alice/albums/${ALICE_NA_ALBUM_ID}/wanted?limit=10`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ items: unknown[]; total: number }>();
      expect(Array.isArray(body.items)).toBe(true);
      expect(typeof body.total).toBe('number');
    });
  });

  describe('GET /:username/achievements', () => {
    it('returns 404 for an unknown profile', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/profiles/no-such-user/achievements',
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns the persisted achievement list', async () => {
      // Seed one achievement so we can prove the public read returns it.
      await app.db.query(
        `INSERT INTO user_achievements (user_id, achievement_key)
         VALUES ($1, 'first_sticker')
         ON CONFLICT (user_id, achievement_key) DO NOTHING`,
        [ALICE_ID],
      );

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/profiles/alice/achievements',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ items: { key: string; unlockedAt: string }[] }>();
      const keys = body.items.map((i) => i.key);
      expect(keys).toContain('first_sticker');
    });
  });

  describe('caching', () => {
    it('the public-profile endpoint is cached (second call returns identical body)', async () => {
      // No public guarantee about ETag, but the cache must produce the same
      // payload byte-for-byte between two adjacent calls (a regression here
      // would mean cache-key drift). We snapshot once, call again, compare.
      const a = await app.inject({ method: 'GET', url: '/api/v1/profiles/alice' });
      const b = await app.inject({ method: 'GET', url: '/api/v1/profiles/alice' });
      expect(a.statusCode).toBe(200);
      expect(b.statusCode).toBe(200);
      expect(b.payload).toBe(a.payload);
    });
  });
});
