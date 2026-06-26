// Analytic projected-opponent fallback. The Monte Carlo forecast yields rich
// opponent distributions for any team that reaches the knockouts in the
// simulations — but a team that almost never qualifies can come back empty.
// This guarantees a non-empty answer for ANY team that can still mathematically
// advance, by reading its potential R32 opponents straight off the bracket
// structure: whichever slot sits opposite this team's group slot (1G / 2G).

import { ratingFor } from './ratings.js';
import type { WcGroupStanding, WcMatch, WcProjectedOpponent } from './types.js';

function candidatesForSlot(
  side: { code: string | null; name: string | null; placeholder: string | null },
  standings: WcGroupStanding[],
): { code: string; name: string }[] {
  if (side.code) return [{ code: side.code, name: side.name ?? side.code }];
  const ph = side.placeholder ?? '';
  const gm = /^([12])([A-L])$/.exec(ph);
  if (gm) {
    const rank = Number(gm[1]);
    const grp = standings.find((s) => s.group === gm[2]);
    const row = grp?.rows.find((r) => r.rank === rank);
    return row ? [{ code: row.code, name: row.name }] : [];
  }
  if (/^T\d$/.test(ph)) {
    // Best-thirds pool: every group's 3rd-placed team still in contention.
    return standings
      .map((s) => s.rows.find((r) => r.rank === 3 && r.qualification !== 'ELIMINATED'))
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
      .map((r) => ({ code: r.code, name: r.name }));
  }
  return [];
}

/**
 * analyticR32Opponents — the set of teams `code` (in `group`) could meet in the
 * Round of 32, derived from the bracket. Returned as a single R32 entry with
 * candidates ordered strongest-first and a uniform probability (these are
 * possibilities, not a simulated distribution). Empty only if the team has no
 * R32 slot at all.
 */
export function analyticR32Opponents(
  code: string,
  group: string,
  bracket: WcMatch[],
  standings: WcGroupStanding[],
): WcProjectedOpponent[] {
  const ours = (s: WcMatch['home']) =>
    s.code === code || s.placeholder === `1${group}` || s.placeholder === `2${group}`;

  const found = new Map<string, string>();
  for (const m of bracket.filter((x) => x.stage === 'R32')) {
    const opp = ours(m.home) ? m.away : ours(m.away) ? m.home : null;
    if (!opp) continue;
    for (const c of candidatesForSlot(opp, standings)) {
      if (c.code !== code) found.set(c.code, c.name);
    }
  }
  if (found.size === 0) return [];

  const opponents = [...found.entries()]
    .map(([c, name]) => ({ code: c, name }))
    .sort((a, b) => ratingFor(b.code) - ratingFor(a.code))
    .slice(0, 6)
    .map((o, _i, arr) => ({ ...o, prob: Math.round((1 / arr.length) * 1000) / 1000 }));

  return [{ stage: 'R32', opponents }];
}
