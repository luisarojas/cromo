import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';

/**
 * Integration tests for the live-trade service (apps/backend/src/services/
 * live-trade.service.ts). The session itself lives in Redis; only completion
 * deltas land in Postgres. These tests pin down:
 *   - guest token issuance + idempotent rejoin,
 *   - mutation invalidates locks,
 *   - auto-suggestion intersects the two lists,
 *   - complete applies host-only deltas, undo reverses them,
 *   - lock + role enforcement.
 *
 * Uses the same fixture conventions as external-match.test.ts (custom user
 * inserts, scratch cleanup) so it can share the dev DB with other suites.
 */

const HAS_REAL_DB =
  typeof process.env['DATABASE_URL'] === 'string' &&
  process.env['DATABASE_URL'].includes('@') &&
  !process.env['DATABASE_URL'].includes('placeholder');

const HAS_REAL_REDIS =
  typeof process.env['REDIS_URL'] === 'string' &&
  process.env['REDIS_URL'].startsWith('redis://');

const shouldRun = HAS_REAL_DB && HAS_REAL_REDIS;

describe.skipIf(!shouldRun)('Live trade (integration)', () => {
  let app: FastifyInstance;
  let live: typeof import('../../src/services/live-trade.service.js');
  let tradeRequests: typeof import('../../src/services/trade-requests.service.js');

  let albumTypeId: string;
  let editionId: string;
  let formatId: string;

  const allInsertedUserIds: string[] = [];
  let scratchUserIds: string[] = [];
  const sessionIdsToClean: string[] = [];

  async function insertUser(): Promise<string> {
    const id = randomUUID();
    const username = id.replace(/-/g, '').slice(0, 20);
    const email = `${id}@live-trade-test.local`;
    await app.db.query(
      `INSERT INTO users (id, email, username, display_name, role, email_verified_at)
       VALUES ($1, $2, $3, 'Live Test', 'user', now())`,
      [id, email, username],
    );
    await app.db.query(`INSERT INTO user_settings (user_id) VALUES ($1)`, [id]);
    allInsertedUserIds.push(id);
    scratchUserIds.push(id);
    return id;
  }

  async function insertAlbum(userId: string): Promise<string> {
    const id = randomUUID();
    await app.db.query(
      `INSERT INTO user_albums (id, user_id, album_type_id, album_edition_id, album_format_id, is_default, settings)
       VALUES ($1, $2, $3, $4, $5, true, $6::jsonb)`,
      [
        id, userId, albumTypeId, editionId, formatId,
        JSON.stringify({ includeExtras: true, includeCocaCola: true, defaultBaseVariant: 'base_border' }),
      ],
    );
    return id;
  }

  async function insertOwned(albumId: string, variantId: string, quantity: number): Promise<void> {
    await app.db.query(
      `INSERT INTO user_stickers (album_id, sticker_variant_id, quantity) VALUES ($1, $2, $3)
         ON CONFLICT (album_id, sticker_variant_id) DO UPDATE SET quantity = $3`,
      [albumId, variantId, quantity],
    );
  }

  async function lookupVariant(stickerNumber: number, variantType: string): Promise<{ variantId: string; albumCode: string }> {
    const { rows } = await app.db.query<{ variant_id: string; album_code: string }>(
      `SELECT sv.id AS variant_id, s.album_code
         FROM stickers s
         JOIN sticker_variants sv ON sv.sticker_id = s.id
        WHERE s.number = $1 AND sv.variant_type = $2 AND s.album_type_id = $3`,
      [stickerNumber, variantType, albumTypeId],
    );
    if (!rows[0]) throw new Error(`No variant for #${stickerNumber} (${variantType})`);
    return { variantId: rows[0].variant_id, albumCode: rows[0].album_code };
  }

  async function ownedQty(albumId: string, variantId: string): Promise<number> {
    const { rows } = await app.db.query<{ quantity: number }>(
      `SELECT quantity FROM user_stickers WHERE album_id = $1 AND sticker_variant_id = $2`,
      [albumId, variantId],
    );
    return rows[0]?.quantity ?? 0;
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app.js');
    live = await import('../../src/services/live-trade.service.js');
    tradeRequests = await import('../../src/services/trade-requests.service.js');
    app = await buildApp();
    await app.ready();

    const { rows } = await app.db.query<{ type_id: string; edition_id: string; format_id: string }>(
      `SELECT at.id AS type_id, ae.id AS edition_id, af.id AS format_id
         FROM album_types at
         JOIN album_editions ae ON ae.album_type_id = at.id AND ae.key = 'north_america'
         JOIN album_formats  af ON af.album_type_id = at.id AND af.key = 'softcover_standard'
        WHERE at.key = 'fifa_world_cup_2026'`,
    );
    if (!rows[0]) throw new Error('FIFA 2026 catalog lookup failed — is the catalog seeded?');
    albumTypeId = rows[0].type_id;
    editionId   = rows[0].edition_id;
    formatId    = rows[0].format_id;
  });

  afterEach(async () => {
    if (scratchUserIds.length > 0) {
      await app.db.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [scratchUserIds]);
      scratchUserIds = [];
    }
    // Best-effort Redis cleanup; sessions naturally expire after 6h so a missed
    // delete doesn't bleed across runs but keeping the namespace tidy helps
    // when sweeping prod-like data.
    if (sessionIdsToClean.length > 0) {
      for (const id of sessionIdsToClean) {
        await app.redis.del(`live-trade:session:${id}`).catch(() => undefined);
      }
      sessionIdsToClean.length = 0;
    }
  });

  afterAll(async () => {
    if (allInsertedUserIds.length > 0) {
      await app.db.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [allInsertedUserIds]);
    }
    await app?.close();
  });

  it('mints a session, lets a guest join, and exposes a 6-digit join code', async () => {
    const hostId = await insertUser();
    const albumId = await insertAlbum(hostId);
    const session = await live.createSession(app.db, app.redis, hostId, albumId);
    sessionIdsToClean.push(session.id);

    expect(session.joinCode).toMatch(/^\d{6}$/);
    expect(session.joinUrl).toContain('/join/');
    expect(session.guest.joined).toBe(false);

    const resolved = await live.resolveSessionId(app.redis, session.joinCode);
    expect(resolved).toBe(session.id);

    const { guestToken, session: joined } = await live.joinSession(app.redis, session.id, 'Sofia');
    expect(guestToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(joined.guest.joined).toBe(true);
    expect(joined.guest.label).toBe('Sofia');

    // Idempotent rejoin returns the same token so a refreshed guest tab survives.
    const { guestToken: again } = await live.joinSession(app.redis, session.id, null);
    expect(again).toBe(guestToken);
  });

  it('resolves lists, computes the suggested swap, and tracks staging + lock state', async () => {
    const hostId = await insertUser();
    const albumId = await insertAlbum(hostId);
    const session = await live.createSession(app.db, app.redis, hostId, albumId);
    sessionIdsToClean.push(session.id);

    const v1 = await lookupVariant(820, 'base_border');
    const v2 = await lookupVariant(821, 'base_border');
    await insertOwned(albumId, v1.variantId, 2);

    await live.setSideList(app.db, app.redis, session.id, 'host', {
      offered: [{ albumCode: v1.albumCode, variantToken: 'base_border', quantity: 2 }],
      wanted:  [{ albumCode: v2.albumCode, variantToken: 'base_border', quantity: 1 }],
    });
    await live.setSideList(app.db, app.redis, session.id, 'guest', {
      offered: [{ albumCode: v2.albumCode, variantToken: 'base_border', quantity: 1 }],
      wanted:  [{ albumCode: v1.albumCode, variantToken: 'base_border', quantity: 1 }],
    });

    let snapshot = (await live.getPublicSession(app.redis, session.id))!;
    expect(snapshot.suggestion?.hostGives).toHaveLength(1);
    expect(snapshot.suggestion?.hostReceives).toHaveLength(1);
    expect(snapshot.suggestion?.hostGives[0]?.stickerVariantId).toBe(v1.variantId);
    expect(snapshot.suggestion?.hostReceives[0]?.stickerVariantId).toBe(v2.variantId);

    // Stage one each.
    await live.setSideStaged(app.redis, session.id, 'host',  [{ stickerVariantId: v1.variantId, quantity: 1 }]);
    await live.setSideStaged(app.redis, session.id, 'guest', [{ stickerVariantId: v2.variantId, quantity: 1 }]);

    // Lock the host, then the guest — both must be true to allow completion.
    await live.setSideLock(app.redis, session.id, 'host', true);
    snapshot = (await live.getPublicSession(app.redis, session.id))!;
    expect(snapshot.hostLocked).toBe(true);
    expect(snapshot.guestLocked).toBe(false);

    await live.setSideLock(app.redis, session.id, 'guest', true);
    snapshot = (await live.getPublicSession(app.redis, session.id))!;
    expect(snapshot.hostLocked && snapshot.guestLocked).toBe(true);

    // Editing the list re-opens the locks — a stale agreement shouldn't carry through.
    await live.setSideStaged(app.redis, session.id, 'host', [{ stickerVariantId: v1.variantId, quantity: 1 }]);
    snapshot = (await live.getPublicSession(app.redis, session.id))!;
    expect(snapshot.hostLocked).toBe(false);
    expect(snapshot.guestLocked).toBe(false);
  });

  it('refuses to complete unless both sides are locked and the caller is the host', async () => {
    const hostId = await insertUser();
    const otherId = await insertUser();
    const albumId = await insertAlbum(hostId);
    const session = await live.createSession(app.db, app.redis, hostId, albumId);
    sessionIdsToClean.push(session.id);

    const v = await lookupVariant(822, 'base_border');
    await insertOwned(albumId, v.variantId, 1);
    await live.setSideList(app.db, app.redis, session.id, 'host', {
      offered: [{ albumCode: v.albumCode, variantToken: 'base_border', quantity: 1 }],
      wanted: [],
    });
    await live.setSideStaged(app.redis, session.id, 'host', [{ stickerVariantId: v.variantId, quantity: 1 }]);
    await live.joinSession(app.redis, session.id, null);

    // Only one side locked.
    await live.setSideLock(app.redis, session.id, 'host', true);
    await expect(live.completeSession(app.db, app.redis, hostId, session.id))
      .rejects.toMatchObject({ statusCode: 409 });

    // Both locked but caller is the wrong user.
    await live.setSideLock(app.redis, session.id, 'guest', true);
    await expect(live.completeSession(app.db, app.redis, otherId, session.id))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  it('completes a trade: host-only deltas land + undo reverses them', async () => {
    const hostId = await insertUser();
    const albumId = await insertAlbum(hostId);
    const session = await live.createSession(app.db, app.redis, hostId, albumId);
    sessionIdsToClean.push(session.id);

    const give = await lookupVariant(830, 'base_border');
    const receive = await lookupVariant(831, 'base_border');
    await insertOwned(albumId, give.variantId, 3); // 3 spares; commit one.

    await live.setSideList(app.db, app.redis, session.id, 'host', {
      offered: [{ albumCode: give.albumCode, variantToken: 'base_border', quantity: 3 }],
      wanted:  [{ albumCode: receive.albumCode, variantToken: 'base_border', quantity: 1 }],
    });
    await live.setSideList(app.db, app.redis, session.id, 'guest', {
      offered: [{ albumCode: receive.albumCode, variantToken: 'base_border', quantity: 1 }],
      wanted:  [{ albumCode: give.albumCode, variantToken: 'base_border', quantity: 1 }],
    });
    await live.joinSession(app.redis, session.id, 'Sofia');
    await live.setSideStaged(app.redis, session.id, 'host',  [{ stickerVariantId: give.variantId, quantity: 1 }]);
    await live.setSideStaged(app.redis, session.id, 'guest', [{ stickerVariantId: receive.variantId, quantity: 1 }]);
    await live.setSideLock(app.redis, session.id, 'host', true);
    await live.setSideLock(app.redis, session.id, 'guest', true);

    const completed = await live.completeSession(app.db, app.redis, hostId, session.id);
    expect(completed.status).toBe('completed');
    expect(completed.completion).not.toBeNull();
    expect(await ownedQty(albumId, give.variantId)).toBe(2);
    expect(await ownedQty(albumId, receive.variantId)).toBe(1);

    const undone = await live.undoCompletion(app.db, app.redis, hostId, session.id);
    expect(undone.status).toBe('open');
    expect(undone.completion?.undoneAt).not.toBeNull();
    expect(await ownedQty(albumId, give.variantId)).toBe(3);
    expect(await ownedQty(albumId, receive.variantId)).toBe(0);
  });

  it('lists completed live trades for the host, enriched with sticker metadata', async () => {
    const hostId = await insertUser();
    const albumId = await insertAlbum(hostId);
    const session = await live.createSession(app.db, app.redis, hostId, albumId);
    sessionIdsToClean.push(session.id);

    const give = await lookupVariant(850, 'base_border');
    const receive = await lookupVariant(851, 'base_border');
    await insertOwned(albumId, give.variantId, 2);

    await live.setSideList(app.db, app.redis, session.id, 'host', {
      offered: [{ albumCode: give.albumCode, variantToken: 'base_border', quantity: 2 }],
      wanted: [{ albumCode: receive.albumCode, variantToken: 'base_border', quantity: 1 }],
    });
    await live.setSideList(app.db, app.redis, session.id, 'guest', {
      offered: [{ albumCode: receive.albumCode, variantToken: 'base_border', quantity: 1 }],
      wanted: [{ albumCode: give.albumCode, variantToken: 'base_border', quantity: 1 }],
    });
    await live.joinSession(app.redis, session.id, 'Sofia');
    await live.setSideStaged(app.redis, session.id, 'host', [{ stickerVariantId: give.variantId, quantity: 1 }]);
    await live.setSideStaged(app.redis, session.id, 'guest', [{ stickerVariantId: receive.variantId, quantity: 1 }]);
    await live.setSideLock(app.redis, session.id, 'host', true);
    await live.setSideLock(app.redis, session.id, 'guest', true);
    await live.completeSession(app.db, app.redis, hostId, session.id);

    const page = await live.listLiveTradeHistory(app.db, hostId, {});
    expect(page.items).toHaveLength(1);
    const row = page.items[0]!;
    expect(row.kind).toBe('live');
    expect(row.status).toBe('completed');
    expect(row.guestLabel).toBe('Sofia');
    expect(row.hostGave).toHaveLength(1);
    expect(row.hostGave[0]?.albumCode).toBe(give.albumCode);
    expect(row.hostGave[0]?.playerName).not.toBeNull(); // enriched from catalog
    expect(row.hostReceived).toHaveLength(1);
    expect(row.hostReceived[0]?.albumCode).toBe(receive.albumCode);

    // After undo the row keeps showing in the history list as 'cancelled'.
    await live.undoCompletion(app.db, app.redis, hostId, session.id);
    const afterUndo = await live.listLiveTradeHistory(app.db, hostId, {});
    expect(afterUndo.items[0]?.status).toBe('cancelled');
    expect(afterUndo.items[0]?.undoneAt).not.toBeNull();
  });

  it('surfaces live trades in the unified history feed with classic trade requests', async () => {
    const hostId = await insertUser();
    const albumId = await insertAlbum(hostId);
    const session = await live.createSession(app.db, app.redis, hostId, albumId);
    sessionIdsToClean.push(session.id);

    const give = await lookupVariant(860, 'base_border');
    await insertOwned(albumId, give.variantId, 2);
    await live.setSideList(app.db, app.redis, session.id, 'host', {
      offered: [{ albumCode: give.albumCode, variantToken: 'base_border', quantity: 2 }],
      wanted: [],
    });
    await live.setSideList(app.db, app.redis, session.id, 'guest', {
      offered: [],
      wanted: [{ albumCode: give.albumCode, variantToken: 'base_border', quantity: 1 }],
    });
    await live.joinSession(app.redis, session.id, 'Bea');
    await live.setSideStaged(app.redis, session.id, 'host', [{ stickerVariantId: give.variantId, quantity: 1 }]);
    await live.setSideLock(app.redis, session.id, 'host', true);
    await live.setSideLock(app.redis, session.id, 'guest', true);
    await live.completeSession(app.db, app.redis, hostId, session.id);

    const merged = await tradeRequests.listTradeHistory(app.db, hostId, {});
    const liveRow = merged.items.find((i) => 'kind' in i && i.kind === 'live');
    expect(liveRow).toBeDefined();

    // Status filters that have no live-trade analogue (pending/etc.) should
    // skip the live source entirely.
    const pendingOnly = await tradeRequests.listTradeHistory(app.db, hostId, { status: 'pending' });
    expect(pendingOnly.items.some((i) => 'kind' in i && i.kind === 'live')).toBe(false);

    // The 'completed' filter still surfaces it.
    const completedOnly = await tradeRequests.listTradeHistory(app.db, hostId, { status: 'completed' });
    expect(completedOnly.items.some((i) => 'kind' in i && i.kind === 'live')).toBe(true);
  });

  it('rejects undo after the 60-second window has passed', async () => {
    const hostId = await insertUser();
    const albumId = await insertAlbum(hostId);
    const session = await live.createSession(app.db, app.redis, hostId, albumId);
    sessionIdsToClean.push(session.id);

    const give = await lookupVariant(840, 'base_border');
    await insertOwned(albumId, give.variantId, 2);
    await live.setSideList(app.db, app.redis, session.id, 'host', {
      offered: [{ albumCode: give.albumCode, variantToken: 'base_border', quantity: 2 }],
      wanted: [],
    });
    await live.setSideList(app.db, app.redis, session.id, 'guest', {
      offered: [],
      wanted: [{ albumCode: give.albumCode, variantToken: 'base_border', quantity: 1 }],
    });
    await live.joinSession(app.redis, session.id, null);
    await live.setSideStaged(app.redis, session.id, 'host', [{ stickerVariantId: give.variantId, quantity: 1 }]);
    await live.setSideLock(app.redis, session.id, 'host', true);
    await live.setSideLock(app.redis, session.id, 'guest', true);
    await live.completeSession(app.db, app.redis, hostId, session.id);

    // Roll the session's completedAt back 61s by writing the Redis blob directly.
    // Cheaper and more deterministic than waiting in a unit test.
    const key = `live-trade:session:${session.id}`;
    const raw = await app.redis.get(key);
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw!) as { completedAt: string };
    stored.completedAt = new Date(Date.now() - 61_000).toISOString();
    await app.redis.set(key, JSON.stringify(stored));

    await expect(live.undoCompletion(app.db, app.redis, hostId, session.id))
      .rejects.toMatchObject({ statusCode: 410 });
  });
});
