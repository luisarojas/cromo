import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Redis } from 'ioredis';
import { buildBundle, championOf, getOverview, getTeamDetail, warmBundle } from '../../src/services/wc2026.service.js';
import type { WcMatch } from '../../src/wc2026/types.js';
import { tournamentBySlug } from '../../src/wc2026/registry.js';
import type { TournamentConfig } from '../../src/wc2026/registry.js';
import { fetchLiveMatches, fetchLiveSquads } from '../../src/wc2026/live-provider.js';
import { fetchApiFootballData } from '../../src/wc2026/api-football-provider.js';
import { fetchEspnKnockout } from '../../src/wc2026/espn-knockout-provider.js';
import { buildMockMatches } from '../../src/wc2026/mock-data.js';
import { WC_TEAMS } from '../../src/wc2026/teams.js';

// Minimal in-memory Redis stub: get / set (incl. NX + EX/PX) / del / persist —
// the subset singleflight + the freeze path need. Mirrors cache-singleflight.test.ts.
function makeRedis() {
  const store: Record<string, string> = {};
  const set = vi.fn(async (key: string, value: string, ...args: unknown[]) => {
    if ((args as unknown[]).includes('NX') && key in store) return null;
    store[key] = value;
    return 'OK';
  });
  const get = vi.fn(async (key: string) => (key in store ? store[key]! : null));
  const del = vi.fn(async (key: string) => (key in store ? (delete store[key], 1) : 0));
  const persist = vi.fn(async (key: string) => (key in store ? 1 : 0));
  return { redis: { set, get, del, persist } as unknown as Redis, store };
}

// The registry's completed WC 2026 (served from the committed archive), and a
// throwaway LIVE tournament that exercises the provider path (forced to mock
// under NODE_ENV=test).
const WC_2026 = tournamentBySlug('wc-2026')!;
const LIVE: TournamentConfig = { slug: 'test-live', name: 'Test Live', competitionCode: 'WC', status: 'live' };

describe('wc2026.service — buildBundle', () => {
  it('returns standings, a 32-match knockout bracket and a forecast', () => {
    const bundle = buildBundle(buildMockMatches(new Date('2026-06-26T00:00:00Z')), WC_TEAMS);
    expect(bundle.standings).toHaveLength(12);
    expect(bundle.bracket).toHaveLength(32);
    expect(Object.keys(bundle.forecast.championOdds).length).toBeGreaterThan(0);
    expect(typeof bundle.updatedAt).toBe('string');
  });
});

describe('wc2026.service — championOf', () => {
  const finalMatch = (winnerCode: string | null): WcMatch =>
    ({ stage: 'FINAL', winnerCode }) as unknown as WcMatch;

  it('returns the FINAL winner once decided', () => {
    expect(championOf([finalMatch('ARG')])).toBe('ARG');
  });

  it('returns null while the final is undecided or absent', () => {
    expect(championOf([finalMatch(null)])).toBeNull();
    expect(championOf([])).toBeNull();
  });
});

describe('wc2026.service — live tournament (mock provider under test)', () => {
  it('getOverview returns groups, bracket and champion odds, and caches under a slug-namespaced key', async () => {
    const { redis, store } = makeRedis();
    const overview = await getOverview(redis, LIVE);
    expect(overview.groups).toHaveLength(12);
    expect(overview.bracket).toHaveLength(32);
    expect(Object.keys(overview.championOdds).length).toBeGreaterThan(0);
    expect(overview.dataSource).toBe('sample'); // mock provider → honest label
    expect(store['wc:bundle:v1:test-live']).toBeTruthy(); // cached, namespaced by slug
    expect(overview.complete).toBe(false); // live tournament, not frozen
    // Mock never simulates the knockout, so the final is undecided → no champion.
    expect(overview.champion).toBeNull();
  });

  it('getTeamDetail reuses the cached bundle and shapes a team payload', async () => {
    const { redis } = makeRedis();
    await getOverview(redis, LIVE); // warms the bundle
    const detail = await getTeamDetail(redis, LIVE, 'arg'); // case-insensitive
    expect(detail).not.toBeNull();
    expect(detail!.code).toBe('ARG');
    expect(detail!.name).toBe('Argentina');
    expect(detail!.history.titles).toBe(3);
    expect(detail!.standing.code).toBe('ARG');
    expect(detail!.championProb).toBeGreaterThanOrEqual(0);
    // Squad + fixtures are now part of the payload.
    expect(detail!.players.length).toBeGreaterThan(0);
    expect(detail!.players[0]).toHaveProperty('age');
    expect(detail!.players[0]).toHaveProperty('club'); // from the static Wikidata snapshot
    expect(Array.isArray(detail!.results)).toBe(true);
    expect(Array.isArray(detail!.upcoming)).toBe(true);
    // A team in the field always has a calculable opponent projection.
    expect(detail!.projectedOpponents.length).toBeGreaterThan(0);
  });

  it('getTeamDetail returns null for an unknown code', async () => {
    const { redis } = makeRedis();
    expect(await getTeamDetail(redis, LIVE, 'ZZZ')).toBeNull();
  });

  it('gives every ELIMINATED team exactly zero reach-final and champion odds', async () => {
    const { redis } = makeRedis();
    const overview = await getOverview(redis, LIVE);
    const eliminated = overview.groups.flatMap((g) => g.rows).filter((r) => r.qualification === 'ELIMINATED');
    expect(eliminated.length).toBeGreaterThan(0); // mock has some out by now
    for (const row of eliminated) {
      expect(overview.championOdds[row.code] ?? 0).toBe(0);
      const detail = await getTeamDetail(redis, LIVE, row.code);
      expect(detail!.championProb).toBe(0);
      expect(detail!.reachFinalProb).toBe(0);
      expect(detail!.projectedOpponents).toEqual([]);
    }
  });

  it('warmBundle writes the bundle key out-of-band', async () => {
    const { redis, store } = makeRedis();
    const affected = await warmBundle(redis, LIVE);
    expect(affected).toBeGreaterThan(0);
    expect(store['wc:bundle:v1:test-live']).toBeTruthy();
  });
});

describe('wc2026.service — completed tournament (static archive)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('serves the committed archive with NO provider fetch, and reports the champion', async () => {
    // Any network call in this path is a bug — the archive must be self-contained.
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('archive path must not hit the network'); }));
    const { redis, store } = makeRedis();

    const overview = await getOverview(redis, WC_2026);
    expect(overview.groups).toHaveLength(12);
    expect(overview.bracket).toHaveLength(32);
    expect(overview.dataSource).toBe('live'); // archived data is real provider data
    expect(overview.complete).toBe(true); // registry status
    expect(overview.champion).toBe('ESP'); // Spain won the 2026 final
    expect(store['wc:bundle:v1:wc-2026']).toBeTruthy(); // cached, namespaced by slug

    const detail = await getTeamDetail(redis, WC_2026, 'esp');
    expect(detail).not.toBeNull();
    expect(detail!.code).toBe('ESP');
  });
});

describe('live-provider — football-data normalizer', () => {
  afterEach(() => vi.restoreAllMocks());

  it('maps the football-data payload into RawMatch shape', async () => {
    const payload = {
      matches: [
        {
          id: 1,
          utcDate: '2026-06-11T18:00:00Z',
          status: 'FINISHED',
          stage: 'GROUP_STAGE',
          group: 'GROUP_A',
          venue: 'Estadio Azteca',
          homeTeam: { tla: 'MEX', name: 'Mexico' },
          awayTeam: { tla: 'KOR', name: 'South Korea' },
          score: { fullTime: { home: 2, away: 1 }, penalties: { home: null, away: null } },
        },
        {
          id: 2,
          utcDate: '2026-07-19T19:00:00Z',
          status: 'TIMED',
          stage: 'FINAL',
          group: null,
          venue: 'MetLife Stadium',
          homeTeam: { tla: null, name: null },
          awayTeam: { tla: null, name: null },
          score: { fullTime: { home: null, away: null } },
        },
      ],
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })));

    const out = await fetchLiveMatches('real-key');
    expect(out.matches).toHaveLength(2);
    expect(out.matches[0]).toMatchObject({ stage: 'GROUP', group: 'A', homeCode: 'MEX', awayCode: 'KOR', homeScore: 2, awayScore: 1, status: 'FINISHED' });
    expect(out.matches[1]).toMatchObject({ stage: 'FINAL', homeCode: null, status: 'SCHEDULED' });
    // Team registry + group membership derived from the feed, not a seed.
    expect(out.teams).toEqual(
      expect.arrayContaining([
        { code: 'MEX', name: 'Mexico', group: 'A' },
        { code: 'KOR', name: 'South Korea', group: 'A' },
      ]),
    );
  });

  it('throws on a non-OK response so the service can fall back to mock', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('rate limited', { status: 429 })));
    await expect(fetchLiveMatches('real-key')).rejects.toThrow(/football-data 429/);
  });

  it('ESPN knockout: parses real teams, group slots, and the third-place combination', async () => {
    const cp = (home: { abbreviation: string; displayName: string }, away: { abbreviation: string; displayName: string }) => ({
      competitions: [{ venue: { fullName: 'SoFi Stadium' }, status: { type: { state: 'pre', completed: false } }, competitors: [
        { homeAway: 'home', score: '0', team: home },
        { homeAway: 'away', score: '0', team: away },
      ] }],
    });
    const payload = {
      events: [
        { date: '2026-06-28T19:00Z', ...cp({ abbreviation: 'RSA', displayName: 'South Africa' }, { abbreviation: 'CAN', displayName: 'Canada' }) },
        { date: '2026-06-29T17:00Z', ...cp({ abbreviation: 'BRA', displayName: 'Brazil' }, { abbreviation: '2F', displayName: 'Group F 2nd Place' }) },
        { date: '2026-06-29T20:00Z', ...cp({ abbreviation: 'GER', displayName: 'Germany' }, { abbreviation: '3RD', displayName: 'Third Place Group A/B/C/D/F' }) },
      ],
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })));
    const ko = await fetchEspnKnockout();
    expect(ko[0]).toMatchObject({ stage: 'R32', homeCode: 'RSA', awayCode: 'CAN' }); // the real matchup
    expect(ko[1]).toMatchObject({ homeCode: 'BRA', awayCode: null, awaySlot: '2F' }); // group runner slot
    expect(ko[2].awaySlot).toBe('3ABCDF'); // third-place combination flattened
  });

  it('does NOT fabricate knockout structure — pre-draw fixtures stay team-less', async () => {
    const payload = {
      matches: [
        { id: 1, utcDate: '2026-06-11T18:00:00Z', status: 'SCHEDULED', stage: 'GROUP_STAGE', group: 'GROUP_A', venue: 'Estadio Azteca', homeTeam: { tla: 'MEX' }, awayTeam: { tla: 'KOR' }, score: { fullTime: { home: null, away: null } } },
        { id: 2, utcDate: '2026-06-28T18:00:00Z', status: 'SCHEDULED', stage: 'LAST_32', group: null, venue: 'MetLife Stadium', homeTeam: { tla: null }, awayTeam: { tla: null }, score: { fullTime: { home: null, away: null } } },
      ],
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })));
    const out = await fetchLiveMatches('real-key');
    const r32 = out.matches.find((m) => m.stage === 'R32')!;
    // No synthetic slot wiring is overlaid — the bracket shows TBD until the draw.
    expect(r32.homeSlot).toBeNull();
    expect(r32.awaySlot).toBeNull();
    expect(r32.homeCode).toBeNull();
  });

  it('api-football: maps fixtures and assigns group letters from standings (no fabricated KO structure)', async () => {
    const fixtures = {
      response: [
        {
          fixture: { id: 1, date: '2026-06-11T18:00:00Z', venue: { name: 'Estadio Azteca', city: 'Mexico City' }, status: { short: 'FT' } },
          league: { round: 'Group Stage - 1' },
          teams: { home: { id: 1, name: 'Mexico' }, away: { id: 2, name: 'South Korea' } },
          goals: { home: 2, away: 1 },
          score: { penalty: { home: null, away: null } },
        },
        {
          fixture: { id: 2, date: '2026-06-28T18:00:00Z', venue: { name: 'MetLife Stadium', city: 'East Rutherford' }, status: { short: 'NS' } },
          league: { round: 'Round of 32' },
          teams: { home: { id: 3, name: 'TBD' }, away: { id: 4, name: 'TBD' } },
          goals: { home: null, away: null },
        },
      ],
    };
    const standings = {
      response: [
        {
          league: {
            standings: [
              [
                { rank: 1, team: { id: 1, name: 'Mexico' }, group: 'Group A' },
                { rank: 2, team: { id: 2, name: 'South Korea' }, group: 'Group A' },
              ],
            ],
          },
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const body = String(url).includes('/standings') ? standings : fixtures;
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );

    const out = await fetchApiFootballData('real-key');
    const grp = out.matches.find((m) => m.stage === 'GROUP')!;
    expect(grp).toMatchObject({ homeCode: 'MEX', awayCode: 'KOR', group: 'A', status: 'FINISHED', homeScore: 2, awayScore: 1 });
    const r32 = out.matches.find((m) => m.stage === 'R32')!;
    expect(r32.homeSlot).toBeNull(); // no fabricated structure — TBD until the draw
    expect(out.teams).toEqual(
      expect.arrayContaining([
        { code: 'MEX', name: 'Mexico', group: 'A' },
        { code: 'KOR', name: 'South Korea', group: 'A' },
      ]),
    );
  });

  it('normalizes live squads to name/position/age with no club', async () => {
    const payload = {
      teams: [
        {
          tla: 'ARG',
          name: 'Argentina',
          squad: [
            { name: 'Keeper One', position: 'Goalkeeper', dateOfBirth: '1990-01-01' },
            { name: 'Back Two', position: 'Centre-Back', dateOfBirth: '1998-06-01' },
            { name: 'Mid Three', position: 'Central Midfield', dateOfBirth: '2000-01-01' },
            { name: 'Fwd Four', position: 'Centre-Forward', dateOfBirth: null },
          ],
        },
      ],
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })));
    const squads = await fetchLiveSquads('real-key');
    expect(squads.ARG.map((p) => p.position)).toEqual(['GK', 'DF', 'MF', 'FW']);
    expect(squads.ARG[0].age).toBeGreaterThan(30);
    expect(squads.ARG[3].age).toBeNull();
    expect(squads.ARG[0]).toHaveProperty('club'); // attached from the Wikidata snapshot (null if unknown)
  });
});
