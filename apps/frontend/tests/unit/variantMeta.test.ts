import { describe, it, expect } from 'vitest';
import {
  ALL_VARIANT_TYPES,
  compareVariantTypes,
  isBaseVariant,
  variantLabel,
  variantRarity,
  variantShort,
  variantSwatch,
} from '@/app/collection/components/variantMeta';

describe('variantMeta', () => {
  describe('isBaseVariant', () => {
    it('treats base_border and base_borderless as base', () => {
      expect(isBaseVariant('base_border')).toBe(true);
      expect(isBaseVariant('base_borderless')).toBe(true);
    });

    it('treats every other variant as non-base', () => {
      for (const v of ALL_VARIANT_TYPES) {
        if (v === 'base_border' || v === 'base_borderless') continue;
        expect(isBaseVariant(v)).toBe(false);
      }
      expect(isBaseVariant('not_a_real_variant')).toBe(false);
    });
  });

  describe('label/short/swatch/rarity', () => {
    it('returns mapped metadata for known variants', () => {
      expect(variantLabel('blue')).toBe('Blue parallel');
      expect(variantShort('extra_gold')).toBe('EX Gold');
      expect(variantRarity('green')).toBe('Ultra Rare');
      expect(variantSwatch('black')).toBe('bg-black');
    });

    it('falls back gracefully on unknown variants', () => {
      // The fallbacks are the safety net for stickers carrying a variant_type
      // that hasn't been wired into the UI yet — they must never throw.
      expect(variantLabel('unknown_xyz')).toBe('unknown_xyz');
      expect(variantShort('unknown_xyz')).toBe('unknown_xyz');
      expect(variantRarity('unknown_xyz')).toBe('');
      expect(variantSwatch('unknown_xyz')).toBe('bg-gray-300');
    });
  });

  describe('compareVariantTypes', () => {
    it('orders known variants by their declared position', () => {
      // Sort a shuffled set; expect to recover declaration order.
      const shuffled = ['green', 'base_border', 'red', 'blue', 'base_borderless'];
      const sorted = [...shuffled].sort(compareVariantTypes);
      expect(sorted).toEqual(['base_border', 'base_borderless', 'blue', 'red', 'green']);
    });

    it('pushes unknown variants to the end, alphabetically', () => {
      const sorted = ['zebra', 'aardvark', 'blue'].sort(compareVariantTypes);
      expect(sorted).toEqual(['blue', 'aardvark', 'zebra']);
    });

    it('returns 0 for equal types', () => {
      expect(compareVariantTypes('blue', 'blue')).toBe(0);
    });
  });
});
