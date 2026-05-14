export interface VariantMeta {
  label: string;
  swatch: string;
  short: string;
  rarity: string;
}

export const VARIANT_META: Record<string, VariantMeta> = {
  base:                { label: 'Base',                short: 'Base',      swatch: 'bg-white border-gray-400', rarity: 'Common' },
  blue:                { label: 'Blue parallel',       short: 'Blue',      swatch: 'bg-blue-500',              rarity: 'Uncommon' },
  red:                 { label: 'Red parallel',        short: 'Red',       swatch: 'bg-red-500',               rarity: 'Rare' },
  purple:              { label: 'Purple parallel',     short: 'Purple',    swatch: 'bg-purple-500',            rarity: 'Epic' },
  green:               { label: 'Green parallel',      short: 'Green',     swatch: 'bg-green-500',             rarity: 'Legendary' },
  black_1of1:          { label: 'Black',               short: 'Black',     swatch: 'bg-black',                 rarity: '1 of 1' },
  orange_amazon:       { label: 'Orange (Amazon)',     short: 'Orange',    swatch: 'bg-orange-500',            rarity: 'Exclusive' },
  gold_crumple:        { label: 'Gold Flood Crumple',  short: 'Crumple',   swatch: 'bg-yellow-400',            rarity: 'Ultra Rare' },
  extra_base:          { label: 'Extra — Base',        short: 'EX Base',   swatch: 'bg-white border-gray-400', rarity: 'Common' },
  extra_bronze:        { label: 'Extra — Bronze',      short: 'EX Bronze', swatch: 'bg-amber-600',             rarity: 'Uncommon' },
  extra_silver:        { label: 'Extra — Silver',      short: 'EX Silver', swatch: 'bg-slate-400',             rarity: 'Rare' },
  extra_gold:          { label: 'Extra — Gold',        short: 'EX Gold',   swatch: 'bg-yellow-500',            rarity: 'Legendary' },
  swiss_gold:          { label: 'Swiss Gold',          short: 'Swiss',     swatch: 'bg-yellow-300',            rarity: 'Swiss Edition' },
};

export const ALL_VARIANT_TYPES = Object.keys(VARIANT_META);

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
