'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  fetchStickerVariants,
  type Sticker,
  type StickerVariant,
} from '@/lib/api';
import { VARIANT_META, compareVariantTypes, isBaseVariant, variantLabel, variantRarity, variantSwatch } from './variantMeta';
import { useAlbumsStore } from '@/store/albums';
import { albumDisplayName } from '@/lib/api';
import { HeartIcon } from '@/components/HeartIcon';
import { haptic } from '@/lib/haptics';
import { useClickOutside } from '@/lib/useClickOutside';
import { useToast } from '@/components/ToastProvider';

export interface OwnedVariantEntry {
  variantId: string;
  quantity: number;
  tradeHidden: boolean;
  tradeForced: boolean;
  updatedAt: string;
}

interface Props {
  sticker: Sticker;
  ownedVariants: Map<string, OwnedVariantEntry>; // keyed by variantType
  anchorRect: DOMRect;
  albumId: string;
  token: string;
  onClose: () => void;
  onAdjust: (variantId: string, variantType: string, delta: 1 | -1) => Promise<void>;
  onAddNew: (variantId: string, variantType: string) => Promise<void>;
  onMove: (variantId: string, targetAlbumId: string, quantity: number) => Promise<void>;
  onMoveFrom: (variantId: string, sourceAlbumId: string, quantity: number) => Promise<void>;
  onSetTradeFlag?: (variantId: string, flags: { tradeHidden?: boolean; tradeForced?: boolean }) => Promise<void>;
  albumsWithSticker?: Array<{ id: string; name: string }>;
  wantedVariantIds: Set<string>;
  onToggleWanted: (variantId: string, stickerId: string) => Promise<void> | void;
  // Presentation mode:
  //  - 'popover': default, anchored to anchorRect. Desktop click-on-card.
  //  - 'sheet': mobile bottom sheet covering ~92vh, swipeable prev/next.
  presentation?: 'popover' | 'sheet';
  onPrev?: () => void;
  onNext?: () => void;
}

const POPOVER_WIDTH = 280;

export default function VariantPopover({
  sticker,
  ownedVariants,
  anchorRect,
  albumId,
  token,
  onClose,
  onAdjust,
  onAddNew,
  onMove,
  onMoveFrom,
  onSetTradeFlag,
  albumsWithSticker,
  wantedVariantIds,
  onToggleWanted,
  presentation = 'popover',
  onPrev,
  onNext,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [allVariants, setAllVariants] = useState<StickerVariant[] | null>(null);
  const [loadingVariants, setLoadingVariants] = useState(false);
  // Default the "other variant" list open when the sticker isn't in the
  // collection yet — adding the first copy is the whole reason the popover opened.
  const [showAddPicker, setShowAddPicker] = useState(ownedVariants.size === 0);
  const [showWantedPicker, setShowWantedPicker] = useState(false);
  const [showMovePicker, setShowMovePicker] = useState(false);
  const [moveVariantId, setMoveVariantId] = useState<string | null>(null);
  const [moveTargetAlbumId, setMoveTargetAlbumId] = useState<string>('');
  const [moveQuantity, setMoveQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [showMoveFromPicker, setShowMoveFromPicker] = useState(false);
  const [moveFromSourceAlbumId, setMoveFromSourceAlbumId] = useState<string>('');
  const [moveFromVariantId, setMoveFromVariantId] = useState<string>('');
  const [moveFromQuantity, setMoveFromQuantity] = useState(1);

  const albums = useAlbumsStore((s) => s.albums);
  const otherAlbums = albums.filter((a) => a.id !== albumId);
  const defaultBaseVariant =
    albums.find((a) => a.id === albumId)?.settings.defaultBaseVariant ?? 'base_borderless';
  // One flag drives every "give this control more thumb room" decision below.
  // Sheet = mobile bottom sheet (lots of width, lots of vertical room) so the
  // primary +/− targets, wishlist heart, and unowned-variant rows render with
  // 44px+ touch areas. Popover = compact desktop dropdown anchored to the
  // card; keeps the original dense layout because mouse precision is fine.
  const isSheet = presentation === 'sheet';

  // Fetch the variant catalog on mount. Wanted state is owned by the page so
  // toggles here stay in sync with the filter bar.
  useEffect(() => {
    let cancelled = false;
    setLoadingVariants(true);
    fetchStickerVariants(sticker.albumCode, token, sticker.id)
      .then((items) => {
        if (cancelled) return;
        const sorted = [...items].sort((a, b) => compareVariantTypes(a.variantType, b.variantType));
        setAllVariants(sorted);
      })
      .catch((err) => console.error('Failed to fetch variants', err))
      .finally(() => { if (!cancelled) setLoadingVariants(false); });
    return () => { cancelled = true; };
  }, [sticker.albumCode, sticker.id, token]);

  // Close on outside click / Esc — shared hook covers mousedown + touchstart + Escape.
  useClickOutside(ref, onClose, true);

  // Position the popover near the anchor, flipping above when space below is tight
  const spaceBelow = window.innerHeight - anchorRect.bottom - 14;
  const spaceAbove = anchorRect.top - 14;
  const showAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
  const maxPopoverHeight = Math.max(showAbove ? spaceAbove : spaceBelow, 150);

  const posStyle = showAbove
    ? { bottom: window.innerHeight - anchorRect.top + 6, top: 'auto' as const }
    : { top: anchorRect.bottom + 6, bottom: 'auto' as const };

  const left = Math.min(
    Math.max(8, anchorRect.left),
    window.innerWidth - POPOVER_WIDTH - 8,
  );

  const ownedEntries = Array.from(ownedVariants.entries()) // [variantType, entry]
    .sort(([a], [b]) => compareVariantTypes(a, b));

  function openAddPicker() {
    setShowAddPicker(true);
  }

  async function handleAdjust(variantId: string, variantType: string, delta: 1 | -1) {
    if (busy) return;
    setBusy(true);
    try {
      await onAdjust(variantId, variantType, delta);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddNew(variantId: string, variantType: string) {
    if (busy) return;
    setBusy(true);
    try {
      await onAddNew(variantId, variantType);
      setShowAddPicker(false);
    } finally {
      setBusy(false);
    }
  }

  function openMovePicker(variantId: string) {
    setMoveVariantId(variantId);
    setMoveTargetAlbumId(otherAlbums[0]?.id ?? '');
    setMoveQuantity(1);
    setShowMovePicker(true);
  }

  async function handleMove() {
    if (!moveVariantId || !moveTargetAlbumId || busy) return;
    setBusy(true);
    try {
      await onMove(moveVariantId, moveTargetAlbumId, moveQuantity);
      setShowMovePicker(false);
      setMoveVariantId(null);
    } finally {
      setBusy(false);
    }
  }

  function openMoveFromPicker() {
    setMoveFromSourceAlbumId(albumsWithSticker?.[0]?.id ?? '');
    setMoveFromVariantId(allVariants?.[0]?.id ?? '');
    setMoveFromQuantity(1);
    setShowMoveFromPicker(true);
  }

  async function handleMoveFrom() {
    if (!moveFromVariantId || !moveFromSourceAlbumId || busy) return;
    setBusy(true);
    try {
      await onMoveFrom(moveFromVariantId, moveFromSourceAlbumId, moveFromQuantity);
      setShowMoveFromPicker(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleWanted(variantId: string) {
    if (busy) return;
    setBusy(true);
    try {
      await onToggleWanted(variantId, sticker.id);
    } finally {
      setBusy(false);
    }
  }

  const unownedVariants = (allVariants ?? []).filter(
    (v) => !ownedVariants.has(v.variantType),
  );
  // The user's preferred base layout gets the single prominent "Add" button —
  // but only when nothing of this sticker is owned yet. Once any variant is in
  // the collection, the base drops into the regular "Add other variant" list
  // so the popover doesn't push a base on someone who deliberately collected,
  // say, the blue parallel.
  const catalogHasPreferredBase = (allVariants ?? []).some((v) => v.variantType === defaultBaseVariant);
  const preferredBaseUnowned = ownedVariants.size === 0
    ? unownedVariants.find(
        (v) => v.variantType === defaultBaseVariant || (!catalogHasPreferredBase && isBaseVariant(v.variantType)),
      )
    : undefined;
  const otherUnowned = unownedVariants.filter((v) => v.id !== preferredBaseUnowned?.id);

  // Lock the underlying page scroll while the sheet is up — same pattern the
  // NavBar drawer uses.
  useEffect(() => {
    if (presentation !== 'sheet') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [presentation]);

  // Sheet-mode horizontal swipe: left → next sticker, right → previous. We
  // commit on a 50px threshold and only when no other drawer (move picker,
  // wanted picker) is open inside the sheet to avoid eating those gestures.
  // Visual feedback: the sheet follows the finger with a damped translateX
  // during the gesture and snaps back to centre below threshold.
  const SHEET_SWIPE_THRESHOLD = 50;
  const SHEET_SWIPE_MAX = 120;
  const sheetSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const sheetIgnoreUntilEnd = useRef(false);
  const [sheetDragX, setSheetDragX] = useState(0);
  const [sheetSnapping, setSheetSnapping] = useState(false);

  function onSheetTouchStart(e: React.TouchEvent) {
    if (presentation !== 'sheet') return;
    if (showMovePicker || showMoveFromPicker || showAddPicker) return;
    const t = e.touches[0]!;
    sheetSwipeStartRef.current = { x: t.clientX, y: t.clientY };
    sheetIgnoreUntilEnd.current = false;
    setSheetSnapping(false);
  }
  function onSheetTouchMove(e: React.TouchEvent) {
    if (!sheetSwipeStartRef.current || sheetIgnoreUntilEnd.current) return;
    const t = e.touches[0]!;
    const dx = t.clientX - sheetSwipeStartRef.current.x;
    const dy = t.clientY - sheetSwipeStartRef.current.y;
    if (Math.abs(dy) > Math.abs(dx) * 1.2) {
      // Vertical scroll wins — let the sheet's content scroll instead of swiping.
      sheetIgnoreUntilEnd.current = true;
      setSheetDragX(0);
      return;
    }
    // Rubber-band past the threshold so over-swipes still feel responsive.
    const clamped = Math.max(-SHEET_SWIPE_MAX, Math.min(SHEET_SWIPE_MAX, dx));
    setSheetDragX(clamped);
  }
  function onSheetTouchEnd(e: React.TouchEvent) {
    if (!sheetSwipeStartRef.current) return;
    const start = sheetSwipeStartRef.current;
    sheetSwipeStartRef.current = null;
    if (sheetIgnoreUntilEnd.current) {
      setSheetDragX(0);
      return;
    }
    const end = e.changedTouches[0]!;
    const dx = end.clientX - start.x;
    setSheetSnapping(true);
    if (dx <= -SHEET_SWIPE_THRESHOLD && onNext) {
      // Visually animate out, then commit. Re-mount of the sheet (key by
      // sticker.id from the parent) resets dragX so the new card lands centred.
      setSheetDragX(-SHEET_SWIPE_MAX);
      window.setTimeout(() => { onNext(); }, 120);
    } else if (dx >= SHEET_SWIPE_THRESHOLD && onPrev) {
      setSheetDragX(SHEET_SWIPE_MAX);
      window.setTimeout(() => { onPrev(); }, 120);
    } else {
      setSheetDragX(0);
    }
  }

  // Two presentations share the same body but differ in wrapper. The body
  // (post-header) is rendered once via this fragment to avoid duplication.
  const sharedHeader = (
    // Outer sheet wrapper already provides p-3, so this header has no padding
    // of its own — keeps the prev/next chevrons flush with the album-code/
    // player-name text and the close button.
    <div className="flex items-center gap-2">
      {presentation === 'sheet' && onPrev && (
        <button
          onClick={onPrev}
          aria-label="Previous sticker"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--cromo-surface-2)] text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-[var(--cromo-fg)]">{sticker.albumCode}</div>
        <div className="text-xs text-[var(--cromo-fg-muted)] truncate">{sticker.playerName ?? sticker.teamName ?? '—'}</div>
      </div>
      {presentation === 'sheet' && onNext && (
        <button
          onClick={onNext}
          aria-label="Next sticker"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--cromo-surface-2)] text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      )}
      <button
        onClick={onClose}
        className="text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-fg)] text-lg leading-none px-1 shrink-0 ml-1"
        aria-label="Close"
      >
        ×
      </button>
    </div>
  );

  const node = (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Manage variants for sticker ${sticker.albumCode}`}
      className={
        // Sheet uses overflow-y-auto so tall content (move picker, full variant
        // list, etc.) is reachable. p-3 + gap-2 mirror the popover's body
        // spacing so the inner sharedHeader can drop its own padding without
        // looking flush against the rounded top edge.
        presentation === 'sheet'
          ? 'fixed inset-x-0 bottom-0 z-50 w-full max-h-[92vh] flex flex-col bg-[var(--cromo-surface)] rounded-t-2xl shadow-cromo-lg overflow-y-auto p-3 gap-2'
          : 'fixed z-50 rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] shadow-cromo-lg p-3 flex flex-col gap-2 overflow-y-auto'
      }
      style={
        presentation === 'sheet'
          ? {
              // p-3 sets a 0.75rem bottom padding; the inline style overrides it,
              // so add the safe-area inset on top of an explicit gutter instead
              // of replacing it — otherwise non-notched devices end up with 0px
              // padding-bottom and the last line sits flush against the edge.
              paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))',
              transform: sheetDragX !== 0 ? `translateX(${sheetDragX}px)` : undefined,
              transition: sheetSnapping ? 'transform 120ms ease-out' : 'none',
              opacity: Math.max(0.6, 1 - Math.abs(sheetDragX) / 240),
            }
          : { ...posStyle, left, width: POPOVER_WIDTH, maxHeight: maxPopoverHeight }
      }
      onTouchStart={onSheetTouchStart}
      onTouchMove={onSheetTouchMove}
      onTouchEnd={onSheetTouchEnd}
    >
      {presentation === 'sheet' && (
        <div className="flex justify-center py-2" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-[var(--cromo-border)]" />
        </div>
      )}
      {presentation === 'sheet' ? sharedHeader : (
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-[var(--cromo-fg)]">
              {sticker.albumCode}
            </div>
            <div className="text-xs text-[var(--cromo-fg-muted)] truncate">
              {sticker.playerName ?? sticker.teamName ?? '—'}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-fg)] text-lg leading-none px-1 shrink-0 ml-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>
      )}

      <div className={presentation === 'sheet' ? 'h-px bg-[var(--cromo-surface-2)] mt-2' : 'h-px bg-[var(--cromo-surface-2)]'} />

      {/* Owned variants */}
      {!showMovePicker && !showMoveFromPicker && (ownedEntries.length === 0 ? (
        <div className="text-xs text-[var(--cromo-fg-muted)] italic py-1">
          Not in your collection yet.
        </div>
      ) : (
        <ul className={isSheet ? 'flex flex-col gap-2' : 'flex flex-col gap-1.5'}>
          {ownedEntries.map(([variantType, entry]) => (
            <OwnedVariantRow
              key={variantType}
              variantType={variantType}
              entry={entry}
              isSheet={isSheet}
              busy={busy}
              stickerLabel={sticker.playerName ? `${sticker.albumCode} · ${sticker.playerName}` : sticker.albumCode}
              onAdjust={(delta) => handleAdjust(entry.variantId, variantType, delta)}
              onSetTradeFlag={onSetTradeFlag}
            />
          ))}
        </ul>
      ))}

      {!showMovePicker && !showMoveFromPicker && <div className="h-px bg-[var(--cromo-surface-2)]" />}

      {/* Move to / from another album */}
      {otherAlbums.length > 0 && (ownedEntries.length > 0 || (albumsWithSticker && albumsWithSticker.length > 0)) && (
        <>
          {showMovePicker ? (
            <div className="flex flex-col gap-2">
              <div className="text-xs font-medium text-[var(--cromo-fg)]">Move to another album</div>

              {ownedEntries.length > 1 && (
                <select
                  value={moveVariantId ?? ''}
                  onChange={(e) => setMoveVariantId(e.target.value)}
                  className="rounded-md border border-[var(--cromo-border)] px-2 py-1 text-xs text-[var(--cromo-fg)] focus:outline-none"
                >
                  {ownedEntries.map(([vt, entry]) => (
                    <option key={entry.variantId} value={entry.variantId}>
                      {variantLabel(vt)} (×{entry.quantity})
                    </option>
                  ))}
                </select>
              )}

              <div className="flex gap-2 items-center">
                <label className="text-xs text-[var(--cromo-fg-muted)] shrink-0">To</label>
                <select
                  value={moveTargetAlbumId}
                  onChange={(e) => setMoveTargetAlbumId(e.target.value)}
                  className="flex-1 rounded-md border border-[var(--cromo-border)] px-2 py-1 text-xs text-[var(--cromo-fg)] focus:outline-none"
                >
                  {otherAlbums.map((a) => (
                    <option key={a.id} value={a.id}>{albumDisplayName(a)}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 items-center">
                <label className="text-xs text-[var(--cromo-fg-muted)] shrink-0">Qty</label>
                <input
                  type="number"
                  min={1}
                  max={
                    ownedEntries.find(([, e]) => e.variantId === moveVariantId)?.[1].quantity ?? 1
                  }
                  value={moveQuantity}
                  onChange={(e) => setMoveQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-16 rounded-md border border-[var(--cromo-border)] px-2 py-1 text-xs text-[var(--cromo-fg)] focus:outline-none"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleMove}
                  disabled={busy || !moveTargetAlbumId}
                  className="flex-1 rounded-md bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] text-xs font-medium py-1.5 hover:bg-[var(--cromo-accent-strong)] disabled:opacity-50"
                >
                  {busy ? 'Moving…' : 'Move'}
                </button>
                <button
                  onClick={() => setShowMovePicker(false)}
                  disabled={busy}
                  className="px-3 rounded-md border border-[var(--cromo-border)] text-xs text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)] disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : showMoveFromPicker ? (
            <div className="flex flex-col gap-2">
              <div className="text-xs font-medium text-[var(--cromo-fg)]">Move from another album</div>

              <div className="flex gap-2 items-center">
                <label className="text-xs text-[var(--cromo-fg-muted)] shrink-0">From</label>
                <select
                  value={moveFromSourceAlbumId}
                  onChange={(e) => setMoveFromSourceAlbumId(e.target.value)}
                  className="flex-1 rounded-md border border-[var(--cromo-border)] px-2 py-1 text-xs text-[var(--cromo-fg)] focus:outline-none"
                >
                  {(albumsWithSticker ?? []).map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              {allVariants && allVariants.length > 1 && (
                <select
                  value={moveFromVariantId}
                  onChange={(e) => setMoveFromVariantId(e.target.value)}
                  className="rounded-md border border-[var(--cromo-border)] px-2 py-1 text-xs text-[var(--cromo-fg)] focus:outline-none"
                >
                  {allVariants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {variantLabel(v.variantType)}
                    </option>
                  ))}
                </select>
              )}

              <div className="flex gap-2 items-center">
                <label className="text-xs text-[var(--cromo-fg-muted)] shrink-0">Qty</label>
                <input
                  type="number"
                  min={1}
                  value={moveFromQuantity}
                  onChange={(e) => setMoveFromQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-16 rounded-md border border-[var(--cromo-border)] px-2 py-1 text-xs text-[var(--cromo-fg)] focus:outline-none"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleMoveFrom}
                  disabled={busy || !moveFromSourceAlbumId || !moveFromVariantId}
                  className="flex-1 rounded-md bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] text-xs font-medium py-1.5 hover:bg-[var(--cromo-accent-strong)] disabled:opacity-50"
                >
                  {busy ? 'Moving…' : 'Move'}
                </button>
                <button
                  onClick={() => setShowMoveFromPicker(false)}
                  disabled={busy}
                  className="px-3 rounded-md border border-[var(--cromo-border)] text-xs text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)] disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {ownedEntries.length > 0 && (
                <button
                  onClick={() => openMovePicker(ownedEntries[0]![1].variantId)}
                  className="text-xs font-medium text-violet-600 hover:text-violet-700 self-start"
                >
                  ↗ Move to another album
                </button>
              )}
              {albumsWithSticker && albumsWithSticker.length > 0 && (
                <button
                  onClick={openMoveFromPicker}
                  disabled={loadingVariants}
                  className="text-xs font-medium text-violet-600 hover:text-violet-700 self-start disabled:opacity-50"
                >
                  ↙ Move from another album
                </button>
              )}
            </div>
          )}
          <div className="h-px bg-[var(--cromo-surface-2)]" />
        </>
      )}

      {/* Unowned variants: add + want-it. On sheet (mobile) every unowned
          variant renders inline with both an Add button and a wishlist heart,
          so the common "I pulled the blue parallel" and "I want the gold" cases
          are one tap each. The popover (desktop) keeps the disclosure flow —
          the narrow 280px width can't afford an inline row per variant. */}
      {loadingVariants ? (
        <div className="text-xs text-[var(--cromo-fg-subtle)]">Loading variants…</div>
      ) : unownedVariants.length === 0 && ownedVariants.size > 0 ? (
        <div className="text-xs text-[var(--cromo-fg-muted)] italic">
          You already own every variant of this sticker.
        </div>
      ) : unownedVariants.length > 0 ? (
        <>
          {/* One-tap add for the preferred base variant — the common case when
              nothing of this sticker is owned yet. */}
          {preferredBaseUnowned && (
            <button
              onClick={() => handleAddNew(preferredBaseUnowned.id, preferredBaseUnowned.variantType)}
              disabled={busy}
              className={
                isSheet
                  ? 'flex items-center justify-center gap-1.5 rounded-md bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] text-sm font-semibold py-3 min-h-[44px] hover:bg-[var(--cromo-accent-strong)] disabled:opacity-50'
                  : 'flex items-center justify-center gap-1.5 rounded-md bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] text-xs font-semibold py-2 hover:bg-[var(--cromo-accent-strong)] disabled:opacity-50'
              }
            >
              + Add {variantLabel(preferredBaseUnowned.variantType)}
            </button>
          )}

          {/* Sheet: every other unowned variant gets its own row with inline
              Add + wishlist heart. No second tap to reveal the list. */}
          {isSheet && otherUnowned.length > 0 && (
            <>
              <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--cromo-fg-subtle)] mt-1">
                Other variants
              </div>
              <ul className="flex flex-col gap-1.5">
                {otherUnowned.map((v) => {
                  const wanted = wantedVariantIds.has(v.id);
                  return (
                    <li key={v.id} className="flex items-center gap-2 rounded-md bg-[var(--cromo-surface-2)] px-2 py-2">
                      <span
                        className={`inline-block w-3 h-3 rounded-full border border-[var(--cromo-border-strong)] shrink-0 ${variantSwatch(v.variantType)}`}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-[var(--cromo-fg)] truncate leading-tight">
                          {VARIANT_META[v.variantType]?.label ?? v.variantType}
                        </div>
                        <div className="text-[10px] text-[var(--cromo-fg-subtle)] leading-tight">
                          {variantRarity(v.variantType)}
                        </div>
                      </div>
                      <button
                        onClick={() => { haptic('tap'); handleToggleWanted(v.id); }}
                        disabled={busy}
                        aria-pressed={wanted}
                        aria-label={wanted ? 'Remove from wishlist' : 'Add to wishlist'}
                        title={wanted ? 'Remove from wishlist' : 'Add to wishlist'}
                        className={`flex h-11 w-11 items-center justify-center rounded-md transition-colors disabled:opacity-50 ${
                          wanted
                            ? 'text-[var(--cromo-danger-text)] bg-[var(--cromo-danger-soft)]'
                            : 'text-[var(--cromo-fg-subtle)] hover:bg-[var(--cromo-surface)]'
                        }`}
                      >
                        <HeartIcon filled={wanted} className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => { haptic('tap'); handleAddNew(v.id, v.variantType); }}
                        disabled={busy}
                        aria-label={`Add ${variantLabel(v.variantType)}`}
                        className="flex h-11 min-w-[44px] items-center justify-center rounded-md bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] text-base font-bold disabled:opacity-50 px-3"
                      >
                        +
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {/* Popover (desktop): keep the disclosure flow. */}
          {!isSheet && otherUnowned.length > 0 && !showAddPicker && (
            <button
              onClick={openAddPicker}
              className="text-xs font-medium text-[var(--cromo-accent)] hover:text-[var(--cromo-accent)] self-start"
            >
              + Add other variant
            </button>
          )}
          {!isSheet && otherUnowned.length > 0 && showAddPicker && (
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
              {otherUnowned.map((v) => (
                <button
                  key={v.id}
                  onClick={() => handleAddNew(v.id, v.variantType)}
                  disabled={busy}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--cromo-accent-soft)] disabled:opacity-50 text-left"
                >
                  <span
                    className={`inline-block w-3 h-3 rounded-full border border-[var(--cromo-border-strong)] ${variantSwatch(v.variantType)}`}
                    aria-hidden
                  />
                  <span className="flex-1 text-xs text-[var(--cromo-fg)] truncate">
                    {VARIANT_META[v.variantType]?.label ?? v.variantType}
                  </span>
                  <span className="text-[10px] text-[var(--cromo-fg-subtle)]">
                    {variantRarity(v.variantType)}
                  </span>
                </button>
              ))}
            </div>
          )}
          {!isSheet && !showWantedPicker && (() => {
            const wantedHere = unownedVariants.filter((v) => wantedVariantIds.has(v.id)).length;
            return (
              <button
                onClick={() => setShowWantedPicker(true)}
                className="text-xs font-medium text-[var(--cromo-accent)] hover:text-[var(--cromo-accent)] self-start"
              >
                {wantedHere > 0 ? `★ Edit wishlist (${wantedHere})` : '☆ Add to wishlist'}
              </button>
            );
          })()}
          {!isSheet && showWantedPicker && (
            <div className="flex flex-col gap-1">
              <p className="text-[10px] text-[var(--cromo-fg-muted)] leading-snug">
                Shown on your public profile so traders can offer matches.
              </p>
              {unownedVariants.map((v) => {
                const wanted = wantedVariantIds.has(v.id);
                return (
                  <button
                    key={v.id}
                    onClick={() => handleToggleWanted(v.id)}
                    disabled={busy}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left disabled:opacity-50 transition-colors ${
                      wanted
                        ? 'bg-[var(--cromo-accent-soft)] hover:bg-[var(--cromo-accent-soft)]'
                        : 'hover:bg-[var(--cromo-surface-2)]'
                    }`}
                  >
                    <span
                      className={`inline-block w-3 h-3 rounded-full border border-[var(--cromo-border-strong)] ${variantSwatch(v.variantType)}`}
                      aria-hidden
                    />
                    <span className="flex-1 text-xs text-[var(--cromo-fg)] truncate">
                      {VARIANT_META[v.variantType]?.label ?? v.variantType}
                    </span>
                    <span className={`text-[10px] font-medium ${wanted ? 'text-[var(--cromo-accent)]' : 'text-[var(--cromo-fg-subtle)]'}`}>
                      {wanted ? '★ Wanted' : '☆ Want it'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Sheet handles the preferred base via the big button above; if the
              user already owns something and the only remaining unowned is the
              preferred base, otherUnowned is empty and there's nothing more
              to show here. */}
        </>
      ) : null}
    </div>
  );

  if (typeof document === 'undefined') return null;
  // Sheet presentation needs a dimming backdrop sibling; the inner node is
  // bottom-anchored and clicking outside it should dismiss.
  if (presentation === 'sheet') {
    return createPortal(
      <>
        <div
          aria-hidden
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/50"
        />
        {node}
      </>,
      document.body,
    );
  }
  return createPortal(node, document.body);
}

// ─── OwnedVariantRow ────────────────────────────────────────────────────────
// One row per owned variant. Two presentation modes share the same scaffold:
//
//   sheet   → 44px+ +/− targets, swipe-to-adjust on the row, trade flags
//             tucked behind a per-row ⋯ menu so the row stays one line.
//   popover → original compact desktop layout (24px buttons, inline chips).
//
// Lives in this file so the swipe + trade-menu state stay co-located with the
// only thing that uses them; extracting further would just move the same
// useState boilerplate.
const ROW_SWIPE_THRESHOLD = 60;
const ROW_SWIPE_MAX = 90;

function OwnedVariantRow({
  variantType,
  entry,
  isSheet,
  busy,
  stickerLabel,
  onAdjust,
  onSetTradeFlag,
}: {
  variantType: string;
  entry: OwnedVariantEntry;
  isSheet: boolean;
  busy: boolean;
  // Human-readable "BRA5 · Vinicius Jr." for the undo toast so a user
  // mid-swipe-spree can tell which sticker an Undo would reverse.
  stickerLabel: string;
  onAdjust: (delta: 1 | -1) => Promise<void>;
  onSetTradeFlag?: (variantId: string, flags: { tradeHidden?: boolean; tradeForced?: boolean }) => Promise<void>;
}) {
  // Per-row swipe state. Mirrors StickerCard's pattern (60px threshold, vertical-wins,
  // committed flag) so the muscle memory carries from the grid into the sheet.
  // Sheet-only — the desktop popover keeps mouse-only +/− clicks.
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const committedRef = useRef(false);
  const [dragX, setDragX] = useState(0);
  const swipeEnabled = isSheet && !busy;
  const { addToast } = useToast();

  // Swipe is irreversible without an explicit undo: 60px on a 390px viewport
  // is ~15% of width, so an accidental commit during a vertical-ish scroll is
  // plausible. Tap +/− is intentional and skips the toast.
  function commitSwipe(delta: 1 | -1) {
    committedRef.current = true;
    haptic('tap');
    onAdjust(delta);
    const sign = delta === 1 ? '+1' : '−1';
    addToast(
      `${sign} ${stickerLabel} (${variantLabel(variantType)})`,
      {
        type: delta === 1 ? 'success' : 'info',
        action: { label: 'Undo', onClick: () => onAdjust(delta === 1 ? -1 : 1) },
        durationMs: 5000,
      },
    );
  }

  function onTouchStart(e: React.TouchEvent) {
    if (!swipeEnabled) return;
    // Block bubble so the outer sheet's prev/next-sticker swipe handler
    // doesn't fire on row-internal gestures.
    e.stopPropagation();
    const t = e.touches[0]!;
    swipeStartRef.current = { x: t.clientX, y: t.clientY };
    committedRef.current = false;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!swipeEnabled || !swipeStartRef.current) return;
    e.stopPropagation();
    const t = e.touches[0]!;
    const dx = t.clientX - swipeStartRef.current.x;
    const dy = t.clientY - swipeStartRef.current.y;
    if (Math.abs(dy) > Math.abs(dx)) {
      // Vertical scroll wins — let the sheet scroll its body.
      swipeStartRef.current = null;
      setDragX(0);
      return;
    }
    setDragX(Math.max(-ROW_SWIPE_MAX, Math.min(ROW_SWIPE_MAX, dx)));
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (!swipeEnabled) return;
    e.stopPropagation();
    if (!swipeStartRef.current) { setDragX(0); return; }
    if (dragX >= ROW_SWIPE_THRESHOLD) {
      commitSwipe(1);
    } else if (dragX <= -ROW_SWIPE_THRESHOLD) {
      commitSwipe(-1);
    }
    swipeStartRef.current = null;
    setDragX(0);
  }

  const swipeIntent = dragX > 10 ? 'add' : dragX < -10 ? 'remove' : null;

  // Trade-flag menu (sheet only). Desktop keeps the inline chips. The menu
  // flips up when there isn't ~140px below the trigger — common when the row
  // is at the bottom of a tall sheet, where a downward menu would clip past
  // the safe-area inset.
  const [tradeMenuOpen, setTradeMenuOpen] = useState(false);
  const [tradeMenuFlipUp, setTradeMenuFlipUp] = useState(false);
  const tradeMenuRef = useRef<HTMLDivElement>(null);
  const tradeTriggerRef = useRef<HTMLButtonElement>(null);
  useClickOutside(tradeMenuRef, () => setTradeMenuOpen(false), tradeMenuOpen);
  function toggleTradeMenu() {
    setTradeMenuOpen((open) => {
      if (open) return false;
      const rect = tradeTriggerRef.current?.getBoundingClientRect();
      if (rect) {
        // The menu holds at most two ~44px items + ~8px padding ≈ 96px.
        // 140px buffers for the safe-area inset and any focus ring outline
        // so the bottom item never sits flush against the OS chrome.
        const FLIP_THRESHOLD_PX = 140;
        const spaceBelow = window.innerHeight - rect.bottom;
        setTradeMenuFlipUp(spaceBelow < FLIP_THRESHOLD_PX);
      }
      return true;
    });
  }

  // ─── Sheet (mobile) layout ────────────────────────────────────────────────
  if (isSheet) {
    return (
      <li
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => { swipeStartRef.current = null; setDragX(0); }}
        style={dragX !== 0 ? { transform: `translateX(${dragX}px)`, transition: 'none' } : undefined}
        className={`relative flex items-center gap-2 rounded-md px-2 py-2 select-none touch-pan-y ${
          swipeIntent === 'add'
            ? 'bg-[var(--cromo-success-soft)]'
            : swipeIntent === 'remove'
              ? 'bg-[var(--cromo-danger-soft)]'
              : 'bg-[var(--cromo-surface-2)]'
        }`}
      >
        {/* Swipe affordance — subtle +1 / −1 hint on the inactive edge */}
        {swipeIntent === 'add' && (
          <span aria-hidden className="pointer-events-none absolute inset-y-0 right-1 flex items-center text-[var(--cromo-success-text)] text-sm font-bold">+1</span>
        )}
        {swipeIntent === 'remove' && (
          <span aria-hidden className="pointer-events-none absolute inset-y-0 right-1 flex items-center text-[var(--cromo-danger-text)] text-sm font-bold">−1</span>
        )}

        <span
          className={`inline-block w-3 h-3 rounded-full border border-[var(--cromo-border-strong)] shrink-0 ${variantSwatch(variantType)}`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-[var(--cromo-fg)] truncate leading-tight">
            {variantLabel(variantType)}
          </div>
          {/* Listed/Unlisted/Forced state surfaced inline since the chips
              moved into the ⋯ menu. Coloured icon + matching text so the state
              reads at a glance: red eye-closed = hidden, green double-arrow =
              forced, neutral eye-open = listed. */}
          {onSetTradeFlag && (
            <div
              className={`flex items-center gap-1 text-[11px] leading-tight ${
                entry.tradeHidden
                  ? 'text-[var(--cromo-danger-text)]'
                  : entry.tradeForced
                    ? 'text-[var(--cromo-success-text)]'
                    : 'text-[var(--cromo-fg-subtle)]'
              }`}
            >
              <svg className="w-3 h-3 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                {entry.tradeHidden ? (
                  <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.515a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                ) : entry.tradeForced ? (
                  <path d="M8 5a1 1 0 100 2h5.586l-1.293 1.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L13.586 5H8zM12 15a1 1 0 100-2H6.414l1.293-1.293a1 1 0 10-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L6.414 15H12z" />
                ) : (
                  <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                )}
              </svg>
              {entry.tradeHidden ? 'Hidden' : entry.tradeForced ? 'Forced offer' : 'Listed'}
            </div>
          )}
        </div>
        <span className="text-sm font-semibold text-[var(--cromo-fg)] tabular-nums w-6 text-right">
          ×{entry.quantity}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); haptic('tap'); onAdjust(-1); }}
          disabled={busy}
          className="flex h-11 w-11 items-center justify-center rounded-md bg-[var(--cromo-danger-soft)] text-[var(--cromo-danger-text)] text-xl font-bold leading-none disabled:opacity-50 active:scale-95 transition-transform"
          aria-label={`Remove one ${variantLabel(variantType)}`}
        >
          −
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); haptic('tap'); onAdjust(1); }}
          disabled={busy}
          className="flex h-11 w-11 items-center justify-center rounded-md bg-[var(--cromo-accent-soft)] text-[var(--cromo-accent)] text-xl font-bold leading-none disabled:opacity-50 active:scale-95 transition-transform"
          aria-label={`Add one ${variantLabel(variantType)}`}
        >
          +
        </button>
        {onSetTradeFlag && (
          <div ref={tradeMenuRef} className="relative shrink-0">
            <button
              ref={tradeTriggerRef}
              type="button"
              onClick={(e) => { e.stopPropagation(); toggleTradeMenu(); }}
              aria-haspopup="menu"
              aria-expanded={tradeMenuOpen}
              aria-label={`Trade options for ${variantLabel(variantType)}`}
              className="flex h-11 w-10 items-center justify-center rounded-md text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface)] transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>
            {tradeMenuOpen && (
              <div
                role="menu"
                className={`absolute right-0 min-w-[12rem] z-30 rounded-lg border border-[var(--cromo-border)] bg-[var(--cromo-surface)] shadow-cromo-lg py-1 ${
                  tradeMenuFlipUp ? 'bottom-full mb-1' : 'top-full mt-1'
                }`}
              >
                <button
                  role="menuitem"
                  onClick={() => {
                    setTradeMenuOpen(false);
                    onSetTradeFlag(entry.variantId, {
                      tradeHidden: !entry.tradeHidden,
                      ...((!entry.tradeHidden) && { tradeForced: false }),
                    });
                  }}
                  disabled={busy || (entry.tradeForced && !entry.tradeHidden)}
                  className="w-full text-left px-3 py-2.5 text-sm text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)] disabled:opacity-50"
                >
                  {entry.tradeHidden ? 'List for trade' : 'Hide from trades'}
                </button>
                {!entry.tradeHidden && (
                  <button
                    role="menuitem"
                    onClick={() => {
                      setTradeMenuOpen(false);
                      onSetTradeFlag(entry.variantId, { tradeForced: !entry.tradeForced });
                    }}
                    disabled={busy}
                    className="w-full text-left px-3 py-2.5 text-sm text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)] disabled:opacity-50"
                  >
                    {entry.tradeForced ? 'Only offer extra copies' : 'Force offer (even as last copy)'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </li>
    );
  }

  // ─── Popover (desktop) layout ─────────────────────────────────────────────
  // Unchanged from the original — compact, mouse-targeted, inline trade chips.
  return (
    <li className="flex flex-col gap-1 rounded-md bg-[var(--cromo-surface-2)] px-2 py-1.5">
      <div className="flex items-center gap-2">
        <span
          className={`inline-block w-3 h-3 rounded-full border border-[var(--cromo-border-strong)] ${variantSwatch(variantType)}`}
          aria-hidden
        />
        <span className="flex-1 text-xs font-medium text-[var(--cromo-fg)] truncate">
          {variantLabel(variantType)}
        </span>
        <span className="text-xs font-semibold text-[var(--cromo-fg)] tabular-nums w-5 text-right">
          ×{entry.quantity}
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => onAdjust(-1)}
            disabled={busy}
            className="w-6 h-6 rounded bg-[var(--cromo-danger-soft)] text-[var(--cromo-danger-text)] hover:bg-red-200 disabled:opacity-50 text-sm font-bold leading-none"
            aria-label={`Remove one ${variantLabel(variantType)}`}
            title="Remove one"
          >
            −
          </button>
          <button
            onClick={() => onAdjust(1)}
            disabled={busy}
            className="w-6 h-6 rounded bg-[var(--cromo-accent-soft)] text-[var(--cromo-accent)] hover:bg-blue-200 disabled:opacity-50 text-sm font-bold leading-none"
            aria-label={`Add one ${variantLabel(variantType)}`}
            title="Add one"
          >
            +
          </button>
        </div>
      </div>
      {onSetTradeFlag && (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onSetTradeFlag(entry.variantId, {
              tradeHidden: !entry.tradeHidden,
              ...((!entry.tradeHidden) && { tradeForced: false }),
            })}
            disabled={busy || (entry.tradeForced && !entry.tradeHidden)}
            title={entry.tradeForced && !entry.tradeHidden ? 'Remove "Force offer" first to unlist' : entry.tradeHidden ? 'List for trade' : 'Unlist from trade'}
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-50 ${
              entry.tradeHidden
                ? 'bg-[var(--cromo-danger-soft)] text-[var(--cromo-danger-text)] hover:bg-red-200'
                : 'bg-[var(--cromo-surface-2)] text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)]'
            }`}
          >
            <svg className="w-3 h-3 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              {entry.tradeHidden ? (
                <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.515a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
              ) : (
                <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
              )}
            </svg>
            {entry.tradeHidden ? 'Unlisted' : 'Listed'}
          </button>
          {!entry.tradeHidden && (
            <button
              onClick={() => onSetTradeFlag(entry.variantId, { tradeForced: !entry.tradeForced })}
              disabled={busy}
              title={entry.tradeForced ? 'Only offer extra copies' : 'Offer even as last copy'}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-50 ${
                entry.tradeForced
                  ? 'bg-[var(--cromo-success-soft)] text-[var(--cromo-success-text)] hover:bg-green-200'
                  : 'bg-[var(--cromo-surface-2)] text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)]'
              }`}
            >
              <svg className="w-3 h-3 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path d="M8 5a1 1 0 100 2h5.586l-1.293 1.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L13.586 5H8zM12 15a1 1 0 100-2H6.414l1.293-1.293a1 1 0 10-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L6.414 15H12z" />
              </svg>
              {entry.tradeForced ? 'Force offer' : 'Extras only'}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
