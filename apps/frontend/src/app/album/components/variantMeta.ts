export interface VariantMeta {
  label: string;
  swatch: string;
  short: string;
}

export const VARIANT_META: Record<string, VariantMeta> = {
  base:                { label: 'Base',                short: 'Base',  swatch: 'bg-white border-gray-400' },
  blue:                { label: 'Blue parallel',       short: 'Blue',  swatch: 'bg-blue-500' },
  red:                 { label: 'Red parallel',        short: 'Red',   swatch: 'bg-red-500' },
  purple:              { label: 'Purple parallel',     short: 'Purple',swatch: 'bg-purple-500' },
  green:               { label: 'Green parallel',      short: 'Green', swatch: 'bg-green-500' },
  black_1of1:          { label: 'Black 1/1',           short: 'Black 1/1', swatch: 'bg-black' },
  orange_amazon:       { label: 'Orange (Amazon)',     short: 'Orange',swatch: 'bg-orange-500' },
  gold_crumple:        { label: 'Gold Flood Crumple',  short: 'Crumple', swatch: 'bg-yellow-400' },
  extra_base:          { label: 'Extra — Base',        short: 'EX Base',   swatch: 'bg-white border-gray-400' },
  extra_bronze:        { label: 'Extra — Bronze',      short: 'EX Bronze', swatch: 'bg-amber-600' },
  extra_silver:        { label: 'Extra — Silver',      short: 'EX Silver', swatch: 'bg-slate-400' },
  extra_gold:          { label: 'Extra — Gold',        short: 'EX Gold',   swatch: 'bg-yellow-500' },
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
