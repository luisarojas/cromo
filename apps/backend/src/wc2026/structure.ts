// Derives the tournament's group structure from a team registry, so standings,
// the forecast, and the bracket all read group membership + names from ONE
// source — the registry the active provider supplied. In live mode that
// registry comes from the real fixtures; in mock mode from the static roster.
// Nothing downstream hard-codes which team is in which group.

import { WC_TEAMS } from './teams.js';
import type { TeamMeta } from './types.js';

export interface Structure {
  /** Group letters present in the feed, sorted (e.g. A..L). */
  letters: string[];
  /** Group letter → its teams, in feed order. */
  byGroup: Map<string, TeamMeta[]>;
  /** Team code → its group letter. */
  groupOf: Map<string, string>;
  /** Team code → display name, falling back to the code. */
  nameOf: (code: string) => string;
}

export function deriveStructure(teams: TeamMeta[] = WC_TEAMS): Structure {
  const byGroup = new Map<string, TeamMeta[]>();
  const groupOf = new Map<string, string>();
  const names = new Map<string, string>();
  for (const t of teams) {
    names.set(t.code, t.name);
    if (!t.group) continue;
    groupOf.set(t.code, t.group);
    const arr = byGroup.get(t.group) ?? [];
    arr.push(t);
    byGroup.set(t.group, arr);
  }
  return {
    letters: [...byGroup.keys()].sort(),
    byGroup,
    groupOf,
    nameOf: (code) => names.get(code) ?? code,
  };
}

/**
 * teamsFromMatches — build a registry purely from a match list, used by the
 * live provider: each group-stage fixture reveals two teams and their group.
 * `names` maps code → display name (provider-supplied).
 */
export function teamsFromMatches(
  matches: { stage: string; group: string | null; homeCode: string | null; awayCode: string | null }[],
  names: Map<string, string>,
): TeamMeta[] {
  const seen = new Map<string, TeamMeta>();
  for (const m of matches) {
    if (m.stage !== 'GROUP' || !m.group) continue;
    for (const code of [m.homeCode, m.awayCode]) {
      if (code && !seen.has(code)) seen.set(code, { code, name: names.get(code) ?? code, group: m.group });
    }
  }
  return [...seen.values()];
}
