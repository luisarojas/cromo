/**
 * Registry of third-party sticker apps Cromo can import a trade list from.
 *
 * The Trade page's "Import from another app" button is backed entirely by this
 * list — adding support for another app (StickerSwap, Album Master, …) is a
 * single entry here plus its parser, with no UI changes. Each app exposes one
 * import `method` and a parser that turns a scanned QR's raw text into Cromo
 * trade buckets (or a typed failure the scanner can explain).
 */
import type { TradeListItem } from '@cromo/shared';
import { parseFiguritas } from './figuritas/parseFiguritas';

/** Outcome of decoding one app's QR. Mirrors the per-app parser results but
 *  drops app-specific extras so the scanner UI stays generic. */
export type ImportOutcome =
  | { kind: 'ok'; offered: TradeListItem[]; wanted: TradeListItem[] }
  /** Readable QR, but an encoding Cromo can't decode yet (e.g. a bitstring). */
  | { kind: 'unsupported-encoding' }
  /** A valid QR for a different album than the one being matched. */
  | { kind: 'wrong-album'; album: string }
  /** Not this app's trade QR at all (a profile link, app-store URL, junk). */
  | { kind: 'unrecognized' };

export interface ThirdPartyApp {
  id: string;
  /** Display name, also used in the scanner's instructions and error copy. */
  name: string;
  /** One-line description shown in the app chooser. */
  blurb: string;
  /** How a user imports from this app. Only QR scanning today. */
  method: 'qr';
  /** Decode a scanned QR's raw text into Cromo trade buckets, or a typed failure. */
  parseQr(raw: string): ImportOutcome;
}

export const THIRD_PARTY_APPS: ThirdPartyApp[] = [
  {
    id: 'figuritas',
    name: 'Figuritas',
    blurb: 'Scan their in-app trade QR (intercambio).',
    method: 'qr',
    parseQr(raw) {
      const result = parseFiguritas(raw);
      if (result.kind === 'ok') {
        return { kind: 'ok', offered: result.offered, wanted: result.wanted };
      }
      // The remaining Figuritas result kinds line up with ImportOutcome 1:1.
      return result;
    },
  },
];
