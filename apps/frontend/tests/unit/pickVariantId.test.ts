import { describe, it, expect } from 'vitest';
import { pickVariantId } from '@/app/scan/pickVariantId';
import type { StickerVariant } from '@/lib/api';

// Helper: build a minimal StickerVariant. Only id + variantType matter for
// pickVariantId; the rest of the type is irrelevant.
function v(id: string, variantType: string): StickerVariant {
  return { id, variantType } as StickerVariant;
}

const FULL_VARIANTS: StickerVariant[] = [
  v('id-border', 'base_border'),
  v('id-borderless', 'base_borderless'),
  v('id-blue', 'blue'),
  v('id-red', 'red'),
  v('id-purple', 'purple'),
  v('id-green', 'green'),
];

describe('pickVariantId', () => {
  describe('with a borderHint from the AI', () => {
    it('returns an exact match on variantType', () => {
      expect(pickVariantId(FULL_VARIANTS, 'red', 'base_border')).toBe('id-red');
      expect(pickVariantId(FULL_VARIANTS, 'base_borderless', 'base_border')).toBe(
        'id-borderless',
      );
    });

    it('falls back to a startsWith match when no exact match exists', () => {
      // Hint is a shorter prefix of the variant token: 'blu' should resolve
      // to 'blue' via the partial-match fallback.
      expect(pickVariantId(FULL_VARIANTS, 'blu', 'base_border')).toBe('id-blue');
    });

    it('is case-insensitive on the partial match', () => {
      expect(pickVariantId(FULL_VARIANTS, 'BLU', 'base_border')).toBe('id-blue');
    });

    it('falls through to the album default when the hint matches nothing', () => {
      expect(pickVariantId(FULL_VARIANTS, 'totally_unknown', 'base_border')).toBe(
        'id-border',
      );
    });
  });

  describe('without a borderHint', () => {
    it('uses the album-level default base variant', () => {
      expect(pickVariantId(FULL_VARIANTS, null, 'base_borderless')).toBe('id-borderless');
      expect(pickVariantId(FULL_VARIANTS, null, 'base_border')).toBe('id-border');
    });

    it('falls back to base_borderless when the album default is missing', () => {
      // Coca-Cola subset: only base_borderless exists, album default is
      // base_border. Must still resolve.
      const ccOnly: StickerVariant[] = [v('cc-1', 'base_borderless')];
      expect(pickVariantId(ccOnly, null, 'base_border')).toBe('cc-1');
    });

    it('falls back to variants[0] when no base variant exists at all', () => {
      const exotic: StickerVariant[] = [v('only', 'extra_gold')];
      expect(pickVariantId(exotic, null, 'base_border')).toBe('only');
    });

    it('returns empty string for an empty variants array', () => {
      expect(pickVariantId([], null, 'base_border')).toBe('');
    });
  });

  describe('empty borderHint string', () => {
    it('is treated like null (album default wins)', () => {
      // The implementation guards with `if (borderHint)` so '' is falsy.
      expect(pickVariantId(FULL_VARIANTS, '', 'base_borderless')).toBe('id-borderless');
    });
  });
});
