// The 48 qualified teams for the FIFA World Cup 2026, mirroring
// scripts/seeds/01_teams.sql (the canonical list from the Dec 5 2025 draw).
// Kept in sync by hand — this module is the source of truth for the standings
// feature's team metadata (the DB `teams` table is the album catalog's copy).

export interface WcTeam {
  code: string; // FIFA 3-letter code, the identity used everywhere
  name: string;
  group: string; // 'A'..'L'
}

export const WC_TEAMS: WcTeam[] = [
  // Group A
  { code: 'MEX', name: 'Mexico', group: 'A' },
  { code: 'CZE', name: 'Czech Republic', group: 'A' },
  { code: 'RSA', name: 'South Africa', group: 'A' },
  { code: 'KOR', name: 'South Korea', group: 'A' },
  // Group B
  { code: 'CAN', name: 'Canada', group: 'B' },
  { code: 'BIH', name: 'Bosnia & Herzegovina', group: 'B' },
  { code: 'QAT', name: 'Qatar', group: 'B' },
  { code: 'SUI', name: 'Switzerland', group: 'B' },
  // Group C
  { code: 'ESP', name: 'Spain', group: 'C' },
  { code: 'ALG', name: 'Algeria', group: 'C' },
  { code: 'JPN', name: 'Japan', group: 'C' },
  { code: 'NZL', name: 'New Zealand', group: 'C' },
  // Group D
  { code: 'USA', name: 'USA', group: 'D' },
  { code: 'PAR', name: 'Paraguay', group: 'D' },
  { code: 'AUS', name: 'Australia', group: 'D' },
  { code: 'TUR', name: 'Türkiye', group: 'D' },
  // Group E
  { code: 'ARG', name: 'Argentina', group: 'E' },
  { code: 'ECU', name: 'Ecuador', group: 'E' },
  { code: 'SWE', name: 'Sweden', group: 'E' },
  { code: 'CIV', name: 'Ivory Coast', group: 'E' },
  // Group F
  { code: 'GER', name: 'Germany', group: 'F' },
  { code: 'SCO', name: 'Scotland', group: 'F' },
  { code: 'CUW', name: 'Curaçao', group: 'F' },
  { code: 'IRN', name: 'Iran', group: 'F' },
  // Group G
  { code: 'BEL', name: 'Belgium', group: 'G' },
  { code: 'EGY', name: 'Egypt', group: 'G' },
  { code: 'JOR', name: 'Jordan', group: 'G' },
  { code: 'HAI', name: 'Haiti', group: 'G' },
  // Group H
  { code: 'POR', name: 'Portugal', group: 'H' },
  { code: 'COL', name: 'Colombia', group: 'H' },
  { code: 'UZB', name: 'Uzbekistan', group: 'H' },
  { code: 'COD', name: 'Congo DR', group: 'H' },
  // Group I
  { code: 'FRA', name: 'France', group: 'I' },
  { code: 'NOR', name: 'Norway', group: 'I' },
  { code: 'SEN', name: 'Senegal', group: 'I' },
  { code: 'IRQ', name: 'Iraq', group: 'I' },
  // Group J
  { code: 'ENG', name: 'England', group: 'J' },
  { code: 'NED', name: 'Netherlands', group: 'J' },
  { code: 'GHA', name: 'Ghana', group: 'J' },
  { code: 'TUN', name: 'Tunisia', group: 'J' },
  // Group K
  { code: 'BRA', name: 'Brazil', group: 'K' },
  { code: 'MAR', name: 'Morocco', group: 'K' },
  { code: 'CRO', name: 'Croatia', group: 'K' },
  { code: 'KSA', name: 'Saudi Arabia', group: 'K' },
  // Group L
  { code: 'URU', name: 'Uruguay', group: 'L' },
  { code: 'AUT', name: 'Austria', group: 'L' },
  { code: 'PAN', name: 'Panama', group: 'L' },
  { code: 'CPV', name: 'Cape Verde', group: 'L' },
];

export const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const;

const BY_CODE = new Map(WC_TEAMS.map((t) => [t.code, t]));

export function teamByCode(code: string): WcTeam | undefined {
  return BY_CODE.get(code);
}

export function teamsInGroup(group: string): WcTeam[] {
  return WC_TEAMS.filter((t) => t.group === group);
}
