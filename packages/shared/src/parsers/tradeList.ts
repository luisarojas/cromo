/**
 * parseTradeList — turn a free-form text block into offered/wanted code lists.
 *
 * Real collectors paste lists in wildly different shapes. The parser supports:
 *   • Inline codes: "BRA5, ARG7"
 *   • Prefix-then-numbers: "BRA: 5, 7, 19" / "BRA - 5, 7" / "BRA 5 7 19"
 *   • Flag emoji decoration: "🇲🇽 MEX - 5, 18, 20"
 *   • Mixed case: "Fwc 1, 2, 3"
 *   • Section headers anywhere in a line: "What I need:", "ISO (Looking for):",
 *     "Up for trade:"
 *   • Spanish markers: "tengo", "busco", "falta", etc.
 *   • Commentary lines without codes are skipped without producing garbage.
 *
 * The parser is intentionally lenient: it never throws, and it will silently
 * drop any token it can't confidently classify. The backend's matchPair
 * endpoint echoes back unknown codes so the user sees what we missed.
 */

export interface TradeListBuckets {
  offered: string[];
  wanted: string[];
}

const OFFERED_MARKERS = [
  'have', 'haves', 'offered', 'offering', 'offer', 'for trade', 'fortrade',
  'up for trade', 'dupes', 'duplicates', 'duplicate', 'dupe',
  'tiene', 'tengo', 'ofrezco', 'cambio',
];

const WANTED_MARKERS = [
  'want', 'wants', 'wanted', 'need', 'needs', 'looking for', 'lookingfor',
  'iso', 'in search of', 'missing', 'busca', 'busco', 'falta', 'faltan',
  'necesito',
];

// 2–4-letter tokens that look like prefixes but are actually English/Spanish
// noise. Real FIFA codes never collide with these (USA, ESP, etc. are not
// here). Without this guard, lines like "first to have 1 full page" would
// generate phantom codes such as FULL1.
const NON_PREFIX_WORDS = new Set([
  // Section markers — we don't want them re-parsed as codes after we've
  // already used them for bucket detection.
  'HAVE', 'HAVES', 'WANT', 'WANTS', 'NEED', 'NEEDS', 'DUPE', 'DUPES',
  'ISO', 'LIST', 'FROM', 'TRADE', 'SWAP',
  // Common English filler
  'THE', 'AND', 'FOR', 'WITH', 'ALL', 'ANY', 'OUR', 'YOU', 'WE', 'IT', 'TO',
  'OF', 'IS', 'ARE', 'BUT', 'NOT', 'OR', 'IN', 'ON', 'AT', 'BY', 'AN', 'AS',
  'BE', 'DO', 'GO', 'SO', 'UP', 'IF', 'NEW', 'OLD', 'YES', 'NO',
  'FULL', 'PAGE', 'HALF', 'EACH', 'BOTH', 'JUST', 'ONLY', 'ALSO',
  'HEY', 'HI', 'THX', 'PLS', 'OKAY', 'HOLA', 'SOLO',
  'ONE', 'TWO', 'TEN',
]);

const HARD_LIMIT = 500;

type Bucket = 'offered' | 'wanted';

/**
 * Find the start index of a marker phrase (e.g. "looking for") inside the
 * already-lowercased haystack, respecting word boundaries on both sides so
 * "for" doesn't match inside "FOR" inside "fortuna".
 */
function findMarkerIndex(lower: string, marker: string): number {
  const pattern = new RegExp(`\\b${marker.replace(/ /g, '\\s+')}\\b`);
  const m = pattern.exec(lower);
  return m ? m.index : -1;
}

export function parseTradeList(value: string): TradeListBuckets {
  const offered = new Set<string>();
  const wanted = new Set<string>();
  let current: Bucket = 'offered';

  const emit = (code: string) => {
    // wanted wins on conflict — mirrors the AI prompt's R6.
    if (current === 'offered') {
      if (!wanted.has(code) && offered.size < HARD_LIMIT) offered.add(code);
    } else {
      offered.delete(code);
      if (wanted.size < HARD_LIMIT) wanted.add(code);
    }
  };

  const lines = value.split(/\r?\n+/);
  for (const rawLine of lines) {
    if (!rawLine.trim()) continue;

    const lower = rawLine.toLowerCase();

    // Header detection: pick whichever marker appears first in the line.
    // A line can be header-only ("What I need:") or header-plus-codes
    // ("HAVE: BRA5, ARG7") — either way, codes on the same line land in
    // the bucket implied by the marker.
    let firstOffered = Infinity;
    let firstWanted = Infinity;
    for (const m of OFFERED_MARKERS) {
      const idx = findMarkerIndex(lower, m);
      if (idx !== -1 && idx < firstOffered) firstOffered = idx;
    }
    for (const m of WANTED_MARKERS) {
      const idx = findMarkerIndex(lower, m);
      if (idx !== -1 && idx < firstWanted) firstWanted = idx;
    }
    if (firstOffered < firstWanted) current = 'offered';
    else if (firstWanted < firstOffered) current = 'wanted';

    // Tokenise. The alternation matters:
    //   1. Inline code (BRA5) — letters glued to digits.
    //   2. Bare prefix (BRA, with word boundaries) — sets state for the
    //      following bare numbers.
    //   3. Bare number — attaches to the most recent prefix on this line.
    // Resetting lastPrefix at every newline keeps a prefix on line N from
    // bleeding into unrelated codes on line N+1.
    let lastPrefix: string | null = null;
    const tokenRegex = /([A-Za-z]{2,4})(\d{1,3})|\b([A-Za-z]{2,4})\b|\b(\d{1,3})\b/g;
    let match: RegExpExecArray | null;
    while ((match = tokenRegex.exec(rawLine)) !== null) {
      const [, inlinePrefix, inlineNumber, prefixOnly, numberOnly] = match;
      if (inlinePrefix && inlineNumber) {
        const prefix = inlinePrefix.toUpperCase();
        if (NON_PREFIX_WORDS.has(prefix)) continue;
        emit(`${prefix}${Number.parseInt(inlineNumber, 10)}`);
        lastPrefix = prefix;
      } else if (prefixOnly) {
        const prefix = prefixOnly.toUpperCase();
        if (NON_PREFIX_WORDS.has(prefix)) continue;
        lastPrefix = prefix;
      } else if (numberOnly) {
        if (!lastPrefix) continue;
        const n = Number.parseInt(numberOnly, 10);
        // Album codes start at 1. Treat 0 / leading-zero noise (e.g. "00" in
        // the wild) as a typo and skip; downstream catalog lookup would drop
        // them anyway.
        if (n < 1) continue;
        emit(`${lastPrefix}${n}`);
      }
    }
  }

  return {
    offered: [...offered],
    wanted: [...wanted],
  };
}
