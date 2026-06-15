import { describe, it, expect } from 'vitest';
import {
  normalizeAlbumCode,
  parseGeminiRetryMs,
  reconcileStickerType,
} from '../../src/services/scan.service.js';

describe('normalizeAlbumCode', () => {
  it('uppercases letters and accepts already-clean codes', () => {
    expect(normalizeAlbumCode('bra5')).toBe('BRA5');
    expect(normalizeAlbumCode('FWC12')).toBe('FWC12');
  });

  it('strips whitespace, dashes, dots, and other punctuation between letters and digits', () => {
    expect(normalizeAlbumCode('BRA 5')).toBe('BRA5');
    expect(normalizeAlbumCode('BRA-5')).toBe('BRA5');
    expect(normalizeAlbumCode('BRA.5')).toBe('BRA5');
    expect(normalizeAlbumCode('BRA·5')).toBe('BRA5');
    expect(normalizeAlbumCode('FWC_1')).toBe('FWC1');
  });

  it('rejects shapes that are not LETTERS-then-DIGITS', () => {
    expect(normalizeAlbumCode('5BRA')).toBe('');
    expect(normalizeAlbumCode('B5R')).toBe('');
    expect(normalizeAlbumCode('B')).toBe(''); // 1 letter, no digits
    expect(normalizeAlbumCode('12345')).toBe(''); // no letters
    expect(normalizeAlbumCode('')).toBe('');
  });

  it('rejects codes with too-many letters or digits', () => {
    expect(normalizeAlbumCode('BRAVO5')).toBe(''); // 5 letters > 4
    expect(normalizeAlbumCode('BRA1234')).toBe(''); // 4 digits > 3
  });
});

describe('parseGeminiRetryMs', () => {
  it('extracts retryDelay from a Gemini 429 envelope and returns ms + 500ms slack', () => {
    const body = JSON.stringify({
      error: { details: [{ retryDelay: '12s' }] },
    });
    // 12s × 1000 = 12000, plus the 500ms guard band.
    expect(parseGeminiRetryMs(body)).toBe(12_500);
  });

  it('rounds fractional second values UP to the next millisecond', () => {
    const body = JSON.stringify({ error: { details: [{ retryDelay: '0.001s' }] } });
    // ceil(0.001 * 1000) = 1, plus 500ms slack.
    expect(parseGeminiRetryMs(body)).toBe(501);
  });

  it('falls back to 10s when retryDelay is missing', () => {
    expect(parseGeminiRetryMs(JSON.stringify({ error: { details: [] } }))).toBe(10_000);
    expect(parseGeminiRetryMs(JSON.stringify({ error: {} }))).toBe(10_000);
    expect(parseGeminiRetryMs(JSON.stringify({}))).toBe(10_000);
  });

  it('falls back to 10s when the body is not JSON', () => {
    expect(parseGeminiRetryMs('not json at all')).toBe(10_000);
    expect(parseGeminiRetryMs('')).toBe(10_000);
  });

  it('falls back to 10s when retryDelay has an unexpected shape', () => {
    // The regex requires `Ns`; a missing unit is rejected.
    expect(
      parseGeminiRetryMs(JSON.stringify({ error: { details: [{ retryDelay: '12' }] } })),
    ).toBe(10_000);
  });
});

describe('reconcileStickerType', () => {
  describe('album-code prefix overrides', () => {
    it('forces "extra" when the album code starts with EX', () => {
      // Trusts the back-of-sticker code over the model's null guess.
      expect(reconcileStickerType(null, 'EX12', null)).toBe('extra');
    });

    it('forces "coca_cola_special" when the album code starts with CC', () => {
      expect(reconcileStickerType(null, 'CC4', null)).toBe('coca_cola_special');
    });

    it('does NOT promote to extra if the model already said coca_cola_special', () => {
      // A CC-prefixed code is never an extra; the EX-override only fires when
      // the raw type isn't already a more specific subset.
      expect(reconcileStickerType('coca_cola_special', 'EX12', null)).toBe('coca_cola_special');
    });
  });

  describe('extra sanity checks (only apply without an EX-prefix override)', () => {
    it('demotes "extra" to null when the variant token is a Crumple finish (front-side scan, no album code)', () => {
      // Crumple is a core-only finish; an Extra can never be Crumple.
      expect(reconcileStickerType('extra', null, 'gold_crumple')).toBeNull();
    });

    it('demotes "extra" to null when the album code does not start with EX', () => {
      // A core-style code rules out the Extra subset.
      expect(reconcileStickerType('extra', 'BRA5', 'extra_gold')).toBeNull();
    });

    it('demotes "extra" to null when the variant token is not an extra_* token (front-side scan)', () => {
      expect(reconcileStickerType('extra', null, 'base_border')).toBeNull();
    });

    it('keeps "extra" on a clean front-side identification', () => {
      // No album code, plausible extra_* variant token, rawType already extra.
      expect(reconcileStickerType('extra', null, 'extra_gold')).toBe('extra');
    });

    it('keeps "extra" via the EX-prefix override even when other signals look weak', () => {
      // The EX prefix is decisive — it's printed on the BACK of the sticker
      // and the catalog tells us what the front looks like.
      expect(reconcileStickerType('extra', 'EX1', 'gold_crumple')).toBe('extra');
      expect(reconcileStickerType('extra', 'EX1', 'base_border')).toBe('extra');
    });
  });

  describe('null inputs', () => {
    it('preserves a null rawType when there is no signal either way', () => {
      expect(reconcileStickerType(null, null, null)).toBeNull();
      expect(reconcileStickerType(null, 'BRA5', 'base_border')).toBeNull();
    });
  });
});
