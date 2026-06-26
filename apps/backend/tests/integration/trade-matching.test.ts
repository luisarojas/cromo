import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';

/**
 * Integration tests for getTradeMatches (apps/backend/src/services/trade-matching.service.ts).
 *
 * Each scenario builds a fully isolated requester + N candidates with random
 * UUIDs in a known-empty sticker range (700+, outside the 1–400 used by the
 * baseline seed in 07_test_users.sql), so the seeded users (Alice, Bob, …)
 * never enter the result set: they share the album type, but have nothing
 * they_have_my_missing the requester wants, so the mutual_users intersection
 * filters them out before any assertion runs.
 *
 * Coverage:
 *   - Cursor pagination across an overlap tie (no dupes, no omissions, stable total)
 *   - they_have_variant_ids gated to my_missing
 *   - Coca-Cola slot identity (owning ANY CC9 alternate fills the slot)
 *   - Candidate with no user_settings row defaults to trade_matching_enabled = true
 */

const HAS_REAL_DB =
  typeof process.env['DATABASE_URL'] === 'string' &&
  process.env['DATABASE_URL'].includes('@') &&
  !process.env['DATABASE_URL'].includes('placeholder');

const HAS_REAL_REDIS =
  typeof process.env['REDIS_URL'] === 'string' &&
  process.env['REDIS_URL'].startsWith('redis://');

const shouldRun = HAS_REAL_DB && HAS_REAL_REDIS;

describe.skipIf(!shouldRun)('Trade matching (integration)', () => {
  let app: FastifyInstance;
  let getTradeMatches: typeof import('../../src/services/trade-matching.service.js')['getTradeMatches'];

  let albumTypeId: string;
  let editionId: string;
  let formatId: string;

  // Tracks every user we create across all tests so afterAll can sweep them
  // even if an afterEach hook silently no-ops. Cascades flush albums/stickers/wanted.
  const allInsertedUserIds: string[] = [];
  // Per-test tracker — wiped in afterEach so each scenario starts on a clean slate.
  let scratchUserIds: string[] = [];

  async function insertUser(opts: { withSettings?: boolean } = {}): Promise<string> {
    const id = randomUUID();
    const username = id.replace(/-/g, '').slice(0, 20);
    const email = `${id}@trade-matching-test.local`;
    await app.db.query(
      `INSERT INTO users (id, email, username, display_name, role, email_verified_at)
       VALUES ($1, $2, $3, 'Test User', 'user', now())`,
      [id, email, username],
    );
    if (opts.withSettings !== false) {
      await app.db.query(`INSERT INTO user_settings (user_id) VALUES ($1)`, [id]);
    }
    allInsertedUserIds.push(id);
    scratchUserIds.push(id);
    return id;
  }

  async function insertAlbum(userId: string): Promise<string> {
    const id = randomUUID();
    const slug = `tm-test-${id.split('-')[0]}`;
    // Matchmaker now requires visibility = 'public' to surface a candidate
    // album, so seed these test albums as public — matchmaker filtering is
    // covered separately and the rest of this suite assumes discoverability.
    await app.db.query(
      `INSERT INTO user_albums (id, user_id, album_type_id, album_edition_id, album_format_id, is_default, slug, trade_inventory_visibility)
       VALUES ($1, $2, $3, $4, $5, true, $6, 'public')`,
      [id, userId, albumTypeId, editionId, formatId, slug],
    );
    return id;
  }

  async function insertOwned(
    albumId: string,
    variantId: string,
    quantity: number,
    opts: { hidden?: boolean; forced?: boolean } = {},
  ): Promise<void> {
    await app.db.query(
      `INSERT INTO user_stickers (album_id, sticker_variant_id, quantity, trade_hidden, trade_forced)
       VALUES ($1, $2, $3, $4, $5)`,
      [albumId, variantId, quantity, !!opts.hidden, !!opts.forced],
    );
  }

  async function insertWantedVariant(
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

  /**
   * Park a qty=1 base_border for every sticker in [min, max] on this album. Used
   * to "neutralize" the baseline seed users (Alice/Bob/Charlie/Diana own 1–400);
   * once the requester owns one variant per sticker in that range, the implicit
   * branch of my_missing excludes those stickers entirely, so the seeded users'
   * dupes can no longer leak into they_have_my_missing and inflate the count or
   * displace test candidates in the result ordering.
   */
  async function neutralizeSeededRange(albumId: string, min: number, max: number): Promise<void> {
    await app.db.query(
      `INSERT INTO user_stickers (album_id, sticker_variant_id, quantity)
       SELECT $1, sv.id, 1
         FROM sticker_variants sv
         JOIN stickers s ON s.id = sv.sticker_id
        WHERE sv.variant_type = 'base_border'
          AND s.album_type_id = $2
          AND s.number BETWEEN $3 AND $4
       ON CONFLICT (album_id, sticker_variant_id) DO NOTHING`,
      [albumId, albumTypeId, min, max],
    );
  }

  async function lookupVariantId(stickerNumber: number, variantType = 'base_border'): Promise<string> {
    const { rows } = await app.db.query<{ id: string }>(
      `SELECT sv.id
         FROM sticker_variants sv
         JOIN stickers s ON s.id = sv.sticker_id
        WHERE s.number = $1
          AND sv.variant_type = $2
          AND s.album_type_id = $3`,
      [stickerNumber, variantType, albumTypeId],
    );
    if (!rows[0]) throw new Error(`No variant for sticker #${stickerNumber} (${variantType})`);
    return rows[0].id;
  }

  async function lookupCCVariantId(playerName: string): Promise<string> {
    const { rows } = await app.db.query<{ id: string }>(
      `SELECT sv.id
         FROM sticker_variants sv
         JOIN stickers s ON s.id = sv.sticker_id
        WHERE s.player_name = $1
          AND s.sticker_type = 'coca_cola_special'
          AND s.album_type_id = $2`,
      [playerName, albumTypeId],
    );
    if (!rows[0]) throw new Error(`No CC variant for ${playerName}`);
    return rows[0].id;
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app.js');
    ({ getTradeMatches } = await import('../../src/services/trade-matching.service.js'));

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
      // DELETE FROM users cascades to user_settings, user_albums (→ user_stickers),
      // and user_wanted_variants, so we don't have to walk those tables by hand.
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

  // ── Cursor pagination over an overlap tie ────────────────────────────────────

  it('paginates a five-way overlap tie without duplicates, omissions, or shifting total', async () => {
    // Build a population where every candidate has the exact same mutual_overlap.
    // The bug we're guarding against is the tuple-comparison cursor predicate,
    // which used to skip half the tie boundary and re-emit the other half.
    const requesterId      = await insertUser();
    const requesterAlbumId = await insertAlbum(requesterId);

    // Neutralize the seeded Alice/Bob/Charlie/Diana inventory so they don't
    // float to the top of the result and displace the test candidates from the
    // expected ordering — only this test asserts a specific order, so only this
    // test pays the cost of the bulk insert.
    await neutralizeSeededRange(requesterAlbumId, 1, 400);

    const offerVariant = await lookupVariantId(700); // requester offers, all 5 candidates want
    await insertOwned(requesterAlbumId, offerVariant, 2);

    const candidates: { userId: string }[] = [];
    for (let i = 0; i < 5; i++) {
      const wantVariant = await lookupVariantId(701 + i); // candidate offers, requester wants
      const cId = await insertUser();
      const cAlbum = await insertAlbum(cId);
      await insertOwned(cAlbum, wantVariant, 2);
      candidates.push({ userId: cId });
    }

    // ORDER BY mutual_overlap DESC, user_id ASC — all overlaps are equal,
    // so the tiebreaker is purely the ascending UUID order of the candidates.
    const expectedOrder = candidates.map((c) => c.userId).sort();

    const page1 = await getTradeMatches(app.db, app.redis, requesterId, requesterAlbumId, { limit: 2 });
    expect(page1.items.map((i) => i.user_id)).toEqual(expectedOrder.slice(0, 2));
    expect(page1.items.every((i) => i.mutual_overlap === 2)).toBe(true);
    expect(page1.total).toBe(5);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await getTradeMatches(app.db, app.redis, requesterId, requesterAlbumId, {
      limit: 2,
      cursor: page1.nextCursor!,
    });
    expect(page2.items.map((i) => i.user_id)).toEqual(expectedOrder.slice(2, 4));
    expect(page2.total).toBe(5); // population-wide, not page-relative
    expect(page2.nextCursor).not.toBeNull();

    const page3 = await getTradeMatches(app.db, app.redis, requesterId, requesterAlbumId, {
      limit: 2,
      cursor: page2.nextCursor!,
    });
    expect(page3.items.map((i) => i.user_id)).toEqual(expectedOrder.slice(4));
    expect(page3.total).toBe(5);
    expect(page3.nextCursor).toBeNull();

    // Sanity: union of pages is the full population, no duplicates.
    const seen = [...page1.items, ...page2.items, ...page3.items].map((i) => i.user_id);
    expect(new Set(seen).size).toBe(5);
    for (const c of candidates) expect(seen).toContain(c.userId);
  });

  it('paginates across a high/low overlap boundary, ordering each bucket by user_id ASC', async () => {
    // Mixed buckets: two candidates at overlap=3, three at overlap=2. Verifies
    // the cursor predicate handles the transition between buckets (primary key
    // strictly less-than) AND the tiebreaker inside each bucket (user_id ASC),
    // not just an all-equal-overlap case where only the tiebreaker matters.
    const requesterId      = await insertUser();
    const requesterAlbumId = await insertAlbum(requesterId);
    await neutralizeSeededRange(requesterAlbumId, 1, 400);

    const offerVariant = await lookupVariantId(751); // R offers, every candidate wants
    await insertOwned(requesterAlbumId, offerVariant, 2);

    // High-overlap bucket: two distinct dupes each → mutual_overlap = 2 + 1 = 3.
    const highVariantPairs: [number, number][] = [
      [752, 753],
      [754, 755],
    ];
    const highIds: string[] = [];
    for (const [a, b] of highVariantPairs) {
      const cId = await insertUser();
      const cAlbum = await insertAlbum(cId);
      await insertOwned(cAlbum, await lookupVariantId(a), 2);
      await insertOwned(cAlbum, await lookupVariantId(b), 2);
      highIds.push(cId);
    }

    // Low-overlap bucket: one dupe each → mutual_overlap = 1 + 1 = 2.
    const lowVariantNums = [756, 757, 758];
    const lowIds: string[] = [];
    for (const n of lowVariantNums) {
      const cId = await insertUser();
      const cAlbum = await insertAlbum(cId);
      await insertOwned(cAlbum, await lookupVariantId(n), 2);
      lowIds.push(cId);
    }

    const expectedHigh = [...highIds].sort();
    const expectedLow  = [...lowIds].sort();
    const expectedAll  = [...expectedHigh, ...expectedLow];

    const page1 = await getTradeMatches(app.db, app.redis, requesterId, requesterAlbumId, { limit: 2 });
    expect(page1.items.map((i) => i.user_id)).toEqual(expectedAll.slice(0, 2));
    expect(page1.items.map((i) => i.mutual_overlap)).toEqual([3, 3]);
    expect(page1.total).toBe(5);

    // Page 2 straddles the bucket boundary: cursor=(3, last_high_uuid).
    // Bug under guard: tuple-comparison cursor would either re-include high-uuid
    // candidates already shown OR skip the entire overlap=2 bucket.
    const page2 = await getTradeMatches(app.db, app.redis, requesterId, requesterAlbumId, {
      limit: 2,
      cursor: page1.nextCursor!,
    });
    expect(page2.items.map((i) => i.user_id)).toEqual(expectedAll.slice(2, 4));
    expect(page2.items.map((i) => i.mutual_overlap)).toEqual([2, 2]);
    expect(page2.total).toBe(5);

    const page3 = await getTradeMatches(app.db, app.redis, requesterId, requesterAlbumId, {
      limit: 2,
      cursor: page2.nextCursor!,
    });
    expect(page3.items.map((i) => i.user_id)).toEqual(expectedAll.slice(4));
    expect(page3.items[0]!.mutual_overlap).toBe(2);
    expect(page3.nextCursor).toBeNull();

    const seen = [...page1.items, ...page2.items, ...page3.items].map((i) => i.user_id);
    expect(new Set(seen).size).toBe(5);
  });

  // ── they_have_variant_ids gated to my_missing ────────────────────────────────

  it('omits variants from they_have_variant_ids that the requester never asked for', async () => {
    // Requester explicitly wants only the base_border parallel of sticker 720.
    // Candidate has spares of BOTH base_border and blue parallels of 720.
    // Pre-fix: blue leaked into they_have_variant_ids alongside base_border.
    // Avoid sticker 710 here — it's a foil badge, which has no parallels.
    const requesterId      = await insertUser();
    const requesterAlbumId = await insertAlbum(requesterId);

    const wanted720Base = await lookupVariantId(720, 'base_border');
    const blue720       = await lookupVariantId(720, 'blue');
    await insertWantedVariant(requesterId, requesterAlbumId, wanted720Base);

    const offerVariant = await lookupVariantId(721);
    await insertOwned(requesterAlbumId, offerVariant, 2);

    const candidateId = await insertUser();
    const candidateAlbumId = await insertAlbum(candidateId);
    await insertOwned(candidateAlbumId, wanted720Base, 2);
    await insertOwned(candidateAlbumId, blue720, 2);

    const page = await getTradeMatches(app.db, app.redis, requesterId, requesterAlbumId, { limit: 50 });
    const match = page.items.find((i) => i.user_id === candidateId);

    expect(match).toBeDefined();
    expect(match!.they_have_variant_ids).toContain(wanted720Base);
    expect(match!.they_have_variant_ids).not.toContain(blue720);
  });

  it('offers an explicitly-wanted variant even when the requester owns another variant of it', async () => {
    // Variant-collector exception: requester owns 722(red) but explicitly wants
    // 722(base_border). The explicit per-variant want is a deliberate signal, so
    // the matcher SHOULD surface 722(base_border) despite owning the red lane.
    const requesterId      = await insertUser();
    const requesterAlbumId = await insertAlbum(requesterId);

    const want722Base = await lookupVariantId(722, 'base_border');
    const red722      = await lookupVariantId(722, 'red');
    await insertOwned(requesterAlbumId, red722, 1);       // 722 is owned (red lane)
    await insertWantedVariant(requesterId, requesterAlbumId, want722Base);

    // Independent mutual so the candidate still shows up: requester offers 724,
    // candidate offers 725 (which the requester is implicitly missing).
    const offer724 = await lookupVariantId(724);
    await insertOwned(requesterAlbumId, offer724, 2);

    const candidateId      = await insertUser();
    const candidateAlbumId = await insertAlbum(candidateId);
    await insertOwned(candidateAlbumId, want722Base, 2);  // candidate has 722 base spare
    await insertOwned(candidateAlbumId, await lookupVariantId(725), 2);

    const page = await getTradeMatches(app.db, app.redis, requesterId, requesterAlbumId, { limit: 50 });
    const match = page.items.find((i) => i.user_id === candidateId);

    expect(match).toBeDefined();
    expect(match!.they_have_variant_ids).toContain(want722Base);
  });

  // ── Coca-Cola slot identity (album_code, not sticker_id) ─────────────────────

  it('excludes other CC9 regional alternates from my_missing when requester owns one', async () => {
    // CC9 ships three regional alternates (Davies / Saliba / Ayew) under one
    // album_code. Album completion is per album_code (see CLAUDE.md §5), so
    // owning Davies fills the CC9 slot. The matcher must not offer Saliba.
    const davies = await lookupCCVariantId('Alphonso Davies');
    const saliba = await lookupCCVariantId('William Saliba');

    const requesterId      = await insertUser();
    const requesterAlbumId = await insertAlbum(requesterId);
    await insertOwned(requesterAlbumId, davies, 1); // CC9 slot is filled

    // Give the requester something to offer so the candidate can become a mutual.
    const offerVariant = await lookupVariantId(712);
    await insertOwned(requesterAlbumId, offerVariant, 2);

    const candidateId      = await insertUser();
    const candidateAlbumId = await insertAlbum(candidateId);
    // Candidate has spares of Saliba AND a regular sticker the requester wants,
    // so the candidate is a mutual on a non-CC sticker (sticker 713) — guaranteeing
    // they show up in the result set regardless of CC handling, so the assertion
    // is "they_have doesn't include CC9" not "candidate is absent".
    await insertOwned(candidateAlbumId, saliba, 2);
    const non_cc_dupe = await lookupVariantId(713);
    await insertOwned(candidateAlbumId, non_cc_dupe, 2);

    const page = await getTradeMatches(app.db, app.redis, requesterId, requesterAlbumId, { limit: 50 });
    const match = page.items.find((i) => i.user_id === candidateId);

    expect(match).toBeDefined();
    expect(match!.they_have).not.toContain('CC9');
    expect(match!.they_have_variant_ids).not.toContain(saliba);
  });

  // ── Candidate with no user_settings row is still a candidate ────────────────

  it('treats a candidate without a user_settings row as opted in (default true)', async () => {
    const requesterId      = await insertUser();
    const requesterAlbumId = await insertAlbum(requesterId);

    const offerVariant = await lookupVariantId(714);
    await insertOwned(requesterAlbumId, offerVariant, 2);

    const candidateId = await insertUser({ withSettings: false });
    const candidateAlbumId = await insertAlbum(candidateId);
    const wantVariant = await lookupVariantId(715);
    await insertOwned(candidateAlbumId, wantVariant, 2);

    const page = await getTradeMatches(app.db, app.redis, requesterId, requesterAlbumId, { limit: 50 });
    const match = page.items.find((i) => i.user_id === candidateId);

    expect(match).toBeDefined();
    expect(match!.mutual_overlap).toBe(2);
  });

  // ── Candidate who explicitly opted out is excluded ──────────────────────────

  it('excludes a candidate who set trade_matching_enabled = false', async () => {
    // Same shape as the prior test but with an opt-out. The two together pin
    // down both branches of the COALESCE(..., true) we introduced.
    const requesterId      = await insertUser();
    const requesterAlbumId = await insertAlbum(requesterId);

    const offerVariant = await lookupVariantId(716);
    await insertOwned(requesterAlbumId, offerVariant, 2);

    const candidateId = await insertUser();
    await app.db.query(
      `UPDATE user_settings SET trade_matching_enabled = false WHERE user_id = $1`,
      [candidateId],
    );
    const candidateAlbumId = await insertAlbum(candidateId);
    const wantVariant = await lookupVariantId(717);
    await insertOwned(candidateAlbumId, wantVariant, 2);

    const page = await getTradeMatches(app.db, app.redis, requesterId, requesterAlbumId, { limit: 50 });
    expect(page.items.find((i) => i.user_id === candidateId)).toBeUndefined();
  });
});
