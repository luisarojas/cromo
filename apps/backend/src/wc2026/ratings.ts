// ─── Team strength baseline — official FIFA World Ranking points ────────────
//
// These are each nation's FIFA/Coca-Cola World Ranking points. FIFA computes
// them with an Elo-based formula from ACTUAL international results (win/draw/loss
// weighted by opponent strength and match importance) — so they are an
// objective, published, facts-only measure of strength. No public sentiment, no
// hand-tuning per team. They are the BASELINE: `strength.ts` then nudges each
// team up/down by the actual results of this tournament as it plays out.
//
// The scale is Elo-like (top teams ~1860, minnows ~1300), so the /400 logistic
// in `winProbability` works directly.
//
// PROVENANCE: transcribed from the published FIFA/Coca-Cola World Ranking at
// inside.fifa.com (release viewed 2026-06-25), rounded to whole points. They
// drift only a few times a year — refresh from inside.fifa.com if a newer
// edition lands during the tournament. Editing a value is the supported way to
// tune a team's odds.

export const DEFAULT_RATING = 1400;

export const TEAM_RATINGS: Record<string, number> = {
  ARG: 1877, // #1
  ESP: 1875, // #2
  FRA: 1871, // #3
  ENG: 1828, // #4
  POR: 1768, // #5
  BRA: 1766, // #6
  MAR: 1755, // #7
  NED: 1754, // #8
  BEL: 1742, // #9
  GER: 1736, // #10
  CRO: 1715, // #11
  COL: 1698, // #13
  MEX: 1687, // #14
  SEN: 1684, // #15
  URU: 1673, // #16
  USA: 1671, // #17
  JPN: 1662, // #18
  SUI: 1650, // #19
  IRN: 1620, // #20
  TUR: 1606, // #22
  ECU: 1599, // #23
  AUT: 1597, // #24
  KOR: 1592, // #25
  AUS: 1579, // #27
  ALG: 1571, // #28
  EGY: 1562, // #29
  CAN: 1559, // #30
  NOR: 1557, // #31
  CIV: 1541, // #33
  PAN: 1539, // #34
  SWE: 1510, // #38
  CZE: 1506, // #40
  PAR: 1505, // #41
  SCO: 1503, // #42
  TUN: 1476, // #45
  COD: 1474, // #46
  UZB: 1459, // #50
  QAT: 1450, // #56
  IRQ: 1446, // #57
  RSA: 1428, // #60
  KSA: 1424, // #61
  JOR: 1388, // #63
  BIH: 1387, // #64
  CPV: 1371, // #67
  GHA: 1347, // #73
  CUW: 1295, // #82
  HAI: 1293, // #83
  NZL: 1276, // #85
};

export function ratingFor(code: string): number {
  return TEAM_RATINGS[code] ?? DEFAULT_RATING;
}

/**
 * winProbability — logistic (Elo) expectation that team A beats team B in a
 * single match, ignoring draws. The classic Elo formula:
 *
 *     P(A) = 1 / (1 + 10^(-(Rₐ - R_b) / 400))
 *
 * A 400-point gap ≈ 91%. This is the single source of all match-level odds;
 * the knockout simulation and the bracket "favourite" badge both call it
 * (via the results-adjusted rating from strength.ts).
 */
export function winProbability(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** (-(ratingA - ratingB) / 400));
}
