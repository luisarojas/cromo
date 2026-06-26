import { describe, it, expect } from 'vitest';
import { buildSchedule } from '../../src/wc2026/schedule.js';
import { computeStandings, qualifiers } from '../../src/wc2026/standings.js';
import { resolveBracket } from '../../src/wc2026/bracket.js';
import { runForecast } from '../../src/wc2026/forecast.js';
import { buildMockMatches } from '../../src/wc2026/mock-data.js';
import { ratingFor, winProbability, DEFAULT_RATING } from '../../src/wc2026/ratings.js';
import { buildStrength } from '../../src/wc2026/strength.js';
import { analyticR32Opponents } from '../../src/wc2026/projection.js';
import { historyFor } from '../../src/wc2026/history.js';
import { playersFor } from '../../src/wc2026/players.js';
import { teamByCode, teamsInGroup } from '../../src/wc2026/teams.js';
import type { RawMatch } from '../../src/wc2026/types.js';

// Mark every group match in a group FINISHED with a fixed scoreline.
function finish(m: RawMatch, hs: number, as: number): RawMatch {
  return { ...m, homeScore: hs, awayScore: as, status: 'FINISHED' };
}

describe('ratings', () => {
  it('winProbability is 0.5 for equal ratings and monotonic in the gap', () => {
    expect(winProbability(1600, 1600)).toBeCloseTo(0.5, 6);
    expect(winProbability(2000, 1600)).toBeGreaterThan(0.9);
    expect(winProbability(1600, 2000)).toBeLessThan(0.1);
  });
  it('is symmetric: p(A,B) + p(B,A) === 1', () => {
    expect(winProbability(1850, 1620) + winProbability(1620, 1850)).toBeCloseTo(1, 9);
  });
  it('falls back to the default for an unknown code', () => {
    expect(ratingFor('ZZZ')).toBe(DEFAULT_RATING);
    // FIFA-ranking baseline: a top side outranks a minnow (scale ~1300–1870).
    expect(ratingFor('ARG')).toBeGreaterThan(ratingFor('HAI'));
    expect(ratingFor('ARG')).toBeGreaterThan(1800);
  });
});

describe('schedule', () => {
  const schedule = buildSchedule();
  it('produces 104 matches: 72 group + 32 knockout', () => {
    expect(schedule).toHaveLength(104);
    expect(schedule.filter((m) => m.stage === 'GROUP')).toHaveLength(72);
    expect(schedule.filter((m) => m.stage !== 'GROUP')).toHaveLength(32);
  });
  it('has unique ids and exactly 16 R32 / 1 FINAL matches', () => {
    expect(new Set(schedule.map((m) => m.id)).size).toBe(104);
    expect(schedule.filter((m) => m.stage === 'R32')).toHaveLength(16);
    expect(schedule.filter((m) => m.stage === 'FINAL')).toHaveLength(1);
  });
});

describe('standings — ranking & clinch logic', () => {
  // Build a finished Group A: MEX wins all, RSA loses all.
  function finishedGroupA(): RawMatch[] {
    const a = buildSchedule().filter((m) => m.group === 'A');
    const [mex] = teamsInGroup('A');
    return a.map((m) => {
      // Home win unless RSA is home (then away wins), MEX always wins.
      if (m.homeCode === mex.code) return finish(m, 2, 0);
      if (m.awayCode === mex.code) return finish(m, 0, 2);
      return finish(m, 1, 0);
    });
  }

  it('ranks by points and flags top-2 CLINCHED, 4th ELIMINATED when complete', () => {
    const standings = computeStandings(finishedGroupA());
    const a = standings.find((g) => g.group === 'A')!;
    expect(a.rows[0].rank).toBe(1);
    expect(a.rows[0].played).toBe(3);
    expect(a.rows[0].qualification).toBe('CLINCHED');
    expect(a.rows[1].qualification).toBe('CLINCHED');
    expect(a.rows[3].qualification).toBe('ELIMINATED');
    // Points sorted descending.
    const pts = a.rows.map((r) => r.points);
    expect([...pts].sort((x, y) => y - x)).toEqual(pts);
  });

  it('places teams by the provided registry, not the static seed (live groups are authoritative)', () => {
    // The seed has Colombia in group H; a live feed could say group K. With a
    // registry that says K, standings must follow the registry.
    const teams: import('../../src/wc2026/types.js').TeamMeta[] = [
      { code: 'COL', name: 'Colombia', group: 'K' },
      { code: 'BRA', name: 'Brazil', group: 'K' },
      { code: 'MAR', name: 'Morocco', group: 'K' },
      { code: 'CRO', name: 'Croatia', group: 'K' },
    ];
    const mk = (id: string, h: string, a: string, hs: number, as: number): RawMatch => ({
      id, stage: 'GROUP', group: 'K', slot: 0, kickoff: '2026-06-11T18:00:00Z', venueIndex: 0,
      homeCode: h, awayCode: a, homeSlot: null, awaySlot: null,
      homeScore: hs, awayScore: as, homePens: null, awayPens: null, status: 'FINISHED',
    });
    const matches = [mk('M1', 'COL', 'CRO', 2, 0), mk('M2', 'BRA', 'MAR', 1, 0)];
    const standings = computeStandings(matches, teams);
    expect(standings.map((g) => g.group)).toEqual(['K']);
    expect(standings[0].rows.map((r) => r.code).sort()).toEqual(['BRA', 'COL', 'CRO', 'MAR']);
  });

  it('clinches a team that is 2nd on goal difference (not just points) and reports guaranteed rank', () => {
    // Group of 4, all matches played. MEX 9pts; KOR & RSA both 3pts but KOR has
    // the better GD; CZE 0. KOR is 2nd BY GOAL DIFFERENCE → must be CLINCHED.
    const teams: import('../../src/wc2026/types.js').TeamMeta[] = [
      { code: 'MEX', name: 'Mexico', group: 'A' },
      { code: 'KOR', name: 'South Korea', group: 'A' },
      { code: 'RSA', name: 'South Africa', group: 'A' },
      { code: 'CZE', name: 'Czechia', group: 'A' },
    ];
    const mk = (id: string, h: string, a: string, hs: number, as: number): RawMatch => ({
      id, stage: 'GROUP', group: 'A', slot: 0, kickoff: '2026-06-11T18:00:00Z', venueIndex: 0,
      homeCode: h, awayCode: a, homeSlot: null, awaySlot: null,
      homeScore: hs, awayScore: as, homePens: null, awayPens: null, status: 'FINISHED',
    });
    const matches = [
      mk('m1', 'MEX', 'KOR', 1, 0), mk('m2', 'CZE', 'RSA', 1, 0),
      mk('m3', 'MEX', 'RSA', 1, 0), mk('m4', 'KOR', 'CZE', 5, 0), // KOR big win → GD
      mk('m5', 'MEX', 'CZE', 1, 0), mk('m6', 'RSA', 'KOR', 1, 0),
    ];
    // Final: MEX 9; KOR/RSA/CZE all 3 pts, ranked by GD → KOR +3 (2nd), RSA -1
    // (3rd), CZE -5 (4th). KOR is 2nd purely on goal difference.
    const rows = computeStandings(matches, teams).find((g) => g.group === 'A')!.rows;
    const byCode = Object.fromEntries(rows.map((r) => [r.code, r]));
    expect(byCode.MEX.qualification).toBe('CLINCHED');
    expect(byCode.MEX.guaranteedRank).toBe(1);
    expect(byCode.KOR.qualification).toBe('CLINCHED'); // 2nd on GD — the bug fix
    expect(byCode.KOR.guaranteedRank).toBe(2);
    expect(byCode.RSA.guaranteedRank).toBe(3); // 3rd, alive pending best-thirds
    expect(byCode.CZE.qualification).toBe('ELIMINATED');
  });

  it('treats an unplayed group as all ALIVE', () => {
    const standings = computeStandings(buildSchedule());
    const a = standings.find((g) => g.group === 'A')!;
    expect(a.rows.every((r) => r.qualification === 'ALIVE')).toBe(true);
    expect(a.rows.every((r) => r.played === 0)).toBe(true);
  });

  it('qualifiers() returns 12 winners, 12 runners and 8 best thirds once all groups finish', () => {
    const finished = buildSchedule().map((m) =>
      m.stage === 'GROUP'
        ? finish(m, ratingFor(m.homeCode!) >= ratingFor(m.awayCode!) ? 2 : 0, ratingFor(m.homeCode!) >= ratingFor(m.awayCode!) ? 0 : 2)
        : m,
    );
    const q = qualifiers(computeStandings(finished));
    expect(Object.keys(q.winners)).toHaveLength(12);
    expect(Object.keys(q.runners)).toHaveLength(12);
    expect(q.bestThirds).toHaveLength(8);
    expect(new Set([...Object.values(q.winners), ...Object.values(q.runners), ...q.bestThirds]).size).toBe(32);
  });
});

describe('bracket resolution', () => {
  const completedGroups = buildSchedule().map((m) =>
    m.stage === 'GROUP'
      ? finish(m, ratingFor(m.homeCode!) >= ratingFor(m.awayCode!) ? 2 : 0, ratingFor(m.homeCode!) >= ratingFor(m.awayCode!) ? 0 : 2)
      : m,
  );

  it('leaves R32 slots as placeholders while the group stage is incomplete', () => {
    const standings = computeStandings(buildSchedule());
    const bracket = resolveBracket(buildSchedule(), standings);
    const r32 = bracket.filter((m) => m.stage === 'R32');
    expect(r32).toHaveLength(16);
    expect(r32[0].home.code).toBeNull();
    expect(r32[0].home.placeholder).toBeTruthy();
    expect(r32[0].favourite).toBeNull();
  });

  it('renders the provider\'s knockout fixtures verbatim — feed team or its slot label, never synthesized', () => {
    // One R32 match: a real feed team vs a slot-labelled opponent (e.g. "2F").
    const withFeed = completedGroups.map((m) =>
      m.stage === 'R32' && m.slot === 0 ? { ...m, homeCode: 'ARG', homeSlot: null, awaySlot: '2F' } : m,
    );
    const bracket = resolveBracket(withFeed, computeStandings(withFeed));
    const m = bracket.find((x) => x.stage === 'R32' && x.home.code === 'ARG')!;
    expect(m.home.code).toBe('ARG'); // feed team shown as-is
    expect(m.away.code).toBeNull();
    expect(m.away.placeholder).toBe('2F'); // slot label shown verbatim, not resolved
  });

  it('shows feed-provided knockout teams with a favourite when both are known', () => {
    const withDrawnR32 = completedGroups.map((m) =>
      m.stage === 'R32' && m.slot === 0 ? { ...m, homeCode: 'ARG', awayCode: 'HAI' } : m,
    );
    const bracket = resolveBracket(withDrawnR32, computeStandings(withDrawnR32));
    const m = bracket.find((x) => x.stage === 'R32' && x.home.code === 'ARG')!;
    expect(m.home.code).toBe('ARG');
    expect(m.away.code).toBe('HAI');
    expect(m.favourite).not.toBeNull();
    expect(m.favourite!.code).toBe('ARG'); // higher FIFA-ranking baseline
  });

  it('shows TBD only when the feed provides neither a team nor a slot label', () => {
    const liveKo: RawMatch = {
      id: 'K1', stage: 'R32', group: null, slot: 0, kickoff: '2026-06-28T18:00:00Z', venueIndex: 0,
      homeCode: null, awayCode: null, homeSlot: null, awaySlot: null,
      homeScore: null, awayScore: null, homePens: null, awayPens: null, status: 'SCHEDULED',
    };
    const bracket = resolveBracket([liveKo], []);
    expect(bracket[0].home.code).toBeNull();
    expect(bracket[0].home.placeholder).toBe('TBD');
  });
});

describe('forecast (Monte Carlo)', () => {
  const matches = buildMockMatches(new Date('2026-06-26T00:00:00Z'));

  it('is deterministic for a fixed seed', () => {
    const a = runForecast(matches, { sims: 300, seed: 7 });
    const b = runForecast(matches, { sims: 300, seed: 7 });
    expect(a.championOdds).toEqual(b.championOdds);
  });

  it('champion odds sum to ~1 and every team reaches the final at least as often as it wins', () => {
    const f = runForecast(matches, { sims: 800, seed: 1 });
    const total = Object.values(f.championOdds).reduce((s, p) => s + p, 0);
    expect(total).toBeGreaterThan(0.9);
    expect(total).toBeLessThanOrEqual(1.01);
    for (const [code, champ] of Object.entries(f.championOdds)) {
      expect(f.reachFinalOdds[code] ?? 0).toBeGreaterThanOrEqual(champ - 0.001);
    }
  });

  it('gives stronger teams higher champion odds than minnows', () => {
    const f = runForecast(matches, { sims: 1500, seed: 3 });
    expect(f.championOdds.ARG ?? 0).toBeGreaterThan(f.championOdds.HAI ?? 0);
  });

  it('resolves the bracket from ESPN-style "3<groups>" third slots', () => {
    // The live ESPN feed expresses third-place slots as a set of eligible groups
    // ("3ABCDF") rather than a rank ("T1"). Assigning the 8 qualifying thirds to
    // these slots is a bipartite matching — a naive greedy leaves a slot empty
    // ~80% of the time, breaking the tree so the final never resolves. With the
    // real combination constraints the champion odds must still sum to ~1.
    const real = ['3ABCDF', '3CDFGH', '3CEFHI', '3EHIJK', '3AEHIJ', '3BEFIJ', '3EFGIJ', '3DEIJL'];
    const sub = (f: string | null): string | null => {
      const t = f && /^T(\d)$/.exec(f);
      return t ? real[Number(t[1]) - 1] : f;
    };
    const espnStyle = buildSchedule().map((m) =>
      m.stage === 'R32'
        ? { ...m, homeFeed: sub(m.homeFeed ?? null), awayFeed: sub(m.awayFeed ?? null) }
        : m,
    );
    const f = runForecast(espnStyle, { sims: 400, seed: 9 });
    const total = Object.values(f.championOdds).reduce((s, p) => s + p, 0);
    expect(total).toBeGreaterThan(0.9);
  });
});

describe('mock data', () => {
  it('only marks matches before "now" as finished, deterministically', () => {
    const early = buildMockMatches(new Date('2026-06-12T00:00:00Z'));
    const later = buildMockMatches(new Date('2026-07-01T00:00:00Z'));
    const earlyDone = early.filter((m) => m.status === 'FINISHED').length;
    const laterDone = later.filter((m) => m.status === 'FINISHED').length;
    expect(laterDone).toBeGreaterThan(earlyDone);
    // Same match → same score regardless of reference date.
    const m1 = early.find((m) => m.status === 'FINISHED')!;
    const m2 = later.find((m) => m.id === m1.id)!;
    expect([m2.homeScore, m2.awayScore]).toEqual([m1.homeScore, m1.awayScore]);
  });
});

describe('strength (results-adjusted Elo)', () => {
  function koFinished(home: string, away: string, hs: number, as: number): RawMatch {
    return {
      id: `${home}${away}`, stage: 'GROUP', group: 'A', slot: 0, kickoff: '2026-06-12T18:00:00Z',
      venueIndex: 0, homeCode: home, awayCode: away, homeSlot: null, awaySlot: null,
      homeScore: hs, awayScore: as, homePens: null, awayPens: null, status: 'FINISHED',
    };
  }

  it('seeds an unknown, never-played team at the neutral common base', () => {
    // No FIFA rating and not in the recent-results graph → the 1500 common base.
    expect(buildStrength([])('ZZZ')).toBe(1500);
  });

  it('raises a tournament winner and lowers the loser, relative to not playing it', () => {
    const without = buildStrength([]); // recent-form background only
    const withMatch = buildStrength([koFinished('CRO', 'CAN', 2, 0)]);
    expect(withMatch('CRO')).toBeGreaterThan(without('CRO'));
    expect(withMatch('CAN')).toBeLessThan(without('CAN'));
  });

  it('moves ratings more for a bigger upset than an expected win', () => {
    const base = buildStrength([]);
    const upsetGain = buildStrength([koFinished('HAI', 'ARG', 1, 0)])('HAI') - base('HAI');
    const expectedGain = buildStrength([koFinished('ARG', 'HAI', 1, 0)])('ARG') - base('ARG');
    expect(upsetGain).toBeGreaterThan(expectedGain);
  });

  it('lets results dominate the FIFA seed (FIFA is only a light anchor)', () => {
    // NZL has the lowest FIFA rating, ARG the highest. Repeated heavy NZL wins
    // must lift NZL above ARG — recent/tournament results decide, not pedigree.
    const rating = buildStrength([
      koFinished('NZL', 'ARG', 4, 0),
      koFinished('NZL', 'ARG', 3, 0),
      koFinished('NZL', 'ARG', 3, 0),
    ]);
    expect(rating('NZL')).toBeGreaterThan(rating('ARG'));
  });
});

describe('analytic projected opponents', () => {
  it('always yields an R32 opponent set for a team with a bracket slot', () => {
    const completed = buildSchedule().map((m) =>
      m.stage === 'GROUP'
        ? finish(m, ratingFor(m.homeCode!) >= ratingFor(m.awayCode!) ? 2 : 0, ratingFor(m.homeCode!) >= ratingFor(m.awayCode!) ? 0 : 2)
        : m,
    );
    const standings = computeStandings(completed);
    const bracket = resolveBracket(completed, standings);
    const winnerA = standings.find((g) => g.group === 'A')!.rows[0].code;
    const proj = analyticR32Opponents(winnerA, 'A', bracket, standings);
    expect(proj).toHaveLength(1);
    expect(proj[0].stage).toBe('R32');
    expect(proj[0].opponents.length).toBeGreaterThan(0);
    expect(proj[0].opponents.every((o) => o.code !== winnerA)).toBe(true);
  });

  it('resolves group-slot and best-third opponent placeholders', () => {
    const row = (code: string, rank: number, qualification = 'ALIVE') => ({
      code, name: code, rank, played: 3, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0,
      qualification: qualification as 'ALIVE' | 'CLINCHED' | 'ELIMINATED',
    });
    const standings = [
      { group: 'A', rows: [row('MEX', 1, 'CLINCHED'), row('KOR', 2), row('RSA', 3), row('CZE', 4, 'ELIMINATED')] },
      { group: 'B', rows: [row('CAN', 1), row('SUI', 2), row('QAT', 3), row('BIH', 4)] },
    ];
    const side = (code: string | null, placeholder: string | null) => ({ code, name: code, placeholder, score: null, pens: null });
    const r32 = (home: ReturnType<typeof side>, away: ReturnType<typeof side>) => ({
      id: 'x', stage: 'R32' as const, group: null, kickoff: '2026-06-28T18:00:00Z', city: '', stadium: '',
      status: 'SCHEDULED' as const, home, away, winnerCode: null, favourite: null,
    });
    // MEX (1A) faces a runner-up slot in one match and a best-third in another.
    const bracket = [
      r32(side('MEX', null), side(null, '2B')),
      r32(side('MEX', null), side(null, 'T3')),
    ];
    const proj = analyticR32Opponents('MEX', 'A', bracket, standings);
    const codes = proj[0].opponents.map((o) => o.code);
    expect(codes).toContain('SUI'); // 2B → group B runner-up
    expect(codes).toContain('RSA'); // T3 → a still-alive 3rd-placed team
    expect(codes).not.toContain('MEX');
  });
});

describe('static lookups', () => {
  it('history and players resolve known teams and degrade for unknowns', () => {
    expect(historyFor('BRA').titles).toBe(5);
    expect(historyFor('ZZZ')).toEqual({ appearances: 0, lastAppearance: null, titles: 0 });
    expect(playersFor('ARG').length).toBeGreaterThan(0);
    expect(playersFor('ZZZ')).toEqual([]);
    expect(teamByCode('FRA')?.name).toBe('France');
    expect(teamByCode('ZZZ')).toBeUndefined();
  });
});
