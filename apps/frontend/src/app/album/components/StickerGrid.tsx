'use client';

import { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { Sticker } from '@/lib/api';
import { addSticker, patchSticker, moveSticker, setTradeFlags } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import StickerCard from './StickerCard';
import VariantPopover, { type OwnedVariantEntry } from './VariantPopover';
import StickerContextMenu, { type ContextItem } from './StickerContextMenu';
import { usePreferencesStore } from '@/store/preferences';
import { haptic, prefersReducedMotion } from '@/lib/haptics';
import { useHotkeys } from '@/lib/hotkeys';
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
  // Density override. 2/3/4 are the classic densities; 5 and 6 exist for wide
  // desktops where 4 cols of small cards still wastes a lot of horizontal
  // gutter. On phones we clamp to 2 regardless so cards stay legible.
  density?: 2 | 3 | 4 | 5 | 6;
  // External pause for grid hotkeys (j/k/+/-/f/w/space etc.) so the page can
  // suppress them while a modal (album edit, scanner, variant picker) is up.
  // Defaults to true (hotkeys active).
  hotkeysEnabled?: boolean;
  // Fires when the persistent right-side rail opens or closes so the page can
  // reserve gutter space only while it's visible (avoids permanent off-centre
  // layout on desktop). Only fires in xl+ 'rail' presentation; sheet/popover
  // presentations don't reserve gutter and never call this.
  onRailVisibleChange?: (visible: boolean) => void;
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
  hotkeysEnabled = true,
  onRailVisibleChange,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const popoverAnchorRef = useRef<HTMLElement | null>(null);
  const lastClickedIndexRef = useRef<number | null>(null);
  const { addToast } = useToast();
  const tradeMatchingEnabled = usePreferencesStore((s) => s.tradeMatchingEnabled);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  // Right-click context menu state. Closes on outside click / escape via the
  // menu component's own handlers.
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sticker: Sticker } | null>(null);
  // Viewport flags — drive the popover/sheet/rail presentation choice. We
  // default both to false so SSR markup matches the desktop popover layout
  // and the client takes over on hydrate.
  const [isMobile, setIsMobile] = useState(false);
  const [isWide, setIsWide] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mqMobile = window.matchMedia('(max-width: 767px)');
    const mqWide = window.matchMedia('(min-width: 1280px)'); // xl
    const update = () => {
      setIsMobile(mqMobile.matches);
      setIsWide(mqWide.matches);
    };
    update();
    mqMobile.addEventListener('change', update);
    mqWide.addEventListener('change', update);
    return () => {
      mqMobile.removeEventListener('change', update);
      mqWide.removeEventListener('change', update);
    };
  }, []);
  const presentation: 'sheet' | 'rail' | 'popover' =
    isMobile ? 'sheet' : isWide ? 'rail' : 'popover';

  // Tell the page when the rail is actually visible so it can reserve gutter
  // space only then. Always emits false when leaving 'rail' presentation or
  // closing the popover so the page can release the reservation.
  const railVisible = presentation === 'rail' && popover !== null;
  useEffect(() => {
    onRailVisibleChange?.(railVisible);
  }, [railVisible, onRailVisibleChange]);
  useEffect(() => () => onRailVisibleChange?.(false), [onRailVisibleChange]);

  // Keyboard-focused sticker index (into the flat displayed `stickers` list).
  // Null when the user hasn't engaged the keyboard yet; first key arrow/j/k
  // arms it on index 0. We don't auto-scroll on every change — only when the
  // focused row isn't currently rendered by the virtualizer.
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  const focusedSticker = focusedIdx !== null ? stickers[focusedIdx] : null;

  // Reset focus when the underlying list changes (filter/tab swap).
  useEffect(() => {
    setFocusedIdx(null);
  }, [stickers]);

  function moveFocus(delta: number) {
    if (stickers.length === 0) return;
    setFocusedIdx((cur) => {
      const base = cur ?? -1;
      const next = Math.max(0, Math.min(stickers.length - 1, base + delta));
      // Auto-scroll the row into view if it's outside the rendered range.
      const sticker = stickers[next];
      if (sticker) {
        // Find the virtual row that contains this sticker.
        let rowIdx = -1;
        for (let i = 0; i < virtualRows.length; i++) {
          const r = virtualRows[i]!;
          if (r.kind === 'stickers' && next >= r.firstIdx && next < r.firstIdx + r.items.length) {
            rowIdx = i;
            break;
          }
        }
        if (rowIdx >= 0) {
          // Scroll only if the row isn't already visible (within current virtual range).
          const vis = virtualizer.getVirtualItems();
          const isRendered = vis.some((vi) => vi.index === rowIdx);
          if (!isRendered) {
            virtualizer.scrollToIndex(rowIdx, { align: 'center' });
          }
        }
      }
      return next;
    });
  }

  // ---- Hotkey bindings ------------------------------------------------------
  // Disable grid hotkeys while any of: a modal owned by the parent is open
  // (page passes hotkeysEnabled=false), the variant popover/sheet/rail is open
  // (the user is interacting with a single sticker, not the grid), or the
  // context menu is up.
  const hotkeysActive = hotkeysEnabled && !popover && !contextMenu;
  // When the popover/sheet/rail is open, arrow keys (and j/k) should still
  // navigate — but to ADJACENT stickers via the popover's prev/next, not the
  // grid focus. Pre-resolve the neighbours from the open sticker so the
  // hotkey can fire without poking into the popover render IIFE.
  const popoverNav = useMemo(() => {
    if (!popover) return null;
    const idx = stickers.findIndex((s) => s.id === popover.sticker.id);
    if (idx < 0) return null;
    return {
      prev: idx > 0 ? stickers[idx - 1] ?? null : null,
      next: idx < stickers.length - 1 ? stickers[idx + 1] ?? null : null,
    };
  }, [popover, stickers]);
  const popoverNavActive = hotkeysEnabled && !!popover && !contextMenu;
  function navTo(sticker: Sticker | null | undefined) {
    if (!sticker) return;
    // anchorRect is ignored by sheet/rail; popover mode recomputes from the
    // sticker's DOM rect so it lands next to the new card.
    const el = document.querySelector(`[data-sticker-id="${sticker.id}"]`) as HTMLElement | null;
    const rect = el?.getBoundingClientRect()
      ?? new DOMRect(window.innerWidth / 2 - 100, window.innerHeight / 2 - 100, 200, 200);
    setPopover({ sticker, rect });
  }
  useHotkeys(['j', 'arrowright'], () => moveFocus(+1), { enabled: hotkeysActive });
  useHotkeys(['k', 'arrowleft'], () => moveFocus(-1), { enabled: hotkeysActive });
  // Popover-open navigation. Lives alongside the grid bindings since both
  // would clash on the same keys; the enabled gates are disjoint
  // (hotkeysActive requires !popover, popoverNavActive requires popover).
  useHotkeys(['arrowright', 'j'], () => navTo(popoverNav?.next), { enabled: popoverNavActive });
  useHotkeys(['arrowleft', 'k'], () => navTo(popoverNav?.prev), { enabled: popoverNavActive });
  useHotkeys('arrowdown', () => moveFocus(COLS), { enabled: hotkeysActive });
  useHotkeys('arrowup', () => moveFocus(-COLS), { enabled: hotkeysActive });
  useHotkeys('enter', () => {
    if (!focusedSticker) return;
    // For popover mode we need the actual DOMRect of the focused card so the
    // popover anchors against it. The card carries a data-sticker-id; if it
    // isn't currently rendered (focused row outside the virtual window), we
    // fall back to a viewport-centre rect so the popover at least lands
    // somewhere visible. Sheet/rail modes ignore the rect entirely.
    const el = document.querySelector(`[data-sticker-id="${focusedSticker.id}"]`) as HTMLElement | null;
    const rect = el?.getBoundingClientRect()
      ?? new DOMRect(window.innerWidth / 2 - 100, window.innerHeight / 2 - 100, 200, 200);
    setPopover({ sticker: focusedSticker, rect });
  }, { enabled: hotkeysActive });
  useHotkeys('+ | =', () => {
    // `=` is the unshifted '+' key on US layouts. Both fire the same action so
    // users don't need to remember to hold shift.
    if (!focusedSticker) return;
    handleSwipeAdjust(focusedSticker, 'right');
  }, { enabled: hotkeysActive });
  useHotkeys('-', () => {
    if (!focusedSticker) return;
    handleSwipeAdjust(focusedSticker, 'left');
  }, { enabled: hotkeysActive });
  useHotkeys('f', () => {
    if (!focusedSticker || !onToggleFavourite) return;
    onToggleFavourite(focusedSticker.id);
  }, { enabled: hotkeysActive });
  useHotkeys('w', () => {
    if (!focusedSticker?.baseVariantId) return;
    void onToggleWanted(focusedSticker.baseVariantId, focusedSticker.id);
  }, { enabled: hotkeysActive });
  useHotkeys('space', () => {
    if (!focusedSticker || !onToggleSelect) return;
    onToggleSelect(focusedSticker.id);
  }, { enabled: hotkeysActive });
  useHotkeys('shift+s', () => {
    if (!focusedSticker) return;
    onRequestSelectionMode?.(focusedSticker.id);
  }, { enabled: hotkeysActive });

  // The density choice (2..6) is the user's *preferred* density. The grid
  // can only honor it at viewports wide enough — 5 and 6 require lg+, and
  // 3 ramps in at sm. Below those breakpoints we step down to a sensible
  // floor. Because the virtualizer's row math uses COLS to slice the sticker
  // list into rows, this number MUST equal the actual rendered column count
  // at the current viewport — otherwise rows contain extra items that wrap,
  // and the measured row height stops matching the estimate.
  const [viewportTier, setViewportTier] = useState<'base' | 'sm' | 'lg'>('base');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const lg = window.matchMedia('(min-width: 1024px)');
    const sm = window.matchMedia('(min-width: 640px)');
    const update = () => setViewportTier(lg.matches ? 'lg' : sm.matches ? 'sm' : 'base');
    update();
    lg.addEventListener('change', update);
    sm.addEventListener('change', update);
    return () => {
      lg.removeEventListener('change', update);
      sm.removeEventListener('change', update);
    };
  }, []);
  function effectiveCols(preferred: number, tier: 'base' | 'sm' | 'lg'): number {
    if (tier === 'base') return 2;
    if (tier === 'sm') return Math.min(preferred, 4);
    return preferred; // lg+
  }
  const COLS = effectiveCols(density, viewportTier);
  const gridColsClass =
    COLS === 2 ? 'grid-cols-2'
    : COLS === 3 ? 'grid-cols-3'
    : COLS === 4 ? 'grid-cols-4'
    : COLS === 5 ? 'grid-cols-5'
    : 'grid-cols-6';

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

  if (stickers.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-[var(--cromo-fg-subtle)] text-sm">
        No stickers found.
      </div>
    );
  }

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
                      isKeyboardFocused={focusedIdx !== null && stickers[focusedIdx]?.id === sticker.id}
                      onContextMenu={selectionMode ? undefined : (cx, cy) => setContextMenu({ x: cx, y: cy, sticker })}
                      dragPayload={(ownedMap.get(sticker.id)?.size ?? 0) > 0 ? JSON.stringify({
                        stickerId: sticker.id,
                        fromAlbumId: albumId,
                        albumCode: sticker.albumCode,
                        playerName: sticker.playerName,
                      }) : undefined}
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
          few characters so the rail stays under a thumb's width.
          Anchored between the sticky FilterBar (~9rem from the top once
          scrolled — nav h-14 + bar padding) and the MobileTabBar
          (--cromo-tabbar-h). Centered with margin: auto inside the bounded
          fixed box so it floats vertically without clipping into the bar
          when the page is short. z-10 sits below the bar's z-20 on purpose
          — bar always wins; the rail just lives in the space below it. */}
      {railGroups.length > 1 && (
        <nav
          aria-label="Jump to group"
          className="md:hidden fixed right-1 z-10 flex flex-col justify-center items-end gap-0.5"
          style={{
            // 13rem ≈ nav (3.5rem) + sticky FilterBar at its tallest 2-row
            // wrap on narrow phones (~7rem with chips). Picking a tall
            // constant rather than measuring keeps the rail stable when
            // the bar re-flows; the rail can scroll internally if needed.
            top: '13rem',
            bottom: 'calc(var(--cromo-tabbar-h) + 1rem)',
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

      {contextMenu && (() => {
        const s = contextMenu.sticker;
        const owned = ownedMap.get(s.id);
        const ownedCount = owned ? Array.from(owned.values()).reduce((sum, e) => sum + e.quantity, 0) : 0;
        const isFav = favouriteSet?.has(s.id) ?? false;
        const wantedBaseOn = s.baseVariantId ? wantedVariantIds.has(s.baseVariantId) : false;
        const items: ContextItem[] = [
          {
            label: 'Open details',
            shortcut: '↵',
            run: () => {
              const rect = new DOMRect(0, 0, 0, 0);
              setPopover({ sticker: s, rect });
            },
          },
          {
            label: 'Add one of default base',
            shortcut: '+',
            disabled: !s.baseVariantId,
            run: () => handleSwipeAdjust(s, 'right'),
          },
          {
            label: 'Remove one',
            shortcut: '−',
            disabled: ownedCount === 0,
            destructive: ownedCount === 0,
            run: () => handleSwipeAdjust(s, 'left'),
          },
          {
            label: isFav ? 'Unfavourite' : 'Favourite',
            shortcut: 'F',
            disabled: !onToggleFavourite,
            run: () => onToggleFavourite?.(s.id),
          },
          {
            label: wantedBaseOn ? 'Remove base from wishlist' : 'Add base to wishlist',
            shortcut: 'W',
            disabled: !s.baseVariantId,
            run: () => {
              if (!s.baseVariantId) return;
              void onToggleWanted(s.baseVariantId, s.id);
            },
          },
        ];
        return (
          <StickerContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={items}
            onClose={() => setContextMenu(null)}
          />
        );
      })()}

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
            presentation={presentation}
            onPrev={prevSticker ? () => navTo(prevSticker) : undefined}
            onNext={nextSticker ? () => navTo(nextSticker) : undefined}
          />
        );
      })()}
    </>
  );
}
