// Pure display helpers for the WC 2026 standings views. Kept out of the api
// module so they sit in the frontend coverage `include[]` (the api barrel is
// excluded). All time formatting is US Eastern, per the feature spec.

import type { WcGroupStanding, WcMatch, WcStage } from '@/lib/api/wc2026';

export const STAGE_LABELS: Record<WcStage, string> = {
  GROUP: 'Group stage',
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarter-final',
  SF: 'Semi-final',
  THIRD: 'Third place',
  FINAL: 'Final',
};

export const KNOCKOUT_ORDER: WcStage[] = ['R32', 'R16', 'QF', 'SF', 'FINAL'];

/** Kickoff formatted in US Eastern time, e.g. "Jun 24, 2:00 PM ET". */
export function formatKickoffET(iso: string): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${fmt.format(new Date(iso))} ET`;
}

/** Day-only ET label for grouping a round's matches, e.g. "Jun 24". */
export function formatDayET(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
}

/** Inclusive ET date span across a set of matches, e.g. "Jun 28 – Jul 3". */
export function dateSpanET(matches: WcMatch[]): string {
  if (matches.length === 0) return '';
  const sorted = [...matches].sort((a, b) => +new Date(a.kickoff) - +new Date(b.kickoff));
  const first = formatDayET(sorted[0].kickoff);
  const last = formatDayET(sorted[sorted.length - 1].kickoff);
  return first === last ? first : `${first} – ${last}`;
}

/** Format a 0..1 probability as a percentage, clamping the extremes. Exact 0
 * reads "0%" (e.g. an eliminated team) — only a small positive value is "<1%". */
export function pct(prob: number): string {
  if (prob <= 0) return '0%';
  if (prob < 0.01) return '<1%';
  if (prob >= 0.995) return '>99%';
  return `${Math.round(prob * 100)}%`;
}

/**
 * Concise label for an unresolved bracket slot. Group/third slots ("1A", "2B",
 * "T3") are already short and meaningful; the canonical "Winner R32#1" template
 * labels are noise to a viewer, so collapse them to "Winner" / "Loser".
 */
export function shortPlaceholder(placeholder: string | null): string {
  if (!placeholder) return '—';
  if (/^[12][A-L]$/.test(placeholder) || /^T\d$/.test(placeholder)) return placeholder;
  if (/^3[A-L]+$/.test(placeholder) || placeholder === '3') return '3rd'; // best-third slot
  if (/^winner/i.test(placeholder)) return 'Winner';
  if (/^loser/i.test(placeholder)) return 'Loser';
  return placeholder;
}

/**
 * The teams that could REALISTICALLY fill a group-position slot, using each
 * team's possible final-rank range. "1A" → group A teams that can still finish
 * 1st; "2L" → group L teams that can finish 2nd; "T3" → every group's teams that
 * can still finish 3rd (the best-thirds pool). A team locked out of that
 * position (or eliminated) is excluded. Returns [] for "winner of match" slots.
 */
export function placeholderCandidates(
  placeholder: string | null,
  groups: WcGroupStanding[],
): { code: string; name: string }[] {
  if (!placeholder) return [];
  const canFinish = (r: WcGroupStanding['rows'][number], rank: number) =>
    r.qualification !== 'ELIMINATED' && r.minRank <= rank && r.maxRank >= rank;

  const gm = /^([12])([A-L])$/.exec(placeholder);
  if (gm) {
    const rank = Number(gm[1]);
    const grp = groups.find((g) => g.group === gm[2]);
    return grp ? grp.rows.filter((r) => canFinish(r, rank)).map((r) => ({ code: r.code, name: r.name })) : [];
  }
  // ESPN third-place slot: "3ABCDF" = thirds of groups A,B,C,D,F. Mock uses "T#"
  // (any group's third). Either way, list teams that can still finish 3rd.
  const third = /^3([A-L]*)$/.exec(placeholder);
  if (third || /^T\d$/.test(placeholder)) {
    const onlyGroups = third && third[1] ? new Set(third[1].split('')) : null;
    return groups
      .filter((g) => !onlyGroups || onlyGroups.has(g.group))
      .flatMap((g) => g.rows.filter((r) => canFinish(r, 3)))
      .map((r) => ({ code: r.code, name: r.name }));
  }
  return [];
}
