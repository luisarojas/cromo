// Team strength — the fact-based input to every probability.
//
// Strength is fit PURELY FROM ACTUAL RESULTS: the last ~12 months of
// internationals (`recent-results.data.ts`, a static ESPN snapshot) plus this
// tournament's finished matches, which are weighted far more heavily so the WC's
// own results dominate as it plays out. There is deliberately NO FIFA-ranking
// anchor: the published ranking blends years of matches and rewards pedigree, so
// it does not represent the squad on the pitch now — anchoring on it produced
// the contradiction this model exists to avoid (a "favourite" carrying high
// title odds while finishing mid-table in its own group). Here a team's number
// IS its recent form.
//
// Opponent strength is handled correctly WITHOUT any external rating: we fit all
// teams' ratings simultaneously to the result graph. Concretely, ratings are the
// regularised maximum-likelihood solution of a weighted Bradley-Terry (logistic)
// model — found by gradient descent, whose per-match step is exactly the Elo
// update K·(actual − expected). Because the non-WC opponents in the graph
// (friendly/qualifier foes that didn't qualify) get their OWN ratings from their
// OWN results, a team earns little for beating a side that loses everywhere and a
// lot for beating one that wins everywhere. This is what stops the weak-schedule
// inflation a single online Elo pass (seeding unknown opponents at a flat base)
// suffers from. A light L2 pull toward the mean regularises teams with few
// matches and fixes the overall scale; iterating to convergence makes the result
// order-independent (and therefore deterministic).
//
// Match weight = importance · recency · margin. Importance makes the tournament
// dwarf friendlies; recency (half-life measured against the latest result, so
// there's no wall-clock and the run is deterministic) keeps the rating about the
// CURRENT squad; margin gives blowouts more signal than narrow wins.
//
// Host advantage (USA/CAN/MEX) is added to the FINAL rating, not into the fit:
// past away friendlies shouldn't get a home bump, but a home World Cup is a real
// edge for their remaining matches.

import { RECENT_RESULTS, type RecentCategory } from './recent-results.data.js';
import type { RawMatch } from './types.js';

const MEAN = 1500; // rating scale centre and the prior every team is pulled toward
const SCALE = 400; // logistic scale — matches winProbability's /400 (a 400-pt gap ≈ 91%)
const HALFLIFE_DAYS = 270; // a result this many days old counts half as much — keeps it "current"
const HOST_ADV = 40; // Elo bump for the 2026 hosts on their remaining matches
const HOSTS = new Set(['USA', 'CAN', 'MEX']);

// Fit hyper-parameters. The fit converges well before EPOCHS (verified: ratings
// are identical at 200 vs 800 epochs), so this is deterministic and cheap (~25ms).
const ETA = 4; // gradient step size
const EPOCHS = 300;
const LAMBDA = 0.02; // L2 pull toward MEAN — larger = flatter field; 0.02 gives a ~480-pt spread

// Relative importance of a result. Tournament matches are played against the real
// field with real stakes, so they dominate; friendlies (rotation squads) count
// least. These are the main lever on how fast the WC overrides pre-tournament form.
const IMPORTANCE: Record<RecentCategory | 'tournament', number> = {
  friendly: 0.5,
  nations: 1.0,
  qualifier: 1.3,
  continental: 1.6,
  tournament: 6.0,
};

// Blowouts carry more information than 1-goal games, but with diminishing returns
// (the standard World-Football-Elo shape, gently flattened).
function marginMultiplier(gd: number): number {
  if (gd <= 1) return 1;
  if (gd === 2) return 1.35;
  return (8 + gd) / 6;
}

interface Played {
  date: number; // epoch ms
  home: string;
  away: string;
  actualHome: number; // 1 win / 0.5 draw / 0 loss
  weight: number;
}

function isFinished(m: RawMatch): boolean {
  return m.status === 'FINISHED' && m.homeScore !== null && m.awayScore !== null;
}

function toPlayed(date: number, home: string, away: string, hs: number, as: number, importance: number, now: number): Played {
  const recency = 0.5 ** ((now - date) / 86_400_000 / HALFLIFE_DAYS);
  return {
    date,
    home,
    away,
    actualHome: hs > as ? 1 : hs < as ? 0 : 0.5,
    weight: importance * recency * marginMultiplier(Math.abs(hs - as)),
  };
}

/**
 * buildStrength — returns `rating(code)` giving each team's current strength,
 * fit purely from results (no FIFA anchor). Pure and deterministic for a given
 * tournament-match list (the recent-results snapshot is static): the fit is run
 * to convergence, so the result doesn't depend on iteration order.
 */
export function buildStrength(matches: RawMatch[]): (code: string) => number {
  const raw: { date: number; home: string; away: string; hs: number; as: number; importance: number }[] = [
    ...RECENT_RESULTS.map((r) => ({ date: Date.parse(r.d), home: r.h, away: r.a, hs: r.hs, as: r.as, importance: IMPORTANCE[r.k] })),
    ...matches
      .filter((m) => isFinished(m) && m.homeCode && m.awayCode)
      .map((m) => ({ date: Date.parse(m.kickoff), home: m.homeCode!, away: m.awayCode!, hs: m.homeScore!, as: m.awayScore!, importance: IMPORTANCE.tournament })),
  ];

  // Recency is measured against the latest result, so it's wall-clock-free and
  // tournament matches always sit at full recency.
  const now = raw.length ? Math.max(...raw.map((p) => p.date)) : 0;
  const played = raw.map((p) => toPlayed(p.date, p.home, p.away, p.hs, p.as, p.importance, now));

  const r = new Map<string, number>();
  for (const p of played) {
    if (!r.has(p.home)) r.set(p.home, MEAN);
    if (!r.has(p.away)) r.set(p.away, MEAN);
  }

  // Gradient descent on the weighted Bradley-Terry log-likelihood with L2
  // regularisation toward MEAN. Each match's step is the Elo update; the L2 pass
  // anchors the scale and pulls sparse teams to the mean. Iterated to convergence.
  for (let epoch = 0; epoch < EPOCHS; epoch += 1) {
    for (const p of played) {
      const rh = r.get(p.home)!;
      const ra = r.get(p.away)!;
      const expectedHome = 1 / (1 + 10 ** (-(rh - ra) / SCALE));
      const step = ETA * p.weight * (p.actualHome - expectedHome);
      r.set(p.home, rh + step);
      r.set(p.away, ra - step);
    }
    for (const [code, v] of r) r.set(code, v + ETA * LAMBDA * (MEAN - v));
  }

  return (c) => (r.get(c) ?? MEAN) + (HOSTS.has(c) ? HOST_ADV : 0);
}
