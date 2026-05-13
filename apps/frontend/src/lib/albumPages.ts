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

// Each team maps to the two-page spread it occupies in each edition.
// Values corrected for sequential consistency where the source table had typos.
const TEAM_PAGES: Record<string, Record<AlbumEdition, PageSpread>> = {
  Mexico:                 { north_america: [12, 13],   international: [4, 5],   swiss_gold: [8, 9],    south_america: [4, 5] },
  'South Africa':         { north_america: [14, 15],   international: [6, 7],   swiss_gold: [10, 11],  south_america: [6, 7] },
  'South Korea':          { north_america: [16, 17],   international: [8, 9],   swiss_gold: [12, 13],  south_america: [8, 9] },
  Czechia:                { north_america: [18, 19],   international: [10, 11], swiss_gold: [14, 15],  south_america: [10, 11] },
  Canada:                 { north_america: [20, 21],   international: [12, 13], swiss_gold: [16, 17],  south_america: [12, 13] },
  Switzerland:            { north_america: [22, 23],   international: [14, 15], swiss_gold: [18, 19],  south_america: [14, 15] },
  Qatar:                  { north_america: [24, 25],   international: [16, 17], swiss_gold: [20, 21],  south_america: [16, 17] },
  'Bosnia & Herzegovina': { north_america: [26, 27],   international: [18, 19], swiss_gold: [22, 23],  south_america: [18, 19] },
  Brazil:                 { north_america: [28, 29],   international: [20, 21], swiss_gold: [24, 25],  south_america: [20, 21] },
  Morocco:                { north_america: [30, 31],   international: [22, 23], swiss_gold: [26, 27],  south_america: [22, 23] },
  Haiti:                  { north_america: [32, 33],   international: [24, 25], swiss_gold: [28, 29],  south_america: [24, 25] },
  Scotland:               { north_america: [34, 35],   international: [26, 27], swiss_gold: [30, 31],  south_america: [26, 27] },
  'United States':        { north_america: [36, 37],   international: [28, 29], swiss_gold: [32, 33],  south_america: [28, 29] },
  Paraguay:               { north_america: [38, 39],   international: [30, 31], swiss_gold: [34, 35],  south_america: [30, 31] },
  Australia:              { north_america: [40, 41],   international: [32, 33], swiss_gold: [36, 37],  south_america: [32, 33] },
  Türkiye:                { north_america: [42, 43],   international: [34, 35], swiss_gold: [38, 39],  south_america: [34, 35] },
  Turkey:                 { north_america: [42, 43],   international: [34, 35], swiss_gold: [38, 39],  south_america: [34, 35] },
  Germany:                { north_america: [44, 45],   international: [36, 37], swiss_gold: [40, 41],  south_america: [36, 37] },
  'Curaçao':              { north_america: [46, 47],   international: [38, 39], swiss_gold: [42, 43],  south_america: [38, 39] },
  'Ivory Coast':          { north_america: [48, 49],   international: [40, 41], swiss_gold: [44, 45],  south_america: [40, 41] },
  "Côte d'Ivoire":        { north_america: [48, 49],   international: [40, 41], swiss_gold: [44, 45],  south_america: [40, 41] },
  Ecuador:                { north_america: [50, 51],   international: [42, 43], swiss_gold: [46, 47],  south_america: [42, 43] },
  Tunisia:                { north_america: [56, 57],   international: [48, 49], swiss_gold: [52, 53],  south_america: [48, 49] },
  Sweden:                 { north_america: [58, 59],   international: [50, 51], swiss_gold: [54, 55],  south_america: [50, 51] },
  Belgium:                { north_america: [60, 61],   international: [52, 53], swiss_gold: [56, 57],  south_america: [52, 53] },
  Egypt:                  { north_america: [62, 63],   international: [54, 55], swiss_gold: [58, 59],  south_america: [54, 55] },
  Iran:                   { north_america: [64, 65],   international: [56, 57], swiss_gold: [60, 61],  south_america: [56, 57] },
  'New Zealand':          { north_america: [66, 67],   international: [58, 59], swiss_gold: [62, 63],  south_america: [58, 59] },
  Spain:                  { north_america: [68, 69],   international: [60, 61], swiss_gold: [64, 65],  south_america: [60, 61] },
  'Cape Verde':           { north_america: [70, 71],   international: [62, 63], swiss_gold: [66, 67],  south_america: [62, 63] },
  'Saudi Arabia':         { north_america: [72, 73],   international: [64, 65], swiss_gold: [68, 69],  south_america: [64, 65] },
  Uruguay:                { north_america: [74, 75],   international: [66, 67], swiss_gold: [70, 71],  south_america: [66, 67] },
  France:                 { north_america: [76, 77],   international: [68, 69], swiss_gold: [72, 73],  south_america: [68, 69] },
  Senegal:                { north_america: [78, 79],   international: [70, 71], swiss_gold: [74, 75],  south_america: [70, 71] },
  Norway:                 { north_america: [80, 81],   international: [72, 73], swiss_gold: [76, 77],  south_america: [72, 73] },
  Iraq:                   { north_america: [82, 83],   international: [74, 75], swiss_gold: [78, 79],  south_america: [74, 75] },
  Argentina:              { north_america: [88, 89],   international: [80, 81], swiss_gold: [84, 85],  south_america: [80, 81] },
  Jordan:                 { north_america: [90, 91],   international: [82, 83], swiss_gold: [86, 87],  south_america: [82, 83] },
  Portugal:               { north_america: [92, 93],   international: [84, 85], swiss_gold: [88, 89],  south_america: [84, 85] },
  Uzbekistan:             { north_america: [94, 95],   international: [86, 87], swiss_gold: [90, 91],  south_america: [86, 87] },
  Colombia:               { north_america: [96, 97],   international: [88, 89], swiss_gold: [92, 93],  south_america: [88, 89] },
  'DR Congo':             { north_america: [98, 99],   international: [90, 91], swiss_gold: [94, 95],  south_america: [90, 91] },
  England:                { north_america: [100, 101], international: [92, 93], swiss_gold: [96, 97],  south_america: [92, 93] },
  Croatia:                { north_america: [102, 103], international: [94, 95], swiss_gold: [98, 99],  south_america: [94, 95] },
  Ghana:                  { north_america: [104, 105], international: [96, 97], swiss_gold: [100, 101],south_america: [96, 97] },
  Panama:                 { north_america: [106, 107], international: [98, 99], swiss_gold: [102, 103],south_america: [98, 99] },
};

export function getTeamPages(
  teamName: string | null | undefined,
  edition: AlbumEdition,
): PageSpread | null {
  if (!teamName) return null;
  return TEAM_PAGES[teamName]?.[edition] ?? null;
}

export function formatPageSpread([a, b]: PageSpread): string {
  return a === b ? `p. ${a}` : `pp. ${a}–${b}`;
}
