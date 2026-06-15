import type { StickerVariant } from '@/lib/api';

/**
 * Pre-selects the best variant for a sticker.
 *
 * The AI's explicit border hint wins whenever it returned one — including
 * `base_border` or `base_borderless`. Only when the hint is `null` do we
 * fall back to the album's configured default Base. This preserves the
 * model's specific identifications (colored borders, crumple, extras) while
 * filling the uncertain case with the user's preference.
 *
 * Falls through to `base_borderless` then `variants[0]` for Coca-Cola
 * stickers, which only ever carry `base_borderless` regardless of the
 * album's default.
 */
export function pickVariantId(
  variants: StickerVariant[],
  borderHint: string | null,
  defaultBaseVariant: 'base_border' | 'base_borderless',
): string {
  if (borderHint) {
    const exact = variants.find((v) => v.variantType === borderHint);
    if (exact) return exact.id;
    const partial = variants.find((v) =>
      v.variantType.toLowerCase().startsWith(borderHint.toLowerCase()),
    );
    if (partial) return partial.id;
  }

  return (
    variants.find((v) => v.variantType === defaultBaseVariant)?.id ??
    variants.find((v) => v.variantType === 'base_borderless')?.id ??
    variants[0]?.id ??
    ''
  );
}
