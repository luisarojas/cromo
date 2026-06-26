// API-Football (api-sports.io v3) normalizer. Selected when
// WC_DATA_PROVIDER=api-football. Richer than football-data: fixtures carry the
// real knockout bracket, /standings gives group letters, and team match history
// is queryable (for a true past-year strength rating). Reached only when
// WC_API_KEY !== 'mock'.
//
// ⚠️ UNVERIFIED against a live key. Shapes follow the documented v3 API; the
// team-name→FIFA-code resolver and the round→stage labels are the most likely
// things to need tuning once a real response is available. Errors bubble to the
// service, which falls back to mock so the page never 500s.

import { WC_TEAMS } from './teams.js';
import { VENUES } from './venues.js';
import type { RawMatch, TeamMeta, WcMatchStatus, WcPlayer, WcStage } from './types.js';

const BASE = 'https://v3.football.api-sports.io';
const LEAGUE_WORLD_CUP = 1;
const SEASON = 2026;

// ─── team name → FIFA code resolution ───────────────────────────────────────
function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
}
const ALIASES: Record<string, string> = {
  korearepublic: 'KOR', southkorea: 'KOR', unitedstates: 'USA', usa: 'USA',
  iriran: 'IRN', iran: 'IRN', cotedivoire: 'CIV', ivorycoast: 'CIV',
  czechia: 'CZE', czechrepublic: 'CZE', holland: 'NED', netherlands: 'NED',
  bosniaandherzegovina: 'BIH', drcongo: 'COD', congodr: 'COD',
  caboverde: 'CPV', capeverde: 'CPV', curacao: 'CUW', turkey: 'TUR', turkiye: 'TUR',
  saudiarabia: 'KSA', southafrica: 'RSA',
};
const BY_NORM_NAME = new Map(WC_TEAMS.map((t) => [norm(t.name), t.code]));

function resolveCode(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = norm(name);
  return BY_NORM_NAME.get(n) ?? ALIASES[n] ?? null;
}

// ─── round / status mapping ─────────────────────────────────────────────────
function stageOf(round: string): WcStage {
  const r = round.toLowerCase();
  if (r.includes('group')) return 'GROUP';
  if (r.includes('32')) return 'R32';
  if (r.includes('16')) return 'R16';
  if (r.includes('quarter')) return 'QF';
  if (r.includes('semi')) return 'SF';
  if (r.includes('3rd') || r.includes('third')) return 'THIRD';
  if (r.includes('final')) return 'FINAL';
  return 'GROUP';
}
function statusOf(short: string): WcMatchStatus {
  if (['FT', 'AET', 'PEN'].includes(short)) return 'FINISHED';
  if (['NS', 'TBD', 'PST', 'CANC'].includes(short)) return 'SCHEDULED';
  return 'LIVE';
}
function venueIndexOf(name?: string | null, city?: string | null): number {
  const i = VENUES.findIndex(
    (v) =>
      (name && v.stadium.toLowerCase() === name.toLowerCase()) ||
      (city && v.city.toLowerCase().includes(city.toLowerCase())),
  );
  return i >= 0 ? i : 0;
}

async function apiGet<T>(path: string, key: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'x-apisports-key': key },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`api-football ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  const body = (await res.json()) as { errors?: unknown; response?: T };
  if (body.errors && Array.isArray(body.errors) ? body.errors.length : body.errors && Object.keys(body.errors).length) {
    throw new Error(`api-football error: ${JSON.stringify(body.errors)}`);
  }
  return body.response as T;
}

interface AfFixture {
  fixture: { id: number; date: string; venue?: { name?: string | null; city?: string | null }; status?: { short?: string } };
  league: { round: string };
  teams: { home: { id: number; name: string }; away: { id: number; name: string } };
  goals: { home: number | null; away: number | null };
  score?: { penalty?: { home: number | null; away: number | null } };
}
interface AfStandingRow {
  rank: number;
  team: { id: number; name: string };
  group: string;
}


/** Group letter per team code, from /standings (which carries "Group A" etc.). */
async function fetchGroups(key: string): Promise<Map<string, string>> {
  const resp = await apiGet<{ league?: { standings?: AfStandingRow[][] } }[]>(
    `/standings?league=${LEAGUE_WORLD_CUP}&season=${SEASON}`,
    key,
  );
  const byCode = new Map<string, string>();
  for (const block of resp?.[0]?.league?.standings ?? []) {
    for (const row of block) {
      const code = resolveCode(row.team.name);
      const letter = (row.group.match(/group\s+([a-l])/i)?.[1] ?? '').toUpperCase();
      if (code && letter) byCode.set(code, letter);
    }
  }
  return byCode;
}

export async function fetchApiFootballData(
  key: string,
): Promise<{ matches: RawMatch[]; teams: TeamMeta[]; squads: Record<string, WcPlayer[]> }> {
  const [fixtures, groupOf] = await Promise.all([
    apiGet<AfFixture[]>(`/fixtures?league=${LEAGUE_WORLD_CUP}&season=${SEASON}`, key),
    fetchGroups(key).catch(() => new Map<string, string>()),
  ]);

  const names = new Map<string, string>();
  const matches: RawMatch[] = fixtures.map((f, i) => {
    const stage = stageOf(f.league.round);
    const homeCode = resolveCode(f.teams.home.name);
    const awayCode = resolveCode(f.teams.away.name);
    if (homeCode) names.set(homeCode, f.teams.home.name);
    if (awayCode) names.set(awayCode, f.teams.away.name);
    const group = stage === 'GROUP' ? (homeCode && groupOf.get(homeCode)) || (awayCode && groupOf.get(awayCode)) || null : null;
    return {
      id: `M${String(i + 1).padStart(3, '0')}`,
      stage,
      group,
      slot: i,
      kickoff: f.fixture.date,
      venueIndex: venueIndexOf(f.fixture.venue?.name, f.fixture.venue?.city),
      homeCode,
      awayCode,
      homeSlot: null,
      awaySlot: null,
      homeScore: f.goals.home,
      awayScore: f.goals.away,
      homePens: f.score?.penalty?.home ?? null,
      awayPens: f.score?.penalty?.away ?? null,
      status: statusOf(f.fixture.status?.short ?? 'NS'),
    };
  });

  // No knockout structure is fabricated — teams come only from the feed (real
  // after the draw, TBD before). The forecast simulates its own skeleton.

  // Team registry from the group fixtures (group membership = the feed's truth).
  const teams: TeamMeta[] = [];
  const seen = new Set<string>();
  for (const m of matches) {
    if (m.stage !== 'GROUP' || !m.group) continue;
    for (const code of [m.homeCode, m.awayCode]) {
      if (code && !seen.has(code)) {
        seen.add(code);
        teams.push({ code, name: names.get(code) ?? code, group: m.group });
      }
    }
  }

  // Squads are intentionally NOT fetched here: /players/squads is one call per
  // team (48), which blows the free-tier daily budget at the 9-min refresh
  // cadence. Wire a separately-cached squad fetch (or a paid tier) before
  // enabling — until then live mode shows the curated fallback.
  return { matches, teams, squads: {} };
}
