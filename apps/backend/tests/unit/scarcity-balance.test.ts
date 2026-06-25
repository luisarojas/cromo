import { describe, it, expect } from 'vitest';
import {
  BASE_STICKER_CASH_CENTS,
  cashToScarcity,
  computeScarcityBalance,
  isSingleVariantTrade,
  suggestBalancingCashCents,
  TRADE_BALANCE_HIGH,
  TRADE_BALANCE_LOW,
  variantCashValueCents,
  variantScarcity,
} from '@cromo/shared';

/**
 * The cash-pricing math is the lever that lets the editable third-party UI
 * compute "fair" trades where one side throws in money. Three layers, tested
 * here in lockstep so a change to one without the others fails fast:
 *   - cashToScarcity / variantCashValueCents — the conversions.
 *   - computeScarcityBalance — the pure aggregator (used by both backend
 *     services AND the editable UI).
 *   - isSingleVariantTrade — the predicate that collapses the fair-band to
 *     "equal counts" for same-lane trades. Re-exported so the optimizer
 *     doesn't redefine it.
 *
 * These tests double as the documentation of the contract — please update the
 * comments when changing the algorithm.
 */

const ref = (variantToken: string | null, quantity = 1) => ({ variantToken, quantity });

describe('cashToScarcity', () => {
  it('treats a base sticker as 1 scarcity point at the BASE_STICKER_CASH_CENTS rate', () => {
    expect(cashToScarcity(BASE_STICKER_CASH_CENTS)).toBe(1);
  });

  it('scales linearly with cents', () => {
    expect(cashToScarcity(BASE_STICKER_CASH_CENTS * 5)).toBe(5);
    expect(cashToScarcity(BASE_STICKER_CASH_CENTS * 100)).toBe(100);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['negative', -50],
    ['zero', 0],
  ])('returns 0 for %s (no negative scarcity, no propagating NaN)', (_label, value) => {
    expect(cashToScarcity(value as number | null | undefined)).toBe(0);
  });
});

describe('variantCashValueCents', () => {
  it('prices a base sticker at BASE_STICKER_CASH_CENTS', () => {
    expect(variantCashValueCents('base_borderless')).toBe(BASE_STICKER_CASH_CENTS);
    expect(variantCashValueCents('base_border')).toBe(BASE_STICKER_CASH_CENTS);
  });

  it('scales with VARIANT_SCARCITY', () => {
    // red scarcity = 25; price = $0.50 × 25 = $12.50.
    expect(variantCashValueCents('red')).toBe(BASE_STICKER_CASH_CENTS * variantScarcity('red'));
    expect(variantCashValueCents('red')).toBe(1250);
    // extra_gold scarcity = 2000; price = $0.50 × 2000 = $1000.
    expect(variantCashValueCents('extra_gold')).toBe(100_000);
  });

  it('respects per-trade weight overrides', () => {
    // Two collectors negotiate 1 red = 50 base = $25.
    expect(variantCashValueCents('red', { red: 50 })).toBe(2500);
  });

  it('treats unknown tokens as base (1.0)', () => {
    expect(variantCashValueCents('hologram')).toBe(BASE_STICKER_CASH_CENTS);
    expect(variantCashValueCents(null)).toBe(BASE_STICKER_CASH_CENTS);
  });
});

describe('isSingleVariantTrade', () => {
  it('returns false when either side is empty', () => {
    expect(isSingleVariantTrade([], [ref('red')])).toBe(false);
    expect(isSingleVariantTrade([ref('red')], [])).toBe(false);
    expect(isSingleVariantTrade([], [])).toBe(false);
  });

  it('returns true when both sides share a single token', () => {
    expect(isSingleVariantTrade([ref('base_borderless'), ref('base_borderless')], [ref('base_borderless')]))
      .toBe(true);
  });

  it('returns false when sides share a token but a side has a second token mixed in', () => {
    expect(isSingleVariantTrade([ref('base_borderless')], [ref('base_borderless'), ref('red')]))
      .toBe(false);
  });

  it('returns false when either side has a null variantToken (unresolved item)', () => {
    expect(isSingleVariantTrade([ref(null)], [ref('base_borderless')])).toBe(false);
  });
});

describe('computeScarcityBalance — sticker only', () => {
  it('handles the empty case without dividing by zero', () => {
    const b = computeScarcityBalance([], []);
    expect(b.give).toBe(0);
    expect(b.get).toBe(0);
    expect(b.ratio).toBeNull();
    expect(b.lopsided).toBe(false);
    expect(b.sameVariant).toBe(false);
  });

  it('flags single-variant trades with mismatched counts as lopsided', () => {
    const b = computeScarcityBalance(
      [ref('base_borderless'), ref('base_borderless')],
      [ref('base_borderless')],
    );
    expect(b.sameVariant).toBe(true);
    expect(b.ratio).toBe(0.5);
    expect(b.lopsided).toBe(true);
  });

  it('treats matching counts in a same-variant trade as exactly fair', () => {
    const b = computeScarcityBalance(
      [ref('red')],
      [ref('red')],
    );
    expect(b.sameVariant).toBe(true);
    expect(b.ratio).toBe(1);
    expect(b.lopsided).toBe(false);
  });

  it('uses the fair-band for mixed-variant trades inside [LOW, HIGH]', () => {
    // give 2 base (2 pts), get 1 blue (2 pts) → ratio 1, inside the band.
    const b = computeScarcityBalance(
      [ref('base_borderless'), ref('base_borderless')],
      [ref('blue')],
    );
    expect(b.sameVariant).toBe(false);
    expect(b.ratio).toBe(1);
    expect(b.lopsided).toBe(false);
  });

  it('flags mixed-variant trades outside the fair-band', () => {
    // give 1 base (1 pt), get 1 red (25 pts) → ratio 25, > TRADE_BALANCE_HIGH.
    const b = computeScarcityBalance(
      [ref('base_borderless')],
      [ref('red')],
    );
    expect(b.ratio).toBe(25);
    expect(25).toBeGreaterThan(TRADE_BALANCE_HIGH);
    expect(b.lopsided).toBe(true);
  });

  it('respects per-trade weight overrides', () => {
    // Without override: give 1 base (1) vs get 1 red (25) → lopsided.
    // With override (1 red = 1 base): ratio 1, fair.
    const b = computeScarcityBalance(
      [ref('base_borderless')],
      [ref('red')],
      { weights: { red: 1 } },
    );
    expect(b.ratio).toBe(1);
    expect(b.lopsided).toBe(false);
  });
});

describe('computeScarcityBalance — cash', () => {
  it('adds cash to the give side as scarcity points', () => {
    // Give 1 base ($0.50) + $5.00 cash = 1 + 10 = 11 pts. Receive 1 red = 25.
    const b = computeScarcityBalance(
      [ref('base_borderless')],
      [ref('red')],
      { giveCashCents: 500 },
    );
    expect(b.give).toBe(11);
    expect(b.get).toBe(25);
    expect(b.ratio).toBeCloseTo(25 / 11, 5);
  });

  it('adds cash to the get side as scarcity points', () => {
    const b = computeScarcityBalance(
      [ref('red')],
      [ref('base_borderless')],
      { getCashCents: 500 },
    );
    expect(b.give).toBe(25);
    expect(b.get).toBe(11);
  });

  it('cash on either side disables the single-variant shortcut', () => {
    // Without cash this is a same-variant trade with equal counts → fair.
    // Adding cash makes it mixed-value, so the fair-band logic re-applies.
    const b = computeScarcityBalance(
      [ref('base_borderless')],
      [ref('base_borderless')],
      { giveCashCents: 100 },
    );
    expect(b.sameVariant).toBe(false);
    // give = 1 + 2 = 3; get = 1. ratio = 1/3 ≈ 0.33. Below TRADE_BALANCE_LOW.
    expect(b.ratio).toBeCloseTo(1 / 3, 5);
    expect(0.33).toBeLessThan(TRADE_BALANCE_LOW);
    expect(b.lopsided).toBe(true);
  });

  it('balances a 4-base-for-1-red with $10.50 cash to make ratio 1', () => {
    // give 4 base (4 pts) + $10.50 cash (21 pts) = 25 pts. get 1 red = 25 pts.
    const b = computeScarcityBalance(
      [ref('base_borderless'), ref('base_borderless'), ref('base_borderless'), ref('base_borderless')],
      [ref('red')],
      { giveCashCents: 1050 },
    );
    expect(b.give).toBe(25);
    expect(b.get).toBe(25);
    expect(b.ratio).toBe(1);
    expect(b.lopsided).toBe(false);
  });

  it('ignores invalid cash hints (negative, NaN) instead of propagating them', () => {
    const b = computeScarcityBalance(
      [ref('base_borderless')],
      [ref('base_borderless')],
      { giveCashCents: -500, getCashCents: Number.NaN },
    );
    expect(b.give).toBe(1);
    expect(b.get).toBe(1);
    expect(b.sameVariant).toBe(true);
  });

  it('treats invalid (negative) cash as 0 across both sides — sanitised values feed the single-variant check', () => {
    // Regression: an earlier implementation read raw input for the
    // single-variant decision, so a negative cash hint would defeat the
    // same-variant collapse on a valid equal-count trade.
    const b = computeScarcityBalance(
      [ref('base_borderless')],
      [ref('base_borderless')],
      { giveCashCents: -5 },
    );
    expect(b.sameVariant).toBe(true);
    expect(b.lopsided).toBe(false);
  });

  it('treats only-cash on the get side as a valid (non-NaN) ratio', () => {
    // give 1 base, get only cash ($1 = 2 pts) → ratio 2 (still > TRADE_BALANCE_HIGH? 2.0 boundary).
    const b = computeScarcityBalance(
      [ref('base_borderless')],
      [],
      { getCashCents: 100 },
    );
    expect(b.give).toBe(1);
    expect(b.get).toBe(2);
    expect(b.ratio).toBe(2);
    // 2.0 is on the boundary; spec is inclusive of the band at the edge.
    expect(b.lopsided).toBe(false);
  });
});

describe('suggestBalancingCashCents', () => {
  it('returns null when the trade is already fair', () => {
    const b = computeScarcityBalance([ref('red')], [ref('red')]);
    expect(suggestBalancingCashCents(b)).toBeNull();
  });

  it('returns null when both sides are empty', () => {
    expect(suggestBalancingCashCents(computeScarcityBalance([], []))).toBeNull();
  });

  it('suggests cash on the GIVE side when the user is receiving more value', () => {
    // give 1 base (1 pt), get 1 red (25 pts) → delta 24 pts → 24 * $0.50 = $12.00.
    const b = computeScarcityBalance([ref('base_borderless')], [ref('red')]);
    expect(suggestBalancingCashCents(b)).toEqual({ side: 'give', cents: 1200 });
  });

  it('suggests cash on the GET side when the user is giving more value', () => {
    // give 1 red (25), get 1 base (1) → delta 24 → $12 from partner.
    const b = computeScarcityBalance([ref('red')], [ref('base_borderless')]);
    expect(suggestBalancingCashCents(b)).toEqual({ side: 'get', cents: 1200 });
  });

  it('rounds the suggestion UP so it always reaches the fair band', () => {
    // Construct a lopsided imbalance that doesn't land on a clean cent
    // boundary. 1 red weighted to 6.5: give 3 base (3), get 6.5 → ratio
    // 2.166 > TRADE_BALANCE_HIGH (2.0) so lopsided fires. Delta = 3.5
    // scarcity → 175 cents exactly. (Round-up matters when scarcity weights
    // produce non-integer deltas; this fixture asserts no cent is lost.)
    const b = computeScarcityBalance(
      [ref('base_borderless'), ref('base_borderless'), ref('base_borderless')],
      [ref('red')],
      { weights: { red: 6.5 } },
    );
    expect(b.give).toBe(3);
    expect(b.get).toBe(6.5);
    expect(b.lopsided).toBe(true);
    expect(suggestBalancingCashCents(b)).toEqual({ side: 'give', cents: 175 });
  });

  it('applies the suggested cash and ends inside the fair band', () => {
    // give 1 base (1), get 1 red (25) → suggestion +$12 on give side.
    const b1 = computeScarcityBalance([ref('base_borderless')], [ref('red')]);
    const s = suggestBalancingCashCents(b1)!;
    expect(s.cents).toBe(1200);

    const b2 = computeScarcityBalance(
      [ref('base_borderless')],
      [ref('red')],
      { giveCashCents: s.cents },
    );
    // 1 + 24 = 25 == 25 → ratio 1, fair.
    expect(b2.give).toBe(25);
    expect(b2.lopsided).toBe(false);
    // A second pass should propose no further cash.
    expect(suggestBalancingCashCents(b2)).toBeNull();
  });

  it('clamps obscene proposals to the $1,000 sanity cap', () => {
    // An undocumented variant with scarcity 1 (fallback). Force a huge weight.
    const b = computeScarcityBalance(
      [ref('base_borderless')],
      [ref('red')],
      { weights: { red: 1_000_000 } },
    );
    // delta ~999,999 scarcity pts → cents would be ~50 million; capped to 100,000 ($1,000).
    const s = suggestBalancingCashCents(b)!;
    expect(s.cents).toBe(100_000);
  });
});
