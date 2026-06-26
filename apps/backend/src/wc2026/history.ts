// ─── World Cup history — static, genuinely-known facts (through 2022) ────────
//
// `appearances` counts prior FIFA World Cup tournaments a nation reached, up to
// and including 2022 (NOT counting 2026). `lastAppearance` is the year of the
// most recent prior tournament, or null for a 2026 debutant. `titles` is the
// number of World Cups won. Figures fold predecessor states into the modern
// nation by common convention (e.g. Czechoslovakia → Czech Republic, Zaire →
// Congo DR). These are historical record, not estimates.

export interface WcHistory {
  appearances: number;
  lastAppearance: number | null;
  titles: number;
}

export const TEAM_HISTORY: Record<string, WcHistory> = {
  MEX: { appearances: 17, lastAppearance: 2022, titles: 0 },
  CZE: { appearances: 10, lastAppearance: 2006, titles: 0 },
  RSA: { appearances: 3, lastAppearance: 2010, titles: 0 },
  KOR: { appearances: 11, lastAppearance: 2022, titles: 0 },
  CAN: { appearances: 2, lastAppearance: 2022, titles: 0 },
  BIH: { appearances: 1, lastAppearance: 2014, titles: 0 },
  QAT: { appearances: 1, lastAppearance: 2022, titles: 0 },
  SUI: { appearances: 12, lastAppearance: 2022, titles: 0 },
  ESP: { appearances: 16, lastAppearance: 2022, titles: 1 },
  ALG: { appearances: 4, lastAppearance: 2014, titles: 0 },
  JPN: { appearances: 7, lastAppearance: 2022, titles: 0 },
  NZL: { appearances: 2, lastAppearance: 2010, titles: 0 },
  USA: { appearances: 11, lastAppearance: 2022, titles: 0 },
  PAR: { appearances: 8, lastAppearance: 2010, titles: 0 },
  AUS: { appearances: 6, lastAppearance: 2022, titles: 0 },
  TUR: { appearances: 2, lastAppearance: 2002, titles: 0 },
  ARG: { appearances: 18, lastAppearance: 2022, titles: 3 },
  ECU: { appearances: 4, lastAppearance: 2022, titles: 0 },
  SWE: { appearances: 12, lastAppearance: 2018, titles: 0 },
  CIV: { appearances: 3, lastAppearance: 2014, titles: 0 },
  GER: { appearances: 20, lastAppearance: 2022, titles: 4 },
  SCO: { appearances: 8, lastAppearance: 1998, titles: 0 },
  CUW: { appearances: 0, lastAppearance: null, titles: 0 },
  IRN: { appearances: 6, lastAppearance: 2022, titles: 0 },
  BEL: { appearances: 14, lastAppearance: 2022, titles: 0 },
  EGY: { appearances: 3, lastAppearance: 2018, titles: 0 },
  JOR: { appearances: 0, lastAppearance: null, titles: 0 },
  HAI: { appearances: 1, lastAppearance: 1974, titles: 0 },
  POR: { appearances: 8, lastAppearance: 2022, titles: 0 },
  COL: { appearances: 6, lastAppearance: 2018, titles: 0 },
  UZB: { appearances: 0, lastAppearance: null, titles: 0 },
  COD: { appearances: 1, lastAppearance: 1974, titles: 0 },
  FRA: { appearances: 16, lastAppearance: 2022, titles: 2 },
  NOR: { appearances: 3, lastAppearance: 1998, titles: 0 },
  SEN: { appearances: 3, lastAppearance: 2022, titles: 0 },
  IRQ: { appearances: 1, lastAppearance: 1986, titles: 0 },
  ENG: { appearances: 16, lastAppearance: 2022, titles: 1 },
  NED: { appearances: 11, lastAppearance: 2022, titles: 0 },
  GHA: { appearances: 4, lastAppearance: 2022, titles: 0 },
  TUN: { appearances: 6, lastAppearance: 2022, titles: 0 },
  BRA: { appearances: 22, lastAppearance: 2022, titles: 5 },
  MAR: { appearances: 6, lastAppearance: 2022, titles: 0 },
  CRO: { appearances: 6, lastAppearance: 2022, titles: 0 },
  KSA: { appearances: 6, lastAppearance: 2022, titles: 0 },
  URU: { appearances: 14, lastAppearance: 2022, titles: 2 },
  AUT: { appearances: 7, lastAppearance: 1998, titles: 0 },
  PAN: { appearances: 1, lastAppearance: 2018, titles: 0 },
  CPV: { appearances: 0, lastAppearance: null, titles: 0 },
};

export function historyFor(code: string): WcHistory {
  return TEAM_HISTORY[code] ?? { appearances: 0, lastAppearance: null, titles: 0 };
}
