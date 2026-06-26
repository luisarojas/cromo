// Builds the full 104-match skeleton: 72 group matches (12 groups × 6) plus a
// 32-match knockout tree (R32 16, R16 8, QF 4, SF 2, third-place 1, final 1).
//
// Dates/venues here are ILLUSTRATIVE — plausible slots across the real June
// 11 – July 19 2026 window, not the official kickoff list. The live provider
// overwrites them with real fixtures; the mock path uses them as-is. Knockout
// matches carry slot placeholders ("1A", "2B", "T3", "W73") that bracket.ts
// resolves to teams once the feeding results are known.

import { GROUPS, teamsInGroup } from './teams.js';
import type { RawMatch, WcStage } from './types.js';

// Round-robin matchday pairings by in-group index (FIFA standard order).
const MATCHDAY_PAIRS: [number, number][][] = [
  [[0, 1], [2, 3]], // MD1
  [[0, 2], [3, 1]], // MD2
  [[3, 0], [1, 2]], // MD3
];

// Base UTC date (midnight) per group matchday. Two kickoff hours per match.
const MD_BASE = ['2026-06-11', '2026-06-18', '2026-06-24'];
const KICKOFF_HOURS = [18, 21]; // UTC ≈ 14:00 / 17:00 ET

function iso(date: string, dayOffset: number, hour: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(hour);
  return d.toISOString();
}

function buildGroupMatches(): RawMatch[] {
  const matches: RawMatch[] = [];
  let n = 0;
  GROUPS.forEach((group, gi) => {
    const teams = teamsInGroup(group);
    MATCHDAY_PAIRS.forEach((pairs, md) => {
      pairs.forEach(([h, a], pi) => {
        n += 1;
        matches.push({
          id: `M${String(n).padStart(3, '0')}`,
          stage: 'GROUP',
          group,
          slot: gi * 6 + md * 2 + pi,
          // Spread the 12 groups across ~4 days within each matchday window.
          kickoff: iso(MD_BASE[md], Math.floor(gi / 3), KICKOFF_HOURS[pi]),
          venueIndex: n % 16,
          homeCode: teams[h].code,
          awayCode: teams[a].code,
          homeSlot: null,
          awaySlot: null,
          homeScore: null,
          awayScore: null,
          homePens: null,
          awayPens: null,
          status: 'SCHEDULED',
        });
      });
    });
  });
  return matches;
}

// R32 slot ordering — 12 winners + 12 runners-up + 8 best thirds (T1..T8),
// paired sequentially. Internally consistent; not the official combination
// table (which fixes WHICH third-place group lands in WHICH slot).
const R32_SLOTS: string[] = [
  '1A', '2B', '1C', '2D', '1E', '2F', '1G', '2H',
  '1I', '2J', '1K', '2L', '1B', '2A', '1D', '2C',
  '1F', '2E', '1H', '2G', '1J', '2I', '1L', '2K',
  'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8',
];

interface StageSpec {
  stage: WcStage;
  count: number;
  base: string;
  spreadDays: number;
}

const KO_STAGES: StageSpec[] = [
  { stage: 'R32', count: 16, base: '2026-06-28', spreadDays: 6 },
  { stage: 'R16', count: 8, base: '2026-07-04', spreadDays: 4 },
  { stage: 'QF', count: 4, base: '2026-07-09', spreadDays: 3 },
  { stage: 'SF', count: 2, base: '2026-07-14', spreadDays: 2 },
  { stage: 'THIRD', count: 1, base: '2026-07-18', spreadDays: 1 },
  { stage: 'FINAL', count: 1, base: '2026-07-19', spreadDays: 1 },
];

function buildKnockoutMatches(startN: number): RawMatch[] {
  const matches: RawMatch[] = [];
  let n = startN;
  for (const spec of KO_STAGES) {
    for (let i = 0; i < spec.count; i += 1) {
      n += 1;
      // prevStage feeds the main chain; THIRD is fed by the two SF losers.
      const prev: Record<string, WcStage> = { R16: 'R32', QF: 'R16', SF: 'QF', FINAL: 'SF' };
      let homeSlot: string, awaySlot: string, homeFeed: string, awayFeed: string;
      if (spec.stage === 'R32') {
        homeSlot = homeFeed = R32_SLOTS[i * 2];
        awaySlot = awayFeed = R32_SLOTS[i * 2 + 1];
      } else if (spec.stage === 'THIRD') {
        homeSlot = awaySlot = 'Loser';
        homeFeed = 'L:SF:0';
        awayFeed = 'L:SF:1';
      } else {
        homeSlot = awaySlot = 'Winner';
        homeFeed = `W:${prev[spec.stage]}:${i * 2}`;
        awayFeed = `W:${prev[spec.stage]}:${i * 2 + 1}`;
      }
      matches.push({
        id: `M${String(n).padStart(3, '0')}`,
        stage: spec.stage,
        group: null,
        slot: i,
        kickoff: iso(spec.base, Math.floor((i * spec.spreadDays) / spec.count), 19),
        venueIndex: n % 16,
        homeCode: null,
        awayCode: null,
        homeSlot,
        awaySlot,
        homeFeed,
        awayFeed,
        homeScore: null,
        awayScore: null,
        homePens: null,
        awayPens: null,
        status: 'SCHEDULED',
      });
    }
  }
  return matches;
}

/** The complete fixed fixture skeleton, no results filled in. */
export function buildSchedule(): RawMatch[] {
  const group = buildGroupMatches();
  const knockout = buildKnockoutMatches(group.length);
  return [...group, ...knockout];
}

/**
 * Canonical knockout slot wiring (R32 → final) — the part of the schedule that
 * encodes WHICH group qualifier feeds WHICH R32 match. Live feeds don't carry
 * this (their knockout fixtures are structure-less until the draw), so the live
 * provider overlays these slots onto the real knockout fixtures. 72 = the fixed
 * number of group matches, used only to keep ids unique.
 */
export function buildKnockoutSkeleton(): RawMatch[] {
  return buildKnockoutMatches(72);
}
