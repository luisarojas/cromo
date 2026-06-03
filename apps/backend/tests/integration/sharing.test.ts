import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * Integration tests for the public sharing / profile endpoints.
 *
 * These tests require a real PostgreSQL database and Redis instance.
 * They are skipped when DATABASE_URL does not point to a real server.
 *
 * Seeded test users (from 07_test_users.sql):
 *   alice   — 00000000-0000-0000-0000-000000000002  alice@test.local
 *             north_america album: stickers 1–200 (every 7th duplicate)
 *             trade_hidden on #7 and #14 (north_america)
 *   bob     — 00000000-0000-0000-0000-000000000003  bob@test.local
 *             north_america album: stickers 150–400 (every 5th duplicate)
 *             trade_forced on #151 and #156 (north_america)
 *
 * Coca-Cola stickers (from 08_coca_cola_stickers.sql):
 *   CC1–CC13 across 20 sticker rows (regional alternates share an album_code).
 *   All outside Alice's 1–200 range, so she is missing every CC slot. Album
 *   completion treats CC by album_code, so toggling includeCocaCola moves the
 *   wantedCount by exactly 13 (one per code group).
 *
 * Setup / teardown:
 *   beforeAll enables is_trade_inventory_public on Alice's and Bob's NA albums
 *   so that the public profile endpoints return data. afterAll restores them to
 *   false so this suite does not affect other test suites.
 */

// ─── Fixed test IDs (from 07_test_users.sql) ──────────────────────────────────

const ALICE_ID            = '00000000-0000-0000-0000-000000000002';
const BOB_ID              = '00000000-0000-0000-0000-000000000003';
const ALICE_NA_ALBUM_ID   = '00000000-0000-0000-0001-000000000002';
const ALICE_INTL_ALBUM_ID = '00000000-0000-0000-0001-000000000012';
const BOB_NA_ALBUM_ID     = '00000000-0000-0000-0001-000000000003';

// ─── Response types (camelCase — the backend serializer converts snake→camel) ──

interface PublicInventoryItem {
  stickerVariantId: string;
  number: number;
  albumCode: string;
  playerName: string | null;
  stickerType: string;
  teamName: string | null;
  variantType: string;
  quantity: number | null;
}

interface PublicProfileAlbum {
  albumId: string;
  albumTypeName: string;
  editionName: string;
  alias: string | null;
  isDefault: boolean;
  offered: PublicInventoryItem[];
  wantedCount: number;
}

interface PublicProfile {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  memberSince: string;
  tradingInventory: PublicProfileAlbum[];
}

interface PublicWantedPage {
  items: PublicInventoryItem[];
  nextCursor: number | null;
  total: number;
}

// ─── Environment guard ─────────────────────────────────────────────────────────

const HAS_REAL_DB =
  typeof process.env['DATABASE_URL'] === 'string' &&
  process.env['DATABASE_URL'].includes('@') &&
  !process.env['DATABASE_URL'].includes('placeholder');

const HAS_REAL_REDIS =
  typeof process.env['REDIS_URL'] === 'string' &&
  process.env['REDIS_URL'].startsWith('redis://');

const shouldRun = HAS_REAL_DB && HAS_REAL_REDIS;

// ─── Suite ────────────────────────────────────────────────────────────────────

describe.skipIf(!shouldRun)('Sharing / public profile routes (integration)', () => {
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

    // Enable public trade inventory for Alice's and Bob's north_america albums.
    await Promise.all([
      app.inject({
        method: 'PATCH',
        url: `/api/v1/users/${ALICE_ID}/albums/${ALICE_NA_ALBUM_ID}`,
        headers: { Authorization: `Bearer ${aliceToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isTradeInventoryPublic: true }),
      }),
      app.inject({
        method: 'PATCH',
        url: `/api/v1/users/${BOB_ID}/albums/${BOB_NA_ALBUM_ID}`,
        headers: { Authorization: `Bearer ${bobToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isTradeInventoryPublic: true }),
      }),
    ]);
  });

  afterAll(async () => {
    // Restore albums to private so this suite does not bleed into others.
    await Promise.all([
      app.inject({
        method: 'PATCH',
        url: `/api/v1/users/${ALICE_ID}/albums/${ALICE_NA_ALBUM_ID}`,
        headers: { Authorization: `Bearer ${aliceToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isTradeInventoryPublic: false }),
      }),
      app.inject({
        method: 'PATCH',
        url: `/api/v1/users/${BOB_ID}/albums/${BOB_NA_ALBUM_ID}`,
        headers: { Authorization: `Bearer ${bobToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isTradeInventoryPublic: false }),
      }),
    ]);
    await app?.close();
  });

  // ── GET /api/v1/profiles/:username — basics ──────────────────────────────────

  describe('GET /api/v1/profiles/:username', () => {
    it('returns 404 for an unknown username', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/profiles/nonexistent_user_x99z',
      });
      expect(response.statusCode).toBe(404);
    });

    it('is publicly accessible — no Authorization header required', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/profiles/alice',
      });
      expect(response.statusCode).toBe(200);
    });

    it("returns the correct profile shape for alice", async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/profiles/alice',
      });
      expect(response.statusCode).toBe(200);

      const body = response.json<PublicProfile>();
      expect(body.userId).toBe(ALICE_ID);
      expect(body.username).toBe('alice');
      expect(Array.isArray(body.tradingInventory)).toBe(true);
      expect(typeof body.memberSince).toBe('string');
    });

    it("tradingInventory contains exactly Alice's one public album (NA)", async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/profiles/alice' });
      const body = response.json<PublicProfile>();

      expect(body.tradingInventory).toHaveLength(1);
      const album = body.tradingInventory[0]!;
      expect(album.albumId).toBe(ALICE_NA_ALBUM_ID);
      expect(typeof album.wantedCount).toBe('number');
      expect(Array.isArray(album.offered)).toBe(true);
    });

    it('wantedCount > 0 — Alice is missing stickers above #200', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/profiles/alice' });
      const body = response.json<PublicProfile>();
      expect(body.tradingInventory[0]!.wantedCount).toBeGreaterThan(0);
    });
  });

  // ── Trade visibility flags ───────────────────────────────────────────────────

  describe('Trade visibility flags in the Offered list', () => {
    it("Alice's offered list excludes trade_hidden stickers (#7 and #14)", async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/profiles/alice' });
      const body = response.json<PublicProfile>();
      const offeredNumbers = body.tradingInventory[0]!.offered.map((i) => i.number);

      expect(offeredNumbers).not.toContain(7);
      expect(offeredNumbers).not.toContain(14);
    });

    it('every offered item has quantity > 1 — Alice has no trade_forced stickers', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/profiles/alice' });
      const body = response.json<PublicProfile>();

      for (const item of body.tradingInventory[0]!.offered) {
        expect(item.quantity).toBeGreaterThan(1);
      }
    });

    it("Bob's offered list includes trade_forced singles (#151 and #156)", async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/profiles/bob' });
      expect(response.statusCode).toBe(200);

      const body = response.json<PublicProfile>();
      const offeredNumbers = body.tradingInventory[0]!.offered.map((i) => i.number);

      expect(offeredNumbers).toContain(151);
      expect(offeredNumbers).toContain(156);
    });
  });

  // ── Album settings filter — includeCocaCola ──────────────────────────────────

  describe('Album settings filter — includeCocaCola', () => {
    it('disabling includeCocaCola reduces wantedCount by exactly 13 (CC1–CC13)', async () => {
      const before = await app.inject({ method: 'GET', url: '/api/v1/profiles/alice' });
      const countBefore = before.json<PublicProfile>().tradingInventory[0]!.wantedCount;

      // Merges { includeCocaCola: false } into existing JSONB settings and busts cache.
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/users/${ALICE_ID}/albums/${ALICE_NA_ALBUM_ID}`,
        headers: { Authorization: `Bearer ${aliceToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { includeCocaCola: false }, isTradeInventoryPublic: true }),
      });

      const after = await app.inject({ method: 'GET', url: '/api/v1/profiles/alice' });
      const countAfter = after.json<PublicProfile>().tradingInventory[0]!.wantedCount;

      expect(countBefore - countAfter).toBe(13);

      // Restore.
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/users/${ALICE_ID}/albums/${ALICE_NA_ALBUM_ID}`,
        headers: { Authorization: `Bearer ${aliceToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { includeCocaCola: true }, isTradeInventoryPublic: true }),
      });
    });

    it('wanted endpoint returns no coca_cola_special items when includeCocaCola is false', async () => {
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/users/${ALICE_ID}/albums/${ALICE_NA_ALBUM_ID}`,
        headers: { Authorization: `Bearer ${aliceToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { includeCocaCola: false }, isTradeInventoryPublic: true }),
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/profiles/alice/albums/${ALICE_NA_ALBUM_ID}/wanted`,
        query: { limit: '500' },
      });
      expect(response.statusCode).toBe(200);

      const body = response.json<PublicWantedPage>();
      const ccItems = body.items.filter((i) => i.stickerType === 'coca_cola_special');
      expect(ccItems).toHaveLength(0);

      // Restore.
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/users/${ALICE_ID}/albums/${ALICE_NA_ALBUM_ID}`,
        headers: { Authorization: `Bearer ${aliceToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { includeCocaCola: true }, isTradeInventoryPublic: true }),
      });
    });
  });

  // ── GET /api/v1/profiles/:username/albums/:albumId/wanted ────────────────────

  describe('GET /api/v1/profiles/:username/albums/:albumId/wanted', () => {
    it("returns 404 for Alice's international album (not flagged public)", async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/profiles/alice/albums/${ALICE_INTL_ALBUM_ID}/wanted`,
      });
      expect(response.statusCode).toBe(404);
    });

    it("returns 200 with items, total, and nextCursor for Alice's public NA album", async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/profiles/alice/albums/${ALICE_NA_ALBUM_ID}/wanted`,
      });
      expect(response.statusCode).toBe(200);

      const body = response.json<PublicWantedPage>();
      expect(Array.isArray(body.items)).toBe(true);
      expect(typeof body.total).toBe('number');
      expect(body.total).toBeGreaterThan(0);
      expect('nextCursor' in body).toBe(true);
    });

    it("wanted total matches Alice's profile wantedCount for the same album", async () => {
      const [profileRes, wantedRes] = await Promise.all([
        app.inject({ method: 'GET', url: '/api/v1/profiles/alice' }),
        app.inject({
          method: 'GET',
          url: `/api/v1/profiles/alice/albums/${ALICE_NA_ALBUM_ID}/wanted`,
          query: { limit: '500' },
        }),
      ]);

      const profileAlbum = profileRes
        .json<PublicProfile>()
        .tradingInventory.find((a) => a.albumId === ALICE_NA_ALBUM_ID)!;
      const wanted = wantedRes.json<PublicWantedPage>();

      expect(wanted.total).toBe(profileAlbum.wantedCount);
    });

    it('cursor pagination: second page items all have number > nextCursor of first page', async () => {
      const firstRes = await app.inject({
        method: 'GET',
        url: `/api/v1/profiles/alice/albums/${ALICE_NA_ALBUM_ID}/wanted`,
        query: { limit: '10' },
      });
      expect(firstRes.statusCode).toBe(200);
      const first = firstRes.json<PublicWantedPage>();

      // Alice has far more than 10 missing stickers, so nextCursor should always exist.
      if (first.nextCursor === null) return;

      const secondRes = await app.inject({
        method: 'GET',
        url: `/api/v1/profiles/alice/albums/${ALICE_NA_ALBUM_ID}/wanted`,
        query: { limit: '10', cursor: String(first.nextCursor) },
      });
      expect(secondRes.statusCode).toBe(200);
      const second = secondRes.json<PublicWantedPage>();

      for (const item of second.items) {
        expect(item.number).toBeGreaterThan(first.nextCursor);
      }

      // No sticker number appears in both pages.
      const firstNumbers = new Set(first.items.map((i) => i.number));
      for (const item of second.items) {
        expect(firstNumbers.has(item.number)).toBe(false);
      }
    });

    it('each wanted item has a non-empty stickerVariantId', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/profiles/alice/albums/${ALICE_NA_ALBUM_ID}/wanted`,
        query: { limit: '20' },
      });
      const body = response.json<PublicWantedPage>();

      expect(body.items.length).toBeGreaterThan(0);
      for (const item of body.items) {
        expect(typeof item.stickerVariantId).toBe('string');
        expect(item.stickerVariantId.length).toBeGreaterThan(0);
      }
    });
  });

  // ── Profile cache behavior ───────────────────────────────────────────────────

  describe('Profile cache behavior', () => {
    it('two consecutive requests return identical tradingInventory data', async () => {
      const [first, second] = await Promise.all([
        app.inject({ method: 'GET', url: '/api/v1/profiles/alice' }),
        app.inject({ method: 'GET', url: '/api/v1/profiles/alice' }),
      ]);
      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);

      const a = first.json<PublicProfile>();
      const b = second.json<PublicProfile>();
      expect(a.tradingInventory).toEqual(b.tradingInventory);
    });

    it('updating the album alias busts the cache — new alias appears on next fetch', async () => {
      const testAlias = `cache-test-${Date.now()}`;

      // Warm the cache.
      await app.inject({ method: 'GET', url: '/api/v1/profiles/alice' });

      // Mutate — updateAlbum calls invalidateUserCaches, clearing public_profile* keys.
      const patchRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/users/${ALICE_ID}/albums/${ALICE_NA_ALBUM_ID}`,
        headers: { Authorization: `Bearer ${aliceToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias: testAlias, isTradeInventoryPublic: true }),
      });
      expect(patchRes.statusCode).toBe(200);

      // Next fetch must re-query the DB and reflect the new alias.
      const profileRes = await app.inject({ method: 'GET', url: '/api/v1/profiles/alice' });
      expect(profileRes.statusCode).toBe(200);

      const profile = profileRes.json<PublicProfile>();
      const album = profile.tradingInventory.find((a) => a.albumId === ALICE_NA_ALBUM_ID);
      expect(album?.alias).toBe(testAlias);

      // Cleanup: strip the test alias.
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/users/${ALICE_ID}/albums/${ALICE_NA_ALBUM_ID}`,
        headers: { Authorization: `Bearer ${aliceToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias: null, isTradeInventoryPublic: true }),
      });
    });
  });

  // ── Rate limiting — MUST run last to accumulate quota from earlier tests ──────

  describe('Rate limiting — profile routes capped at 30 req / min per IP', () => {
    it('returns 429 once the per-route quota is exhausted', async () => {
      // Earlier tests in this suite have already consumed some of the 30-req/min
      // quota. Sending 35 more sequential requests from the same loopback IP is
      // guaranteed to push the total over the limit.
      const statuses: number[] = [];
      for (let i = 0; i < 35; i++) {
        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/profiles/alice',
        });
        statuses.push(res.statusCode);
        if (res.statusCode === 429) break; // Rate limit confirmed — stop hammering.
      }

      expect(statuses).toContain(429);
    });
  });
});
