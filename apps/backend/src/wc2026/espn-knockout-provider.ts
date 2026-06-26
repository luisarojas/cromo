// ESPN knockout-bracket source. football-data lags on the post-group-stage draw
// (returns null teams), but ESPN's free hidden API has the OFFICIAL 2026 bracket:
// real teams once known (FIFA-code abbreviations), official slot descriptors
// before then (group winner/runner "1F"/"2E", the third-place combination table
// "Third Place Group A/B/C/D/F"), AND the tree wiring (later rounds reference
// their feeder match, e.g. "RD32 W1" = winner of Round-of-32 match 1). We use
// ESPN ONLY for the knockout; groups/standings/squads stay on football-data.
//
// Unofficial endpoint, no key. Failures degrade to football-data's (TBD)
// knockout, so the page never breaks.

import { teamByCode } from './teams.js';
import { VENUES } from './venues.js';
import type { RawMatch, WcMatchStatus, WcStage } from './types.js';

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
// The fixed 2026 knockout shape, in chronological order.
const STAGE_LAYOUT: [WcStage, number][] = [
  ['R32', 16],
  ['R16', 8],
  ['QF', 4],
  ['SF', 2],
  ['THIRD', 1],
  ['FINAL', 1],
];

interface EspnTeam {
  abbreviation?: string;
  displayName?: string;
  shortDisplayName?: string;
}
interface EspnCompetitor {
  homeAway: 'home' | 'away';
  score?: string | number;
  team?: EspnTeam;
}
interface EspnEvent {
  id?: string;
  date: string;
  competitions?: {
    venue?: { fullName?: string };
    status?: { type?: { state?: string; completed?: boolean } };
    competitors?: EspnCompetitor[];
  }[];
}

function statusOf(state: string | undefined, completed: boolean | undefined): WcMatchStatus {
  if (completed || state === 'post') return 'FINISHED';
  if (state === 'in') return 'LIVE';
  return 'SCHEDULED';
}

function venueIndexOf(name?: string): number {
  if (!name) return 0;
  const i = VENUES.findIndex((v) => v.stadium.toLowerCase() === name.toLowerCase());
  return i >= 0 ? i : 0;
}

function realCode(abbr?: string): string | null {
  if (!abbr) return null;
  const code = abbr.toUpperCase();
  return teamByCode(code) ? code : null;
}

// Resolve one ESPN competitor → { code, slot (display), feed (forecast) }.
function parseSide(team: EspnTeam | undefined): { code: string | null; slot: string | null; feed: string | null } {
  const abbr = (team?.abbreviation ?? '').toUpperCase();
  const code = realCode(abbr);
  if (code) return { code, slot: null, feed: null };

  // Group winner/runner: "1F", "2E".
  if (/^[12][A-L]$/.test(abbr)) return { code: null, slot: abbr, feed: abbr };
  // Third place: name carries the group combination → "3ABCDF".
  if (abbr === '3RD' || /third place/i.test(team?.displayName ?? '')) {
    const letters = (team?.displayName ?? '').match(/group\s+([a-l](?:\/[a-l])*)/i)?.[1] ?? '';
    const groups = letters.split('/').map((g) => g.toUpperCase()).join('');
    return { code: null, slot: groups ? `3${groups}` : '3', feed: groups ? `3${groups}` : '3' };
  }
  // Winner/loser of an earlier match. The match number lives in the
  // abbreviation ("QFW1", "RD16 W1") or shortDisplayName ("RD32 W1"); we try
  // both (1-based → our slots are 0-based).
  const fed = (n: string, stage: WcStage, kind: 'W' | 'L'): { code: null; slot: string; feed: string } => ({
    code: null,
    slot: kind === 'W' ? 'Winner' : 'Loser',
    feed: `${kind}:${stage}:${Number(n) - 1}`,
  });
  for (const cand of [abbr, team?.shortDisplayName ?? '']) {
    let m: RegExpExecArray | null;
    if ((m = /^RD32 ?W ?(\d+)/i.exec(cand))) return fed(m[1], 'R32', 'W');
    if ((m = /^RD16 ?W ?(\d+)/i.exec(cand))) return fed(m[1], 'R16', 'W');
    if ((m = /^SF ?L ?(\d+)/i.exec(cand))) return fed(m[1], 'SF', 'L');
    if ((m = /^SF ?W ?(\d+)/i.exec(cand))) return fed(m[1], 'SF', 'W');
    if ((m = /^Q[FW]*\s*W?\s*(\d+)/i.exec(cand))) return fed(m[1], 'QF', 'W'); // QFW1, QW4
  }
  return { code: null, slot: 'TBD', feed: null };
}

export async function fetchEspnKnockout(): Promise<RawMatch[]> {
  const res = await fetch(`${ESPN}?dates=20260628-20260720`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (CromoWC2026)' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`espn ${res.status}`);
  const body = (await res.json()) as { events?: EspnEvent[] };
  const byDate = (body.events ?? []).slice().sort((a, b) => +new Date(a.date) - +new Date(b.date));

  // Stage by chronological position (fixed 16/8/4/2/1/1 layout).
  const stageFor: WcStage[] = [];
  for (const [stage, count] of STAGE_LAYOUT) for (let k = 0; k < count; k += 1) stageFor.push(stage);
  const withStage = byDate.map((ev, i) => ({ ev, stage: stageFor[i] ?? 'R32' }));

  // Per-stage match number = ESPN id order (this is what feed refs like
  // "RD32 W1" point at). slot carries that 0-based number.
  const slotByEventId = new Map<string, number>();
  for (const stage of new Set(withStage.map((w) => w.stage))) {
    withStage
      .filter((w) => w.stage === stage)
      .sort((a, b) => Number(a.ev.id ?? 0) - Number(b.ev.id ?? 0))
      .forEach((w, idx) => slotByEventId.set(w.ev.id ?? `${w.stage}${idx}`, idx));
  }

  return withStage.map(({ ev, stage }, i): RawMatch => {
    const comp = ev.competitions?.[0];
    const home = parseSide(comp?.competitors?.find((c) => c.homeAway === 'home')?.team);
    const away = parseSide(comp?.competitors?.find((c) => c.homeAway === 'away')?.team);
    const status = statusOf(comp?.status?.type?.state, comp?.status?.type?.completed);
    const finished = status === 'FINISHED';
    const scoreOf = (ha: 'home' | 'away') => {
      const c = comp?.competitors?.find((x) => x.homeAway === ha);
      return finished && c?.score != null ? Number(c.score) : null;
    };
    return {
      id: `K${String(i + 1).padStart(3, '0')}`,
      stage,
      group: null,
      slot: slotByEventId.get(ev.id ?? '') ?? i,
      kickoff: ev.date,
      venueIndex: venueIndexOf(comp?.venue?.fullName),
      homeCode: home.code,
      awayCode: away.code,
      homeSlot: home.slot,
      awaySlot: away.slot,
      homeFeed: home.feed,
      awayFeed: away.feed,
      homeScore: scoreOf('home'),
      awayScore: scoreOf('away'),
      homePens: null,
      awayPens: null,
      status,
    };
  });
}
