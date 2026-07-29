/**
 * parseTradeList — turn a free-form text block into offered/wanted code lists.
 *
 * Real collectors paste lists in wildly different shapes. The parser supports:
 *   • Inline codes: "BRA5, ARG7"
 *   • Prefix-then-numbers: "BRA: 5, 7, 19" / "BRA - 5, 7" / "BRA 5 7 19"
 *   • Flag emoji decoration: "🇲🇽 MEX - 5, 18, 20"
 *   • Mixed case: "Fwc 1, 2, 3"
 *   • Full country names instead of FIFA codes: "Mexico: 6, 10, 11",
 *     "South Korea: 1, 3, 7", "Cote D'Ivoire: 4, 5", "Bosnia & Herzegovina: 2"
 *   • Common misspellings & exonyms: "Columbia"→COL, "Czechia"/"Czech Republic"
 *     →CZE, "Turkey"/"Türkiye"→TUR, "Holland"→NED, "Cape Verde"/"Cabo Verde"
 *     →CPV, "Ivory Coast"→CIV
 *   • Glued-number typos from missing commas: "714" → "7, 14", "1920" →
 *     "19, 20" (only when the split is unambiguous and each half is ≤99,
 *     since no team in this catalog has more than 20 stickers)
 *   • Section headers anywhere in a line: "What I need:", "ISO (Looking for):",
 *     "DUPLICATES:", "SWAPS:", "Up for trade:"
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
  'swap', 'swaps', 'swapping',
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
  'ISO', 'LIST', 'FROM', 'TRADE', 'SWAP', 'SWAPS', 'SWAPPING',
  // Common English filler
  'THE', 'AND', 'FOR', 'WITH', 'ALL', 'ANY', 'OUR', 'YOU', 'WE', 'IT', 'TO',
  'OF', 'IS', 'ARE', 'BUT', 'NOT', 'OR', 'IN', 'ON', 'AT', 'BY', 'AN', 'AS',
  'BE', 'DO', 'GO', 'SO', 'UP', 'IF', 'NEW', 'OLD', 'YES', 'NO',
  'FULL', 'PAGE', 'HALF', 'EACH', 'BOTH', 'JUST', 'ONLY', 'ALSO',
  'HEY', 'HI', 'THX', 'PLS', 'OKAY', 'HOLA', 'SOLO',
  'ONE', 'TWO', 'TEN',
]);

// Full country-name → FIFA code mapping. Collectors writing by hand often
// type the country name out instead of the three-letter code. Keys are
// already normalised (lowercased, accents stripped, apostrophes removed,
// single spaces between words). The preprocessor in normaliseLine() applies
// the same normalisation to the input before matching.
//
// Aliases include common misspellings (Columbia→COL), historical exonyms
// (Ivory Coast→CIV, Holland→NED), and the FWC special section.
const COUNTRY_ALIASES: ReadonlyArray<readonly [string, string]> = [
  // Group A
  ['mexico', 'MEX'],
  ['czechia', 'CZE'],
  ['czech republic', 'CZE'],
  ['south africa', 'RSA'],
  ['south korea', 'KOR'],
  ['korea', 'KOR'],
  // Group B
  ['canada', 'CAN'],
  ['bosnia and herzegovina', 'BIH'],
  ['bosnia herzegovina', 'BIH'],
  ['bosnia', 'BIH'],
  ['qatar', 'QAT'],
  ['switzerland', 'SUI'],
  // Group C
  ['spain', 'ESP'],
  ['algeria', 'ALG'],
  ['japan', 'JPN'],
  ['new zealand', 'NZL'],
  // Group D
  ['united states', 'USA'],
  ['paraguay', 'PAR'],
  ['australia', 'AUS'],
  ['turkey', 'TUR'],
  ['turkiye', 'TUR'],
  // Group E
  ['argentina', 'ARG'],
  ['ecuador', 'ECU'],
  ['sweden', 'SWE'],
  ['ivory coast', 'CIV'],
  ['cote divoire', 'CIV'],
  // Group F
  ['germany', 'GER'],
  ['scotland', 'SCO'],
  ['curacao', 'CUW'],
  ['iran', 'IRN'],
  // Group G
  ['belgium', 'BEL'],
  ['egypt', 'EGY'],
  ['jordan', 'JOR'],
  ['haiti', 'HAI'],
  // Group H
  ['portugal', 'POR'],
  ['colombia', 'COL'],
  ['columbia', 'COL'],
  ['uzbekistan', 'UZB'],
  ['congo dr', 'COD'],
  ['dr congo', 'COD'],
  // Group I
  ['france', 'FRA'],
  ['norway', 'NOR'],
  ['senegal', 'SEN'],
  ['iraq', 'IRQ'],
  // Group J
  ['england', 'ENG'],
  ['netherlands', 'NED'],
  ['holland', 'NED'],
  ['ghana', 'GHA'],
  ['tunisia', 'TUN'],
  // Group K
  ['brazil', 'BRA'],
  ['morocco', 'MAR'],
  ['croatia', 'CRO'],
  ['saudi arabia', 'KSA'],
  // Group L
  ['uruguay', 'URU'],
  ['austria', 'AUT'],
  ['panama', 'PAN'],
  ['cape verde', 'CPV'],
  ['cabo verde', 'CPV'],
  // Specials
  ['fifa world cup', 'FWC'],
  ['world cup', 'FWC'],
  ['coca cola', 'CC'],
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Single regex matching any alias. Longest-first so multi-word names beat
// their single-word substrings (e.g. "south korea" wins over "korea").
// Whitespace inside an alias is treated as `\s+` so collectors can use any
// run of spaces, tabs, or non-breaking spaces.
const ALIAS_REGEX: RegExp = (() => {
  const sorted = [...COUNTRY_ALIASES].sort((a, b) => b[0].length - a[0].length);
  const parts = sorted.map(([key]) =>
    key.split(' ').map(escapeRegex).join('\\s+'),
  );
  return new RegExp(`\\b(?:${parts.join('|')})\\b`, 'gi');
})();

const ALIAS_LOOKUP: ReadonlyMap<string, string> = new Map(
  COUNTRY_ALIASES.map(([k, v]) => [k, v]),
);

/**
 * normaliseLine — fold accents, drop apostrophes, expand ampersands, then
 * replace any country-name alias with its FIFA code. The result is fed to the
 * existing tokenizer, which only needs to recognise 2–4-letter prefixes and
 * numbers — so this step is purely additive: codes already in the input
 * (BRA5, MEX, FWC) pass through untouched.
 */
function normaliseLine(line: string): string {
  const normalised = line
    .normalize('NFD')
    // U+0300–U+036F are the combining diacritical marks left over after NFD
    // decomposes characters like "ü" → "u" + combining-diaeresis.
    .replace(/[̀-ͯ]/g, '')
    // Curly + straight apostrophes glue letters across the punctuation so
    // "Cote D'Ivoire" → "Cote DIvoire" → alias "cote divoire" matches.
    .replace(/['‘’`]/g, '')
    // Ampersand is just decorative between country-name words.
    .replace(/&/g, ' ');

  return normalised.replace(ALIAS_REGEX, (match) => {
    const key = match.toLowerCase().replace(/\s+/g, ' ');
    return ALIAS_LOOKUP.get(key) ?? match;
  });
}

/**
 * splitGluedDigits — recover the numbers a collector meant when they dropped
 * a comma between two of them ("714" → [7,14], "1920" → [19,20]). The catalog
 * caps every team at 20 stickers, so anything ≥ 100 is almost certainly two
 * glued numbers. Split only when the result is unambiguous; otherwise return
 * null and let the caller drop the token.
 */
function splitGluedDigits(digits: string): number[] | null {
  const n = Number.parseInt(digits, 10);
  if (digits.length <= 2) return n >= 1 ? [n] : null;

  if (digits.length === 3) {
    // Prefer 1+2 (e.g. "714" → 7, 14) since the typical glue is a single-digit
    // sticker followed by a two-digit one. Fall back to 2+1 only when 1+2 is
    // invalid (leading 0 in the second half).
    const a = Number.parseInt(digits[0]!, 10);
    const b = Number.parseInt(digits.slice(1), 10);
    if (a >= 1 && b >= 10 && b <= 99) return [a, b];
    const c = Number.parseInt(digits.slice(0, 2), 10);
    const d = Number.parseInt(digits[2]!, 10);
    if (c >= 10 && c <= 99 && d >= 1) return [c, d];
    return null;
  }

  if (digits.length === 4) {
    const a = Number.parseInt(digits.slice(0, 2), 10);
    const b = Number.parseInt(digits.slice(2), 10);
    if (a >= 10 && a <= 99 && b >= 10 && b <= 99) return [a, b];
    return null;
  }

  return null;
}

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

    // Country-name preprocessing happens here so the tokenizer downstream
    // only ever sees 2–4-letter FIFA codes. We use the normalised line as the
    // single source of truth for marker detection too, so "DUPLICATES:" and
    // "WHAT I NEED:" headers work regardless of accents/punctuation.
    const line = normaliseLine(rawLine);
    const lower = line.toLowerCase();

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
    //   3. Bare digit run — attaches to the most recent prefix on this line.
    //      Captured as `\d+` (not `\d{1,3}`) so glued typos like "1920" reach
    //      splitGluedDigits() intact instead of being silently truncated.
    // Resetting lastPrefix at every newline keeps a prefix on line N from
    // bleeding into unrelated codes on line N+1.
    let lastPrefix: string | null = null;
    const tokenRegex = /([A-Za-z]{2,4})(\d{1,3})|\b([A-Za-z]{2,4})\b|\b(\d+)\b/g;
    let match: RegExpExecArray | null;
    while ((match = tokenRegex.exec(line)) !== null) {
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
        // splitGluedDigits handles both the simple 1-2 digit case and the
        // missing-comma recovery for 3-4 digit runs. Album codes start at 1,
        // so leading-zero noise ("00") falls out automatically.
        const parts = splitGluedDigits(numberOnly);
        if (!parts) continue;
        for (const n of parts) emit(`${lastPrefix}${n}`);
      }
    }
  }

  return {
    offered: [...offered],
    wanted: [...wanted],
  };
}

// ─── Variant-aware parser ─────────────────────────────────────────────────
// parseTradeListItems extends parseTradeList with two pieces of trailing
// metadata that collectors care about in third-party trades:
//   1. A variant tag in parens or after a colon: "BRA5(red)", "BRA5:red",
//      "BRA5 red". Multi-word tags work too: "BRA5(red crumple)".
//   2. A quantity multiplier: "BRA5 x2", "BRA5(red)x3", "BRA5 *4".
// Codes without a tag are emitted with variantToken=null; the backend then
// resolves null to the album's appropriate base variant. Unknown variant
// words pass through as the raw lowercased token so the backend can echo
// them back in `unknownCodes` — that's a better signal than silently
// dropping the tag.

export interface TradeListItem {
  albumCode: string;
  variantToken: string | null;
  quantity: number;
}

export interface TradeListItemBuckets {
  offered: TradeListItem[];
  wanted: TradeListItem[];
}

// User-facing variant words → canonical VariantType tokens. Keys are kept
// short and natural — what people actually type. Multi-word entries use a
// single space; the normaliser collapses runs of whitespace before lookup.
// Ambiguous bare words ("gold", "purple", "bronze", "silver") are routed to
// their core meaning here; the backend resolves Extras-vs-Core based on the
// album_code's sticker_type, so "EX5(gold)" still resolves to extra_gold.
const VARIANT_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ['base', 'base'],
  ['white', 'base_border'],
  ['white border', 'base_border'],
  ['borderless', 'base_borderless'],
  ['no border', 'base_borderless'],
  ['blue', 'blue'],
  ['red', 'red'],
  ['purple', 'purple'],
  ['green', 'green'],
  ['black', 'black'],
  ['orange', 'orange_amazon'],
  ['amazon', 'orange_amazon'],
  ['swiss', 'swiss_green'],
  ['swiss green', 'swiss_green'],
  ['light green', 'swiss_green'],
  ['gold', 'gold_crumple'],
  ['gold crumple', 'gold_crumple'],
  ['blue crumple', 'blue_crumple'],
  ['red crumple', 'red_crumple'],
  ['purple crumple', 'purple_crumple'],
  ['green crumple', 'green_crumple'],
  ['black crumple', 'black_crumple'],
  ['crumple', 'gold_crumple'],
  ['bronze', 'extra_bronze'],
  ['silver', 'extra_silver'],
  ['extra', 'extra_purple'],
  ['extra purple', 'extra_purple'],
  ['extra bronze', 'extra_bronze'],
  ['extra silver', 'extra_silver'],
  ['extra gold', 'extra_gold'],
];

const VARIANT_ALIAS_MAP: ReadonlyMap<string, string> = new Map(
  VARIANT_ALIASES.map(([k, v]) => [k, v]),
);

// Also accept the canonical tokens themselves so "BRA5(extra_gold)" works.
const CANONICAL_VARIANT_TOKENS: ReadonlySet<string> = new Set([
  'base_border', 'base_borderless', 'blue', 'red', 'purple', 'green', 'black',
  'orange_amazon', 'gold_crumple', 'blue_crumple', 'red_crumple',
  'purple_crumple', 'green_crumple', 'black_crumple',
  'extra_purple', 'extra_bronze', 'extra_silver', 'extra_gold',
  'swiss_green',
]);

/**
 * Resolve user-typed variant text to a canonical VariantType token, or the
 * raw normalised string when no alias matches. Returning the raw string lets
 * the backend surface it in `unknownCodes` for the warning UI.
 */
export function resolveVariantToken(raw: string): string {
  const norm = raw.trim().toLowerCase().replace(/[_\s]+/g, ' ').replace(/[()]/g, '');
  if (!norm) return '';
  if (CANONICAL_VARIANT_TOKENS.has(norm.replace(/ /g, '_'))) {
    return norm.replace(/ /g, '_');
  }
  // Try the longest matching prefix so "red crumple foil" still resolves to red_crumple.
  const sorted = [...VARIANT_ALIASES].sort((a, b) => b[0].length - a[0].length);
  for (const [alias, token] of sorted) {
    if (norm === alias) return token;
  }
  // Single-word match (e.g. "Red Crumple" with trailing noise).
  const first = norm.split(' ')[0];
  if (first && VARIANT_ALIAS_MAP.has(first)) return VARIANT_ALIAS_MAP.get(first)!;
  return norm.replace(/ /g, '_');
}

interface VariantTail {
  variantToken: string | null;
  quantity: number;
  /** Number of characters consumed from the source string (for the tokenizer). */
  consumed: number;
}

// Match an optional trailing variant + quantity after a code. Greedy enough
// to capture "(red crumple) x2" as one tail, conservative enough that the
// next code on the same line still parses normally. The colon form is
// limited to single tokens — "BRA5:red", "BRA5:gold_crumple" — and stops
// at the next word boundary; multi-word aliases must use parens.
const TAIL_REGEX = /^\s*(?:\(([^)]+)\)|:([a-zA-Z][a-zA-Z_-]*))?\s*(?:[x×*]\s*(\d{1,3}))?/i;

function parseTail(rest: string): VariantTail {
  const m = TAIL_REGEX.exec(rest);
  if (!m) return { variantToken: null, quantity: 1, consumed: 0 };
  const [whole, parenTag, colonTag, qty] = m;
  const rawTag = parenTag ?? colonTag ?? null;
  const variantToken = rawTag ? resolveVariantToken(rawTag) : null;
  const quantity = qty ? Math.max(1, Math.min(99, Number.parseInt(qty, 10))) : 1;
  return { variantToken, quantity, consumed: whole?.length ?? 0 };
}

/**
 * @param defaultBucket Where codes before any HAVE/WANT header land. Defaults to
 *   'offered' (a pasted dupes list is the common case). The Live Room passes
 *   'wanted': a guest typing a bare list there is stating what they're after, so
 *   an untagged list should read as their wants, not their offers.
 */
export function parseTradeListItems(
  value: string,
  defaultBucket: Bucket = 'offered',
): TradeListItemBuckets {
  // Last-write-wins on (albumCode, variantToken) — the user pasting "BRA5(red),
  // BRA5(red) x2" almost certainly means quantity 2, not two separate lines.
  const offered = new Map<string, TradeListItem>();
  const wanted = new Map<string, TradeListItem>();
  let current: Bucket = defaultBucket;

  const keyOf = (code: string, token: string | null) => `${code}|${token ?? ''}`;

  const emit = (item: TradeListItem) => {
    const k = keyOf(item.albumCode, item.variantToken);
    if (current === 'offered') {
      if (wanted.has(k)) return;
      if (offered.size >= HARD_LIMIT && !offered.has(k)) return;
      const existing = offered.get(k);
      offered.set(k, existing ? { ...existing, quantity: existing.quantity + item.quantity } : item);
    } else {
      offered.delete(k);
      if (wanted.size >= HARD_LIMIT && !wanted.has(k)) return;
      const existing = wanted.get(k);
      wanted.set(k, existing ? { ...existing, quantity: existing.quantity + item.quantity } : item);
    }
  };

  const lines = value.split(/\r?\n+/);
  for (const rawLine of lines) {
    if (!rawLine.trim()) continue;
    const line = normaliseLine(rawLine);
    const lower = line.toLowerCase();

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

    // Walk the line manually so a code consumes any trailing variant tail
    // before the regex advances. lastIndex tracks where the next token search
    // resumes from.
    const tokenRegex = /([A-Za-z]{2,4})(\d{1,3})|\b([A-Za-z]{2,4})\b|\b(\d+)\b/g;
    let lastPrefix: string | null = null;
    let match: RegExpExecArray | null;
    while ((match = tokenRegex.exec(line)) !== null) {
      const [, inlinePrefix, inlineNumber, prefixOnly, numberOnly] = match;
      if (inlinePrefix && inlineNumber) {
        const prefix = inlinePrefix.toUpperCase();
        if (NON_PREFIX_WORDS.has(prefix)) continue;
        const code = `${prefix}${Number.parseInt(inlineNumber, 10)}`;
        const tail = parseTail(line.slice(tokenRegex.lastIndex));
        emit({ albumCode: code, variantToken: tail.variantToken, quantity: tail.quantity });
        tokenRegex.lastIndex += tail.consumed;
        lastPrefix = prefix;
      } else if (prefixOnly) {
        const prefix = prefixOnly.toUpperCase();
        if (NON_PREFIX_WORDS.has(prefix)) continue;
        lastPrefix = prefix;
      } else if (numberOnly) {
        if (!lastPrefix) continue;
        const parts = splitGluedDigits(numberOnly);
        if (!parts) continue;
        // Variant + quantity tail attaches only to the *last* number in a
        // glued/listed run — "BRA: 5, 7 (red) x2" means BRA7(red) x2, not
        // both. Keeps the parser predictable for hand-written lists.
        for (let i = 0; i < parts.length - 1; i++) {
          emit({ albumCode: `${lastPrefix}${parts[i]}`, variantToken: null, quantity: 1 });
        }
        const tail = parseTail(line.slice(tokenRegex.lastIndex));
        const last = parts[parts.length - 1]!;
        emit({ albumCode: `${lastPrefix}${last}`, variantToken: tail.variantToken, quantity: tail.quantity });
        tokenRegex.lastIndex += tail.consumed;
      }
    }
  }

  return {
    offered: [...offered.values()],
    wanted: [...wanted.values()],
  };
}
