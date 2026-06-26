// Results-adjusted team strength — the fact-based input to every probability.
//
// We start each team from a pre-tournament BASELINE (`ratings.ts`) and then run
// a standard Elo update over every FINISHED match in the dataset, in kickoff
// order. Elo is exactly "credit for beating strong teams, penalty for losing to
// weak ones": the adjustment for a result is K·mult·(actual − expected), where
// expected comes from the rating gap and `mult` scales by goal margin. So a
// team that beats a strong side climbs more than one that beats a minnow, and
// the ratings drift toward what actually happened on the pitch — no public
// sentiment, no hand-tuning per result.
//
// LIMITATION (documented honestly): the only finished matches we can see for
// these national teams on the data plan are this tournament's. A full "past 12
// months of results" rating needs a historical-results feed the current source
// doesn't expose — until then the baseline carries the pre-tournament signal and
// the live results move it.

import { ratingFor } from './ratings.js';
import type { RawMatch } from './types.js';

const K = 24;

function isFinished(m: RawMatch): boolean {
  return m.status === 'FINISHED' && m.homeScore !== null && m.awayScore !== null;
}

// Goal-difference multiplier (FIFA/clubelo style): blowouts move ratings more.
function marginMultiplier(gd: number): number {
  if (gd <= 1) return 1;
  if (gd === 2) return 1.5;
  return (11 + gd) / 8;
}

/**
 * buildStrength — returns `rating(code)` giving each team's current adjusted
 * Elo. Pure and deterministic for a given match list.
 */
export function buildStrength(matches: RawMatch[]): (code: string) => number {
  const r = new Map<string, number>();
  const rating = (c: string): number => {
    if (!r.has(c)) r.set(c, ratingFor(c));
    return r.get(c)!;
  };

  const finished = matches
    .filter((m) => isFinished(m) && m.homeCode && m.awayCode)
    .sort((a, b) => +new Date(a.kickoff) - +new Date(b.kickoff));

  for (const m of finished) {
    const ra = rating(m.homeCode!);
    const rb = rating(m.awayCode!);
    const expectedHome = 1 / (1 + 10 ** (-(ra - rb) / 400));
    const actualHome = m.homeScore! > m.awayScore! ? 1 : m.homeScore! < m.awayScore! ? 0 : 0.5;
    const mult = marginMultiplier(Math.abs(m.homeScore! - m.awayScore!));
    const delta = K * mult * (actualHome - expectedHome);
    r.set(m.homeCode!, ra + delta);
    r.set(m.awayCode!, rb - delta);
  }

  return (c) => r.get(c) ?? ratingFor(c);
}
