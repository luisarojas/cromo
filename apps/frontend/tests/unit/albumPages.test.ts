import { describe, it, expect } from 'vitest';
import { formatPageSpread } from '@/lib/albumPages';
import { foldAccents } from '@/lib/normalize';

describe('formatPageSpread', () => {
  it('collapses identical bounds to a single page label', () => {
    expect(formatPageSpread([4, 4])).toBe('p. 4');
  });

  it('uses an en-dash range when the bounds differ', () => {
    expect(formatPageSpread([10, 12])).toBe('pp. 10–12');
  });
});

describe('foldAccents', () => {
  it('lowercases and strips combining diacritics', () => {
    expect(foldAccents('Müller')).toBe('muller');
    expect(foldAccents('VINÍCIUS')).toBe('vinicius');
    expect(foldAccents('Mbappé')).toBe('mbappe');
  });

  it('leaves ASCII names untouched aside from casing', () => {
    expect(foldAccents('Harry Kane')).toBe('harry kane');
  });

  it('handles strings with no letters', () => {
    expect(foldAccents('')).toBe('');
    expect(foldAccents('  ')).toBe('  ');
  });
});
