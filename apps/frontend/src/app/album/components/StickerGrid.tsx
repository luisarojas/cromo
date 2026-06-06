'use client';

import { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { Sticker } from '@/lib/api';
import { addSticker, patchSticker, moveSticker, setTradeFlags } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import StickerCard from './StickerCard';
import VariantPopover, { type OwnedVariantEntry } from './VariantPopover';
import { usePreferencesStore } from '@/store/preferences';
import { haptic, prefersReducedMotion } from '@/lib/haptics';
export type OwnedVariantMap = Map<string, OwnedVariantEntry>; // variantType -> entry

interface Props {
  stickers: Sticker[];
  ownedMap: Map<string, OwnedVariantMap>; // stickerId -> variantType -> entry
  userId: string;
  albumId: string;
  token: string;
  onCollectionChange: () => void;
  onOptimisticAdjust: (
    stickerId: string,
    variantType: string,
    variantId: string,
    delta: number,
  ) => void;
  // album_code -> other album IDs that are missing this code (cross-album math
  // is still per-code: regional CC alternates share completion semantics).
  crossAlbumNeeded?: Map<string, string[]>;
  crossAlbumAvailable?: Map<string, string[]>;
  crossAlbumHasSticker?: Map<string, Array<{ id: string; name: string }>>;
  favouriteSet?: Set<string>; // sticker IDs
  onToggleFavourite?: (stickerId: string) => void;
  wantedVariantIds: Set<string>;
  onToggleWanted: (variantId: string, stickerId: string) => Promise<void> | void;
  selectionMode?: boolean;
  selectedStickerIds?: Set<string>;
  onToggleSelect?: (stickerId: string) => void;
  onRangeSelect?: (stickerIds: string[]) => void;
  // Album-configured default Base variant. Drives the swipe shortcut: a swipe
  // right on a sticker adds +1 of this variant without opening the popover.
  defaultBaseVariant: 'base_border' | 'base_borderless';
  // Lets a long-press on an owned card flip the album page into selection
  // mode (with this sticker pre-selected). Owned by AlbumDetailClient.
  onRequestSelectionMode?: (stickerId: string) => void;
  // Density override: 2 (cozy), 3 (default mobile-friendly), or 4 (dense).
  // Wraps differently at sm: 2-col stays 2, 3-col goes to 3, 4-col goes to 4.
  density?: 2 | 3 | 4;
}

interface PopoverState {
  sticker: Sticker;
  rect: DOMRect;
}

export default function StickerGrid({
  stickers,
  ownedMap,
  userId,
  albumId,
  token,
  onCollectionChange,
  onOptimisticAdjust,
  crossAlbumNeeded,
  crossAlbumAvailable,
  crossAlbumHasSticker,
  favouriteSet,
  onToggleFavourite,
  wantedVariantIds,
  onToggleWanted,
  selectionMode,
  selectedStickerIds,
  onToggleSelect,
  onRangeSelect,
  defaultBaseVariant,
  onRequestSelectionMode,
  density = 4,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const popoverAnchorRef = useRef<HTMLElement | null>(null);
  const lastClickedIndexRef = useRef<number | null>(null);
  const { addToast } = useToast();
  const tradeMatchingEnabled = usePreferencesStore((s) => s.tradeMatchingEnabled);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  // Mobile viewport flag — drives the popover→sheet swap. Updated on resize
  // and on initial mount. We default to false so SSR markup matches desktop.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // COLS drives the row math AND the Tailwind grid class. Keep them in
  // lockstep — a virtual row that holds fewer items than the grid renders
  // leaves blank cells; the reverse leaves un-rendered cards.
  const COLS = density;
  const gridColsClass =
    COLS === 2 ? 'grid-cols-2'
    : COLS === 3 ? 'grid-cols-2 sm:grid-cols-3'
    : 'grid-cols-2 sm:grid-cols-4';

  // Mixed-row model: a virtual row is either a group header (variable, short
  // height) or a row of up to COLS stickers. We don't let a sticker row span
  // two groups, so a partial trailing row gets blank cells rather than mixing.
  // The first index attached to each stickers row is the *global* sticker
  // index (across the unmixed `stickers` array) — selection range math relies
  // on it being a stable global index, not a row-local one.
  type VRow =
    | { kind: 'header'; name: string }
    | { kind: 'stickers'; items: Sticker[]; firstIdx: number };

  const { virtualRows, headerRowIndexByGroup } = useMemo(() => {
    const out: VRow[] = [];
    const idxByGroup = new Map<string, number>();
    let i = 0;
    while (i < stickers.length) {
      const groupName = stickers[i]!.groupName ?? 'Other';
      // Header.
      idxByGroup.set(groupName, out.length);
      out.push({ kind: 'header', name: groupName });
      // Find the run length for this group.
      let j = i;
      while (j < stickers.length && (stickers[j]!.groupName ?? 'Other') === groupName) j++;
      // Slice into COLS-sized rows.
      for (let r = i; r < j; r += COLS) {
        out.push({ kind: 'stickers', items: stickers.slice(r, Math.min(r + COLS, j)), firstIdx: r });
      }
      i = j;
    }
    return { virtualRows: out, headerRowIndexByGroup: idxByGroup };
  }, [stickers, COLS]);

  const virtualizer = useWindowVirtualizer({
    count: virtualRows.length,
    estimateSize: (idx) => virtualRows[idx]?.kind === 'header' ? 36 : 160,
    overscan: 5,
    measureElement: (el) => el?.getBoundingClientRect().height ?? 160,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });

  // The rail uses headerRowIndexByGroup to jump. NavBar (h-14) + sticky
  // FilterBar both consume space at the top of the viewport, so we offset the
  // scroll target by their combined height to avoid landing the header
  // underneath sticky chrome.
  const STICKY_OFFSET_PX = 56 + 80;
  function jumpToGroup(name: string) {
    const idx = headerRowIndexByGroup.get(name);
    if (idx === undefined) return;
    const targetTop = virtualizer.getVirtualItems().find((vi) => vi.index === idx)?.start
      ?? virtualizer.measurementsCache[idx]?.start
      ?? 0;
    window.scrollTo({
      top: (listRef.current?.offsetTop ?? 0) + targetTop - STICKY_OFFSET_PX,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }

  useEffect(() => {
    if (!selectionMode) lastClickedIndexRef.current = null;
  }, [selectionMode]);

  // Keep popover anchored to its tile while the user scrolls
  const isPopoverOpen = popover !== null;
  useEffect(() => {
    if (!isPopoverOpen) return;
    const update = () => {
      if (popoverAnchorRef.current) {
        setPopover((prev) =>
          prev ? { ...prev, rect: popoverAnchorRef.current!.getBoundingClientRect() } : null,
        );
      }
    };
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, [isPopoverOpen]);

  const handleOpenPopover = useCallback(
    (sticker: Sticker, anchor: HTMLElement) => {
      if (selectionMode) return;
      popoverAnchorRef.current = anchor;
      setPopover({ sticker, rect: anchor.getBoundingClientRect() });
    },
    [selectionMode],
  );

  const handleAdjust = useCallback(
    async (
      sticker: Sticker,
      variantId: string,
      variantType: string,
      delta: 1 | -1,
      // True when the adjust came from the bottom-edge swipe gesture, so we
      // can show an Undo affordance — the user can't see the popover state
      // change, so the toast is their only feedback that anything happened.
      fromGesture = false,
    ) => {
      const current =
        ownedMap.get(sticker.id)?.get(variantType)?.quantity ?? 0;
      const next = current + delta;
      onOptimisticAdjust(sticker.id, variantType, variantId, delta);
      haptic('tap');
      try {
        if (delta > 0 && current === 0) {
          await addSticker(userId, variantId, 1, token || undefined, albumId);
        } else {
          await patchSticker(userId, variantId, Math.max(0, next), token || undefined, albumId);
        }
        onCollectionChange();
        if (fromGesture) {
          const verb = delta > 0 ? 'Added' : 'Removed';
          addToast(`${verb} ${sticker.albumCode}`, {
            type: 'success',
            action: {
              label: 'Undo',
              onClick: () => {
                // Re-run with the inverted delta, no further undo chain.
                void handleAdjust(sticker, variantId, variantType, (-delta) as 1 | -1, false);
              },
            },
          });
        }
      } catch (err) {
        console.error('Failed to adjust sticker', err);
        addToast('Failed to update sticker. Please try again.');
        onOptimisticAdjust(sticker.id, variantType, variantId, -delta);
        haptic('error');
      }
    },
    [userId, albumId, token, ownedMap, onCollectionChange, onOptimisticAdjust, addToast],
  );

  // Swipe shortcut on the card — bypasses the popover for the common case of
  // "I have this / I don't". Right = +1 of the album's default Base variant
  // (or stack +1 on top of whatever is owned). Left = -1 of the first owned
  // variant. Falls back silently when there's no actionable variant id, so a
  // swipe on, say, a Coca-Cola sticker without a baseVariantId is a no-op.
  const handleSwipeAdjust = useCallback(
    (sticker: Sticker, direction: 'left' | 'right') => {
      const owned = ownedMap.get(sticker.id);
      if (direction === 'right') {
        if (sticker.baseVariantId) {
          void handleAdjust(sticker, sticker.baseVariantId, defaultBaseVariant, 1, true);
          return;
        }
        const first = owned ? owned.entries().next().value : undefined;
        if (first) {
          const [variantType, entry] = first as [string, OwnedVariantEntry];
          void handleAdjust(sticker, entry.variantId, variantType, 1, true);
        }
      } else {
        if (!owned || owned.size === 0) return;
        const first = owned.entries().next().value as [string, OwnedVariantEntry];
        const [variantType, entry] = first;
        void handleAdjust(sticker, entry.variantId, variantType, -1, true);
      }
    },
    [ownedMap, handleAdjust, defaultBaseVariant],
  );

  const handleAddNew = useCallback(
    async (sticker: Sticker, variantId: string, variantType: string) => {
      onOptimisticAdjust(sticker.id, variantType, variantId, 1);
      try {
        await addSticker(userId, variantId, 1, token || undefined, albumId);
        onCollectionChange();
      } catch (err) {
        console.error('Failed to add variant', err);
        addToast('Failed to add variant. Please try again.');
        onOptimisticAdjust(sticker.id, variantType, variantId, -1);
      }
    },
    [userId, token, albumId, onCollectionChange, onOptimisticAdjust, addToast],
  );

  const handleMove = useCallback(
    async (variantId: string, targetAlbumId: string, quantity: number) => {
      try {
        await moveSticker(userId, albumId, variantId, targetAlbumId, quantity, token);
        onCollectionChange();
      } catch (err) {
        console.error('Failed to move sticker', err);
        addToast('Failed to move sticker. Please try again.');
      }
    },
    [userId, albumId, token, onCollectionChange, addToast],
  );

  const handleMoveFrom = useCallback(
    async (variantId: string, sourceAlbumId: string, quantity: number) => {
      try {
        await moveSticker(userId, sourceAlbumId, variantId, albumId, quantity, token);
        onCollectionChange();
      } catch (err) {
        console.error('Failed to move sticker from other album', err);
        addToast('Failed to move sticker. Please try again.');
      }
    },
    [userId, albumId, token, onCollectionChange, addToast],
  );

  const handleSetTradeFlag = useCallback(
    async (variantId: string, flags: { tradeHidden?: boolean; tradeForced?: boolean }) => {
      try {
        await setTradeFlags(userId, variantId, flags, token, albumId);
        onCollectionChange();
      } catch (err) {
        console.error('Failed to update trade flag', err);
        addToast('Failed to update trade setting. Please try again.');
      }
    },
    [userId, albumId, token, onCollectionChange, addToast],
  );

  if (stickers.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-[var(--cromo-fg-subtle)] text-sm">
        No stickers found.
      </div>
    );
  }

  // Distinct group names, in the order they appear in the list. Drives the
  // right-edge jump rail. Only render the rail when there's more than one
  // group to jump to — otherwise it's noise.
  const railGroups = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const row of virtualRows) {
      if (row.kind === 'header' && !seen.has(row.name)) {
        seen.add(row.name);
        list.push(row.name);
      }
    }
    return list;
  }, [virtualRows]);

  return (
    <>
      <div
        ref={listRef}
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = virtualRows[virtualRow.index]!;
          if (row.kind === 'header') {
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
                }}
                className="pt-3 pb-1.5"
              >
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--cromo-fg-muted)]">
                  {row.name}
                </h3>
              </div>
            );
          }
          const startIdx = row.firstIdx;
          const rowStickers = row.items;

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
              }}
            >
              <div className={`grid ${gridColsClass} gap-2 py-1`}>
                {rowStickers.map((sticker: Sticker) => {
                  const ownedVariants = ownedMap.get(sticker.id);
                  const totalQuantity = ownedVariants
                    ? Array.from(ownedVariants.values()).reduce((sum, e) => sum + e.quantity, 0)
                    : 0;
                  return (
                    <StickerCard
                      key={sticker.id}
                      sticker={sticker}
                      ownedVariants={ownedVariants}
                      crossAlbumNeededBy={totalQuantity > 1 ? crossAlbumNeeded?.get(sticker.albumCode) : undefined}
                      crossAlbumAvailableIn={crossAlbumAvailable?.get(sticker.albumCode)}
                      isFavourited={favouriteSet?.has(sticker.id)}
                      onToggleFavourite={onToggleFavourite ? () => onToggleFavourite(sticker.id) : undefined}
                      onSwipeAdjust={(direction) => handleSwipeAdjust(sticker, direction)}
                      onLongPress={() => {
                        // Owned → flip to selection mode (caller pre-selects).
                        // Unowned → toggle wishlist on the album's default base
                        // variant if known. Either way, give the user a haptic
                        // pulse so the gesture feels deliberate.
                        haptic('success');
                        if (totalQuantity > 0) {
                          onRequestSelectionMode?.(sticker.id);
                        } else if (sticker.baseVariantId) {
                          void onToggleWanted(sticker.baseVariantId, sticker.id);
                        }
                      }}
                      onOpenPopover={(anchor) =>
                        handleOpenPopover(sticker, anchor)
                      }
                      selectionMode={selectionMode}
                      isSelected={selectedStickerIds?.has(sticker.id)}
                      onToggleSelect={onToggleSelect ? (shiftKey: boolean) => {
                        const currentIndex = startIdx + rowStickers.indexOf(sticker);
                        if (shiftKey && lastClickedIndexRef.current !== null && onRangeSelect) {
                          const from = Math.min(lastClickedIndexRef.current, currentIndex);
                          const to = Math.max(lastClickedIndexRef.current, currentIndex);
                          // Range select works on the global sticker index — the
                          // group header rows live in virtualRows but not in the
                          // flat `stickers` array, so the slice is still safe.
                          onRangeSelect(stickers.slice(from, to + 1).map((s) => s.id));
                        } else {
                          lastClickedIndexRef.current = currentIndex;
                          onToggleSelect(sticker.id);
                        }
                      } : undefined}
                    />
                  );
                })}
                {rowStickers.length < COLS &&
                  [...Array(COLS - rowStickers.length)].map((_, i) => (
                    <div key={`empty-${i}`} />
                  ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Vertical jump rail — fixed to the right edge of the viewport, mobile
          only (the grid is narrow enough on desktop that group headers are
          easy to scan without it). Each row is a single label clipped to a
          few characters so the rail stays under a thumb's width. */}
      {railGroups.length > 1 && (
        <nav
          aria-label="Jump to group"
          className="md:hidden fixed right-1 z-10 flex flex-col gap-0.5"
          style={{
            top: 'calc(50% - 0px)',
            transform: 'translateY(-50%)',
            maxHeight: '70vh',
            overflowY: 'auto',
          }}
        >
          {railGroups.map((name: string) => (
            <button
              key={name}
              type="button"
              onClick={() => jumpToGroup(name)}
              aria-label={`Jump to ${name}`}
              className="rounded-l-md bg-[var(--cromo-surface)]/85 backdrop-blur border border-[var(--cromo-border)] border-r-0 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-accent)]"
            >
              {name.length > 5 ? name.slice(0, 5) : name}
            </button>
          ))}
        </nav>
      )}

      {popover && (() => {
        // Resolve the prev/next stickers from the flat list so the sheet can
        // navigate without reaching back into the grid's row math.
        const currentIdx = stickers.findIndex((s) => s.id === popover.sticker.id);
        const prevSticker = currentIdx > 0 ? stickers[currentIdx - 1] : null;
        const nextSticker = currentIdx >= 0 && currentIdx < stickers.length - 1 ? stickers[currentIdx + 1] : null;
        const navTo = (s: Sticker | null) => {
          if (!s) return;
          // For sheet mode we don't need a DOMRect — anchorRect is unused
          // there. Synthesise a zero rect so the type stays satisfied.
          const rect = new DOMRect(0, 0, 0, 0);
          setPopover({ sticker: s, rect });
        };
        return (
          <VariantPopover
            // Re-mount per sticker so `useEffect` variant fetches re-run.
            key={popover.sticker.id}
            sticker={popover.sticker}
            ownedVariants={
              ownedMap.get(popover.sticker.id) ?? new Map<string, OwnedVariantEntry>()
            }
            anchorRect={popover.rect}
            albumId={albumId}
            token={token}
            onClose={() => setPopover(null)}
            onAdjust={(variantId, variantType, delta) =>
              handleAdjust(popover.sticker, variantId, variantType, delta)
            }
            onAddNew={(variantId, variantType) =>
              handleAddNew(popover.sticker, variantId, variantType)
            }
            onMove={handleMove}
            onMoveFrom={handleMoveFrom}
            onSetTradeFlag={tradeMatchingEnabled ? handleSetTradeFlag : undefined}
            albumsWithSticker={crossAlbumHasSticker?.get(popover.sticker.albumCode)}
            wantedVariantIds={wantedVariantIds}
            onToggleWanted={onToggleWanted}
            presentation={isMobile ? 'sheet' : 'popover'}
            onPrev={prevSticker ? () => navTo(prevSticker) : undefined}
            onNext={nextSticker ? () => navTo(nextSticker) : undefined}
          />
        );
      })()}
    </>
  );
}
