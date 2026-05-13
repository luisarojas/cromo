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
  gold_crumple:        { label: 'Gold crumple',        short: 'Gold',  swatch: 'bg-yellow-400' },
  blue_crumple:        { label: 'Blue crumple',        short: 'Blue ◊',swatch: 'bg-blue-400' },
  red_crumple:         { label: 'Red crumple',         short: 'Red ◊', swatch: 'bg-red-400' },
  purple_crumple:      { label: 'Purple crumple',      short: 'Purple ◊', swatch: 'bg-purple-400' },
  green_crumple:       { label: 'Green crumple',       short: 'Green ◊',  swatch: 'bg-green-400' },
  black_crumple_1of1:  { label: 'Black crumple 1/1',   short: 'Black ◊ 1/1', swatch: 'bg-gray-900' },
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
