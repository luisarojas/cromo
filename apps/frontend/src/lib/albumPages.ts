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

// Coca-Cola sticker section info varies by edition.
export type CocaColaLocation =
  | { type: 'numbered'; pages: PageSpread; sectionName: string }
  | { type: 'unnumbered'; description: string; sectionName: string };

export const COCA_COLA_LOCATION: Record<AlbumEdition, CocaColaLocation> = {
  north_america: {
    type: 'unnumbered',
    sectionName: 'The Taste of Victory',
    description: 'Inside Back Cover (after p. 112)',
  },
  international: {
    type: 'numbered',
    sectionName: 'The Coca-Cola Collection',
    pages: [56, 57],
  },
  swiss_gold: {
    type: 'numbered',
    sectionName: 'The Coca-Cola Collection',
    pages: [56, 57],
  },
  south_america: {
    type: 'numbered',
    sectionName: 'Magia de la Copa',
    pages: [112, 112],
  },
};

export function formatPageSpread([a, b]: PageSpread): string {
  return a === b ? `p. ${a}` : `pp. ${a}–${b}`;
}
