// Deterministic mock dataset used whenever WC_API_KEY === 'mock' (local dev,
// tests, CI) — exactly mirroring scan.service.ts's mock pathway. Scorelines are
// seeded off the match id so a given match always has the same result; only
// whether it has been PLAYED yet depends on the reference "now". That makes the
// bracket "fill in over time" naturally as the date advances, with zero
// external calls and no fabricated live data presented as real.

import { playersFor } from './players.js';
import { ratingFor, winProbability } from './ratings.js';
import { buildSchedule } from './schedule.js';
import { WC_TEAMS } from './teams.js';
import type { RawMatch, TeamMeta, WcPlayer } from './types.js';

function seedFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Poisson-ish goal draw from an expected value, capped for realism.
function goals(expected: number, r: () => number): number {
  let n = 0;
  for (let i = 0; i < 6; i += 1) if (r() < expected / (i + 2)) n += 1;
  return Math.min(n, 5);
}

function simulateResult(m: RawMatch): RawMatch {
  if (!m.homeCode || !m.awayCode) return m;
  const r = rng(seedFromId(m.id));
  const pHome = winProbability(ratingFor(m.homeCode), ratingFor(m.awayCode));
  // Stronger side gets a higher expected-goals base.
  const homeXg = 0.8 + pHome * 1.8;
  const awayXg = 0.8 + (1 - pHome) * 1.8;
  const hs = goals(homeXg, r);
  const as = goals(awayXg, r);
  const knockout = m.stage !== 'GROUP';
  let homePens: number | null = null;
  let awayPens: number | null = null;
  if (knockout && hs === as) {
    // Force a winner via shoot-out (favourite edge).
    if (r() < pHome) { homePens = 5; awayPens = 3 + Math.floor(r() * 2); }
    else { awayPens = 5; homePens = 3 + Math.floor(r() * 2); }
  }
  return { ...m, homeScore: hs, awayScore: as, homePens, awayPens, status: 'FINISHED' };
}

/**
 * buildMockMatches — full schedule with every match whose kickoff precedes
 * `now` simulated to a finished result. Knockout team slots remain placeholders
 * in the RawMatch (bracket.ts resolves them); a knockout match only gets a
 * score once its two feeders have produced teams AND its kickoff has passed.
 */
export function buildMockMatches(now: Date = new Date()): RawMatch[] {
  const schedule = buildSchedule();
  const played: RawMatch[] = [];

  // First pass: group matches (always have concrete teams).
  for (const m of schedule) {
    if (m.stage === 'GROUP' && new Date(m.kickoff) < now) played.push(simulateResult(m));
    else played.push({ ...m });
  }

  // Knockout results are produced by the live/derive path from real feeders;
  // for the mock we leave them SCHEDULED so the demo shows the bracket filling
  // in from the group stage outward. (Simulating the whole tree here would
  // duplicate forecast.ts and present one arbitrary outcome as fact.)
  return played;
}

/** Mock provider output: matches, the static roster, and curated squads. */
export function buildMockData(
  now: Date = new Date(),
): { matches: RawMatch[]; teams: TeamMeta[]; squads: Record<string, WcPlayer[]> } {
  const squads: Record<string, WcPlayer[]> = {};
  for (const t of WC_TEAMS) {
    const p = playersFor(t.code);
    if (p.length) squads[t.code] = p;
  }
  return { matches: buildMockMatches(now), teams: WC_TEAMS, squads };
}
