export interface VariantMeta {
  label: string;
  swatch: string;
  short: string;
  rarity: string;
}

export const VARIANT_META: Record<string, VariantMeta> = {
  base_border:          { label: 'Base (White Border)',     short: 'Base (White)',   swatch: 'bg-white border-[var(--cromo-border-strong)]',    rarity: 'Common' },
  base_borderless:      { label: 'Base (Borderless)',       short: 'Base (Intl.)', swatch: 'bg-white border-[var(--cromo-border-strong)]', rarity: 'Common' },
  blue:                 { label: 'Blue parallel',           short: 'Blue',      swatch: 'bg-blue-900',              rarity: 'Uncommon' },
  red:                  { label: 'Red parallel',            short: 'Red',       swatch: 'bg-[var(--cromo-danger)]',               rarity: 'Rare' },
  purple:               { label: 'Purple parallel',         short: 'Purple',    swatch: 'bg-[var(--cromo-tier-very-rare)]',            rarity: 'Very Rare' },
  green:                { label: 'Green parallel',          short: 'Green',     swatch: 'bg-green-800',                          rarity: 'Ultra Rare' },
black:                  { label: 'Black',                   short: 'Black',     swatch: 'bg-black',                 rarity: 'Unique' },
  orange_amazon:        { label: 'Orange (Amazon)',         short: 'Orange',    swatch: 'bg-orange-500',            rarity: 'Exclusive' },
  gold_crumple:         { label: 'Gold Flood Crumple',      short: 'Gold Crmp', swatch: 'bg-yellow-400',            rarity: 'iCollect' },
  blue_crumple:         { label: 'Blue Crumple',            short: 'Blue Crmp', swatch: 'bg-blue-900',              rarity: 'iCollect' },
  red_crumple:          { label: 'Red Crumple',             short: 'Red Crmp',  swatch: 'bg-red-400',               rarity: 'iCollect Rare' },
  purple_crumple:       { label: 'Purple Crumple',          short: 'Pur Crmp',  swatch: 'bg-purple-400',            rarity: 'iCollect Very Rare' },
  green_crumple:        { label: 'Green Crumple',           short: 'Grn Crmp',  swatch: 'bg-green-800',                          rarity: 'iCollect Ultra Rare' },
  black_crumple:   { label: 'Black Crumple',           short: 'Blk Crmp',  swatch: 'bg-neutral-900',           rarity: 'iCollect Unique' },
  extra_purple:         { label: 'Extra — Purple',          short: 'EX Purple', swatch: 'bg-purple-400',            rarity: 'Base Extra' },
  extra_bronze:         { label: 'Extra — Bronze',          short: 'EX Bronze', swatch: 'bg-amber-600',             rarity: 'Uncommon' },
  extra_silver:         { label: 'Extra — Silver',          short: 'EX Silver', swatch: 'bg-slate-400',             rarity: 'Rare' },
  extra_gold:           { label: 'Extra — Gold',            short: 'EX Gold',   swatch: 'bg-[var(--cromo-warning)]',            rarity: 'Ultra Rare' },
  swiss_green:          { label: 'Green (United Edition)',  short: 'Swiss',     swatch: 'bg-[var(--cromo-success)]',             rarity: 'Swiss Edition' },
};

export const ALL_VARIANT_TYPES = Object.keys(VARIANT_META);

const VARIANT_ORDER: Record<string, number> = Object.fromEntries(
  ALL_VARIANT_TYPES.map((type, idx) => [type, idx]),
);

// Canonical display order for any variant-typed list (pills, popover lists,
// pickers). Unknown types sort to the end, alphabetically, so a stray new
// variant never silently reorders the rest.
export function compareVariantTypes(a: string, b: string): number {
  const ai = VARIANT_ORDER[a] ?? Number.MAX_SAFE_INTEGER;
  const bi = VARIANT_ORDER[b] ?? Number.MAX_SAFE_INTEGER;
  if (ai !== bi) return ai - bi;
  return a.localeCompare(b);
}

export function variantLabel(type: string): string {
  return VARIANT_META[type]?.label ?? type;
}

export function variantShort(type: string): string {
  return VARIANT_META[type]?.short ?? type;
}

export function variantSwatch(type: string): string {
  return VARIANT_META[type]?.swatch ?? 'bg-gray-300';
}

export function variantRarity(type: string): string {
  return VARIANT_META[type]?.rarity ?? '';
}

export function isBaseVariant(type: string): boolean {
  return type === 'base_border' || type === 'base_borderless';
}
