export type AlbumEdition =
  | 'north_america'
  | 'international'
  | 'swiss_gold'
  | 'south_america';

export const EDITION_LABELS: Record<AlbumEdition, string> = {
  north_america: 'North American (Host)',
  international: 'International',
  swiss_gold: 'Swiss Gold',
  south_america: 'South American',
};

export const ALL_EDITIONS = Object.keys(EDITION_LABELS) as AlbumEdition[];

type PageSpread = [number, number];

export function formatPageSpread([a, b]: PageSpread): string {
  return a === b ? `p. ${a}` : `pp. ${a}–${b}`;
}
