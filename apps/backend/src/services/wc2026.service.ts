// Orchestration + caching for the WC 2026 standings feature. Provider selection
// mirrors scan.service.ts: WC_API_KEY === 'mock' (the default) short-circuits to
// the deterministic mock dataset — zero external calls in dev/test/CI. A live
// key routes through the WC_DATA_PROVIDER normalizer (api-football by default,
// football-data as the fallback option), with a mock fallback on any provider
// error so the page never hard-fails.
//
// Everything expensive (the Monte Carlo forecast) is computed once per refresh
// and cached under one bundle key via `singleflight`, so concurrent requests
// don't stampede the simulation.

import type { Redis } from 'ioredis';
import { env } from '../env.js';
import { singleflight } from './cache.js';
import { resolveBracket, toWireMatch } from '../wc2026/bracket.js';
import { runForecast, type Forecast } from '../wc2026/forecast.js';
import { historyFor } from '../wc2026/history.js';
import { buildMockData } from '../wc2026/mock-data.js';
import { fetchLiveMatches, fetchLiveSquads } from '../wc2026/live-provider.js';
import { fetchApiFootballData } from '../wc2026/api-football-provider.js';
import { fetchEspnKnockout } from '../wc2026/espn-knockout-provider.js';
import { playersFor } from '../wc2026/players.js';
import { analyticR32Opponents } from '../wc2026/projection.js';
import { computeStandings } from '../wc2026/standings.js';
import { buildStrength } from '../wc2026/strength.js';
import { deriveStructure } from '../wc2026/structure.js';
import { teamByCode } from '../wc2026/teams.js';
import { KNOCKOUT_STAGES } from '../wc2026/types.js';
import type {
  RawMatch,
  TeamMeta,
  WcMatch,
  WcGroupStanding,
  WcOverview,
  WcPlayer,
  WcProjectedOpponent,
  WcStage,
  WcTeamDetail,
} from '../wc2026/types.js';

const BUNDLE_KEY = 'wc2026:bundle:v1';
const BUNDLE_TTL = 600; // 10 min — matches the warm job cadence
// 20k sims keeps the long tail (sub-1% teams) stable to ~0.1% run-to-run; it
// costs ~1s and the result is cached for 10 min (warmed out-of-band), so the
// request path never pays it. Tests use far fewer for speed — they assert the
// champion-odds sum and ordering, which converge well before the tail does.
const SIMS = env.NODE_ENV === 'test' ? 600 : 20000;

export type WcDataSource = 'live' | 'sample';

type Squads = Record<string, WcPlayer[]>;

interface Bundle {
  updatedAt: string;
  dataSource: WcDataSource;
  standings: WcGroupStanding[];
  bracket: WcMatch[];
  /** Every fixture (group + knockout) in wire form, for per-team schedules. */
  allMatches: WcMatch[];
  squads: Squads;
  forecast: Forecast;
}

interface ProviderData {
  matches: RawMatch[];
  teams: TeamMeta[];
  squads: Squads;
  source: WcDataSource;
}

async function loadRawMatches(redis: Redis): Promise<ProviderData> {
  // Tests must never touch the live provider (rate limits, flakiness,
  // non-determinism) — force the deterministic mock regardless of ambient key.
  if (env.NODE_ENV === 'test' || env.WC_API_KEY === 'mock') {
    return { ...buildMockData(), source: 'sample' };
  }
  try {
    const data = await singleflight(redis, 'wc2026:raw:v1', BUNDLE_TTL, async () => {
      if (env.WC_DATA_PROVIDER === 'api-football') {
        return fetchApiFootballData(env.WC_API_KEY);
      }
      // football-data: group fixtures/standings + squads. football-data lags on
      // the knockout draw (null teams), so the knockout fixtures come from ESPN
      // (the official bracket); ESPN failure degrades to football-data's TBD
      // knockout. Squad failure degrades to empty squads independently.
      const matchData = await fetchLiveMatches(env.WC_API_KEY);
      const [squads, espnKnockout] = await Promise.all([
        fetchLiveSquads(env.WC_API_KEY).catch(() => ({}) as Squads),
        fetchEspnKnockout().catch(() => [] as RawMatch[]),
      ]);
      const groupMatches = matchData.matches.filter((m) => m.stage === 'GROUP');
      const knockout = espnKnockout.length ? espnKnockout : matchData.matches.filter((m) => m.stage !== 'GROUP');
      return { ...matchData, matches: [...groupMatches, ...knockout], squads };
    });
    return { ...data, source: 'live' };
  } catch {
    // Provider down → degrade to mock rather than 500 the page, but say so.
    return { ...buildMockData(), source: 'sample' };
  }
}

export function buildBundle(
  matches: RawMatch[],
  teams: TeamMeta[],
  squads: Squads = {},
  source: WcDataSource = 'sample',
): Bundle {
  const standings = computeStandings(matches, teams);
  const bracket = resolveBracket(matches, standings, teams);
  const forecast = runForecast(matches, { sims: SIMS, teams });

  // Hard invariant: a mathematically eliminated team has ZERO chance of
  // reaching the final or winning. The simulation already almost never advances
  // them, but force exact 0 so the UI never shows a misleading "<1%".
  for (const row of standings.flatMap((g) => g.rows)) {
    if (row.qualification === 'ELIMINATED') {
      forecast.championOdds[row.code] = 0;
      forecast.reachFinalOdds[row.code] = 0;
      delete forecast.projectedOpponents[row.code];
    }
  }

  // Group fixtures in wire form (knockout already are, via the bracket).
  const { nameOf } = deriveStructure(teams);
  const rating = buildStrength(matches);
  const groupWire = matches
    .filter((m) => m.stage === 'GROUP')
    .map((m) => toWireMatch(m, nameOf, rating));

  return {
    updatedAt: new Date().toISOString(),
    dataSource: source,
    standings,
    bracket,
    allMatches: [...groupWire, ...bracket],
    squads,
    forecast,
  };
}

async function getBundle(redis: Redis): Promise<Bundle> {
  return singleflight(redis, BUNDLE_KEY, BUNDLE_TTL, async () => {
    const { matches, teams, squads, source } = await loadRawMatches(redis);
    return buildBundle(matches, teams, squads, source);
  });
}

/** Refresh the cached bundle out-of-band (used by the warm-wc2026 job). */
export async function warmBundle(redis: Redis): Promise<number> {
  const { matches, teams, squads, source } = await loadRawMatches(redis);
  const bundle = buildBundle(matches, teams, squads, source);
  await redis.set(BUNDLE_KEY, JSON.stringify(bundle), 'EX', BUNDLE_TTL);
  return bundle.bracket.length + bundle.standings.length;
}

export async function getOverview(redis: Redis): Promise<WcOverview> {
  const { updatedAt, dataSource, standings, bracket, allMatches, forecast } = await getBundle(redis);
  const groupMatches = allMatches.filter((m) => m.stage === 'GROUP');
  return { updatedAt, dataSource, groups: standings, groupMatches, bracket, championOdds: forecast.championOdds };
}

export async function getTeamDetail(redis: Redis, codeInput: string): Promise<WcTeamDetail | null> {
  const code = codeInput.toUpperCase();

  // Group, name and standing all come from the (feed-driven) standings — the
  // authoritative structure — not the static roster. A team unknown to the feed
  // simply 404s.
  const { standings, bracket, allMatches, squads, forecast } = await getBundle(redis);
  const group = standings.find((g) => g.rows.some((r) => r.code === code));
  const standing = group?.rows.find((r) => r.code === code);
  if (!group || !standing) return null;

  // Opponent names also come from the standings rows where possible.
  const nameOf = (c: string) =>
    standings.flatMap((g) => g.rows).find((r) => r.code === c)?.name ?? teamByCode(c)?.name ?? c;

  const oppByStage = forecast.projectedOpponents[code] ?? {};
  let projectedOpponents: WcProjectedOpponent[] = (KNOCKOUT_STAGES as WcStage[])
    .filter((s) => oppByStage[s]?.length)
    .map((stage) => ({
      stage,
      opponents: oppByStage[stage].map((o) => ({ code: o.code, name: nameOf(o.code), prob: o.prob })),
    }));
  // Guarantee a non-empty projection for any team still able to advance: if the
  // simulation never placed it in a knockout, derive its R32 opponents from the
  // bracket structure directly.
  if (projectedOpponents.length === 0 && standing.qualification !== 'ELIMINATED') {
    projectedOpponents = analyticR32Opponents(code, group.group, bracket, standings);
  }

  // This team's own fixtures, split into played and to-come.
  const own = allMatches
    .filter((m) => m.home.code === code || m.away.code === code)
    .sort((a, b) => +new Date(a.kickoff) - +new Date(b.kickoff));

  return {
    code,
    name: standing.name,
    group: group.group,
    standing,
    groupTable: group.rows,
    reachFinalProb: forecast.reachFinalOdds[code] ?? 0,
    championProb: forecast.championOdds[code] ?? 0,
    projectedOpponents,
    results: own.filter((m) => m.status === 'FINISHED'),
    upcoming: own.filter((m) => m.status !== 'FINISHED'),
    players: squads[code]?.length ? squads[code] : playersFor(code),
    history: historyFor(code),
  };
}
