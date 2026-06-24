import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';

/**
 * One ephemeral user per test exercises a single criterion in
 * apps/backend/src/services/achievements.service.ts. The DB is shared with
 * the dev stack; per CLAUDE.md "Integration Tests Share The Dev DB", every
 * test cleans up after itself by deleting its user (CASCADE removes albums,
 * stickers, and trade_requests).
 */

const HAS_REAL_DB =
  typeof process.env['DATABASE_URL'] === 'string' &&
  process.env['DATABASE_URL'].includes('@') &&
  !process.env['DATABASE_URL'].includes('placeholder');
const HAS_REAL_REDIS =
  typeof process.env['REDIS_URL'] === 'string' &&
  process.env['REDIS_URL'].startsWith('redis://');
const shouldRun = HAS_REAL_DB && HAS_REAL_REDIS;

describe.skipIf(!shouldRun)('Achievements evaluator (integration)', () => {
  let app: FastifyInstance;
  let evaluateAchievements: typeof import('../../src/services/achievements.service.js')['evaluateAchievements'];

  let albumTypeId: string;
  let editionId: string;
  let formatId: string;

  const scratchUserIds: string[] = [];

  async function insertUser(): Promise<string> {
    const id = randomUUID();
    const username = `ach-${id.replace(/-/g, '').slice(0, 16)}`;
    await app.db.query(
      `INSERT INTO users (id, email, username, display_name, role, email_verified_at)
       VALUES ($1, $2, $3, 'Achievement Test', 'user', now())`,
      [id, `${id}@achievements-test.local`, username],
    );
    await app.db.query(`INSERT INTO user_settings (user_id) VALUES ($1)`, [id]);
    scratchUserIds.push(id);
    return id;
  }

  async function insertAlbum(userId: string): Promise<string> {
    const id = randomUUID();
    await app.db.query(
      `INSERT INTO user_albums (id, user_id, album_type_id, album_edition_id, album_format_id, is_default, settings, slug)
       VALUES ($1, $2, $3, $4, $5, true, $6::jsonb, $7)`,
      [
        id, userId, albumTypeId, editionId, formatId,
        JSON.stringify({ includeExtras: true, includeCocaCola: true, defaultBaseVariant: 'base_border' }),
        `ach-test-${id.split('-')[0]}`,
      ],
    );
    return id;
  }

  /**
   * Insert ownership of the canonical base variant for every standard sticker
   * (badge + 18 players + team photo) belonging to one team. CC and Extras
   * are skipped on purpose — that's the contract the achievement enforces.
   */
  async function ownStandardTeam(albumId: string, fifaCode: string): Promise<number> {
    const { rowCount } = await app.db.query(
      `INSERT INTO user_stickers (album_id, sticker_variant_id, quantity)
       SELECT $1, sv.id, 1
         FROM stickers s
         JOIN teams t ON t.id = s.team_id
         JOIN sticker_variants sv ON sv.sticker_id = s.id
        WHERE t.fifa_code = $2
          AND s.album_type_id = $3
          AND s.sticker_type NOT IN ('extra', 'coca_cola_special')
          AND sv.variant_type = 'base_border'`,
      [albumId, fifaCode, albumTypeId],
    );
    return rowCount ?? 0;
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app.js');
    ({ evaluateAchievements } = await import('../../src/services/achievements.service.js'));
    app = await buildApp();
    await app.ready();

    const { rows } = await app.db.query<{ type_id: string; edition_id: string; format_id: string }>(
      `SELECT at.id AS type_id, ae.id AS edition_id, af.id AS format_id
         FROM album_types at
         JOIN album_editions ae ON ae.album_type_id = at.id AND ae.key = 'north_america'
         JOIN album_formats  af ON af.album_type_id = at.id AND af.key = 'softcover_standard'
        WHERE at.key = 'fifa_world_cup_2026'`,
    );
    if (!rows[0]) throw new Error('FIFA 2026 album type lookup failed — is the catalog seeded?');
    albumTypeId = rows[0].type_id;
    editionId   = rows[0].edition_id;
    formatId    = rows[0].format_id;
  });

  afterEach(async () => {
    if (scratchUserIds.length > 0) {
      await app.db.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [scratchUserIds]);
      scratchUserIds.length = 0;
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  async function keysFor(userId: string): Promise<Set<string>> {
    const items = await evaluateAchievements(app.db, userId);
    return new Set(items.map((i) => i.key));
  }

  // ── first_sticker ──────────────────────────────────────────────────────────

  describe('first_sticker', () => {
    it('unlocks when the user owns at least one sticker', async () => {
      const userId = await insertUser();
      const albumId = await insertAlbum(userId);

      expect(await keysFor(userId)).not.toContain('first_sticker');

      const { rows: [variant] } = await app.db.query<{ id: string }>(
        `SELECT sv.id
           FROM stickers s
           JOIN sticker_variants sv ON sv.sticker_id = s.id
          WHERE s.album_type_id = $1 AND sv.variant_type = 'base_border'
          LIMIT 1`,
        [albumTypeId],
      );
      await app.db.query(
        `INSERT INTO user_stickers (album_id, sticker_variant_id, quantity)
         VALUES ($1, $2, 1)`,
        [albumId, variant.id],
      );

      expect(await keysFor(userId)).toContain('first_sticker');
    });
  });

  // ── percentage_gte_{25,50,75,100} ──────────────────────────────────────────

  describe('percentage thresholds', () => {
    async function setProgress(userId: string, owned: number, total: number) {
      const albumId = await insertAlbum(userId);
      // Bypass the user_stickers trigger by writing the counts directly —
      // we only care that the criterion reads from user_albums.
      await app.db.query(
        `UPDATE user_albums SET owned_count = $1, total_count = $2 WHERE id = $3`,
        [owned, total, albumId],
      );
    }

    it.each([
      { pct: 24, expected: [] as string[] },
      { pct: 25, expected: ['pct_25'] },
      { pct: 50, expected: ['pct_25', 'pct_50'] },
      { pct: 75, expected: ['pct_25', 'pct_50', 'pct_75'] },
      { pct: 99, expected: ['pct_25', 'pct_50', 'pct_75'] },
      { pct: 100, expected: ['pct_25', 'pct_50', 'pct_75', 'pct_100'] },
    ])('at $pct% unlocks $expected', async ({ pct, expected }) => {
      const userId = await insertUser();
      await setProgress(userId, pct, 100);
      const keys = await keysFor(userId);
      for (const key of expected) expect(keys).toContain(key);
      for (const key of ['pct_25', 'pct_50', 'pct_75', 'pct_100']) {
        if (!expected.includes(key)) expect(keys).not.toContain(key);
      }
    });

    it('treats a zero-sticker album as 0% (no division-by-zero unlock)', async () => {
      const userId = await insertUser();
      await insertAlbum(userId);
      // Trigger left counts at the real catalog totals; force the zero edge.
      await app.db.query(
        `UPDATE user_albums SET owned_count = 0, total_count = 0 WHERE user_id = $1`,
        [userId],
      );
      const keys = await keysFor(userId);
      for (const key of ['pct_25', 'pct_50', 'pct_75', 'pct_100']) {
        expect(keys).not.toContain(key);
      }
    });
  });

  // ── team_complete_any ──────────────────────────────────────────────────────

  describe('team_complete_any', () => {
    it('unlocks for a team with no Extras and no Coca-Cola alternates (CZE)', async () => {
      const userId = await insertUser();
      const albumId = await insertAlbum(userId);
      const n = await ownStandardTeam(albumId, 'CZE');
      expect(n).toBe(20);
      expect(await keysFor(userId)).toContain('team_complete');
    });

    it('unlocks for a team that has an Extra and a Coca-Cola alternate (CRO) when only the 20 standard stickers are owned', async () => {
      // Regression for the bug where Extras (no album slot) and Coca-Cola
      // bonus stickers were counted as part of team completion. A collector
      // who owns the 20 standard CRO stickers should unlock the badge
      // without also owning EX16 Modrić and CC5 Gvardiol.
      const userId = await insertUser();
      const albumId = await insertAlbum(userId);
      const n = await ownStandardTeam(albumId, 'CRO');
      expect(n).toBe(20);
      expect(await keysFor(userId)).toContain('team_complete');
    });

    it('does not unlock when one standard sticker is missing', async () => {
      const userId = await insertUser();
      const albumId = await insertAlbum(userId);
      // Own all CZE stickers except one to prove the per-team check is tight.
      const { rows: variants } = await app.db.query<{ id: string }>(
        `SELECT sv.id
           FROM stickers s
           JOIN teams t ON t.id = s.team_id
           JOIN sticker_variants sv ON sv.sticker_id = s.id
          WHERE t.fifa_code = 'CZE'
            AND s.album_type_id = $1
            AND s.sticker_type NOT IN ('extra', 'coca_cola_special')
            AND sv.variant_type = 'base_border'
          ORDER BY s.album_code
          LIMIT 19`,
        [albumTypeId],
      );
      expect(variants).toHaveLength(19);
      for (const v of variants) {
        await app.db.query(
          `INSERT INTO user_stickers (album_id, sticker_variant_id, quantity)
           VALUES ($1, $2, 1)`,
          [albumId, v.id],
        );
      }
      expect(await keysFor(userId)).not.toContain('team_complete');
    });
  });

  // ── all_teams_complete ─────────────────────────────────────────────────────

  describe('all_teams_complete', () => {
    it('unlocks only when every team in the album has its standard stickers owned', async () => {
      const userId = await insertUser();
      const albumId = await insertAlbum(userId);

      // Own one team only → team_complete fires, all_teams does not.
      await ownStandardTeam(albumId, 'CZE');
      let keys = await keysFor(userId);
      expect(keys).toContain('team_complete');
      expect(keys).not.toContain('all_teams');

      // Now own every other team's standard stickers. Extras and CC are
      // intentionally excluded, matching the criterion's contract.
      await app.db.query(
        `INSERT INTO user_stickers (album_id, sticker_variant_id, quantity)
         SELECT $1, sv.id, 1
           FROM stickers s
           JOIN sticker_variants sv ON sv.sticker_id = s.id
          WHERE s.album_type_id = $2
            AND s.team_id IS NOT NULL
            AND s.sticker_type NOT IN ('extra', 'coca_cola_special')
            AND sv.variant_type = 'base_border'
         ON CONFLICT (album_id, sticker_variant_id) DO NOTHING`,
        [albumId, albumTypeId],
      );

      keys = await keysFor(userId);
      expect(keys).toContain('all_teams');
    });
  });

  // ── rare_pull ──────────────────────────────────────────────────────────────

  describe('rare_pull', () => {
    it('unlocks the first time the user owns a variant with rarity_rank >= 4', async () => {
      const userId = await insertUser();
      const albumId = await insertAlbum(userId);

      // Own a common (red, rank 3) first → not yet unlocked.
      const { rows: [common] } = await app.db.query<{ id: string }>(
        `SELECT sv.id
           FROM stickers s
           JOIN sticker_variants sv ON sv.sticker_id = s.id
          WHERE s.album_type_id = $1 AND sv.variant_type = 'red'
          LIMIT 1`,
        [albumTypeId],
      );
      await app.db.query(
        `INSERT INTO user_stickers (album_id, sticker_variant_id, quantity)
         VALUES ($1, $2, 1)`,
        [albumId, common.id],
      );
      expect(await keysFor(userId)).not.toContain('rare_pull');

      // Now add a purple (rank 4) — over the threshold.
      const { rows: [rare] } = await app.db.query<{ id: string }>(
        `SELECT sv.id
           FROM stickers s
           JOIN sticker_variants sv ON sv.sticker_id = s.id
          WHERE s.album_type_id = $1 AND sv.variant_type = 'purple'
          LIMIT 1`,
        [albumTypeId],
      );
      await app.db.query(
        `INSERT INTO user_stickers (album_id, sticker_variant_id, quantity)
         VALUES ($1, $2, 1)`,
        [albumId, rare.id],
      );
      expect(await keysFor(userId)).toContain('rare_pull');
    });
  });

  // ── first_trade_completed ──────────────────────────────────────────────────

  describe('first_trade_completed', () => {
    it('unlocks on the user\'s first completed trade as requester or recipient', async () => {
      const requesterId = await insertUser();
      const recipientId = await insertUser();
      const requesterAlbumId = await insertAlbum(requesterId);
      const recipientAlbumId = await insertAlbum(recipientId);

      // Pending trade → criterion does not fire.
      const pendingId = randomUUID();
      await app.db.query(
        `INSERT INTO trade_requests (id, requester_id, recipient_id, requester_album_id, recipient_album_id, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')`,
        [pendingId, requesterId, recipientId, requesterAlbumId, recipientAlbumId],
      );
      expect(await keysFor(requesterId)).not.toContain('first_trade');
      expect(await keysFor(recipientId)).not.toContain('first_trade');

      // Flip to completed → both sides unlock.
      await app.db.query(
        `UPDATE trade_requests
            SET status = 'completed', completed_at = now()
          WHERE id = $1`,
        [pendingId],
      );
      expect(await keysFor(requesterId)).toContain('first_trade');
      expect(await keysFor(recipientId)).toContain('first_trade');
    });
  });

  // ── persistence semantics ──────────────────────────────────────────────────

  describe('persistence', () => {
    it('is idempotent — a second evaluate call returns the same set without re-inserting', async () => {
      const userId = await insertUser();
      const albumId = await insertAlbum(userId);
      await ownStandardTeam(albumId, 'CZE');

      const first = await evaluateAchievements(app.db, userId);
      const firstUnlockedAt = first.find((i) => i.key === 'team_complete')?.unlockedAt;
      expect(firstUnlockedAt).toBeDefined();

      const second = await evaluateAchievements(app.db, userId);
      expect(second.find((i) => i.key === 'team_complete')?.unlockedAt).toBe(firstUnlockedAt);
    });

    it('keeps the badge after the underlying state regresses (once won, stays won)', async () => {
      const userId = await insertUser();
      const albumId = await insertAlbum(userId);
      await ownStandardTeam(albumId, 'CZE');
      expect(await keysFor(userId)).toContain('team_complete');

      // Remove every owned sticker — the criterion would now return false.
      await app.db.query(`DELETE FROM user_stickers WHERE album_id = $1`, [albumId]);
      expect(await keysFor(userId)).toContain('team_complete');
    });
  });
});
