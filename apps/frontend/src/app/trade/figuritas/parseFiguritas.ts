/**
 * parseFiguritas — decode a Figuritas-app QR payload into Cromo trade buckets.
 *
 * Figuritas (FiguritasApp, Album Master, et al.) is the dominant LatAm sticker-
 * swap app for the Panini World Cup 2026 album. Its QR is a *self-contained*
 * text payload — no account, no server call — keyed on the printed album codes,
 * which are exactly Cromo's `album_code` with the section colon removed
 * (`MEX:11` → `MEX11`). That 1:1 mapping is what lets a Cromo user scan a
 * Figuritas QR and match it against their own collection entirely client-side.
 *
 * Two encodings exist in the wild:
 *
 *   Method 1 — human-readable, section-keyed (SUPPORTED):
 *       FIGURITAS_USA2026_EXPORT
 *       NEED[FWC:1,2;MEX:11;CAN:3,5,12]
 *       SWAP[MEX:2,4,5;CAN:2,10]
 *     `NEED[…]` = what they're missing (their wants), `SWAP[…]` = their dupes
 *     (what they offer). We translate to Cromo's canonical HAVE/WANT text and
 *     reuse the shared `parseTradeListItems` so section expansion, dedup, and
 *     offered/wanted classification stay in one tested place.
 *
 *   Method 2 — compact hex bitstring (NOT YET SUPPORTED):
 *       fig://trade/v2?album=wc26&swaps=4A8F91C0E3B&needs=01F2C8D7
 *     The hex is a bitstring over the album's canonical slot order, which we
 *     don't have. Decoding it without that ordering would fabricate matches, so
 *     we detect it and report it honestly rather than guess.
 *
 * Pure + total: never throws, no I/O. The camera/UI layer handles the rest.
 */
import { parseTradeListItems, type TradeListItem } from '@cromo/shared';

export type FiguritasParseResult =
  | { kind: 'ok'; album: string; offered: TradeListItem[]; wanted: TradeListItem[] }
  /** A Method-2 `fig://` bitstring QR — readable but not decodable without the slot order. */
  | { kind: 'unsupported-encoding' }
  /** A valid Figuritas QR, but for a different album than the FIFA World Cup 2026 set. */
  | { kind: 'wrong-album'; album: string }
  /** Not a Figuritas QR at all (or too mangled to read). */
  | { kind: 'unrecognized' };

// Album tokens a Figuritas export may use for the FIFA World Cup 2026 set. The
// US/CAN/MEX edition is the one whose printed codes line up with Cromo's
// catalog; we accept the common spellings rather than a single exact string.
const WC2026_ALBUM_TOKENS = new Set([
  'USA2026', 'US2026', 'WC26', 'WC2026', 'WORLDCUP2026', 'FWC2026', 'MUNDIAL2026', 'FIFA2026',
]);

/** Turn a `SECTION:csv;SECTION:csv` block into newline-separated `SECTION: csv`
 *  lines that `parseTradeListItems` understands (it expands `MEX: 2,4,5`). */
function sectionsToLines(block: string): string {
  return block
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const colon = chunk.indexOf(':');
      if (colon === -1) return chunk; // bare code, let the parser handle it
      const prefix = chunk.slice(0, colon).trim();
      const nums = chunk.slice(colon + 1).trim();
      return `${prefix}: ${nums}`;
    })
    .join('\n');
}

export function parseFiguritas(raw: string): FiguritasParseResult {
  const text = (raw ?? '').trim();
  if (!text) return { kind: 'unrecognized' };

  // Method 2: compact bitstring deep-link. We can read the album but not the
  // payload — surface it as explicitly unsupported.
  if (/^fig:\/\/trade\//i.test(text) || /\bswaps=[0-9a-f]+/i.test(text)) {
    return { kind: 'unsupported-encoding' };
  }

  const need = text.match(/NEED\[([^\]]*)\]/i)?.[1];
  const swap = text.match(/SWAP\[([^\]]*)\]/i)?.[1];
  if (need === undefined && swap === undefined) {
    return { kind: 'unrecognized' };
  }

  // Album guard. The header is `FIGURITAS_<ALBUM>_EXPORT`; if present and not a
  // WC-2026 token, the codes won't line up with Cromo's catalog — say so rather
  // than silently mis-match. A missing header is treated leniently as the WC set.
  const album = text.match(/FIGURITAS_([A-Z0-9]+)_EXPORT/i)?.[1]?.toUpperCase();
  if (album && !WC2026_ALBUM_TOKENS.has(album)) {
    return { kind: 'wrong-album', album };
  }

  // Reuse the shared parser: SWAP → offered (their dupes), NEED → wanted (their
  // wants). The `SWAP`/`NEED` header lines double as bucket markers and are not
  // re-parsed as codes (they're in the parser's NON_PREFIX_WORDS guard).
  const parts: string[] = [];
  if (swap !== undefined) parts.push('SWAP', sectionsToLines(swap));
  if (need !== undefined) parts.push('NEED', sectionsToLines(need));
  const { offered, wanted } = parseTradeListItems(parts.join('\n'));

  return { kind: 'ok', album: album ?? 'USA2026', offered, wanted };
}
