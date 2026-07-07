import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';

/**
 * Integration tests for the variant-aware external-list matching paths
 * (apps/backend/src/services/trade-matching.service.ts):
 *   - matchAgainstUserAlbum: a third-party's offered/wanted list matched
 *     against a logged-in user's collection. The give side is per-variant
 *     (a base spare satisfies a base want only). The RECEIVE side is
 *     per-sticker: a user is never recommended to receive a sticker they
 *     already own in ANY variant — owning the base means the red parallel is
 *     "owned" too and is never offered to them, UNLESS they've explicitly added
 *     that exact variant to their wanted list (the variant-collector exception).
 *   - matchPair: anonymous two-list match.
 *
 * The third-party flow is the entry point for trade-ratio guidance: the
 * service computes a give/get scarcity total and flags lopsided trades, so
 * these tests pin the math down to a known fixture.
 */

const HAS_REAL_DB =
  typeof process.env['DATABASE_URL'] === 'string' &&
  process.env['DATABASE_URL'].includes('@') &&
  !process.env['DATABASE_URL'].includes('placeholder');

const HAS_REAL_REDIS =
  typeof process.env['REDIS_URL'] === 'string' &&
  process.env['REDIS_URL'].startsWith('redis://');

const shouldRun = HAS_REAL_DB && HAS_REAL_REDIS;

describe.skipIf(!shouldRun)('External-list matching (integration)', () => {
  let app: FastifyInstance;
  let matchAgainstUserAlbum: typeof import('../../src/services/trade-matching.service.js')['matchAgainstUserAlbum'];
  let matchPair: typeof import('../../src/services/trade-matching.service.js')['matchPair'];

  let albumTypeId: string;
  let editionId: string;
  let formatId: string;

  const allInsertedUserIds: string[] = [];
  let scratchUserIds: string[] = [];

  async function insertUser(): Promise<string> {
    const id = randomUUID();
    const username = id.replace(/-/g, '').slice(0, 20);
    const email = `${id}@external-match-test.local`;
    await app.db.query(
      `INSERT INTO users (id, email, username, display_name, role, email_verified_at)
       VALUES ($1, $2, $3, 'Test User', 'user', now())`,
      [id, email, username],
    );
    await app.db.query(`INSERT INTO user_settings (user_id) VALUES ($1)`, [id]);
    allInsertedUserIds.push(id);
    scratchUserIds.push(id);
    return id;
  }

  async function insertAlbum(
    userId: string,
    defaultBaseVariant: 'base_border' | 'base_borderless' = 'base_border',
    extraSettings: Record<string, unknown> = {},
  ): Promise<string> {
    const id = randomUUID();
    const slug = `external-match-test-${id.split('-')[0]}`;
    await app.db.query(
      `INSERT INTO user_albums (id, user_id, album_type_id, album_edition_id, album_format_id, is_default, settings, slug)
       VALUES ($1, $2, $3, $4, $5, true, $6::jsonb, $7)`,
      [
        id, userId, albumTypeId, editionId, formatId,
        JSON.stringify({
          includeExtras: true,
          includeCocaCola: true,
          defaultBaseVariant,
          ...extraSettings,
        }),
        slug,
      ],
    );
    return id;
  }

  async function insertOwned(
    albumId: string,
    variantId: string,
    quantity: number,
    flags: { tradeForced?: boolean; tradeHidden?: boolean } = {},
  ): Promise<void> {
    await app.db.query(
      `INSERT INTO user_stickers (album_id, sticker_variant_id, quantity, trade_forced, trade_hidden)
       VALUES ($1, $2, $3, $4, $5)`,
      [albumId, variantId, quantity, flags.tradeForced ?? false, flags.tradeHidden ?? false],
    );
  }

  async function insertWanted(
    userId: string,
    albumId: string,
    variantId: string,
  ): Promise<void> {
    await app.db.query(
      `INSERT INTO user_wanted_variants (user_id, album_id, sticker_variant_id)
       VALUES ($1, $2, $3)`,
      [userId, albumId, variantId],
    );
  }

  // Test fixtures use sticker numbers 800–810 (well above seeded ranges).
  async function lookupVariant(stickerNumber: number, variantType: string): Promise<{
    stickerId: string; variantId: string; albumCode: string;
  }> {
    const { rows } = await app.db.query<{ sticker_id: string; variant_id: string; album_code: string }>(
      `SELECT s.id AS sticker_id, sv.id AS variant_id, s.album_code
         FROM stickers s
         JOIN sticker_variants sv ON sv.sticker_id = s.id
        WHERE s.number = $1
          AND sv.variant_type = $2
          AND s.album_type_id = $3`,
      [stickerNumber, variantType, albumTypeId],
    );
    if (!rows[0]) throw new Error(`No variant for sticker #${stickerNumber} (${variantType})`);
    return { stickerId: rows[0].sticker_id, variantId: rows[0].variant_id, albumCode: rows[0].album_code };
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app.js');
    ({ matchAgainstUserAlbum, matchPair } = await import('../../src/services/trade-matching.service.js'));

    app = await buildApp();
    await app.ready();

    const { rows } = await app.db.query<{ type_id: string; edition_id: string; format_id: string }>(
      `SELECT at.id   AS type_id,
              ae.id   AS edition_id,
              af.id   AS format_id
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
      scratchUserIds = [];
    }
  });

  afterAll(async () => {
    if (allInsertedUserIds.length > 0) {
      await app.db.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [allInsertedUserIds]);
    }
    await app?.close();
  });

  describe('matchAgainstUserAlbum — variant identity', () => {
    it('never recommends receiving a parallel of a sticker already owned in another variant', async () => {
      const userId = await insertUser();
      const albumId = await insertAlbum(userId, 'base_border');

      const base = await lookupVariant(800, 'base_border');
      const red = await lookupVariant(800, 'red');

      // User owns the base only.
      await insertOwned(albumId, base.variantId, 1);

      // Third party offers BRA800(red). The user already owns BRA800 (in the
      // base lane), so it must NEVER be recommended as a receive — regardless
      // of variant, owning the sticker means owning it.
      const result = await matchAgainstUserAlbum(app.db, userId, albumId, {
        theirOffered: [{ albumCode: red.albumCode, variantToken: 'red', quantity: 1 }],
        theirWanted:  [],
      });

      expect(result.iGet).toHaveLength(0);
      expect(result.candidatesIGet).toHaveLength(0);
      expect(result.unknownCodes).toEqual([]);
    });

    it('DOES offer a parallel the user explicitly wants, even while owning another variant', async () => {
      const userId = await insertUser();
      const albumId = await insertAlbum(userId, 'base_border');

      const base = await lookupVariant(804, 'base_border');
      const red = await lookupVariant(804, 'red');

      // User owns the base but has explicitly added the red to their wanted list
      // — the variant-collector exception: the explicit per-variant want wins.
      await insertOwned(albumId, base.variantId, 1);
      await insertWanted(userId, albumId, red.variantId);

      const result = await matchAgainstUserAlbum(app.db, userId, albumId, {
        theirOffered: [{ albumCode: red.albumCode, variantToken: 'red', quantity: 1 }],
        theirWanted:  [],
      });

      expect(result.iGet).toHaveLength(1);
      expect(result.iGet[0]?.variantToken).toBe('red');
      expect(result.iGet[0]?.wanted).toBe(true);
    });

    it('resolves an untagged code to the album owner\'s defaultBaseVariant', async () => {
      const userId = await insertUser();
      const albumId = await insertAlbum(userId, 'base_border'); // NA edition

      const base = await lookupVariant(801, 'base_border');

      // User has TWO of the base → trade_forced isn't set, but qty > 1 makes
      // it a spare. The third party wants the code with no variant tag.
      await insertOwned(albumId, base.variantId, 2);

      const result = await matchAgainstUserAlbum(app.db, userId, albumId, {
        theirOffered: [],
        theirWanted:  [{ albumCode: base.albumCode, variantToken: null, quantity: 1 }],
      });

      expect(result.theyGet).toHaveLength(1);
      // Untagged on a base_border-default album resolves to base_border.
      expect(result.theyGet[0]?.variantToken).toBe('base_border');
    });

    it('resolves an untagged foil code via the sibling base lane instead of flagging it unknown', async () => {
      const userId = await insertUser();
      // Intl album → defaultBaseVariant base_borderless, which foil stickers
      // (team badges, FWC intro) do NOT have — they print only base_border.
      const albumId = await insertAlbum(userId, 'base_borderless');

      // FWC1 is a seeded foil intro sticker: it exists ONLY as base_border.
      // Before the fix this landed in unknownCodes because the borderless
      // default had no catalog variant for it.
      const result = await matchAgainstUserAlbum(app.db, userId, albumId, {
        theirOffered: [{ albumCode: 'FWC1', variantToken: null, quantity: 1 }],
        theirWanted:  [],
      });

      expect(result.unknownCodes).toEqual([]);
      expect(result.candidatesIGet).toHaveLength(1);
      expect(result.candidatesIGet[0]?.variantToken).toBe('base_border');
    });

    it('coerces an explicit borderless tag on a foil code to its white-border printing', async () => {
      const userId = await insertUser();
      const albumId = await insertAlbum(userId, 'base_border');

      // A foil sticker can ONLY ever be base_border — a borderless base tag
      // (however it got attached) resolves to the white-border printing rather
      // than flagging a legitimate code as unknown.
      const result = await matchAgainstUserAlbum(app.db, userId, albumId, {
        theirOffered: [{ albumCode: 'FWC1', variantToken: 'base_borderless', quantity: 1 }],
        theirWanted:  [],
      });

      expect(result.unknownCodes).toEqual([]);
      expect(result.candidatesIGet).toHaveLength(1);
      expect(result.candidatesIGet[0]?.variantToken).toBe('base_border');
    });

    it('flags an unknown variant token without dropping the rest of the list', async () => {
      const userId = await insertUser();
      const albumId = await insertAlbum(userId);
      const base = await lookupVariant(802, 'base_border');
      await insertOwned(albumId, base.variantId, 2);
      // #803 is a sticker the user owns NO variant of, so its red is receivable.
      const red803 = await lookupVariant(803, 'red');

      const result = await matchAgainstUserAlbum(app.db, userId, albumId, {
        theirOffered: [
          { albumCode: 'BRA802', variantToken: 'hologram', quantity: 1 },
          { albumCode: red803.albumCode, variantToken: 'red', quantity: 1 },
        ],
        theirWanted:  [],
      });

      // hologram is unknown → echoes back with the variant tag attached so
      // the user sees exactly what didn't resolve.
      expect(result.unknownCodes).toContain('BRA802(hologram)');
      // Real items still resolve: user owns no variant of #803, so they receive it.
      expect(result.iGet.map((r) => r.variantToken)).toContain('red');
    });
  });

  describe('matchAgainstUserAlbum — all-variants duplicates (give side)', () => {
    // Regression: owning one copy each of two variants of the same sticker
    // (e.g. NED3 base + blue) IS a duplicate when the album counts variants
    // as duplicates — the optimal list must offer the wanted variant even
    // though no single variant has qty > 1.
    it('offers a single-copy variant as a spare when another variant of the sticker is owned', async () => {
      const userId = await insertUser();
      // No explicit duplicatesCountAllVariants → defaults to true.
      const albumId = await insertAlbum(userId, 'base_border');

      const base = await lookupVariant(806, 'base_border');
      const blue = await lookupVariant(806, 'blue');
      await insertOwned(albumId, base.variantId, 1);
      await insertOwned(albumId, blue.variantId, 1);

      const result = await matchAgainstUserAlbum(app.db, userId, albumId, {
        theirOffered: [],
        theirWanted:  [{ albumCode: base.albumCode, variantToken: null, quantity: 1 }],
      });

      expect(result.candidatesTheyGet).toHaveLength(1);
      expect(result.candidatesTheyGet[0]?.variantToken).toBe('base_border');
      expect(result.theyGet).toHaveLength(1);
    });

    it('offers a base_border spare for an untagged want even when the album default is base_borderless', async () => {
      const userId = await insertUser();
      // Intl-default album, but the collector physically holds white-border
      // copies. An untagged partner want must still match those spares — the
      // partner typed a bare code and doesn't care about border vs borderless.
      const albumId = await insertAlbum(userId, 'base_borderless');

      const base = await lookupVariant(801, 'base_border');
      await insertOwned(albumId, base.variantId, 4);

      const result = await matchAgainstUserAlbum(app.db, userId, albumId, {
        theirOffered: [],
        theirWanted:  [{ albumCode: base.albumCode, variantToken: null, quantity: 1 }],
      });

      expect(result.candidatesTheyGet).toHaveLength(1);
      expect(result.candidatesTheyGet[0]?.variantToken).toBe('base_border');
      expect(result.candidatesTheyGet[0]?.spareCount).toBe(3);
      expect(result.theyGet).toHaveLength(1);
    });

    it('does NOT offer it when the album counts duplicates per-variant only', async () => {
      const userId = await insertUser();
      const albumId = await insertAlbum(userId, 'base_border', { duplicatesCountAllVariants: false });

      const base = await lookupVariant(806, 'base_border');
      const blue = await lookupVariant(806, 'blue');
      await insertOwned(albumId, base.variantId, 1);
      await insertOwned(albumId, blue.variantId, 1);

      const result = await matchAgainstUserAlbum(app.db, userId, albumId, {
        theirOffered: [],
        theirWanted:  [{ albumCode: base.albumCode, variantToken: null, quantity: 1 }],
      });

      expect(result.candidatesTheyGet).toHaveLength(0);
      expect(result.theyGet).toHaveLength(0);
    });

    it('keeps the rarest single even when the partner explicitly wants it', async () => {
      const userId = await insertUser();
      const albumId = await insertAlbum(userId, 'base_border');

      const base = await lookupVariant(806, 'base_border');
      const blue = await lookupVariant(806, 'blue');
      await insertOwned(albumId, base.variantId, 1);
      await insertOwned(albumId, blue.variantId, 1);

      // Blue is the rarest owned variant → auto-kept. The partner's explicit
      // want does not override the keep; Force offer is the only escape hatch.
      const result = await matchAgainstUserAlbum(app.db, userId, albumId, {
        theirOffered: [],
        theirWanted:  [{ albumCode: blue.albumCode, variantToken: 'blue', quantity: 1 }],
      });

      expect(result.candidatesTheyGet).toHaveLength(0);
      expect(result.theyGet).toHaveLength(0);
    });

    it('force-offering the rarest trades it and shifts the keep to the next variant', async () => {
      const userId = await insertUser();
      const albumId = await insertAlbum(userId, 'base_border');

      const base = await lookupVariant(806, 'base_border');
      const blue = await lookupVariant(806, 'blue');
      await insertOwned(albumId, base.variantId, 1);
      await insertOwned(albumId, blue.variantId, 1, { tradeForced: true });

      // Blue forced → tradeable; the keep shifts to the base, which is now
      // withheld even though the partner asks for both.
      const result = await matchAgainstUserAlbum(app.db, userId, albumId, {
        theirOffered: [],
        theirWanted:  [
          { albumCode: blue.albumCode, variantToken: 'blue', quantity: 1 },
          { albumCode: base.albumCode, variantToken: 'base_border', quantity: 1 },
        ],
      });

      expect(result.candidatesTheyGet).toHaveLength(1);
      expect(result.candidatesTheyGet[0]?.variantToken).toBe('blue');
    });

    it('a second copy of the kept variant is a duplicate — the spare is offered', async () => {
      const userId = await insertUser();
      const albumId = await insertAlbum(userId, 'base_border');

      const blue = await lookupVariant(806, 'blue');
      await insertOwned(albumId, blue.variantId, 2);

      const result = await matchAgainstUserAlbum(app.db, userId, albumId, {
        theirOffered: [],
        theirWanted:  [{ albumCode: blue.albumCode, variantToken: 'blue', quantity: 1 }],
      });

      expect(result.candidatesTheyGet).toHaveLength(1);
      expect(result.candidatesTheyGet[0]?.variantToken).toBe('blue');
    });

    it("caps a give at the user's tradeable copies, not the partner's ask", async () => {
      const userId = await insertUser();
      const albumId = await insertAlbum(userId, 'base_border');

      const base = await lookupVariant(806, 'base_border');
      // 3 copies owned → 2 tradeable (one is auto-kept). A want of ×3 must
      // come back as ×2, or recording would strip the kept copy.
      await insertOwned(albumId, base.variantId, 3);

      const result = await matchAgainstUserAlbum(app.db, userId, albumId, {
        theirOffered: [],
        theirWanted:  [{ albumCode: base.albumCode, variantToken: 'base_border', quantity: 3 }],
      });

      expect(result.candidatesTheyGet).toHaveLength(1);
      expect(result.candidatesTheyGet[0]?.quantity).toBe(2);
    });

    it('a forced single gives exactly one copy no matter how many are asked', async () => {
      const userId = await insertUser();
      const albumId = await insertAlbum(userId, 'base_border');

      const base = await lookupVariant(806, 'base_border');
      await insertOwned(albumId, base.variantId, 1, { tradeForced: true });

      const result = await matchAgainstUserAlbum(app.db, userId, albumId, {
        theirOffered: [],
        theirWanted:  [{ albumCode: base.albumCode, variantToken: 'base_border', quantity: 5 }],
      });

      expect(result.candidatesTheyGet).toHaveLength(1);
      expect(result.candidatesTheyGet[0]?.quantity).toBe(1);
    });

    it('a cross-variant single gives one copy even when the partner asks for two', async () => {
      const userId = await insertUser();
      const albumId = await insertAlbum(userId, 'base_border');

      const base = await lookupVariant(806, 'base_border');
      const blue = await lookupVariant(806, 'blue');
      await insertOwned(albumId, base.variantId, 1);
      await insertOwned(albumId, blue.variantId, 1);

      // Blue is auto-kept; the base single is the only tradeable copy.
      const result = await matchAgainstUserAlbum(app.db, userId, albumId, {
        theirOffered: [],
        theirWanted:  [{ albumCode: base.albumCode, variantToken: 'base_border', quantity: 2 }],
      });

      expect(result.candidatesTheyGet).toHaveLength(1);
      expect(result.candidatesTheyGet[0]?.quantity).toBe(1);
    });

    it('suggests receiving one copy of a missing sticker regardless of how many the partner offers', async () => {
      const userId = await insertUser();
      const albumId = await insertAlbum(userId, 'base_border');
      // User owns nothing of #807 — the partner's ×4 is their availability,
      // not a bundle the user must take.
      const base807 = await lookupVariant(807, 'base_border');

      const result = await matchAgainstUserAlbum(app.db, userId, albumId, {
        theirOffered: [{ albumCode: base807.albumCode, variantToken: 'base_border', quantity: 4 }],
        theirWanted:  [],
      });

      expect(result.candidatesIGet).toHaveLength(1);
      expect(result.candidatesIGet[0]?.quantity).toBe(1);
    });

    it('never offers the only copy of a sticker, even with all-variants counting on', async () => {
      const userId = await insertUser();
      const albumId = await insertAlbum(userId, 'base_border', { duplicatesCountAllVariants: true });

      const base = await lookupVariant(806, 'base_border');
      await insertOwned(albumId, base.variantId, 1);

      const result = await matchAgainstUserAlbum(app.db, userId, albumId, {
        theirOffered: [],
        theirWanted:  [{ albumCode: base.albumCode, variantToken: null, quantity: 1 }],
      });

      expect(result.candidatesTheyGet).toHaveLength(0);
    });
  });

  describe('matchAgainstUserAlbum — duplicate-heavy give side', () => {
    it('surfaces the biggest duplicate pile first on the give side', async () => {
      const userId = await insertUser();
      const albumId = await insertAlbum(userId, 'base_border');

      // Two same-lane bases the partner wants. The user is drowning in #809
      // (6 copies → 5 spare) but has just one spare of #808 (2 copies → 1
      // spare). #809 sorts AFTER #808 by album number, so only the new
      // spare-count-desc priority puts the heavy pile first.
      const lowDup = await lookupVariant(808, 'base_border');
      const highDup = await lookupVariant(809, 'base_border');
      await insertOwned(albumId, lowDup.variantId, 2);
      await insertOwned(albumId, highDup.variantId, 6);

      const result = await matchAgainstUserAlbum(app.db, userId, albumId, {
        theirOffered: [],
        theirWanted: [lowDup, highDup].map((v) => ({
          albumCode: v.albumCode, variantToken: 'base_border', quantity: 1,
        })),
      });

      expect(result.theyGet).toHaveLength(2);
      // Heavy duplicate pile leads, ahead of the low-number single spare.
      expect(result.theyGet[0]?.albumCode).toBe(highDup.albumCode);
      expect(result.theyGet[0]?.spareCount).toBe(5);
      expect(result.theyGet[1]?.albumCode).toBe(lowDup.albumCode);
      expect(result.theyGet[1]?.spareCount).toBe(1);
    });
  });

  describe('matchAgainstUserAlbum — same-variant parity', () => {
    it('trims both sides to equal counts when only the base lane is in play', async () => {
      const userId = await insertUser();
      const albumId = await insertAlbum(userId, 'base_borderless');

      // 3 unique bases the partner offers (I'm missing all 3); 5 unique bases
      // they want (I have spares of all 5). Same-variant parity should trim
      // theyGet to 3 and leave iGet at 3 — a fair 3-for-3 same-lane swap.
      const offered1 = await lookupVariant(840, 'base_borderless');
      const offered2 = await lookupVariant(841, 'base_borderless');
      const offered3 = await lookupVariant(842, 'base_borderless');
      const want1 = await lookupVariant(843, 'base_borderless');
      const want2 = await lookupVariant(844, 'base_borderless');
      const want3 = await lookupVariant(845, 'base_borderless');
      const want4 = await lookupVariant(846, 'base_borderless');
      const want5 = await lookupVariant(847, 'base_borderless');
      for (const v of [want1, want2, want3, want4, want5]) {
        await insertOwned(albumId, v.variantId, 2);
      }

      const result = await matchAgainstUserAlbum(app.db, userId, albumId, {
        theirOffered: [offered1, offered2, offered3].map((o) => ({
          albumCode: o.albumCode, variantToken: 'base_borderless', quantity: 1,
        })),
        theirWanted: [want1, want2, want3, want4, want5].map((w) => ({
          albumCode: w.albumCode, variantToken: 'base_borderless', quantity: 1,
        })),
      });

      // Full candidate pools reflect every match.
      expect(result.candidatesIGet).toHaveLength(3);
      expect(result.candidatesTheyGet).toHaveLength(5);
      // Suggestion is trimmed to a fair 3-for-3.
      expect(result.iGet).toHaveLength(3);
      expect(result.theyGet).toHaveLength(3);
      expect(result.balance.sameVariant).toBe(true);
      expect(result.balance.lopsided).toBe(false);
    });

    it('sorts favourites + wanted ahead of plain matches on the receive side', async () => {
      const userId = await insertUser();
      const albumId = await insertAlbum(userId);

      const plain = await lookupVariant(850, 'base_border');
      const fav = await lookupVariant(851, 'base_border');
      const want = await lookupVariant(852, 'base_border');

      // Flag #851 as a favourite and #852 as wanted.
      await app.db.query(
        `INSERT INTO user_sticker_favourites (album_id, sticker_id) VALUES ($1, $2)`,
        [albumId, fav.stickerId],
      );
      await app.db.query(
        `INSERT INTO user_wanted_variants (user_id, sticker_variant_id, album_id) VALUES ($1, $2, $3)`,
        [userId, want.variantId, albumId],
      );

      const result = await matchAgainstUserAlbum(app.db, userId, albumId, {
        theirOffered: [plain, fav, want].map((v) => ({
          albumCode: v.albumCode, variantToken: 'base_border', quantity: 1,
        })),
        theirWanted: [],
      });

      expect(result.iGet).toHaveLength(3);
      // Favourite first (priority 100), then wanted (50), then plain (0).
      expect(result.iGet[0]?.albumCode).toBe(fav.albumCode);
      expect(result.iGet[0]?.favourite).toBe(true);
      expect(result.iGet[1]?.albumCode).toBe(want.albumCode);
      expect(result.iGet[1]?.wanted).toBe(true);
      expect(result.iGet[2]?.albumCode).toBe(plain.albumCode);
    });
  });

  describe('matchAgainstUserAlbum — scarcity balance', () => {
    it('flags a lopsided trade and reports the give/get totals from the user\'s perspective', async () => {
      const userId = await insertUser();
      const albumId = await insertAlbum(userId);

      // User has 5 spares of the base (scarcity 1 each); third party offers
      // their green parallel (scarcity 1400). User gives 5 × 1 = 5, gets
      // 1 × 1400 = 1400 — get/give ratio = 280, far above the upper bound.
      const baseA = await lookupVariant(803, 'base_border');
      const greenB = await lookupVariant(804, 'green');
      await insertOwned(albumId, baseA.variantId, 5);

      const result = await matchAgainstUserAlbum(app.db, userId, albumId, {
        theirOffered: [{ albumCode: greenB.albumCode, variantToken: 'green', quantity: 1 }],
        theirWanted:  [
          { albumCode: baseA.albumCode, variantToken: 'base_border', quantity: 1 },
        ],
      });

      expect(result.balance.give).toBe(1);     // theyGet sticker × 1 base
      expect(result.balance.get).toBe(1400);   // iGet sticker × 1 green
      expect(result.balance.ratio).toBe(1400);
      expect(result.balance.lopsided).toBe(true);
    });

    it('treats roughly balanced trades as not lopsided', async () => {
      const userId = await insertUser();
      const albumId = await insertAlbum(userId);

      // User has 1 spare blue (scarcity 2); third party offers a red parallel
      // (scarcity 25). 25/2 = 12.5, still well outside the band.
      // For a fair trade: user gives 1 red (25), receives 1 red (25) — exact 1:1.
      const redA = await lookupVariant(805, 'red');
      const redB = await lookupVariant(806, 'red');
      await insertOwned(albumId, redA.variantId, 2);

      const result = await matchAgainstUserAlbum(app.db, userId, albumId, {
        theirOffered: [{ albumCode: redB.albumCode, variantToken: 'red', quantity: 1 }],
        theirWanted:  [{ albumCode: redA.albumCode, variantToken: 'red', quantity: 1 }],
      });

      expect(result.balance.give).toBe(25);
      expect(result.balance.get).toBe(25);
      expect(result.balance.ratio).toBe(1);
      expect(result.balance.lopsided).toBe(false);
    });
  });

  describe('matchPair — variant-aware anonymous flow', () => {
    it('matches variants between two ephemeral lists and surfaces a balance', async () => {
      // No user state involved at all — purely a catalog lookup. Person A
      // wants BRA807(red) and B has it; vice versa with a base sticker.
      const a807 = await lookupVariant(807, 'red');
      const b808 = await lookupVariant(808, 'base_borderless');

      const result = await matchPair(app.db, {
        a: {
          offered: [{ albumCode: b808.albumCode, variantToken: null, quantity: 1 }],
          wanted:  [{ albumCode: a807.albumCode, variantToken: 'red', quantity: 1 }],
        },
        b: {
          offered: [{ albumCode: a807.albumCode, variantToken: 'red', quantity: 1 }],
          wanted:  [{ albumCode: b808.albumCode, variantToken: null, quantity: 1 }],
        },
        albumTypeKey: 'fifa_world_cup_2026',
      });

      expect(result.aGets).toHaveLength(1);
      expect(result.aGets[0]?.variantToken).toBe('red');
      expect(result.bGets).toHaveLength(1);
      // matchPair falls back to base_borderless globally when no album owner exists.
      expect(result.bGets[0]?.variantToken).toBe('base_borderless');
      // A gives 1 base (1), receives 1 red (25) — ratio 25, lopsided.
      expect(result.balance.give).toBe(1);
      expect(result.balance.get).toBe(25);
      expect(result.balance.lopsided).toBe(true);
    });
  });
});
