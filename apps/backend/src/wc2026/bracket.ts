// Converts the provider's knockout fixtures → WcMatch wire objects. Teams are
// NEVER guessed: a knockout side shows a real team only when the feed actually
// provides it (after FIFA's official draw is ingested), otherwise "TBD". We do
// not derive matchups from a template — the template's slot→match wiring is not
// the official bracket, so doing so put wrong teams in wrong matches. The
// forecast simulates its own internal skeleton for odds, separately.

import { ratingFor, winProbability } from './ratings.js';
import { buildStrength } from './strength.js';
import { deriveStructure } from './structure.js';
import { teamByCode } from './teams.js';
import { venueAt } from './venues.js';
import type { RawMatch, TeamMeta, WcGroupStanding, WcMatch, WcMatchSide } from './types.js';

const defaultName = (code: string) => teamByCode(code)?.name ?? code;

const KO_ORDER = ['R32', 'R16', 'QF', 'SF', 'THIRD', 'FINAL'] as const;

function winnerOf(m: RawMatch): string | null {
  if (m.status !== 'FINISHED' || m.homeScore === null || m.awayScore === null) return null;
  if (m.homeScore > m.awayScore) return m.homeCode;
  if (m.awayScore > m.homeScore) return m.awayCode;
  // Draw → shoot-out.
  if (m.homePens !== null && m.awayPens !== null) {
    return m.homePens >= m.awayPens ? m.homeCode : m.awayCode;
  }
  return null;
}

function side(
  code: string | null,
  placeholder: string | null,
  feed: string | null | undefined,
  score: number | null,
  pens: number | null,
  nameOf: (c: string) => string,
): WcMatchSide {
  return {
    code,
    name: code ? nameOf(code) : null,
    // Unknown side → "TBD" (teams aren't known until the post-group-stage draw).
    placeholder: code ? null : placeholder || 'TBD',
    feed: code ? null : (feed ?? null),
    score,
    pens,
  };
}

function favourite(
  homeCode: string | null,
  awayCode: string | null,
  rating: (c: string) => number,
): WcMatch['favourite'] {
  if (!homeCode || !awayCode) return null;
  const rh = rating(homeCode);
  const ra = rating(awayCode);
  const [code, hi, lo] = rh >= ra ? [homeCode, rh, ra] : [awayCode, ra, rh];
  return { code, prob: Math.round(winProbability(hi, lo) * 1000) / 1000 };
}

export function toWireMatch(
  m: RawMatch,
  nameOf: (c: string) => string = defaultName,
  rating: (c: string) => number = (c) => ratingFor(c),
): WcMatch {
  const venue = venueAt(m.venueIndex);
  return {
    id: m.id,
    stage: m.stage,
    group: m.group,
    slot: m.slot,
    kickoff: m.kickoff,
    city: venue.city,
    stadium: venue.stadium,
    status: m.status,
    home: side(m.homeCode, m.homeSlot, m.homeFeed, m.homeScore, m.homePens, nameOf),
    away: side(m.awayCode, m.awaySlot, m.awayFeed, m.awayScore, m.awayPens, nameOf),
    winnerCode: winnerOf(m),
    favourite: favourite(m.homeCode, m.awayCode, rating),
  };
}

/**
 * resolveBracket — the knockout matches as wire objects, STRICTLY from the feed.
 * A knockout team is shown only when the provider actually supplies it (i.e. the
 * official draw has been ingested); otherwise the side is "TBD". We do NOT
 * fabricate matchups from a template — the canonical template's slot→match
 * wiring is not FIFA's official bracket, so resolving slots to teams placed the
 * wrong teams in the wrong matches. Correct knockout matchups appear here the
 * moment the feed has them.
 */
export function resolveBracket(
  matches: RawMatch[],
  _standings: WcGroupStanding[],
  teams?: TeamMeta[],
): WcMatch[] {
  const { nameOf } = deriveStructure(teams);
  const rating = buildStrength(matches);
  return KO_ORDER.flatMap((stage) =>
    matches
      .filter((m) => m.stage === stage)
      .sort((a, b) => a.slot - b.slot)
      .map((m) => toWireMatch(m, nameOf, rating)),
  );
}

export { winnerOf };
