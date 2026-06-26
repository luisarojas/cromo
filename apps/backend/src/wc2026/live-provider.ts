// football-data.org normalizer. Maps their /competitions/WC payloads to our
// shapes. Only reached when WC_API_KEY !== 'mock'. Network/shape errors bubble
// to the service, which falls back to mock so a provider outage never 500s the
// page. Verified against the live v4 API: matches carry stage/group/venue/score;
// /competitions/WC/teams returns all 48 teams with a 26-man `squad` inline
// (player { name, position, dateOfBirth } — there is NO club field on the
// free tier, so squads carry name/position/age only).

import { clubFor } from './player-clubs.js';
import { teamsFromMatches } from './structure.js';
import { teamByCode, WC_TEAMS } from './teams.js';
import { VENUES } from './venues.js';
import type { RawMatch, TeamMeta, WcMatchStatus, WcPlayer, WcStage } from './types.js';

const FD_BASE = 'https://api.football-data.org/v4';

export type Squads = Record<string, WcPlayer[]>;

// football-data uses verbose position strings ("Centre-Back", "Right Winger",
// "Goalkeeper", …); collapse to GK/DF/MF/FW.
function normalizePosition(pos: string | null | undefined): string {
  const p = (pos ?? '').toLowerCase();
  if (p.includes('keeper')) return 'GK';
  if (p.includes('back') || p.includes('defen')) return 'DF';
  if (p.includes('midfield')) return 'MF';
  if (p.includes('forward') || p.includes('winger') || p.includes('offen') || p.includes('strik') || p.includes('attack')) return 'FW';
  return p ? p.slice(0, 2).toUpperCase() : '';
}

function ageFrom(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age -= 1;
  return age;
}

const STAGE_MAP: Record<string, WcStage> = {
  GROUP_STAGE: 'GROUP',
  LAST_32: 'R32',
  ROUND_OF_32: 'R32',
  LAST_16: 'R16',
  ROUND_OF_16: 'R16',
  QUARTER_FINALS: 'QF',
  QUARTER_FINAL: 'QF',
  SEMI_FINALS: 'SF',
  SEMI_FINAL: 'SF',
  THIRD_PLACE: 'THIRD',
  FINAL: 'FINAL',
};

const NAME_TO_CODE = new Map(WC_TEAMS.map((t) => [t.name.toLowerCase(), t.code]));

function statusOf(s: string): WcMatchStatus {
  if (s === 'FINISHED' || s === 'AWARDED') return 'FINISHED';
  if (s === 'IN_PLAY' || s === 'PAUSED') return 'LIVE';
  return 'SCHEDULED';
}

function codeOf(team: { tla?: string | null; name?: string | null }): string | null {
  if (team.tla && teamByCode(team.tla)) return team.tla;
  if (team.name) return NAME_TO_CODE.get(team.name.toLowerCase()) ?? null;
  return null;
}

function venueIndexOf(name: string | null | undefined): number {
  if (!name) return 0;
  const i = VENUES.findIndex(
    (v) => v.stadium.toLowerCase() === name.toLowerCase() || name.toLowerCase().includes(v.city.toLowerCase()),
  );
  return i >= 0 ? i : 0;
}

interface FdMatch {
  id: number;
  utcDate: string;
  status: string;
  stage: string;
  group?: string | null;
  venue?: string | null;
  homeTeam: { tla?: string | null; name?: string | null };
  awayTeam: { tla?: string | null; name?: string | null };
  score?: { fullTime?: { home: number | null; away: number | null }; penalties?: { home: number | null; away: number | null } };
}

interface FdTeam {
  tla?: string | null;
  name?: string | null;
  squad?: { name: string; position?: string | null; dateOfBirth?: string | null }[];
}

async function fdGet<T>(path: string, apiKey: string): Promise<T> {
  const res = await fetch(`${FD_BASE}${path}`, {
    headers: { 'X-Auth-Token': apiKey },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`football-data ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  return res.json() as Promise<T>;
}

/** Current 26-man squads per team code, straight from the live feed. */
export async function fetchLiveSquads(apiKey: string): Promise<Squads> {
  const body = await fdGet<{ teams?: FdTeam[] }>('/competitions/WC/teams', apiKey);
  const squads: Squads = {};
  for (const t of body.teams ?? []) {
    const code = codeOf(t);
    if (!code || !t.squad) continue;
    squads[code] = t.squad.map((p) => ({
      name: p.name,
      position: normalizePosition(p.position),
      age: ageFrom(p.dateOfBirth),
      club: clubFor(p.name, code),
    }));
  }
  return squads;
}

export async function fetchLiveMatches(apiKey: string): Promise<{ matches: RawMatch[]; teams: TeamMeta[] }> {
  const body = await fdGet<{ matches?: FdMatch[] }>('/competitions/WC/matches', apiKey);
  const raw = body.matches ?? [];

  // Build a code → display name map from the feed itself so team names come
  // from the provider, not a static seed.
  const names = new Map<string, string>();
  const matches = raw.map((m, i): RawMatch => {
    const stage = STAGE_MAP[m.stage] ?? 'GROUP';
    const ft = m.score?.fullTime;
    const pens = m.score?.penalties;
    const homeCode = codeOf(m.homeTeam);
    const awayCode = codeOf(m.awayTeam);
    if (homeCode && m.homeTeam.name) names.set(homeCode, m.homeTeam.name);
    if (awayCode && m.awayTeam.name) names.set(awayCode, m.awayTeam.name);
    return {
      id: `M${String(i + 1).padStart(3, '0')}`,
      stage,
      group: m.group ? m.group.replace(/GROUP[_\s]?/i, '').trim().toUpperCase() : null,
      slot: i,
      kickoff: m.utcDate,
      venueIndex: venueIndexOf(m.venue),
      homeCode,
      awayCode,
      homeSlot: null,
      awaySlot: null,
      homeScore: ft?.home ?? null,
      awayScore: ft?.away ?? null,
      homePens: pens?.home ?? null,
      awayPens: pens?.away ?? null,
      status: statusOf(m.status),
    };
  });

  // NOTE: we deliberately do NOT fabricate the knockout bracket. football-data
  // returns knockout fixtures with null teams until the post-group-stage draw,
  // so the displayed bracket stays TBD until the feed has real teams. The
  // forecast simulates its own canonical skeleton internally (see forecast.ts).

  // Group membership is derived from the real fixtures — the authoritative
  // source — so a stale static roster can never put a team in the wrong group.
  return { matches, teams: teamsFromMatches(matches, names) };
}
