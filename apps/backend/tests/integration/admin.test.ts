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

const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const ALICE_ID = '00000000-0000-0000-0000-000000000002';
const BOB_ID   = '00000000-0000-0000-0000-000000000003';
const EVAN_ID  = '00000000-0000-0000-0000-000000000006';

describe.skipIf(!shouldRun)('Admin routes (integration)', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let aliceToken: string;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app.js');
    const { signAccessToken } = await import('../../src/middleware/auth.js');
    app = await buildApp();
    await app.ready();
    adminToken = signAccessToken({ sub: ADMIN_ID, email: 'admin@test.local', role: 'admin' });
    aliceToken = signAccessToken({ sub: ALICE_ID, email: 'alice@test.local', role: 'user' });
  });

  afterAll(async () => {
    // Lift any test-induced bans on evan and bob, and reset alice's role.
    await app.db.query(
      `UPDATE user_bans SET lifted_at = NOW(), lifted_by = $1, lift_reason = 'test cleanup'
        WHERE user_id IN ($2, $3) AND lifted_at IS NULL`,
      [ADMIN_ID, EVAN_ID, BOB_ID],
    );
    await app.db.query(`DELETE FROM user_bans WHERE user_id IN ($1, $2)`, [EVAN_ID, BOB_ID]);
    await app.db.query(`UPDATE users SET role = 'user' WHERE id IN ($1, $2)`, [EVAN_ID, BOB_ID]);
    // Clear any banned_emails row this test created for evan.
    const { hashEmailForBan } = await import('../../src/services/user-provisioning.js');
    await app.db.query(
      `DELETE FROM banned_emails WHERE hashed_email = $1`,
      [hashEmailForBan('evan@test.local')],
    );
    await app?.close();
  });

  beforeEach(async () => {
    await app.db.query(`DELETE FROM user_bans WHERE user_id IN ($1, $2)`, [EVAN_ID, BOB_ID]);
    await app.db.query(`UPDATE users SET role = 'user' WHERE id IN ($1, $2)`, [EVAN_ID, BOB_ID]);
    const { hashEmailForBan } = await import('../../src/services/user-provisioning.js');
    await app.db.query(
      `DELETE FROM banned_emails WHERE hashed_email = $1`,
      [hashEmailForBan('evan@test.local')],
    );
  });

  // ── Authorization gate ─────────────────────────────────────────────────────

  describe('authorization', () => {
    it('returns 403 for non-admin tokens', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/users',
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns 401 with no token at all', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/users' });
      expect(res.statusCode).toBe(401);
    });
  });

  // ── Feature flags ──────────────────────────────────────────────────────────

  describe('GET /admin/feature-flags', () => {
    it('returns every flag as { key: boolean }', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/feature-flags',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ flags: Record<string, boolean> }>();
      // FEATURE_WEB_PUSH is seeded; confirm at least one flag exists.
      expect(Object.keys(body.flags).length).toBeGreaterThan(0);
      for (const v of Object.values(body.flags)) expect(typeof v).toBe('boolean');
    });
  });

  // ── User listing ───────────────────────────────────────────────────────────

  describe('GET /admin/users', () => {
    it('returns paginated users with total', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/users?limit=3&page=1',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ items: { id: string; isBanned: boolean }[]; total: number; page: number; limit: number }>();
      expect(body.items.length).toBeLessThanOrEqual(3);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(3);
      expect(body.total).toBeGreaterThanOrEqual(body.items.length);
      // Every item must have the isBanned discriminator.
      for (const item of body.items) expect(typeof item.isBanned).toBe('boolean');
    });

    it('filters by search substring (case-insensitive)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/users?search=ALICE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ items: { username: string }[] }>();
      expect(body.items.some((u) => u.username === 'alice')).toBe(true);
    });
  });

  // ── Role mutation ──────────────────────────────────────────────────────────

  describe('PATCH /admin/users/:id/role', () => {
    it('rejects changing your own role with 400', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/users/${ADMIN_ID}/role`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { role: 'admin' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects unknown role values with 400', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/users/${EVAN_ID}/role`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { role: 'superuser' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('promotes a user to admin and audits the change', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/users/${EVAN_ID}/role`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { role: 'admin' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ role: string }>().role).toBe('admin');

      // Direct-DB proof: role flipped + an audit row exists.
      const { rows: userRows } = await app.db.query<{ role: string }>(
        `SELECT role FROM users WHERE id = $1`,
        [EVAN_ID],
      );
      expect(userRows[0]?.role).toBe('admin');

      const { rowCount: auditCount } = await app.db.query(
        `SELECT 1 FROM audit_log
          WHERE user_id = $1 AND action = 'user_role_changed'
            AND metadata->>'targetUserId' = $2
          ORDER BY occurred_at DESC LIMIT 1`,
        [ADMIN_ID, EVAN_ID],
      );
      expect(auditCount).toBe(1);
    });
  });

  // ── Ban & lift ─────────────────────────────────────────────────────────────

  describe('POST /admin/users/:id/ban + DELETE /admin/users/:id/ban', () => {
    it('rejects banning yourself with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/users/${ADMIN_ID}/ban`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { reason: 'just because' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects reasons shorter than 5 chars', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/users/${EVAN_ID}/ban`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { reason: 'no' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 when the target user does not exist', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/users/00000000-0000-0000-0000-deadbeef0000/ban',
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { reason: 'imaginary user' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('soft-bans a user, then lifts the ban', async () => {
      const banRes = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/users/${EVAN_ID}/ban`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { reason: 'integration test ban' },
      });
      expect(banRes.statusCode).toBe(201);

      // Direct-DB proof a soft ban row exists.
      const { rows: banRows } = await app.db.query<{ ban_type: string; lifted_at: Date | null }>(
        `SELECT ban_type, lifted_at FROM user_bans WHERE user_id = $1`,
        [EVAN_ID],
      );
      expect(banRows[0]?.ban_type).toBe('soft');
      expect(banRows[0]?.lifted_at).toBeNull();

      const liftRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/users/${EVAN_ID}/ban`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { liftReason: 'reconciled' },
      });
      expect(liftRes.statusCode).toBe(204);

      const { rows: liftedRows } = await app.db.query<{ lifted_at: Date | null }>(
        `SELECT lifted_at FROM user_bans WHERE user_id = $1`,
        [EVAN_ID],
      );
      expect(liftedRows[0]?.lifted_at).not.toBeNull();
    });

    it('returns 404 from DELETE when there is no active ban', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/users/${EVAN_ID}/ban`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { liftReason: 'nothing to lift' },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Granular bans ──────────────────────────────────────────────────────────

  describe('POST /admin/users/:id/bans + GET /admin/users/:id/bans + POST .../lift', () => {
    it('creates a hard ban, lists it, and lifts it', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/users/${EVAN_ID}/bans`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { banType: 'hard', reason: 'cheating, sustained reports' },
      });
      expect(createRes.statusCode).toBe(201);
      const banId = createRes.json<{ id: string }>().id;

      // Hard bans must also write to banned_emails. We check the hash with
      // the same helper the route uses so we're testing actual behaviour
      // rather than reimplementing the algorithm in SQL.
      const { hashEmailForBan } = await import('../../src/services/user-provisioning.js');
      const { rowCount: bannedEmailRows } = await app.db.query(
        `SELECT 1 FROM banned_emails WHERE hashed_email = $1`,
        [hashEmailForBan('evan@test.local')],
      );
      expect(bannedEmailRows).toBe(1);

      // List bans.
      const listRes = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/users/${EVAN_ID}/bans`,
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(listRes.statusCode).toBe(200);
      const items = listRes.json<{ items: { id: string; banType: string }[] }>().items;
      expect(items.some((b) => b.id === banId && b.banType === 'hard')).toBe(true);

      // Lift the specific ban.
      const liftRes = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/users/${EVAN_ID}/bans/${banId}/lift`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { liftReason: 'reviewed evidence; cleared' },
      });
      expect(liftRes.statusCode).toBe(200);
    });

    it('rejects bans with banType not in {soft, hard}', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/users/${EVAN_ID}/bans`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { banType: 'silver', reason: 'should fail validation' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── Trust summary ──────────────────────────────────────────────────────────

  describe('GET /admin/users/:id/trust-summary', () => {
    it('returns trust score, ban history, open reports count, and recent ratings', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/users/${ALICE_ID}/trust-summary`,
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{
        userId: string;
        username: string;
        trustScore: unknown;
        banHistory: unknown[];
        openReportsCount: number;
        recentRatings: unknown[];
      }>();
      expect(body.userId).toBe(ALICE_ID);
      expect(body.username).toBe('alice');
      expect(Array.isArray(body.banHistory)).toBe(true);
      expect(Array.isArray(body.recentRatings)).toBe(true);
      expect(typeof body.openReportsCount).toBe('number');
    });

    it('returns 404 for an unknown user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/users/00000000-0000-0000-0000-deadbeef0000/trust-summary',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Sticker update ─────────────────────────────────────────────────────────

  describe('PATCH /admin/stickers/:id', () => {
    let sampleStickerId: string;
    let originalPlayerName: string;

    beforeAll(async () => {
      const { rows } = await app.db.query<{ id: string; player_name: string }>(
        `SELECT id, player_name FROM stickers WHERE player_name IS NOT NULL LIMIT 1`,
      );
      sampleStickerId = rows[0]!.id;
      originalPlayerName = rows[0]!.player_name;
    });

    afterAll(async () => {
      // Restore the original name so this test doesn't leak state.
      await app.db.query(
        `UPDATE stickers SET player_name = $1 WHERE id = $2`,
        [originalPlayerName, sampleStickerId],
      );
    });

    it('updates the player_name and writes an audit row', async () => {
      const newName = 'Test Player ' + Date.now();
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/stickers/${sampleStickerId}`,
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { playerName: newName },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ playerName: string }>();
      expect(body.playerName).toBe(newName);

      // Audit row written by the admin.
      const { rowCount } = await app.db.query(
        `SELECT 1 FROM audit_log
          WHERE user_id = $1 AND action = 'sticker_updated'
            AND metadata->>'stickerId' = $2
          ORDER BY occurred_at DESC LIMIT 1`,
        [ADMIN_ID, sampleStickerId],
      );
      expect(rowCount).toBe(1);
    });

    it('returns 404 for an unknown sticker id', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/admin/stickers/00000000-0000-0000-0000-deadbeef0000',
        headers: { Authorization: `Bearer ${adminToken}` },
        payload: { playerName: 'whatever' },
      });
      // The admin route returns 403 (when the sticker is not editable) or
      // 404 (when the row doesn't exist) — either is an acceptable error.
      expect([403, 404]).toContain(res.statusCode);
    });
  });
});
