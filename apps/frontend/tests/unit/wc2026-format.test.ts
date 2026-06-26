import { describe, it, expect } from 'vitest';
import {
  STAGE_LABELS,
  KNOCKOUT_ORDER,
  formatKickoffET,
  formatDayET,
  dateSpanET,
  pct,
  shortPlaceholder,
  placeholderCandidates,
} from '@/app/guide/wc-2026/standings/format';
import type { WcGroupStanding, WcMatch } from '@/lib/api/wc2026';

function matchAt(kickoff: string): WcMatch {
  return {
    id: kickoff,
    stage: 'R32',
    group: null,
    kickoff,
    city: 'X',
    stadium: 'Y',
    status: 'SCHEDULED',
    home: { code: null, name: null, placeholder: '1A', score: null, pens: null },
    away: { code: null, name: null, placeholder: '2B', score: null, pens: null },
    winnerCode: null,
    favourite: null,
  };
}

describe('formatKickoffET', () => {
  it('renders the time in US Eastern with an ET suffix', () => {
    // 2026-06-24T18:00Z === 14:00 EDT.
    const out = formatKickoffET('2026-06-24T18:00:00Z');
    expect(out).toContain('Jun 24');
    expect(out).toMatch(/2:00\s?PM/);
    expect(out.endsWith('ET')).toBe(true);
  });
});

describe('formatDayET', () => {
  it('returns a month/day label in Eastern time', () => {
    expect(formatDayET('2026-07-19T19:00:00Z')).toBe('Jul 19');
  });
  it('rolls back to the previous ET day for a post-midnight-UTC kickoff', () => {
    // 02:00Z on Jun 29 is 22:00 EDT on Jun 28.
    expect(formatDayET('2026-06-29T02:00:00Z')).toBe('Jun 28');
  });
});

describe('dateSpanET', () => {
  it('returns an empty string with no matches', () => {
    expect(dateSpanET([])).toBe('');
  });
  it('collapses a single day to one label', () => {
    expect(dateSpanET([matchAt('2026-06-28T18:00:00Z')])).toBe('Jun 28');
  });
  it('renders an inclusive span sorted by kickoff', () => {
    const span = dateSpanET([
      matchAt('2026-07-03T18:00:00Z'),
      matchAt('2026-06-28T18:00:00Z'),
    ]);
    expect(span).toBe('Jun 28 – Jul 3');
  });
});

describe('pct', () => {
  it('clamps the extremes and rounds the middle', () => {
    expect(pct(0)).toBe('0%'); // exact zero (e.g. eliminated) reads 0%, not <1%
    expect(pct(-0.2)).toBe('0%');
    expect(pct(0.003)).toBe('<1%'); // small positive
    expect(pct(1)).toBe('>99%');
    expect(pct(0.5)).toBe('50%');
    expect(pct(0.234)).toBe('23%');
  });
});

describe('shortPlaceholder', () => {
  it('keeps short group/third slot labels and collapses winner/loser noise', () => {
    expect(shortPlaceholder('1A')).toBe('1A');
    expect(shortPlaceholder('2B')).toBe('2B');
    expect(shortPlaceholder('T3')).toBe('T3');
    expect(shortPlaceholder('Winner R32#1')).toBe('Winner');
    expect(shortPlaceholder('Loser SF1')).toBe('Loser');
    expect(shortPlaceholder(null)).toBe('—');
  });
});

describe('placeholderCandidates', () => {
  const row = (code: string, rank: number, minRank: number, maxRank: number, qualification = 'ALIVE') => ({
    code, name: code, rank, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0,
    qualification: qualification as 'ALIVE' | 'CLINCHED' | 'ELIMINATED', minRank, maxRank,
    guaranteedRank: minRank === maxRank ? minRank : null, lastAppearance: null,
  });
  const groups: WcGroupStanding[] = [
    // MEX can be 1st–2nd; KOR 1st–3rd; RSA 2nd–4th; CZE locked 4th (eliminated).
    { group: 'A', rows: [row('MEX', 1, 1, 2, 'CLINCHED'), row('KOR', 2, 1, 3), row('RSA', 3, 2, 4), row('CZE', 4, 4, 4, 'ELIMINATED')] },
    { group: 'B', rows: [row('CAN', 1, 1, 1, 'CLINCHED'), row('SUI', 2, 2, 3), row('QAT', 3, 2, 3), row('BIH', 4, 4, 4, 'ELIMINATED')] },
  ];

  it('lists only teams that can realistically finish in that position', () => {
    // "1A" → can finish 1st: MEX (1–2) and KOR (1–3); NOT RSA (min 2) or CZE.
    expect(placeholderCandidates('1A', groups).map((c) => c.code)).toEqual(['MEX', 'KOR']);
    // "2A" → can finish 2nd: MEX, KOR, RSA.
    expect(placeholderCandidates('2A', groups).map((c) => c.code)).toEqual(['MEX', 'KOR', 'RSA']);
  });
  it('lists every team that can still finish 3rd for a best-third slot', () => {
    // Can finish 3rd across groups: KOR, RSA (A); SUI, QAT (B). Not CAN (locked 1st).
    expect(placeholderCandidates('T2', groups).map((c) => c.code)).toEqual(['KOR', 'RSA', 'SUI', 'QAT']);
  });
  it('returns nothing for winner/loser slots or null', () => {
    expect(placeholderCandidates('Winner R32#1', groups)).toEqual([]);
    expect(placeholderCandidates(null, groups)).toEqual([]);
  });
});

describe('stage metadata', () => {
  it('labels every stage and orders the knockout rounds', () => {
    expect(STAGE_LABELS.FINAL).toBe('Final');
    expect(STAGE_LABELS.R32).toBe('Round of 32');
    expect(KNOCKOUT_ORDER).toEqual(['R32', 'R16', 'QF', 'SF', 'FINAL']);
  });
});
