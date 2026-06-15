import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  listFavourites,
  setFavourites,
  toggleFavourite,
} from '../../src/services/favourites.service.js';

const HAS_REAL_DB =
  typeof process.env['DATABASE_URL'] === 'string' &&
  process.env['DATABASE_URL'].includes('@') &&
  !process.env['DATABASE_URL'].includes('placeholder');
const HAS_REAL_REDIS =
  typeof process.env['REDIS_URL'] === 'string' &&
  process.env['REDIS_URL'].startsWith('redis://');
const shouldRun = HAS_REAL_DB && HAS_REAL_REDIS;

const ALICE_NA_ALBUM_ID = '00000000-0000-0000-0001-000000000002';

describe.skipIf(!shouldRun)('favourites.service (integration, real DB)', () => {
  let app: FastifyInstance;
  let stickerA: string;
  let stickerB: string;
  let stickerC: string;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app.js');
    app = await buildApp();
    await app.ready();
    const { rows } = await app.db.query<{ id: string }>(
      `SELECT s.id FROM stickers s
         JOIN album_types at ON at.id = s.album_type_id
        WHERE at.key = 'fifa_world_cup_2026'
        ORDER BY s.number LIMIT 3`,
    );
    [stickerA, stickerB, stickerC] = rows.map((r) => r.id);
  });

  afterAll(async () => {
    await app.db.query(
      `DELETE FROM user_sticker_favourites WHERE album_id = $1`,
      [ALICE_NA_ALBUM_ID],
    );
    await app?.close();
  });

  beforeEach(async () => {
    await app.db.query(
      `DELETE FROM user_sticker_favourites WHERE album_id = $1`,
      [ALICE_NA_ALBUM_ID],
    );
  });

  describe('listFavourites', () => {
    it('returns an empty array when nothing is favourited', async () => {
      expect(await listFavourites(app.db, ALICE_NA_ALBUM_ID)).toEqual([]);
    });
  });

  describe('setFavourites', () => {
    it('replaces the favourite set inside a single transaction', async () => {
      await setFavourites(app.db, ALICE_NA_ALBUM_ID, [stickerA, stickerB]);
      expect((await listFavourites(app.db, ALICE_NA_ALBUM_ID)).sort()).toEqual(
        [stickerA, stickerB].sort(),
      );

      // Replacing with a smaller set must DELETE the old members.
      await setFavourites(app.db, ALICE_NA_ALBUM_ID, [stickerC]);
      expect(await listFavourites(app.db, ALICE_NA_ALBUM_ID)).toEqual([stickerC]);
    });

    it('accepts an empty array — clears every favourite for the album', async () => {
      await setFavourites(app.db, ALICE_NA_ALBUM_ID, [stickerA, stickerB]);
      await setFavourites(app.db, ALICE_NA_ALBUM_ID, []);
      expect(await listFavourites(app.db, ALICE_NA_ALBUM_ID)).toEqual([]);
    });

    it('is idempotent — re-setting the same list leaves the rows in place', async () => {
      await setFavourites(app.db, ALICE_NA_ALBUM_ID, [stickerA, stickerB]);
      await setFavourites(app.db, ALICE_NA_ALBUM_ID, [stickerA, stickerB]);
      expect((await listFavourites(app.db, ALICE_NA_ALBUM_ID)).sort()).toEqual(
        [stickerA, stickerB].sort(),
      );
    });
  });

  describe('toggleFavourite', () => {
    it('inserts when absent (returns favourited=true), deletes when present (returns favourited=false)', async () => {
      const first = await toggleFavourite(app.db, ALICE_NA_ALBUM_ID, stickerA);
      expect(first).toEqual({ favourited: true });
      expect(await listFavourites(app.db, ALICE_NA_ALBUM_ID)).toEqual([stickerA]);

      const second = await toggleFavourite(app.db, ALICE_NA_ALBUM_ID, stickerA);
      expect(second).toEqual({ favourited: false });
      expect(await listFavourites(app.db, ALICE_NA_ALBUM_ID)).toEqual([]);
    });

    it('toggling a different sticker does not affect existing favourites', async () => {
      await toggleFavourite(app.db, ALICE_NA_ALBUM_ID, stickerA);
      await toggleFavourite(app.db, ALICE_NA_ALBUM_ID, stickerB);
      expect((await listFavourites(app.db, ALICE_NA_ALBUM_ID)).sort()).toEqual(
        [stickerA, stickerB].sort(),
      );
    });
  });
});
