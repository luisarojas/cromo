// Normalized tournament shapes. Both the mock generator and the live
// football-data.org provider produce `RawMatch[]`; everything else
// (standings, bracket resolution, forecast) is derived from that single
// list so there is exactly one code path to test. Wire types (Wc* below) are
// what the routes emit — camelCase, passed through the global serializer
// unchanged since they are already plain JS objects.

/**
 * TeamMeta — a nation's identity for the standings feature. In live mode this
 * is built from the provider's fixtures (so group assignments and names are
 * whatever the feed says); in mock mode it comes from the static roster. Every
 * derivation (groups, names) flows from this, never from a hard-coded seed.
 */
export interface TeamMeta {
  code: string;
  name: string;
  group: string;
}

export type WcStage = 'GROUP' | 'R32' | 'R16' | 'QF' | 'SF' | 'THIRD' | 'FINAL';

export const KNOCKOUT_STAGES: WcStage[] = ['R32', 'R16', 'QF', 'SF', 'THIRD', 'FINAL'];

export type WcMatchStatus = 'SCHEDULED' | 'LIVE' | 'FINISHED';

/**
 * RawMatch — the lowest common denominator a data source must produce. Group
 * matches carry concrete team codes; knockout matches may carry `null` codes
 * with a `homeSlot`/`awaySlot` placeholder ("1A", "2B", "3rd", "W73") until the
 * feeding result is known.
 */
export interface RawMatch {
  id: string; // stable, e.g. "M01" .. "M104"
  stage: WcStage;
  group: string | null; // 'A'..'L' for GROUP, else null
  /** Bracket ordering slot within the stage (0-based), used to wire the tree. */
  slot: number;
  kickoff: string; // ISO 8601 UTC
  venueIndex: number;
  homeCode: string | null;
  awayCode: string | null;
  /** Display placeholder when the team isn't resolved yet (knockout only). */
  homeSlot: string | null;
  awaySlot: string | null;
  /**
   * Structured feed for the forecast's knockout simulation, encoding where this
   * side comes from: "1F"/"2E" (group winner/runner), "3ABCDF" (a best third
   * from those groups) or "T3" (mock), "W:R32:0" (winner of R32 match slot 0),
   * "L:SF:0" (loser of SF match slot 0). Null for group matches.
   */
  homeFeed?: string | null;
  awayFeed?: string | null;
  homeScore: number | null;
  awayScore: number | null;
  homePens: number | null; // shoot-out goals, knockout draws only
  awayPens: number | null;
  status: WcMatchStatus;
}

// ─── Wire shapes (route output) ─────────────────────────────────────────────

export interface WcMatchSide {
  code: string | null;
  name: string | null;
  placeholder: string | null; // "1A", "Winner M73", etc. when code is null
  /** Structured provenance ("1A", "3ABCDF", "W:R32:0") so the UI can resolve
   * the set of teams that could still fill this slot. Null once `code` is known. */
  feed: string | null;
  score: number | null;
  pens: number | null;
}

export interface WcMatch {
  id: string;
  stage: WcStage;
  group: string | null;
  /** Bracket position within the stage (0-based) — lets the UI find the match a
   * "W:STAGE:n" feed points at. */
  slot: number;
  kickoff: string;
  city: string;
  stadium: string;
  status: WcMatchStatus;
  home: WcMatchSide;
  away: WcMatchSide;
  winnerCode: string | null;
  /** Pre-match favourite by Elo, with single-match win probability (0..1). */
  favourite: { code: string; prob: number } | null;
}

export type GroupQualification = 'CLINCHED' | 'ELIMINATED' | 'ALIVE';

export interface WcStandingRow {
  code: string;
  name: string;
  rank: number; // 1-based within group
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  qualification: GroupQualification;
  /** Best and worst final group position the team can still reach (1–4). */
  minRank: number;
  maxRank: number;
  /** Certain final group position (1–4) if mathematically locked, else null. */
  guaranteedRank: number | null;
  /** Year of the team's most recent prior WC, or null for a debutant. */
  lastAppearance: number | null;
}

export interface WcGroupStanding {
  group: string;
  rows: WcStandingRow[];
}

export interface WcOverview {
  updatedAt: string;
  /** 'live' = real provider data; 'sample' = illustrative mock (no live key). */
  dataSource: 'live' | 'sample';
  groups: WcGroupStanding[];
  /** All group-stage fixtures (finished + upcoming), for the bracket view. */
  groupMatches: WcMatch[];
  bracket: WcMatch[];
  /** Per-team champion probability (0..1), keyed by FIFA code. */
  championOdds: Record<string, number>;
}

export interface WcPlayer {
  name: string;
  position: string; // normalized: GK / DF / MF / FW
  age: number | null;
  /** Current club, from the static Wikidata snapshot (null if unknown). */
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
  /** The team's full group table (all rows, ranked) for context. */
  groupTable: WcStandingRow[];
  reachFinalProb: number;
  championProb: number;
  projectedOpponents: WcProjectedOpponent[];
  /** This team's own fixtures — finished (with result) and upcoming. */
  results: WcMatch[];
  upcoming: WcMatch[];
  players: WcPlayer[];
  history: { appearances: number; lastAppearance: number | null; titles: number };
}
