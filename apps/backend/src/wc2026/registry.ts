// Tournament registry — makes "tournament" a first-class concept so the
// standings feature can run one tournament LIVE while others stay STATIC.
//
// Each finished tournament is served from a committed archive (see
// capture-archive.ts) rather than the live provider: results never change, and
// football-data's competition codes eventually roll over to the next edition,
// so polling would otherwise overwrite the old tournament with the new one.

import type { RawMatch, TeamMeta, WcPlayer } from './types.js';
import { WC_2026_ARCHIVE } from './archive/wc-2026.data.js';

/** A frozen tournament snapshot — the normalized provider output, captured once. */
export interface ArchiveData {
  matches: RawMatch[];
  teams: TeamMeta[];
  squads: Record<string, WcPlayer[]>;
}

export interface TournamentConfig {
  /** URL + cache-namespace key, e.g. 'wc-2026'. */
  slug: string;
  /** Display name, e.g. 'FIFA World Cup 2026'. */
  name: string;
  /** football-data competition code (live tournaments only). */
  competitionCode: string;
  /** 'live' polls the provider; 'complete' serves the committed archive. */
  status: 'live' | 'complete';
  /** Required when status === 'complete': the frozen snapshot. */
  loadArchive?: () => ArchiveData;
}

export const TOURNAMENTS: TournamentConfig[] = [
  {
    slug: 'wc-2026',
    name: 'FIFA World Cup 2026',
    competitionCode: 'WC',
    status: 'complete',
    loadArchive: () => WC_2026_ARCHIVE,
  },
  // Adding the next tournament while it's being played: register it as
  // `status: 'live'` with its football-data competition code (below). Nothing
  // else needs touching — the service namespaces its cache by slug, the routes
  // resolve it by slug, and the warm job picks up live tournaments
  // automatically. When it ends, capture its archive:
  //   tsx src/wc2026/capture-archive.ts wc-2030 WC
  // then flip it to `status: 'complete'` + `loadArchive`. WC 2026 is untouched.
  //
  // {
  //   slug: 'wc-2030',
  //   name: 'FIFA World Cup 2030',
  //   competitionCode: 'WC',
  //   status: 'live',
  // },
];

export function tournamentBySlug(slug: string): TournamentConfig | undefined {
  return TOURNAMENTS.find((t) => t.slug === slug);
}
