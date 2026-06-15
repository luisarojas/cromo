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

describe.skipIf(!shouldRun)('Sharing routes (integration)', () => {
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

  afterAll(async () => {
    await app.db.query(`DELETE FROM public_lists WHERE user_id IN ($1, $2)`, [ALICE_ID, BOB_ID]);
    await app?.close();
  });

  beforeEach(async () => {
    await app.db.query(`DELETE FROM public_lists WHERE user_id IN ($1, $2)`, [ALICE_ID, BOB_ID]);
  });

  // ── Authorization gating ────────────────────────────────────────────────────

  describe('authorization', () => {
    it('POST /share rejects acting on another user with 403', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/users/${ALICE_ID}/share`,
        headers: { Authorization: `Bearer ${bobToken}` },
        payload: { listType: 'missing', albumId: ALICE_NA_ALBUM_ID },
      });
      expect(res.statusCode).toBe(403);
    });

    it('GET /share rejects listing another user\'s share links', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${ALICE_ID}/share`,
        headers: { Authorization: `Bearer ${bobToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ── Body validation ─────────────────────────────────────────────────────────

  describe('body validation', () => {
    it('rejects an unknown listType with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/users/${ALICE_ID}/share`,
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: { listType: 'galactic', albumId: ALICE_NA_ALBUM_ID },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects a non-UUID albumId with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/users/${ALICE_ID}/share`,
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: { listType: 'missing', albumId: 'not-a-uuid' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── Full lifecycle: create → list → public read → revoke ────────────────────

  describe('lifecycle', () => {
    it('creates a missing-list share link, lists it, returns it publicly, then revokes it', async () => {
      // CREATE
      const createRes = await app.inject({
        method: 'POST',
        url: `/api/v1/users/${ALICE_ID}/share`,
        headers: { Authorization: `Bearer ${aliceToken}` },
        payload: { listType: 'missing', albumId: ALICE_NA_ALBUM_ID },
      });
      expect(createRes.statusCode).toBe(201);
      const link = createRes.json<{ shareToken: string; listType: string; url: string }>();
      expect(link.listType).toBe('missing');
      expect(link.shareToken).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(link.url).toContain(link.shareToken);

      // LIST — must include the just-created token
      const listRes = await app.inject({
        method: 'GET',
        url: `/api/v1/users/${ALICE_ID}/share`,
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(listRes.statusCode).toBe(200);
      const items = listRes.json<{ items: { shareToken: string }[] }>().items;
      expect(items.some((i) => i.shareToken === link.shareToken)).toBe(true);

      // PUBLIC READ — no auth required
      const publicRes = await app.inject({
        method: 'GET',
        url: `/api/v1/share/${link.shareToken}`,
      });
      expect(publicRes.statusCode).toBe(200);
      const publicBody = publicRes.json<{ listType: string }>();
      expect(publicBody.listType).toBe('missing');

      // REVOKE
      const revokeRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/users/${ALICE_ID}/share/${link.shareToken}`,
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(revokeRes.statusCode).toBe(204);

      // PUBLIC READ AFTER REVOKE → 410 Gone
      const goneRes = await app.inject({
        method: 'GET',
        url: `/api/v1/share/${link.shareToken}`,
      });
      expect(goneRes.statusCode).toBe(410);

      // Direct DB proof the row was deleted.
      const { rowCount } = await app.db.query(
        `SELECT 1 FROM public_lists WHERE share_token = $1`,
        [link.shareToken],
      );
      expect(rowCount).toBe(0);
    });

    it('GET /share/:token returns 410 for a never-existed token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/share/nonexistent-token-' + Date.now(),
      });
      expect(res.statusCode).toBe(410);
    });

    it('supports the three listType variants', async () => {
      for (const listType of ['missing', 'duplicates', 'full_collection'] as const) {
        const res = await app.inject({
          method: 'POST',
          url: `/api/v1/users/${ALICE_ID}/share`,
          headers: { Authorization: `Bearer ${aliceToken}` },
          payload: { listType, albumId: ALICE_NA_ALBUM_ID },
        });
        expect(res.statusCode).toBe(201);
        expect(res.json<{ listType: string }>().listType).toBe(listType);
      }
    });
  });

  // ── Idempotency ─────────────────────────────────────────────────────────────

  describe('idempotency', () => {
    it('a retry with the same Idempotency-Key returns the same token', async () => {
      const key = 'idem-' + Date.now();
      const a = await app.inject({
        method: 'POST',
        url: `/api/v1/users/${ALICE_ID}/share`,
        headers: { Authorization: `Bearer ${aliceToken}`, 'idempotency-key': key },
        payload: { listType: 'duplicates', albumId: ALICE_NA_ALBUM_ID },
      });
      const b = await app.inject({
        method: 'POST',
        url: `/api/v1/users/${ALICE_ID}/share`,
        headers: { Authorization: `Bearer ${aliceToken}`, 'idempotency-key': key },
        payload: { listType: 'duplicates', albumId: ALICE_NA_ALBUM_ID },
      });
      expect(a.statusCode).toBe(201);
      // The second response is a cached replay; status can be 200 or 201
      // depending on the idempotency middleware's storage policy. What
      // matters is that it returns the SAME token (not a new one).
      expect([200, 201]).toContain(b.statusCode);
      const aToken = a.json<{ shareToken: string }>().shareToken;
      const bToken = b.json<{ shareToken: string }>().shareToken;
      expect(bToken).toBe(aToken);

      // Only one row should exist for this token (no duplicate INSERT).
      const { rowCount } = await app.db.query(
        `SELECT 1 FROM public_lists WHERE share_token = $1`,
        [aToken],
      );
      expect(rowCount).toBe(1);
    });
  });
});
