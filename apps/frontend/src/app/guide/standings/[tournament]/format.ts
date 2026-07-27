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
 * "T3") are already short and meaningful. A winner/loser feed ("W:R32:0",
 * "L:SF:1") renders as "R32 W1" / "SF L2" so each later-round slot is
 * distinguishable; the old "Winner R32#1" template labels collapse to a plain
 * "Winner" / "Loser".
 */
export function shortPlaceholder(placeholder: string | null): string {
  if (!placeholder) return '—';
  if (/^[12][A-L]$/.test(placeholder) || /^T\d$/.test(placeholder)) return placeholder;
  if (/^3[A-L]+$/.test(placeholder) || placeholder === '3') return '3rd'; // best-third slot
  const wl = /^([WL]):(\w+):(\d+)$/.exec(placeholder);
  if (wl) return `${wl[2]} ${wl[1]}${Number(wl[3]) + 1}`; // "W:R32:0" → "R32 W1"
  if (/^winner/i.test(placeholder)) return 'Winner';
  if (/^loser/i.test(placeholder)) return 'Loser';
  return placeholder;
}

/**
 * The teams that could REALISTICALLY fill a bracket slot.
 *
 * Group/third slots use each team's possible final-rank range: "1A" → group A
 * teams that can still finish 1st; "2L" → group L teams that can finish 2nd;
 * "3ABCDF"/"T3" → teams from those groups that can still finish 3rd. A team
 * locked out of that position (or eliminated) is excluded.
 *
 * Later-round slots carry a "W:STAGE:n" / "L:STAGE:n" feed (winner/loser of an
 * earlier match): the candidates are the union of the teams that could fill
 * EITHER side of that feeding match, resolved recursively down the tree. So a
 * Round-of-16 slot lists everyone who could win its two Round-of-32 matches,
 * a quarter-final lists the four R32 matches behind it, and so on.
 */
export function placeholderCandidates(
  feed: string | null,
  groups: WcGroupStanding[],
  bracket: WcMatch[] = [],
  seen: Set<string> = new Set(),
): { code: string; name: string }[] {
  if (!feed) return [];
  const canFinish = (r: WcGroupStanding['rows'][number], rank: number) =>
    r.qualification !== 'ELIMINATED' && r.minRank <= rank && r.maxRank >= rank;

  const gm = /^([12])([A-L])$/.exec(feed);
  if (gm) {
    const rank = Number(gm[1]);
    const grp = groups.find((g) => g.group === gm[2]);
    return grp ? grp.rows.filter((r) => canFinish(r, rank)).map((r) => ({ code: r.code, name: r.name })) : [];
  }
  // ESPN third-place slot: "3ABCDF" = thirds of groups A,B,C,D,F. Mock uses "T#"
  // (any group's third). Either way, list teams that can still finish 3rd.
  const third = /^3([A-L]*)$/.exec(feed);
  if (third || /^T\d$/.test(feed)) {
    const onlyGroups = third && third[1] ? new Set(third[1].split('')) : null;
    return groups
      .filter((g) => !onlyGroups || onlyGroups.has(g.group))
      .flatMap((g) => g.rows.filter((r) => canFinish(r, 3)))
      .map((r) => ({ code: r.code, name: r.name }));
  }
  // Winner/loser of an earlier match → everyone who could be in that match.
  const wl = /^[WL]:(\w+):(\d+)$/.exec(feed);
  if (wl) {
    const key = `${wl[1]}:${wl[2]}`;
    if (seen.has(key)) return []; // guard against a malformed cyclic feed
    seen.add(key);
    const m = bracket.find((b) => b.stage === wl[1] && b.slot === Number(wl[2]));
    if (!m) return [];
    const fromSide = (s: WcMatch['home']) =>
      s.code ? [{ code: s.code, name: s.name ?? s.code }] : placeholderCandidates(s.feed, groups, bracket, seen);
    const byCode = new Map<string, { code: string; name: string }>();
    for (const c of [...fromSide(m.home), ...fromSide(m.away)]) byCode.set(c.code, c);
    return [...byCode.values()];
  }
  return [];
}
