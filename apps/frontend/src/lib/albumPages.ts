type PageSpread = [number, number];

export function formatPageSpread([a, b]: PageSpread): string {
  return a === b ? `p. ${a}` : `pp. ${a}–${b}`;
}
