import { apiFetch } from '../apiClient';

// Wire types for the WC 2026 standings feature. These mirror the backend
// `apps/backend/src/wc2026/types.ts` shapes (camelCase over the wire).

export type WcStage = 'GROUP' | 'R32' | 'R16' | 'QF' | 'SF' | 'THIRD' | 'FINAL';
export type WcMatchStatus = 'SCHEDULED' | 'LIVE' | 'FINISHED';
export type GroupQualification = 'CLINCHED' | 'ELIMINATED' | 'ALIVE';

export interface WcMatchSide {
  code: string | null;
  name: string | null;
  placeholder: string | null;
  /** Structured provenance ("1A", "3ABCDF", "W:R32:0") for resolving the teams
   * that could still fill this slot. Null once `code` is known. */
  feed: string | null;
  score: number | null;
  pens: number | null;
}

export interface WcMatch {
  id: string;
  stage: WcStage;
  group: string | null;
  /** Bracket position within the stage (0-based) — finds the match a
   * "W:STAGE:n" feed points at. */
  slot: number;
  kickoff: string;
  city: string;
  stadium: string;
  status: WcMatchStatus;
  home: WcMatchSide;
  away: WcMatchSide;
  winnerCode: string | null;
  favourite: { code: string; prob: number } | null;
}

export interface WcStandingRow {
  code: string;
  name: string;
  rank: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  qualification: GroupQualification;
  minRank: number;
  maxRank: number;
  guaranteedRank: number | null;
  lastAppearance: number | null;
}

export interface WcGroupStanding {
  group: string;
  rows: WcStandingRow[];
}

export interface WcOverview {
  updatedAt: string;
  dataSource: 'live' | 'sample';
  /** True once the tournament is over and the standings are frozen. */
  complete: boolean;
  /** FIFA code of the tournament winner (final decided), else null. */
  champion: string | null;
  groups: WcGroupStanding[];
  groupMatches: WcMatch[];
  bracket: WcMatch[];
  championOdds: Record<string, number>;
}

export interface WcPlayer {
  name: string;
  position: string;
  age: number | null;
  club: string | null;
}

export interface WcProjectedOpponent {
  stage: WcStage;
  opponents: { code: string; name: string; prob: number }[];
}

export interface WcTeamDetail {
  code: string;
  name: string;
  group: string;
  standing: WcStandingRow;
  groupTable: WcStandingRow[];
  reachFinalProb: number;
  championProb: number;
  projectedOpponents: WcProjectedOpponent[];
  results: WcMatch[];
  upcoming: WcMatch[];
  players: WcPlayer[];
  history: { appearances: number; lastAppearance: number | null; titles: number };
}

export function fetchWcOverview(tournament: string): Promise<WcOverview> {
  return apiFetch<WcOverview>(`/api/v1/tournaments/${encodeURIComponent(tournament)}/overview`);
}

export function fetchWcTeam(tournament: string, code: string): Promise<WcTeamDetail> {
  return apiFetch<WcTeamDetail>(
    `/api/v1/tournaments/${encodeURIComponent(tournament)}/teams/${encodeURIComponent(code)}`,
  );
}

// Pure display helpers live in the standings feature folder so they fall under
// the frontend coverage include[] (this api barrel is excluded). Re-exported
// here so call sites can keep importing them from '@/lib/api'.
export {
  STAGE_LABELS,
  KNOCKOUT_ORDER,
  formatKickoffET,
  formatDayET,
  dateSpanET,
  pct,
  shortPlaceholder,
  placeholderCandidates,
} from '@/app/guide/standings/[tournament]/format';
