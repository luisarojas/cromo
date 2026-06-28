// Monte Carlo forecast. Plays out every UNRESOLVED match thousands of times —
// remaining group games (with draws) and the knockout tree (win-or-out) — using
// the Elo win probability, while honouring any result that has already happened.
// Produces champion odds, reach-final odds, and a projected-opponent
// distribution per team. Deterministic given a seed, so the math is testable.

import { winProbability } from './ratings.js';
import { buildStrength } from './strength.js';
import { deriveStructure } from './structure.js';
import type { RawMatch, TeamMeta, WcStage } from './types.js';

// Draw rate for a group game, as a function of how even it is. Even matchups
// draw most often; lopsided ones almost never do — so a flat share would both
// over-draw mismatches and under-draw coin-flips, distorting who finishes 2nd on
// points. `MAX_DRAW` is the rate for a 50/50 game; it tapers linearly to ~0 as
// the single-match win probability approaches 0 or 1. Averaged over a real group
// schedule this lands near the historical WC group draw rate (~22%).
const MAX_DRAW = 0.3;
function drawProbability(pHome: number): number {
  return MAX_DRAW * (1 - Math.abs(2 * pHome - 1));
}

export interface Forecast {
  championOdds: Record<string, number>;
  reachFinalOdds: Record<string, number>;
  /** code → stage → opponentCode → P(face them | reach that stage). */
  projectedOpponents: Record<string, Record<string, { code: string; prob: number }[]>>;
}

function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SimTally {
  code: string;
  points: number;
  gf: number;
  ga: number;
}

function isFinished(m: RawMatch): boolean {
  return m.status === 'FINISHED' && m.homeScore !== null && m.awayScore !== null;
}

function baseGroupTallies(
  matches: RawMatch[],
  byGroup: Map<string, TeamMeta[]>,
): Map<string, Map<string, SimTally>> {
  const groups = new Map<string, Map<string, SimTally>>();
  for (const [g, members] of byGroup) {
    groups.set(g, new Map(members.map((t) => [t.code, { code: t.code, points: 0, gf: 0, ga: 0 }])));
  }
  for (const m of matches) {
    if (m.stage !== 'GROUP' || !isFinished(m) || !m.homeCode || !m.awayCode) continue;
    const g = groups.get(m.group!)!;
    const h = g.get(m.homeCode)!;
    const a = g.get(m.awayCode)!;
    h.gf += m.homeScore!; h.ga += m.awayScore!;
    a.gf += m.awayScore!; a.ga += m.homeScore!;
    if (m.homeScore! > m.awayScore!) h.points += 3;
    else if (m.homeScore! < m.awayScore!) a.points += 3;
    else { h.points += 1; a.points += 1; }
  }
  return groups;
}

function rankGroup(tallies: SimTally[]): SimTally[] {
  return [...tallies].sort(
    (a, b) =>
      b.points - a.points ||
      (b.gf - b.ga) - (a.gf - a.ga) ||
      b.gf - a.gf ||
      a.code.localeCompare(b.code),
  );
}

interface FeedCtx {
  winners: Record<string, string>;
  runners: Record<string, string>;
  thirdAssign: Map<string, string>; // third-slot feed → assigned team code
  winnerOf: Map<string, string>; // `${stage}:${slot}` → winner code
  loserOf: Map<string, string>;
}

// Resolve a structured feed to a team code, given the current simulated context.
function resolveFeed(feed: string | null | undefined, ctx: FeedCtx): string | null {
  if (!feed) return null;
  let m: RegExpExecArray | null;
  if ((m = /^1([A-L])$/.exec(feed))) return ctx.winners[m[1]] ?? null;
  if ((m = /^2([A-L])$/.exec(feed))) return ctx.runners[m[1]] ?? null;
  if (/^3[A-L]*$/.test(feed) || /^T\d$/.test(feed)) return ctx.thirdAssign.get(feed) ?? null;
  if ((m = /^W:(\w+):(\d+)$/.exec(feed))) return ctx.winnerOf.get(`${m[1]}:${m[2]}`) ?? null;
  if ((m = /^L:(\w+):(\d+)$/.exec(feed))) return ctx.loserOf.get(`${m[1]}:${m[2]}`) ?? null;
  return null;
}

// Assign the 8 best thirds to the third-place slots, respecting each slot's
// allowed groups (ESPN "3ABCDF") or by rank (mock "T1".."T8"). The group case is
// a bipartite matching (slot → an eligible third); a greedy pass leaves a slot
// unfillable ~80% of the time, so we use Kuhn's augmenting-path algorithm, which
// finds a perfect matching whenever one exists. Any valid matching is a sound
// forecast estimate — FIFA's exact combination table isn't published pre-draw.
function assignThirds(slotFeeds: string[], thirdsRanked: string[], thirdGroup: Map<string, string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of slotFeeds) {
    const t = /^T(\d)$/.exec(f);
    if (t && thirdsRanked[Number(t[1]) - 1]) out.set(f, thirdsRanked[Number(t[1]) - 1]);
  }
  const slots = slotFeeds
    .filter((f) => /^3[A-L]+$/.test(f))
    .map((f) => ({ feed: f, allow: new Set(f.slice(1).split('')) }));
  if (slots.length === 0) return out;

  const thirdToSlot = new Map<string, number>(); // third code → slot index it's matched to
  const augment = (slotIdx: number, seen: Set<string>): boolean => {
    for (const code of thirdsRanked) {
      if (!slots[slotIdx].allow.has(thirdGroup.get(code) ?? '') || seen.has(code)) continue;
      seen.add(code);
      const heldBy = thirdToSlot.get(code);
      if (heldBy === undefined || augment(heldBy, seen)) {
        thirdToSlot.set(code, slotIdx);
        return true;
      }
    }
    return false;
  };
  for (let i = 0; i < slots.length; i += 1) augment(i, new Set());
  for (const [code, slotIdx] of thirdToSlot) out.set(slots[slotIdx].feed, code);
  return out;
}

interface OppCounter {
  // team → stage → opp → count, plus team → stage → total
  counts: Map<string, Map<string, Map<string, number>>>;
  totals: Map<string, Map<string, number>>;
}

function recordPairing(oc: OppCounter, stage: WcStage, a: string, b: string): void {
  for (const [x, y] of [[a, b], [b, a]] as const) {
    let byStage = oc.counts.get(x);
    if (!byStage) { byStage = new Map(); oc.counts.set(x, byStage); }
    let byOpp = byStage.get(stage);
    if (!byOpp) { byOpp = new Map(); byStage.set(stage, byOpp); }
    byOpp.set(y, (byOpp.get(y) ?? 0) + 1);
    let st = oc.totals.get(x);
    if (!st) { st = new Map(); oc.totals.set(x, st); }
    st.set(stage, (st.get(stage) ?? 0) + 1);
  }
}

export function runForecast(
  matches: RawMatch[],
  opts: { sims?: number; seed?: number; teams?: TeamMeta[] } = {},
): Forecast {
  const sims = opts.sims ?? 4000;
  const rand = mulberry32(opts.seed ?? 0x1f2e3d4c);

  const { letters, byGroup } = deriveStructure(opts.teams);
  // Strength is the pre-tournament baseline Elo adjusted by actual results so
  // far — facts, not sentiment. Every match-odds call below reads from it.
  const rating = buildStrength(matches);
  const baseGroups = baseGroupTallies(matches, byGroup);
  const remainingGroup = matches.filter((m) => m.stage === 'GROUP' && !isFinished(m) && m.homeCode && m.awayCode);

  // Knockout structure for the SIMULATION comes from the REAL bracket in
  // `matches` (live: ESPN's official draw; mock: the canonical schedule) — both
  // carry structured `homeFeed`/`awayFeed`, so we propagate through the actual
  // tree. Indexed by stage in slot (match-number) order.
  const koStages: WcStage[] = ['R32', 'R16', 'QF', 'SF', 'THIRD', 'FINAL'];
  const koByStage = new Map<WcStage, RawMatch[]>();
  for (const stage of koStages) {
    koByStage.set(stage, matches.filter((m) => m.stage === stage).sort((a, b) => a.slot - b.slot));
  }
  // Distinct third-place slot feeds, e.g. "3ABCDF" (ESPN) or "T1" (mock).
  const thirdSlotFeeds = [
    ...new Set(
      (koByStage.get('R32') ?? [])
        .flatMap((m) => [m.homeFeed, m.awayFeed])
        .filter((f): f is string => !!f && (/^3[A-L]*$/.test(f) || /^T\d$/.test(f))),
    ),
  ];

  const champion = new Map<string, number>();
  const finalist = new Map<string, number>();
  const oc: OppCounter = { counts: new Map(), totals: new Map() };

  for (let run = 0; run < sims; run += 1) {
    // 1. Simulate remaining group matches on a per-run copy of the tallies.
    const groups = new Map<string, Map<string, SimTally>>();
    for (const [g, m] of baseGroups) {
      groups.set(g, new Map([...m].map(([c, t]) => [c, { ...t }])));
    }
    for (const m of remainingGroup) {
      const g = groups.get(m.group!)!;
      const h = g.get(m.homeCode!)!;
      const a = g.get(m.awayCode!)!;
      const pHome = winProbability(rating(m.homeCode!), rating(m.awayCode!));
      const draw = drawProbability(pHome);
      const r = rand();
      if (r < draw) { h.points += 1; a.points += 1; h.gf += 1; a.gf += 1; h.ga += 1; a.ga += 1; }
      else if (r < draw + (1 - draw) * pHome) { h.points += 3; h.gf += 2; a.ga += 2; }
      else { a.points += 3; a.gf += 2; h.ga += 2; }
    }

    // 2. Resolve qualifiers (and remember each third's group for slot matching).
    const winners: Record<string, string> = {};
    const runners: Record<string, string> = {};
    const thirdTallies: SimTally[] = [];
    const thirdGroup = new Map<string, string>();
    for (const g of letters) {
      const ranked = rankGroup([...groups.get(g)!.values()]);
      winners[g] = ranked[0].code;
      runners[g] = ranked[1].code;
      thirdTallies.push(ranked[2]);
      thirdGroup.set(ranked[2].code, g);
    }
    const thirdsRanked = rankGroup(thirdTallies).slice(0, 8).map((t) => t.code);

    // 3. Knockout: walk the REAL tree stage by stage, resolving each side from
    // the feed (group qualifier / assigned third / earlier match winner|loser),
    // honouring any real team or result the feed already provides.
    const ctx: FeedCtx = {
      winners,
      runners,
      thirdAssign: assignThirds(thirdSlotFeeds, thirdsRanked, thirdGroup),
      winnerOf: new Map(),
      loserOf: new Map(),
    };
    let finalHome: string | null = null;
    let finalAway: string | null = null;
    for (const stage of koStages) {
      for (const m of koByStage.get(stage) ?? []) {
        const home = m.homeCode ?? resolveFeed(m.homeFeed, ctx);
        const away = m.awayCode ?? resolveFeed(m.awayFeed, ctx);
        if (!home || !away) continue;
        recordPairing(oc, stage, home, away);
        if (stage === 'FINAL') { finalHome = home; finalAway = away; }
        let w: string;
        if (isFinished(m)) {
          w = m.homeScore! !== m.awayScore!
            ? (m.homeScore! > m.awayScore! ? home : away)
            : ((m.homePens ?? 0) >= (m.awayPens ?? 0) ? home : away);
        } else {
          w = rand() < winProbability(rating(home), rating(away)) ? home : away;
        }
        ctx.winnerOf.set(`${stage}:${m.slot}`, w);
        ctx.loserOf.set(`${stage}:${m.slot}`, w === home ? away : home);
      }
    }

    if (finalHome) finalist.set(finalHome, (finalist.get(finalHome) ?? 0) + 1);
    if (finalAway) finalist.set(finalAway, (finalist.get(finalAway) ?? 0) + 1);
    const finalSlot = koByStage.get('FINAL')?.[0]?.slot;
    const champ = finalSlot !== undefined ? ctx.winnerOf.get(`FINAL:${finalSlot}`) : undefined;
    if (champ) champion.set(champ, (champion.get(champ) ?? 0) + 1);
  }

  const championOdds: Record<string, number> = {};
  const reachFinalOdds: Record<string, number> = {};
  for (const [code, c] of champion) championOdds[code] = Math.round((c / sims) * 1000) / 1000;
  for (const [code, c] of finalist) reachFinalOdds[code] = Math.round((c / sims) * 1000) / 1000;

  const projectedOpponents: Forecast['projectedOpponents'] = {};
  for (const [team, byStage] of oc.counts) {
    const stages: Record<string, { code: string; prob: number }[]> = {};
    for (const [stage, byOpp] of byStage) {
      const total = oc.totals.get(team)?.get(stage) ?? 1;
      stages[stage] = [...byOpp.entries()]
        .map(([code, n]) => ({ code, prob: Math.round((n / total) * 1000) / 1000 }))
        .sort((a, b) => b.prob - a.prob)
        .slice(0, 4);
    }
    projectedOpponents[team] = stages;
  }

  return { championOdds, reachFinalOdds, projectedOpponents };
}
