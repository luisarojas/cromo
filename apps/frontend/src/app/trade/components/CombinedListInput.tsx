'use client';

import { useRef, useState } from 'react';
import { parseTradeListItems, type TradeListItem } from '@cromo/shared';
import { scanList } from '@/lib/api';

export type ListItem = TradeListItem;

interface Props {
  label: string;
  helper?: string;
  offered: ListItem[];
  wanted: ListItem[];
  onChange: (next: { offered: ListItem[]; wanted: ListItem[] }) => void;
  albumTypeKey?: string;
  /** Optional bearer; /scan/list is public but logged-in callers attach it to
   *  use their authenticated rate-limit bucket. */
  token?: string;
}

// Client-side guard rails. The server already caps each bucket at 500 items
// in its Zod schema; we mirror that here so the UI fails fast with a clear
// message instead of the user submitting and getting a 400. The text cap
// keeps the browser from hanging on a paste-bomb (~16k chars fits comfortably
// past 1500 codes including separators, variant tags and section headers).
const MAX_BUCKET_ITEMS = 500;
const MAX_TEXT_LENGTH = 16_000;

function parseCombinedText(value: string): { offered: ListItem[]; wanted: ListItem[] } {
  const { offered, wanted } = parseTradeListItems(value);
  return {
    offered: offered.slice(0, MAX_BUCKET_ITEMS),
    wanted: wanted.slice(0, MAX_BUCKET_ITEMS),
  };
}

/** Render an item back to its compact source form: BRA5, BRA5(red), BRA5(red)x2. */
function serialiseItem(item: ListItem): string {
  const base = item.albumCode;
  const variant = item.variantToken ? `(${item.variantToken})` : '';
  const qty = item.quantity > 1 ? `x${item.quantity}` : '';
  return `${base}${variant}${qty}`;
}

function serialise(buckets: { offered: ListItem[]; wanted: ListItem[] }): string {
  const parts: string[] = [];
  if (buckets.offered.length > 0)
    parts.push(`HAVE: ${buckets.offered.map(serialiseItem).join(', ')}`);
  if (buckets.wanted.length > 0)
    parts.push(`WANT: ${buckets.wanted.map(serialiseItem).join(', ')}`);
  return parts.join('\n');
}

/**
 * Combined offered/wanted input: one textarea (with HAVE/WANT section
 * detection) plus a photo-upload button that scans an image via /scan/list.
 * Emits both buckets at once on every change. Lines can optionally carry an
 * inline variant tag and quantity multiplier — e.g. `BRA5(red)x2` —
 * which the backend uses for variant-scoped matching and trade-ratio guidance.
 */
export default function CombinedListInput({
  label, helper, offered, wanted, onChange, albumTypeKey, token,
}: Props) {
  // The textarea is the source of truth for the keyboard path. When the user
  // uploads a photo or pastes a new block, we replace its content with a
  // re-serialised "HAVE: ... / WANT: ..." canonical form so the round-trip
  // (parse → display → parse) is stable.
  const initialText = serialise({ offered, wanted });
  const [text, setText] = useState(initialText);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleTextChange(value: string) {
    // Hard-cap the text so a paste-bomb can't hang the parser. The user sees
    // a one-line notice immediately and the rest is dropped before parsing.
    const capped = value.length > MAX_TEXT_LENGTH ? value.slice(0, MAX_TEXT_LENGTH) : value;
    setText(capped);
    setTruncated(value.length > MAX_TEXT_LENGTH);
    onChange(parseCombinedText(capped));
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setScanError(null);
    setScanning(true);
    try {
      const result = await scanList(Array.from(files), { albumTypeKey, token });
      // The OCR pipeline emits codes only — variants on hand-written or
      // photographed lists aren't reliable enough to extract. The scanned codes
      // land as untagged items (variantToken=null, qty=1) which the backend
      // then resolves to the user's preferred base variant.
      const current = parseCombinedText(text);
      const offeredMap = new Map(current.offered.map((i) => [keyOf(i), i] as const));
      const wantedMap = new Map(current.wanted.map((i) => [keyOf(i), i] as const));
      for (const code of result.offered) {
        const i: ListItem = { albumCode: code, variantToken: null, quantity: 1 };
        if (!wantedMap.has(keyOf(i))) offeredMap.set(keyOf(i), i);
      }
      for (const code of result.wanted) {
        const i: ListItem = { albumCode: code, variantToken: null, quantity: 1 };
        offeredMap.delete(keyOf(i));
        wantedMap.set(keyOf(i), i);
      }
      const merged = {
        offered: [...offeredMap.values()],
        wanted: [...wantedMap.values()],
      };
      const nextText = serialise(merged);
      setText(nextText);
      onChange(merged);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Failed to scan image.');
    } finally {
      setScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div>
      <label className="block text-xs font-medium text-[var(--cromo-fg-muted)] mb-1">
        {label}
      </label>
      <textarea
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        rows={6}
        maxLength={MAX_TEXT_LENGTH}
        placeholder={'HAVE\nBRA: 5, 7, 12\nARG 4, 9 (red)\n\nWANT\nMEX 1, 10\nFWC: 3 (purple) x2'}
        className="w-full rounded-md border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)] font-mono"
      />
      {truncated && (
        <p className="mt-1 text-xs text-[var(--cromo-warning-text)]">
          Input was truncated to {MAX_TEXT_LENGTH.toLocaleString()} characters.
        </p>
      )}
      <div className="mt-1 flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-[var(--cromo-fg-subtle)]">
          {helper ?? 'Use HAVE / WANT headers. Tag variants with parens — BRA5(red), BRA5(gold)x2. Untagged codes default to base.'}
          {(offered.length > 0 || wanted.length > 0) && (
            <span className="ml-1">
              · <span className="text-[var(--cromo-success-text)] font-medium">{offered.length} offered</span>
              {' · '}
              <span className="text-[var(--cromo-accent)] font-medium">{wanted.length} wanted</span>
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          {scanning && <span className="text-xs text-[var(--cromo-fg-subtle)]">Scanning…</span>}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={scanning}
            className="text-xs text-[var(--cromo-accent)] hover:underline disabled:opacity-50"
          >
            Upload list photo
          </button>
        </div>
      </div>
      {scanError && (
        <p className="mt-1 text-xs text-[var(--cromo-danger-text)]">{scanError}</p>
      )}
    </div>
  );
}

function keyOf(item: ListItem): string {
  return `${item.albumCode}|${item.variantToken ?? ''}`;
}
