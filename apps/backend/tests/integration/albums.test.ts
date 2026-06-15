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
const BOB_ID   = '00000000-0000-0000-0000-000000000003';
const ALICE_NA_ALBUM_ID = '00000000-0000-0000-0001-000000000002';

describe.skipIf(!shouldRun)('Albums routes (integration)', () => {
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

  afterAll(async () => { await app?.close(); });

  // ── Album listing & stats ───────────────────────────────────────────────────

  describe('GET /users/:userId/albums', () => {
    it('returns 403 when one user tries to read another\'s albums list', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${ALICE_ID}/albums`,
        headers: { Authorization: `Bearer ${bobToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns alice\'s albums for alice', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${ALICE_ID}/albums`,
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ items: { id: string }[] }>();
      expect(body.items.length).toBeGreaterThanOrEqual(2);
      expect(body.items.map((a) => a.id)).toContain(ALICE_NA_ALBUM_ID);
    });

    it('with withStats=true the items include a stats object', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${ALICE_ID}/albums?withStats=true`,
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ items: { stats?: { total: number; owned: number } }[] }>();
      expect(body.items.length).toBeGreaterThan(0);
      // Every item should carry stats — even an empty album returns 0/0.
      for (const item of body.items) {
        expect(item.stats).toBeDefined();
        expect(typeof item.stats!.total).toBe('number');
        expect(typeof item.stats!.owned).toBe('number');
      }
    });
  });

  describe('GET /users/:userId/albums/stats', () => {
    it('returns per-album stats; owned + missing equals total for each row', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${ALICE_ID}/albums/stats`,
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ items: { albumId: string; total: number; owned: number; missing: number; duplicates: number; percentage: number }[] }>();
      expect(body.items.length).toBeGreaterThan(0);
      for (const item of body.items) {
        expect(item.owned + item.missing).toBe(item.total);
        expect(item.owned).toBeGreaterThanOrEqual(item.duplicates);
        expect(item.percentage).toBeGreaterThanOrEqual(0);
        expect(item.percentage).toBeLessThanOrEqual(100);
      }
    });
  });

  // ── Single album views ──────────────────────────────────────────────────────

  describe('GET /users/:userId/albums/:albumId', () => {
    it('returns 404 when the album does not belong to the user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${ALICE_ID}/albums/00000000-0000-0000-0000-deadbeef0000`,
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns the album when accessed by its owner', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${ALICE_ID}/albums/${ALICE_NA_ALBUM_ID}`,
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ id: string; albumTypeKey: string; settings: { defaultBaseVariant: string } }>();
      expect(body.id).toBe(ALICE_NA_ALBUM_ID);
      expect(body.albumTypeKey).toBe('fifa_world_cup_2026');
      expect(['base_border', 'base_borderless'].includes(body.settings.defaultBaseVariant)).toBe(true);
    });
  });

  describe('GET /users/:userId/albums/:albumId/view', () => {
    it('bundles ownedVariants + stats + totalExtraCopies + filterOptions + crossAlbum', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${ALICE_ID}/albums/${ALICE_NA_ALBUM_ID}/view`,
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{
        ownedVariants: unknown[];
        stats: { total: number; owned: number };
        totalExtraCopies: number;
        filterOptions: unknown;
        crossAlbum: unknown;
      }>();
      expect(Array.isArray(body.ownedVariants)).toBe(true);
      expect(typeof body.stats.total).toBe('number');
      expect(typeof body.totalExtraCopies).toBe('number');
      expect(body.filterOptions).toBeDefined();
      expect(body.crossAlbum).toBeDefined();
    });
  });

  // ── Album CRUD ──────────────────────────────────────────────────────────────

  describe('POST + PATCH + DELETE /users/:userId/albums', () => {
    it('round-trips a custom album: create → patch → delete', async () => {
      // CREATE
      const createRes = await app.inject({
        method: 'POST',
        url: `/api/v1/users/${ALICE_ID}/albums`,
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: {
          edition: 'north_america',
          format: 'softcover_standard',
          alias: 'integration-test',
          settings: { defaultBaseVariant: 'base_border' },
        },
      });
      expect(createRes.statusCode).toBe(201);
      const created = createRes.json<{ id: string; alias: string; stats: { total: number } }>();
      expect(created.alias).toBe('integration-test');

      try {
        // PATCH alias
        const patchRes = await app.inject({
          method: 'PATCH',
          url: `/api/v1/users/${ALICE_ID}/albums/${created.id}`,
          headers: { Authorization: `Bearer ${aliceToken}` },
          payload: { alias: 'renamed', isTradeInventoryPublic: true },
        });
        expect(patchRes.statusCode).toBe(200);
        const patched = patchRes.json<{ alias: string; isTradeInventoryPublic: boolean }>();
        expect(patched.alias).toBe('renamed');
        expect(patched.isTradeInventoryPublic).toBe(true);

        // Verify via direct DB read.
        const { rows } = await app.db.query<{ alias: string }>(
          `SELECT alias FROM user_albums WHERE id = $1`,
          [created.id],
        );
        expect(rows[0]?.alias).toBe('renamed');
      } finally {
        // DELETE (always cleans up even if the PATCH fails)
        const delRes = await app.inject({
          method: 'DELETE',
          url: `/api/v1/users/${ALICE_ID}/albums/${created.id}`,
          headers: { Authorization: `Bearer ${aliceToken}` },
        });
        expect(delRes.statusCode).toBe(204);

        // Confirm the row is gone.
        const { rowCount } = await app.db.query(
          `SELECT 1 FROM user_albums WHERE id = $1`,
          [created.id],
        );
        expect(rowCount).toBe(0);
      }
    });
  });

  // ── Favourites ──────────────────────────────────────────────────────────────

  describe('Favourites (list + put + toggle)', () => {
    let sampleStickerIds: string[];

    beforeAll(async () => {
      // Grab two real sticker IDs for the FWC 2026 catalog so we can favourite them.
      const { rows } = await app.db.query<{ id: string }>(
        `SELECT s.id FROM stickers s
           JOIN album_types at ON at.id = s.album_type_id
          WHERE at.key = 'fifa_world_cup_2026'
          ORDER BY s.number LIMIT 2`,
      );
      sampleStickerIds = rows.map((r) => r.id);
      expect(sampleStickerIds.length).toBe(2);
    });

    it('starts empty, PUT replaces the set, GET returns the same IDs', async () => {
      // Start clean.
      await app.db.query(
        `DELETE FROM user_sticker_favourites WHERE album_id = $1`,
        [ALICE_NA_ALBUM_ID],
      );

      // GET empty
      const empty = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${ALICE_ID}/albums/${ALICE_NA_ALBUM_ID}/favourites`,
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(empty.statusCode).toBe(200);
      expect(empty.json<{ items: string[] }>().items).toEqual([]);

      // PUT set
      const put = await app.inject({
        method: 'PUT',
        url: `/api/v1/users/${ALICE_ID}/albums/${ALICE_NA_ALBUM_ID}/favourites`,
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: { stickerIds: sampleStickerIds },
      });
      expect(put.statusCode).toBe(204);

      // GET reflects PUT
      const after = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${ALICE_ID}/albums/${ALICE_NA_ALBUM_ID}/favourites`,
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(after.json<{ items: string[] }>().items.sort()).toEqual([...sampleStickerIds].sort());
    });

    it('toggle adds then removes the same sticker', async () => {
      const stickerId = sampleStickerIds[0]!;
      // Ensure not present
      await app.db.query(
        `DELETE FROM user_sticker_favourites WHERE album_id = $1 AND sticker_id = $2`,
        [ALICE_NA_ALBUM_ID, stickerId],
      );
      const first = await app.inject({
        method: 'POST',
        url: `/api/v1/users/${ALICE_ID}/albums/${ALICE_NA_ALBUM_ID}/favourites/${stickerId}/toggle`,
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(first.statusCode).toBe(200);
      expect(first.json<{ favourited: boolean }>().favourited).toBe(true);

      const second = await app.inject({
        method: 'POST',
        url: `/api/v1/users/${ALICE_ID}/albums/${ALICE_NA_ALBUM_ID}/favourites/${stickerId}/toggle`,
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(second.statusCode).toBe(200);
      expect(second.json<{ favourited: boolean }>().favourited).toBe(false);

      // Cleanup.
      await app.db.query(
        `DELETE FROM user_sticker_favourites WHERE album_id = $1`,
        [ALICE_NA_ALBUM_ID],
      );
    });
  });

  // ── Public catalog endpoints (no auth) ──────────────────────────────────────

  describe('Public album-types / editions / formats', () => {
    it('GET /album-types returns the FWC 2026 entry', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/album-types' });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ items: { key: string; name: string }[] }>();
      expect(body.items.some((t) => t.key === 'fifa_world_cup_2026')).toBe(true);
    });

    it('GET /album-types/:typeKey/editions returns 404 for unknown type', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/album-types/no_such_type/editions',
      });
      expect(res.statusCode).toBe(404);
    });

    it('GET /album-types/:typeKey/editions returns the seeded editions', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/album-types/fifa_world_cup_2026/editions',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ items: { key: string }[] }>();
      expect(body.items.map((e) => e.key)).toContain('north_america');
    });

    it('GET /album-types/:typeKey/formats returns formats with per-edition availability', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/album-types/fifa_world_cup_2026/formats',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ items: { key: string; editions: string[] }[] }>();
      expect(body.items.length).toBeGreaterThan(0);
      const sc = body.items.find((f) => f.key === 'softcover_standard');
      expect(sc).toBeDefined();
      expect(Array.isArray(sc!.editions)).toBe(true);
    });
  });
});
