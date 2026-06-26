// Results-driven team strength — the fact-based input to every probability.
//
// The rating each team carries is built by a margin-weighted Elo over ACTUAL
// matches, in kickoff order. Two result streams dominate it:
//   1. the last ~12 months of internationals (`recent-results.data.ts`), and
//   2. this tournament's finished matches.
// Elo is exactly "credit for beating strong teams, penalty for losing to weak
// ones": each result moves both teams by K·importance·recency·margin·(actual −
// expected). A team in strong recent form climbs above a higher-pedigree team
// that has been losing — no public sentiment, no hand-tuning per result.
//
// The published FIFA ranking (`ratings.ts`) is deliberately NOT the dominant
// factor: it only SEEDS the Elo, and in compressed form (a fraction of each
// team's distance from the field's mean), so it gently anchors teams with few
// recent matches without overriding what the results say. Tournament matches
// carry the highest importance and the latest dates, so as the WC plays out it
// takes over from the pre-tournament form. Non-WC opponents in the recent-
// results graph (friendly opponents that didn't qualify) start at the neutral
// common base — they exist only to give each rated match a real opponent.
//
// Host advantage (USA/CAN/MEX) is added to the FINAL rating, not the seed: past
// away friendlies shouldn't get a home bump, but a home World Cup is a real edge
// for their remaining matches.

import { hasRating, MEAN_RATING, ratingFor } from './ratings.js';
import { RECENT_RESULTS, type RecentCategory } from './recent-results.data.js';
import type { RawMatch } from './types.js';

const COMMON_BASE = 1500; // neutral starting rating before any results
const PRIOR_PULL = 0.3; // how much of a team's FIFA-distance-from-mean seeds it
const HOST_ADV = 45; // Elo bump for the 2026 hosts on their remaining matches
const HOSTS = new Set(['USA', 'CAN', 'MEX']);
const HALFLIFE_DAYS = 365; // a result one year old counts half as much as today's

// Elo K by match importance — friendlies move ratings least (rotation squads),
// tournament matches most (they're the point of the whole model).
const K_BY_CATEGORY: Record<RecentCategory | 'tournament', number> = {
  friendly: 15,
  nations: 25,
  qualifier: 30,
  continental: 35,
  tournament: 45,
};

interface Played {
  date: number; // epoch ms
  home: string;
  away: string;
  hs: number;
  as: number;
  k: number; // importance K
}

function marginMultiplier(gd: number): number {
  if (gd <= 1) return 1;
  if (gd === 2) return 1.5;
  return (11 + gd) / 8;
}

// Compressed FIFA anchor: a team 300 pts above the field mean starts only
// PRIOR_PULL·300 above the common base, so real results dominate the spread.
function seedRating(code: string): number {
  return hasRating(code) ? COMMON_BASE + PRIOR_PULL * (ratingFor(code) - MEAN_RATING) : COMMON_BASE;
}

function isFinished(m: RawMatch): boolean {
  return m.status === 'FINISHED' && m.homeScore !== null && m.awayScore !== null;
}

/**
 * buildStrength — returns `rating(code)` giving each team's current strength.
 * Pure and deterministic for a given tournament-match list (the recent-results
 * snapshot is static). The dominant inputs are recent form + the tournament so
 * far; FIFA only seeds.
 */
export function buildStrength(matches: RawMatch[]): (code: string) => number {
  const played: Played[] = [
    ...RECENT_RESULTS.map((r) => ({
      date: Date.parse(r.d),
      home: r.h,
      away: r.a,
      hs: r.hs,
      as: r.as,
      k: K_BY_CATEGORY[r.k],
    })),
    ...matches
      .filter((m) => isFinished(m) && m.homeCode && m.awayCode)
      .map((m) => ({
        date: Date.parse(m.kickoff),
        home: m.homeCode!,
        away: m.awayCode!,
        hs: m.homeScore!,
        as: m.awayScore!,
        k: K_BY_CATEGORY.tournament,
      })),
  ].sort((a, b) => a.date - b.date);

  // Recency is measured against the latest result, so it's deterministic (no
  // wall-clock) and tournament matches always sit at full weight.
  const now = played.length ? played[played.length - 1].date : 0;
  const DAY = 86_400_000;

  const r = new Map<string, number>();
  const rating = (c: string): number => {
    if (!r.has(c)) r.set(c, seedRating(c));
    return r.get(c)!;
  };

  for (const p of played) {
    const ra = rating(p.home);
    const rb = rating(p.away);
    const expectedHome = 1 / (1 + 10 ** (-(ra - rb) / 400));
    const actualHome = p.hs > p.as ? 1 : p.hs < p.as ? 0 : 0.5;
    const recency = 0.5 ** ((now - p.date) / DAY / HALFLIFE_DAYS);
    const delta = p.k * recency * marginMultiplier(Math.abs(p.hs - p.as)) * (actualHome - expectedHome);
    r.set(p.home, ra + delta);
    r.set(p.away, rb - delta);
  }

  return (c) => (r.get(c) ?? seedRating(c)) + (HOSTS.has(c) ? HOST_ADV : 0);
}
