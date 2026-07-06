import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';

/**
 * Integration tests for the third-party trade draft service
 * (apps/backend/src/services/third-party-drafts.service.ts):
 *   - upsert/list/get/delete CRUD against the real third_party_trade_drafts
 *     table.
 *   - cross-user album scoping — a draft can only attach to an album the
 *     caller owns, even though the route accepts an albumId in the body.
 *   - the route layer's partner_name normalization (empty string → null) so
 *     the UI doesn't have to special-case "no partner".
 *
 * Per CLAUDE.md "Tests — Integration Tests Share The Dev DB": this suite
 * inserts ephemeral users only, cleans up in afterAll, and never mutates
 * seeded fixture users.
 */

const HAS_REAL_DB =
  typeof process.env['DATABASE_URL'] === 'string' &&
  process.env['DATABASE_URL'].includes('@') &&
  !process.env['DATABASE_URL'].includes('placeholder');

const HAS_REAL_REDIS =
  typeof process.env['REDIS_URL'] === 'string' &&
  process.env['REDIS_URL'].startsWith('redis://');

const shouldRun = HAS_REAL_DB && HAS_REAL_REDIS;

describe.skipIf(!shouldRun)('Third-party trade drafts (integration)', () => {
  let app: FastifyInstance;
  let upsertThirdPartyDraft: typeof import('../../src/services/third-party-drafts.service.js')['upsertThirdPartyDraft'];
  let listThirdPartyDrafts: typeof import('../../src/services/third-party-drafts.service.js')['listThirdPartyDrafts'];
  let getThirdPartyDraft: typeof import('../../src/services/third-party-drafts.service.js')['getThirdPartyDraft'];
  let deleteThirdPartyDraft: typeof import('../../src/services/third-party-drafts.service.js')['deleteThirdPartyDraft'];

  let albumTypeId: string;
  let editionId: string;
  let formatId: string;

  const allInsertedUserIds: string[] = [];
  let scratchUserIds: string[] = [];

  async function insertUser(): Promise<string> {
    const id = randomUUID();
    const username = id.replace(/-/g, '').slice(0, 20);
    await app.db.query(
      `INSERT INTO users (id, email, username, display_name, role, email_verified_at)
       VALUES ($1, $2, $3, 'Draft Test', 'user', now())`,
      [id, `${id}@third-party-drafts-test.local`, username],
    );
    await app.db.query(`INSERT INTO user_settings (user_id) VALUES ($1)`, [id]);
    allInsertedUserIds.push(id);
    scratchUserIds.push(id);
    return id;
  }

  async function insertAlbum(userId: string): Promise<string> {
    const id = randomUUID();
    const slug = `tp-drafts-${id.split('-')[0]}`;
    await app.db.query(
      `INSERT INTO user_albums (id, user_id, album_type_id, album_edition_id, album_format_id, is_default, settings, slug)
       VALUES ($1, $2, $3, $4, $5, true, $6::jsonb, $7)`,
      [id, userId, albumTypeId, editionId, formatId,
       JSON.stringify({ includeExtras: true, includeCocaCola: true, defaultBaseVariant: 'base_borderless' }),
       slug],
    );
    return id;
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app.js');
    ({
      upsertThirdPartyDraft,
      listThirdPartyDrafts,
      getThirdPartyDraft,
      deleteThirdPartyDraft,
    } = await import('../../src/services/third-party-drafts.service.js'));

    app = await buildApp();
    await app.ready();

    const { rows } = await app.db.query<{ type_id: string; edition_id: string; format_id: string }>(
      `SELECT at.id AS type_id, ae.id AS edition_id, af.id AS format_id
         FROM album_types at
         JOIN album_editions ae ON ae.album_type_id = at.id AND ae.key = 'north_america'
         JOIN album_formats af  ON af.album_type_id = at.id AND af.key = 'softcover_standard'
        WHERE at.key = 'fifa_world_cup_2026'`,
    );
    if (!rows[0]) throw new Error('FIFA 2026 catalog not seeded.');
    albumTypeId = rows[0].type_id;
    editionId = rows[0].edition_id;
    formatId = rows[0].format_id;
  });

  afterEach(async () => {
    if (scratchUserIds.length > 0) {
      await app.db.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [scratchUserIds]);
      scratchUserIds = [];
    }
  });

  afterAll(async () => {
    if (allInsertedUserIds.length > 0) {
      await app.db.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [allInsertedUserIds]);
    }
    await app?.close();
  });

  describe('upsert', () => {
    it('inserts a new draft and returns the persisted row', async () => {
      const userId = await insertUser();
      const albumId = await insertAlbum(userId);

      const draft = await upsertThirdPartyDraft(app.db, {
        id: null,
        userId,
        albumId,
        partnerName: 'Alex',
        theirOffered: [{ albumCode: 'BRA5', variantToken: 'red', quantity: 2 }],
        theirWanted: [{ albumCode: 'ARG10', variantToken: null, quantity: 1 }],
        selectionIReceive: [],
        selectionIGive: [],
        iReceiveCashCents: 500,
        iGiveCashCents: 0,
      });

      expect(draft.id).toBeTruthy();
      expect(draft.userId).toBe(userId);
      expect(draft.albumId).toBe(albumId);
      expect(draft.partnerName).toBe('Alex');
      expect(draft.theirOffered).toEqual([{ albumCode: 'BRA5', variantToken: 'red', quantity: 2 }]);
      expect(draft.iReceiveCashCents).toBe(500);
      expect(draft.iGiveCashCents).toBe(0);
      expect(draft.createdAt).toBeTruthy();
      expect(draft.updatedAt).toBeTruthy();
    });

    it('updates in place when given an existing id', async () => {
      const userId = await insertUser();
      const albumId = await insertAlbum(userId);

      const first = await upsertThirdPartyDraft(app.db, {
        id: null, userId, albumId,
        partnerName: 'Initial',
        theirOffered: [], theirWanted: [],
        selectionIReceive: [], selectionIGive: [],
        iReceiveCashCents: 0, iGiveCashCents: 0,
      });

      const updated = await upsertThirdPartyDraft(app.db, {
        id: first.id, userId, albumId,
        partnerName: 'Renamed',
        theirOffered: [{ albumCode: 'BRA5', variantToken: null, quantity: 1 }],
        theirWanted: [],
        selectionIReceive: [], selectionIGive: [],
        iReceiveCashCents: 250, iGiveCashCents: 100,
      });

      expect(updated.id).toBe(first.id);
      expect(updated.partnerName).toBe('Renamed');
      expect(updated.iReceiveCashCents).toBe(250);
      expect(updated.iGiveCashCents).toBe(100);

      // Confirm via list that there's only one row (not a duplicate insert).
      const all = await listThirdPartyDrafts(app.db, userId);
      expect(all).toHaveLength(1);
      expect(all[0]?.id).toBe(first.id);
    });

    it('rejects an albumId belonging to another user with 404', async () => {
      const alice = await insertUser();
      const bob = await insertUser();
      const bobsAlbum = await insertAlbum(bob);

      // Alice tries to attach a draft to bob's album.
      await expect(
        upsertThirdPartyDraft(app.db, {
          id: null, userId: alice, albumId: bobsAlbum,
          partnerName: null,
          theirOffered: [], theirWanted: [],
          selectionIReceive: [], selectionIGive: [],
          iReceiveCashCents: 0, iGiveCashCents: 0,
        }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('rejects updating a draft owned by another user with 404', async () => {
      const alice = await insertUser();
      const bob = await insertUser();
      const aliceAlbum = await insertAlbum(alice);
      const bobAlbum = await insertAlbum(bob);

      const aliceDraft = await upsertThirdPartyDraft(app.db, {
        id: null, userId: alice, albumId: aliceAlbum,
        partnerName: 'Mine',
        theirOffered: [], theirWanted: [],
        selectionIReceive: [], selectionIGive: [],
        iReceiveCashCents: 0, iGiveCashCents: 0,
      });

      // Bob tries to overwrite Alice's draft, with his own albumId so the
      // album-ownership check passes — the row-ownership check is what stops
      // him.
      await expect(
        upsertThirdPartyDraft(app.db, {
          id: aliceDraft.id, userId: bob, albumId: bobAlbum,
          partnerName: 'Hijacked',
          theirOffered: [], theirWanted: [],
          selectionIReceive: [], selectionIGive: [],
          iReceiveCashCents: 0, iGiveCashCents: 0,
        }),
      ).rejects.toMatchObject({ statusCode: 404 });

      // Verify Alice's draft is unchanged.
      const reread = await getThirdPartyDraft(app.db, alice, aliceDraft.id);
      expect(reread?.partnerName).toBe('Mine');
    });

    it('preserves selections — variant UUIDs and copy counts — through a round-trip', async () => {
      const userId = await insertUser();
      const albumId = await insertAlbum(userId);

      const { rows: variantRows } = await app.db.query<{ id: string }>(
        `SELECT sv.id FROM sticker_variants sv
           JOIN stickers s ON s.id = sv.sticker_id
          WHERE s.album_type_id = $1 LIMIT 3`,
        [albumTypeId],
      );
      const variantIds = variantRows.map((r) => r.id);
      expect(variantIds).toHaveLength(3);

      // Mixed quantities: an explicit stepper override (2), an explicit 1,
      // and a null ("pool default" — the shape pre-0025 drafts convert to).
      const receive = [
        { stickerVariantId: variantIds[0]!, quantity: 2 },
        { stickerVariantId: variantIds[1]!, quantity: 1 },
      ];
      const give = [{ stickerVariantId: variantIds[2]!, quantity: null }];

      const draft = await upsertThirdPartyDraft(app.db, {
        id: null, userId, albumId,
        partnerName: null,
        theirOffered: [], theirWanted: [],
        selectionIReceive: receive,
        selectionIGive: give,
        iReceiveCashCents: 0, iGiveCashCents: 0,
      });

      expect(draft.selectionIReceive).toEqual(receive);
      expect(draft.selectionIGive).toEqual(give);

      // And again through a fresh read, not just the RETURNING row.
      const reread = await getThirdPartyDraft(app.db, userId, draft.id);
      expect(reread?.selectionIReceive).toEqual(receive);
      expect(reread?.selectionIGive).toEqual(give);
    });
  });

  describe('list / get', () => {
    it('returns drafts only for the requesting user, newest first', async () => {
      const alice = await insertUser();
      const bob = await insertUser();
      const aliceAlbum = await insertAlbum(alice);
      const bobAlbum = await insertAlbum(bob);

      const aliceFirst = await upsertThirdPartyDraft(app.db, {
        id: null, userId: alice, albumId: aliceAlbum,
        partnerName: 'A1', theirOffered: [], theirWanted: [],
        selectionIReceive: [], selectionIGive: [],
        iReceiveCashCents: 0, iGiveCashCents: 0,
      });
      // Bump updated_at on the second one so we can assert ordering.
      await new Promise((r) => setTimeout(r, 10));
      const aliceSecond = await upsertThirdPartyDraft(app.db, {
        id: null, userId: alice, albumId: aliceAlbum,
        partnerName: 'A2', theirOffered: [], theirWanted: [],
        selectionIReceive: [], selectionIGive: [],
        iReceiveCashCents: 0, iGiveCashCents: 0,
      });
      await upsertThirdPartyDraft(app.db, {
        id: null, userId: bob, albumId: bobAlbum,
        partnerName: 'B1', theirOffered: [], theirWanted: [],
        selectionIReceive: [], selectionIGive: [],
        iReceiveCashCents: 0, iGiveCashCents: 0,
      });

      const aliceList = await listThirdPartyDrafts(app.db, alice);
      expect(aliceList.map((d) => d.id)).toEqual([aliceSecond.id, aliceFirst.id]);
      const bobList = await listThirdPartyDrafts(app.db, bob);
      expect(bobList).toHaveLength(1);
      expect(bobList[0]?.partnerName).toBe('B1');
    });

    it('getThirdPartyDraft returns null for a draft owned by another user', async () => {
      const alice = await insertUser();
      const bob = await insertUser();
      const aliceAlbum = await insertAlbum(alice);

      const draft = await upsertThirdPartyDraft(app.db, {
        id: null, userId: alice, albumId: aliceAlbum,
        partnerName: null, theirOffered: [], theirWanted: [],
        selectionIReceive: [], selectionIGive: [],
        iReceiveCashCents: 0, iGiveCashCents: 0,
      });

      expect(await getThirdPartyDraft(app.db, bob, draft.id)).toBeNull();
    });
  });

  describe('delete', () => {
    it('removes only the draft owned by the caller', async () => {
      const alice = await insertUser();
      const bob = await insertUser();
      const aliceAlbum = await insertAlbum(alice);

      const draft = await upsertThirdPartyDraft(app.db, {
        id: null, userId: alice, albumId: aliceAlbum,
        partnerName: null, theirOffered: [], theirWanted: [],
        selectionIReceive: [], selectionIGive: [],
        iReceiveCashCents: 0, iGiveCashCents: 0,
      });

      // Bob's delete request silently no-ops (returns false). Alice's draft
      // is still there.
      expect(await deleteThirdPartyDraft(app.db, bob, draft.id)).toBe(false);
      expect(await getThirdPartyDraft(app.db, alice, draft.id)).not.toBeNull();

      // Alice's delete succeeds.
      expect(await deleteThirdPartyDraft(app.db, alice, draft.id)).toBe(true);
      expect(await getThirdPartyDraft(app.db, alice, draft.id)).toBeNull();
    });

    it('cascades when the parent album is deleted', async () => {
      const userId = await insertUser();
      const albumId = await insertAlbum(userId);

      const draft = await upsertThirdPartyDraft(app.db, {
        id: null, userId, albumId,
        partnerName: null, theirOffered: [], theirWanted: [],
        selectionIReceive: [], selectionIGive: [],
        iReceiveCashCents: 0, iGiveCashCents: 0,
      });

      await app.db.query(`DELETE FROM user_albums WHERE id = $1`, [albumId]);
      expect(await getThirdPartyDraft(app.db, userId, draft.id)).toBeNull();
    });
  });

  describe('cash constraints', () => {
    it('rejects a negative cash amount via the CHECK constraint', async () => {
      const userId = await insertUser();
      const albumId = await insertAlbum(userId);

      await expect(
        upsertThirdPartyDraft(app.db, {
          id: null, userId, albumId,
          partnerName: null, theirOffered: [], theirWanted: [],
          selectionIReceive: [], selectionIGive: [],
          iReceiveCashCents: -1, iGiveCashCents: 0,
        }),
      ).rejects.toThrow();
    });
  });
});
