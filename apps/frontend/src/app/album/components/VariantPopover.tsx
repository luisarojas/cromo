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

  // Close on outside click / Esc
  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

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

  const node = (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Manage variants for sticker ${sticker.albumCode}`}
      className="fixed z-50 rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] shadow-cromo-lg p-3 flex flex-col gap-2 overflow-y-auto"
      style={{ ...posStyle, left, width: POPOVER_WIDTH, maxHeight: maxPopoverHeight }}
    >
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

      <div className="h-px bg-[var(--cromo-surface-2)]" />

      {/* Owned variants */}
      {!showMovePicker && !showMoveFromPicker && (ownedEntries.length === 0 ? (
        <div className="text-xs text-[var(--cromo-fg-muted)] italic py-1">
          Not in your collection yet.
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {ownedEntries.map(([variantType, entry]) => (
            <li
              key={variantType}
              className="flex flex-col gap-1 rounded-md bg-[var(--cromo-surface-2)] px-2 py-1.5"
            >
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
                    onClick={() => handleAdjust(entry.variantId, variantType, -1)}
                    disabled={busy}
                    className="w-6 h-6 rounded bg-[var(--cromo-danger-soft)] text-[var(--cromo-danger-text)] hover:bg-red-200 disabled:opacity-50 text-sm font-bold leading-none"
                    aria-label={`Remove one ${variantLabel(variantType)}`}
                    title="Remove one"
                  >
                    −
                  </button>
                  <button
                    onClick={() => handleAdjust(entry.variantId, variantType, 1)}
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
                    title={entry.tradeForced && !entry.tradeHidden ? 'Remove "Force offer" first to unlist' : entry.tradeHidden ? 'Click to list for trade' : 'Click to unlist from trade'}
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
                      onClick={() => onSetTradeFlag(entry.variantId, {
                        tradeForced: !entry.tradeForced,
                      })}
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

      {/* Unowned variants: add + want-it */}
      {loadingVariants ? (
        <div className="text-xs text-[var(--cromo-fg-subtle)]">Loading variants…</div>
      ) : unownedVariants.length === 0 && ownedVariants.size > 0 ? (
        <div className="text-xs text-[var(--cromo-fg-muted)] italic">
          You already own every variant of this sticker.
        </div>
      ) : unownedVariants.length > 0 ? (
        <>
          {/* One-click add for the preferred base variant — the common case */}
          {preferredBaseUnowned && (
            <button
              onClick={() => handleAddNew(preferredBaseUnowned.id, preferredBaseUnowned.variantType)}
              disabled={busy}
              className="flex items-center justify-center gap-1.5 rounded-md bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] text-xs font-semibold py-2 hover:bg-[var(--cromo-accent-strong)] disabled:opacity-50"
            >
              + Add {variantLabel(preferredBaseUnowned.variantType)}
            </button>
          )}
          {otherUnowned.length > 0 && !showAddPicker && (
            <button
              onClick={openAddPicker}
              className="text-xs font-medium text-[var(--cromo-accent)] hover:text-[var(--cromo-accent)] self-start"
            >
              + Add other variant
            </button>
          )}
          {otherUnowned.length > 0 && showAddPicker && (
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
          {!showWantedPicker && (() => {
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
          {showWantedPicker && (
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
        </>
      ) : null}
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(node, document.body);
}
