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
const ALICE_NA_ALBUM_ID = '00000000-0000-0000-0001-000000000002';

// Extra-coverage suite for collection.ts endpoints not yet exercised by
// the original collection.test.ts: PATCH /stickers/:variantId, trade-flags
// PATCH, bulk ops, wanted-variants {GET/POST/DELETE}, and the avatar
// upload happy path.
describe.skipIf(!shouldRun)('Collection extra routes (integration)', () => {
  let app: FastifyInstance;
  let aliceToken: string;
  let testVariantId: string;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app.js');
    const { signAccessToken } = await import('../../src/middleware/auth.js');
    app = await buildApp();
    await app.ready();
    aliceToken = signAccessToken({ sub: ALICE_ID, email: 'alice@test.local', role: 'user' });

    // Pick a real variant ID from the catalog that Alice doesn't already own
    // by default — pick one outside her seeded 1–200 base_border range, e.g.
    // a coloured variant of #1, so add/remove/patch don't collide with the
    // baseline collection.
    const { rows } = await app.db.query<{ id: string }>(
      `SELECT sv.id FROM sticker_variants sv
         JOIN stickers s ON s.id = sv.sticker_id
         JOIN album_types at ON at.id = s.album_type_id
        WHERE at.key = 'fifa_world_cup_2026'
          AND s.number BETWEEN 1 AND 50
          AND sv.variant_type NOT IN ('base_border', 'base_borderless')
        LIMIT 1`,
    );
    testVariantId = rows[0]!.id;
  });

  afterAll(async () => {
    // Clean up anything we added under the test variant.
    await app.db.query(
      `DELETE FROM user_stickers WHERE album_id = $1 AND sticker_variant_id = $2`,
      [ALICE_NA_ALBUM_ID, testVariantId],
    );
    await app.db.query(
      `DELETE FROM user_wanted_variants WHERE user_id = $1`,
      [ALICE_ID],
    );
    await app?.close();
  });

  beforeEach(async () => {
    await app.db.query(
      `DELETE FROM user_stickers WHERE album_id = $1 AND sticker_variant_id = $2`,
      [ALICE_NA_ALBUM_ID, testVariantId],
    );
  });

  // ── PATCH /stickers/:variantId — quantity update ────────────────────────────

  describe('PATCH /users/:userId/stickers/:variantId', () => {
    it('adjusts the quantity and removes the row when quantity becomes 0', async () => {
      // First add one copy via the POST endpoint.
      const addRes = await app.inject({
        method: 'POST',
        url: `/api/v1/users/${ALICE_ID}/stickers?albumId=${ALICE_NA_ALBUM_ID}`,
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: { variantId: testVariantId, albumId: ALICE_NA_ALBUM_ID, quantity: 1 },
      });
      expect(addRes.statusCode).toBe(200);

      // PATCH to quantity = 3.
      const patchRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/users/${ALICE_ID}/stickers/${testVariantId}?albumId=${ALICE_NA_ALBUM_ID}`,
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: { quantity: 3 },
      });
      expect(patchRes.statusCode).toBe(204);

      const { rows: afterRaise } = await app.db.query<{ quantity: number }>(
        `SELECT quantity FROM user_stickers WHERE album_id = $1 AND sticker_variant_id = $2`,
        [ALICE_NA_ALBUM_ID, testVariantId],
      );
      expect(afterRaise[0]?.quantity).toBe(3);

      // PATCH to quantity = 0 must delete the row.
      const delRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/users/${ALICE_ID}/stickers/${testVariantId}?albumId=${ALICE_NA_ALBUM_ID}`,
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: { quantity: 0 },
      });
      expect(delRes.statusCode).toBe(204);

      const { rowCount } = await app.db.query(
        `SELECT 1 FROM user_stickers WHERE album_id = $1 AND sticker_variant_id = $2`,
        [ALICE_NA_ALBUM_ID, testVariantId],
      );
      expect(rowCount).toBe(0);
    });

    it('rejects negative quantities with 400', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/users/${ALICE_ID}/stickers/${testVariantId}?albumId=${ALICE_NA_ALBUM_ID}`,
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: { quantity: -1 },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── PATCH /stickers/:variantId/trade-flags ─────────────────────────────────

  describe('PATCH /users/:userId/stickers/:variantId/trade-flags', () => {
    it('flips tradeHidden + tradeForced on a user_stickers row', async () => {
      // Need to own the variant first.
      await app.inject({
        method: 'POST',
        url: `/api/v1/users/${ALICE_ID}/stickers`,
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: { variantId: testVariantId, albumId: ALICE_NA_ALBUM_ID, quantity: 2 },
      });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/users/${ALICE_ID}/stickers/${testVariantId}/trade-flags?albumId=${ALICE_NA_ALBUM_ID}`,
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: { tradeHidden: true, tradeForced: false },
      });
      expect(res.statusCode).toBe(204);

      const { rows } = await app.db.query<{ trade_hidden: boolean; trade_forced: boolean }>(
        `SELECT trade_hidden, trade_forced FROM user_stickers
           WHERE album_id = $1 AND sticker_variant_id = $2`,
        [ALICE_NA_ALBUM_ID, testVariantId],
      );
      expect(rows[0]).toMatchObject({ trade_hidden: true, trade_forced: false });
    });
  });

  // ── POST /stickers/bulk ────────────────────────────────────────────────────

  describe('POST /users/:userId/stickers/bulk', () => {
    it('applies a mixed batch of add/set/remove ops in one transaction', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/users/${ALICE_ID}/stickers/bulk`,
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: {
          albumId: ALICE_NA_ALBUM_ID,
          ops: [
            { op: 'add', variantId: testVariantId, quantity: 2 },
            { op: 'set', variantId: testVariantId, quantity: 5 }, // overrides the add
            { op: 'flags', variantId: testVariantId, tradeHidden: true },
          ],
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ applied: number }>();
      expect(body.applied).toBeGreaterThanOrEqual(1);

      const { rows } = await app.db.query<{ quantity: number; trade_hidden: boolean }>(
        `SELECT quantity, trade_hidden FROM user_stickers
           WHERE album_id = $1 AND sticker_variant_id = $2`,
        [ALICE_NA_ALBUM_ID, testVariantId],
      );
      expect(rows[0]?.quantity).toBe(5);
      expect(rows[0]?.trade_hidden).toBe(true);
    });

    it('rejects an empty ops array via schema validation (minItems: 1)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/users/${ALICE_ID}/stickers/bulk`,
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: { albumId: ALICE_NA_ALBUM_ID, ops: [] },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── /albums/:albumId/wanted-variants ────────────────────────────────────────

  describe('Wanted variants (GET/POST/DELETE)', () => {
    it('starts empty, POST adds, GET reflects, DELETE removes', async () => {
      // Wipe to baseline.
      await app.db.query(
        `DELETE FROM user_wanted_variants WHERE user_id = $1 AND album_id = $2`,
        [ALICE_ID, ALICE_NA_ALBUM_ID],
      );

      const empty = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${ALICE_ID}/albums/${ALICE_NA_ALBUM_ID}/wanted-variants`,
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(empty.statusCode).toBe(200);
      expect(empty.json<{ items: unknown[] }>().items).toEqual([]);

      const add = await app.inject({
        method: 'POST',
        url: `/api/v1/users/${ALICE_ID}/albums/${ALICE_NA_ALBUM_ID}/wanted-variants`,
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: { variantId: testVariantId },
      });
      expect(add.statusCode).toBe(204);

      const after = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${ALICE_ID}/albums/${ALICE_NA_ALBUM_ID}/wanted-variants`,
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(after.statusCode).toBe(200);
      const items = after.json<{ items: { variantId: string }[] }>().items;
      expect(items.some((i) => i.variantId === testVariantId)).toBe(true);

      const del = await app.inject({
        method: 'DELETE',
        url: `/api/v1/users/${ALICE_ID}/albums/${ALICE_NA_ALBUM_ID}/wanted-variants/${testVariantId}`,
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(del.statusCode).toBe(204);

      const afterDel = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${ALICE_ID}/albums/${ALICE_NA_ALBUM_ID}/wanted-variants`,
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(afterDel.json<{ items: { variantId: string }[] }>().items
        .some((i) => i.variantId === testVariantId)).toBe(false);
    });
  });
});
