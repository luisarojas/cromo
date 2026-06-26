// Derives group tables and qualification certainty from a RawMatch[]. Used by
// both the mock and live paths — standings are never read from the provider
// directly, always recomputed here, so there's one tested ranking code path.

import { historyFor } from './history.js';
import { WC_TEAMS } from './teams.js';
import { deriveStructure } from './structure.js';
import type { GroupQualification, RawMatch, TeamMeta, WcGroupStanding, WcStandingRow } from './types.js';

interface Tally {
  code: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
}

function emptyTally(code: string): Tally {
  return { code, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 };
}

function isFinished(m: RawMatch): boolean {
  return m.status === 'FINISHED' && m.homeScore !== null && m.awayScore !== null;
}

function applyResult(t: Tally, gf: number, ga: number): void {
  t.played += 1;
  t.gf += gf;
  t.ga += ga;
  if (gf > ga) {
    t.won += 1;
    t.points += 3;
  } else if (gf === ga) {
    t.drawn += 1;
    t.points += 1;
  } else {
    t.lost += 1;
  }
}

// Group ordering: points, then goal difference, then goals for, then name.
// Head-to-head (FIFA's true first tiebreak) is intentionally omitted — it
// rarely changes the table and would couple ranking to fixture order; this is
// documented as a deliberate simplification. `nameOf` makes the final
// alphabetical tiebreak read from the provider's team registry.
function compareTally(a: Tally, b: Tally, nameOf: (c: string) => string): number {
  if (b.points !== a.points) return b.points - a.points;
  const agd = a.gf - a.ga;
  const bgd = b.gf - b.ga;
  if (bgd !== agd) return bgd - agd;
  if (b.gf !== a.gf) return b.gf - a.gf;
  return nameOf(a.code).localeCompare(nameOf(b.code));
}

function tallyGroup(
  members: TeamMeta[],
  group: string,
  matches: RawMatch[],
  nameOf: (c: string) => string,
): Tally[] {
  const tallies = new Map(members.map((t) => [t.code, emptyTally(t.code)]));
  for (const m of matches) {
    if (m.group !== group || !isFinished(m) || !m.homeCode || !m.awayCode) continue;
    applyResult(tallies.get(m.homeCode)!, m.homeScore!, m.awayScore!);
    applyResult(tallies.get(m.awayCode)!, m.awayScore!, m.homeScore!);
  }
  return [...tallies.values()].sort((a, b) => compareTally(a, b, nameOf));
}

// ─── Qualification certainty (goal-difference aware) ─────────────────────────
//
// We compute each team's BEST (min) and WORST (max) possible final position by
// enumerating every W/D/L outcome of the group's remaining matches AND reasoning
// about goal difference: a team that still has a win to play can inflate its GD
// arbitrarily, a team with a loss to play can deflate it, so GD ties between
// teams that are "done" are decisive while ties involving teams with games to
// play are not. From the position bounds:
//   maxPos ≤ 2  → CLINCHED (guaranteed top-2 → through, even via GD)
//   minPos = 4  → ELIMINATED (guaranteed last)
//   minPos = maxPos → that rank is GUARANTEED (surfaced to the UI)
// Bounds are computed conservatively (never over-claim a guarantee). The
// best-third (3rd place) cross-group resolution still happens once all groups
// finish.

interface PosStat {
  points: number;
  up: boolean; // has a remaining WIN in this scenario → GD can go arbitrarily high
  down: boolean; // has a remaining LOSS → GD can go arbitrarily low
}

function remainingInGroup(group: string, matches: RawMatch[]): RawMatch[] {
  return matches.filter((m) => m.group === group && !isFinished(m) && m.homeCode && m.awayCode);
}

function enumerateScenarios(remaining: RawMatch[], base: Map<string, PosStat>): Map<string, PosStat>[] {
  if (remaining.length === 0) return [new Map([...base].map(([k, v]) => [k, { ...v }]))];
  const [head, ...tail] = remaining;
  // [homePts, awayPts, homeUp, homeDown, awayUp, awayDown]
  const outcomes: [number, number, boolean, boolean, boolean, boolean][] = [
    [3, 0, true, false, false, true], // home win
    [1, 1, false, false, false, false], // draw
    [0, 3, false, true, true, false], // away win
  ];
  const results: Map<string, PosStat>[] = [];
  for (const [hp, ap, hUp, hDown, aUp, aDown] of outcomes) {
    const next = new Map([...base].map(([k, v]) => [k, { ...v }]));
    const h = next.get(head.homeCode!)!;
    h.points += hp; h.up = h.up || hUp; h.down = h.down || hDown;
    const a = next.get(head.awayCode!)!;
    a.points += ap; a.up = a.up || aUp; a.down = a.down || aDown;
    results.push(...enumerateScenarios(tail, next));
  }
  return results;
}

interface Position {
  min: number;
  max: number;
}

function computePositions(tallies: Tally[], remaining: RawMatch[], nameOf: (c: string) => string): Map<string, Position> {
  const codes = tallies.map((t) => t.code);
  const base = new Map(tallies.map((t) => [t.code, { points: t.points, up: false, down: false } as PosStat]));
  const fixed = new Map(tallies.map((t) => [t.code, { gd: t.gf - t.ga, gf: t.gf, name: nameOf(t.code) }]));
  // True if R outranks X on the FIXED (already-played) tiebreakers.
  const fixedAbove = (R: string, X: string): boolean => {
    const r = fixed.get(R)!;
    const x = fixed.get(X)!;
    if (r.gd !== x.gd) return r.gd > x.gd;
    if (r.gf !== x.gf) return r.gf > x.gf;
    return r.name.localeCompare(x.name) < 0;
  };

  const result = new Map(codes.map((c) => [c, { min: codes.length, max: 1 } as Position]));
  for (const sc of enumerateScenarios(remaining, base)) {
    for (const X of codes) {
      const x = sc.get(X)!;
      let possibly = 0; // teams that COULD finish above X (worst case for X)
      let certainly = 0; // teams that MUST finish above X (best case for X)
      for (const R of codes) {
        if (R === X) continue;
        const r = sc.get(R)!;
        if (r.points > x.points) { possibly += 1; certainly += 1; continue; }
        if (r.points < x.points) continue;
        // Level on points: GD decides, with flexibility from games still to play.
        if (r.up || x.down || fixedAbove(R, X)) possibly += 1;
        if (!x.up && !r.down && fixedAbove(R, X)) certainly += 1;
      }
      const res = result.get(X)!;
      res.max = Math.max(res.max, 1 + possibly);
      res.min = Math.min(res.min, 1 + certainly);
    }
  }
  return result;
}

function qualificationFromPosition(pos: Position): GroupQualification {
  if (pos.max <= 2) return 'CLINCHED'; // guaranteed top-2 → through
  if (pos.min >= 4) return 'ELIMINATED'; // guaranteed last → out (3rd may still be a best-third)
  return 'ALIVE';
}

function allGroupsComplete(matches: RawMatch[]): boolean {
  return matches.filter((m) => m.stage === 'GROUP').every(isFinished);
}

/**
 * computeStandings — full set of 12 group tables with per-team qualification.
 * When every group match is finished, a cross-group pass resolves the 8 best
 * third-place teams: those 8 become CLINCHED, the other 4 thirds ELIMINATED.
 * (Rank order of thirds replaces FIFA's official combination table — a
 * documented simplification.)
 */
export function computeStandings(matches: RawMatch[], teams: TeamMeta[] = WC_TEAMS): WcGroupStanding[] {
  const { letters, byGroup, nameOf } = deriveStructure(teams);
  const groupsComplete = allGroupsComplete(matches);
  const thirds: Tally[] = [];

  const standings: WcGroupStanding[] = letters.map((group) => {
    const tallies = tallyGroup(byGroup.get(group) ?? [], group, matches, nameOf);
    const remaining = remainingInGroup(group, matches);
    const positions = computePositions(tallies, remaining, nameOf);

    const rows: WcStandingRow[] = tallies.map((t, i) => {
      const pos = positions.get(t.code)!;
      if (i === 2) thirds.push(t);
      return {
        code: t.code,
        name: nameOf(t.code),
        rank: i + 1,
        played: t.played,
        won: t.won,
        drawn: t.drawn,
        lost: t.lost,
        gf: t.gf,
        ga: t.ga,
        gd: t.gf - t.ga,
        points: t.points,
        qualification: qualificationFromPosition(pos),
        minRank: pos.min,
        maxRank: pos.max,
        // The team's certain final position, if its best and worst case agree.
        guaranteedRank: pos.min === pos.max ? pos.min : null,
        lastAppearance: historyFor(t.code).lastAppearance,
      };
    });
    return { group, rows };
  });

  if (groupsComplete) {
    const ranked = [...thirds].sort((a, b) => compareTally(a, b, nameOf));
    const qualifyingThirds = new Set(ranked.slice(0, 8).map((t) => t.code));
    for (const g of standings) {
      const third = g.rows.find((r) => r.rank === 3);
      if (third) third.qualification = qualifyingThirds.has(third.code) ? 'CLINCHED' : 'ELIMINATED';
    }
  }

  return standings;
}

/** Ranked codes (1st, 2nd) per group plus the 8 best thirds — for bracket fill. */
export function qualifiers(standings: WcGroupStanding[]): {
  winners: Record<string, string>;
  runners: Record<string, string>;
  bestThirds: string[];
} {
  const winners: Record<string, string> = {};
  const runners: Record<string, string> = {};
  const thirdRows: WcStandingRow[] = [];
  for (const g of standings) {
    const first = g.rows.find((r) => r.rank === 1);
    const second = g.rows.find((r) => r.rank === 2);
    const third = g.rows.find((r) => r.rank === 3);
    if (first) winners[g.group] = first.code;
    if (second) runners[g.group] = second.code;
    if (third) thirdRows.push(third);
  }
  const bestThirds = [...thirdRows]
    .sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf)
    .slice(0, 8)
    .map((r) => r.code);
  return { winners, runners, bestThirds };
}
