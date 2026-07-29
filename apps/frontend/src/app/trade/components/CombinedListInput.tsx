'use client';

import { useRef, useState, type ReactNode } from 'react';
import { parseTradeListItems, type TradeListItem } from '@cromo/shared';
import { scanList } from '@/lib/api';
import { useClickOutside } from '@/lib/useClickOutside';
import { TOOLBAR_BTN_CLASS } from './toolbarButton';

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
  /** Bucket for codes typed before any HAVE/WANT header. Defaults to 'offered'
   *  (a dupes list); the Live Room passes 'wanted' so a guest's untagged list
   *  reads as what they're looking for. */
  defaultBucket?: 'offered' | 'wanted';
  /** Extra input-source buttons rendered alongside Take/Upload photo in the
   *  toolbar (e.g. "Import from another app"). Styled by the caller with
   *  TOOLBAR_BTN_CLASS so the whole row reads as one consistent group. */
  actions?: ReactNode;
}

// Client-side guard rails. The server already caps each bucket at 500 items
// in its Zod schema; we mirror that here so the UI fails fast with a clear
// message instead of the user submitting and getting a 400. The text cap
// keeps the browser from hanging on a paste-bomb (~16k chars fits comfortably
// past 1500 codes including separators, variant tags and section headers).
const MAX_BUCKET_ITEMS = 500;
const MAX_TEXT_LENGTH = 16_000;

function parseCombinedText(
  value: string,
  defaultBucket: 'offered' | 'wanted' = 'offered',
): { offered: ListItem[]; wanted: ListItem[] } {
  const { offered, wanted } = parseTradeListItems(value, defaultBucket);
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
  label, helper, offered, wanted, onChange, albumTypeKey, token, actions,
  defaultBucket = 'offered',
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Two file inputs behind one "Add photo" button. `photoInputRef` has no
  // `capture` hint — selecting it opens the gallery / file picker for an
  // existing photo (and the textarea also accepts a drag-and-drop onto it).
  // `cameraInputRef` carries `capture="environment"` so mobile jumps straight
  // to the rear camera to snap the list in person. Desktop browsers ignore
  // `capture` and fall back to a normal picker, so the camera item degrades
  // gracefully there.
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, () => setMenuOpen(false), menuOpen);

  function handleTextChange(value: string) {
    // Hard-cap the text so a paste-bomb can't hang the parser. The user sees
    // a one-line notice immediately and the rest is dropped before parsing.
    const capped = value.length > MAX_TEXT_LENGTH ? value.slice(0, MAX_TEXT_LENGTH) : value;
    setText(capped);
    setTruncated(value.length > MAX_TEXT_LENGTH);
    onChange(parseCombinedText(capped, defaultBucket));
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
      const current = parseCombinedText(text, defaultBucket);
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
      // Reset both inputs so re-selecting the same file fires `onChange` again.
      if (photoInputRef.current) photoInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  }

  return (
    <div>
      {/* One toolbar holds every way to fill in the list — imported, snapped,
          or uploaded — so the input sources read as a single consistent group
          above the textarea instead of a scatter of mixed-style links. */}
      <div className="mb-1.5 flex items-end justify-between gap-2 flex-wrap">
        <label className="text-xs font-medium text-[var(--cromo-fg-muted)]">{label}</label>
        <div className="flex items-center gap-1.5 flex-wrap">
          {actions}
          {/* Upload an existing photo (gallery / file picker, no capture hint). */}
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
          />
          {/* Take a photo — `capture` jumps mobile straight to the rear camera. */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
          />
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              disabled={scanning}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className={TOOLBAR_BTN_CLASS}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path d="M4 5a2 2 0 00-2 2v7a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.382a1 1 0 01-.894-.553l-.448-.894A1 1 0 0012.382 3H7.618a1 1 0 00-.894.553l-.448.894A1 1 0 015.382 5H4zm6 9a3.5 3.5 0 100-7 3.5 3.5 0 000 7z" />
              </svg>
              Add photo
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-[var(--cromo-border)] bg-[var(--cromo-surface)] shadow-cromo-lg py-1.5"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); cameraInputRef.current?.click(); }}
                  className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-sm text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)] transition-colors"
                >
                  <svg className="h-4 w-4 text-[var(--cromo-fg-muted)]" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                    <path d="M4 5a2 2 0 00-2 2v7a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.382a1 1 0 01-.894-.553l-.448-.894A1 1 0 0012.382 3H7.618a1 1 0 00-.894.553l-.448.894A1 1 0 015.382 5H4zm6 9a3.5 3.5 0 100-7 3.5 3.5 0 000 7z" />
                  </svg>
                  Take photo
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); photoInputRef.current?.click(); }}
                  className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-sm text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)] transition-colors"
                >
                  <svg className="h-4 w-4 text-[var(--cromo-fg-muted)]" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                    <path d="M3 17a1 1 0 01-1-1V4a1 1 0 011-1h14a1 1 0 011 1v12a1 1 0 01-1 1H3zm2.5-7.5l2 2.5 3-4 4 5.5H5l.5-4z" />
                    <path d="M10 2.5l3 3h-2v3H9v-3H7l3-3z" />
                  </svg>
                  Upload photo
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* The textarea doubles as a drop zone: dragging an image onto it scans
          the same way the "Upload photo" picker does. */}
      <div
        className="relative"
        onDragOver={(e) => { e.preventDefault(); if (!scanning) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!scanning) handleFiles(e.dataTransfer.files);
        }}
      >
        <textarea
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          rows={6}
          maxLength={MAX_TEXT_LENGTH}
          placeholder={'HAVE\nBRA: 5, 7, 12\nARG 4, 9 (red)\n\nWANT\nMEX 1, 10\nFWC: 3 (purple) x2'}
          className={`w-full rounded-md border bg-[var(--cromo-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)] font-mono ${
            dragging ? 'border-[var(--cromo-accent)]' : 'border-[var(--cromo-border-strong)]'
          }`}
        />
        {dragging && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md border-2 border-dashed border-[var(--cromo-accent)] bg-[var(--cromo-accent-soft)] text-sm font-medium text-[var(--cromo-accent)]">
            Drop a photo to scan
          </div>
        )}
      </div>
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
        {scanning && <span className="text-xs text-[var(--cromo-fg-subtle)]">Scanning…</span>}
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
