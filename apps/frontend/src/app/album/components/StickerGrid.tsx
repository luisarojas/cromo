'use client';

import { useRef, useCallback, useState, useEffect } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { Sticker } from '@/lib/api';
import { addSticker, patchSticker, moveSticker, setTradeFlags } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import StickerCard from './StickerCard';
import VariantPopover, { type OwnedVariantEntry } from './VariantPopover';
import { usePreferencesStore } from '@/store/preferences';
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
}

const COLS = 4;

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
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const popoverAnchorRef = useRef<HTMLElement | null>(null);
  const lastClickedIndexRef = useRef<number | null>(null);
  const { addToast } = useToast();
  const tradeMatchingEnabled = usePreferencesStore((s) => s.tradeMatchingEnabled);
  const [popover, setPopover] = useState<PopoverState | null>(null);

  const rows = Math.ceil(stickers.length / COLS);

  const virtualizer = useWindowVirtualizer({
    count: rows,
    estimateSize: () => 160,
    overscan: 5,
    measureElement: (el) => el?.getBoundingClientRect().height ?? 160,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });

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
    ) => {
      const current =
        ownedMap.get(sticker.id)?.get(variantType)?.quantity ?? 0;
      const next = current + delta;
      onOptimisticAdjust(sticker.id, variantType, variantId, delta);
      try {
        if (delta > 0 && current === 0) {
          await addSticker(userId, variantId, 1, token || undefined, albumId);
        } else {
          await patchSticker(userId, variantId, Math.max(0, next), token || undefined, albumId);
        }
        onCollectionChange();
      } catch (err) {
        console.error('Failed to adjust sticker', err);
        addToast('Failed to update sticker. Please try again.');
        onOptimisticAdjust(sticker.id, variantType, variantId, -delta);
      }
    },
    [userId, albumId, token, ownedMap, onCollectionChange, onOptimisticAdjust, addToast],
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
          const startIdx = virtualRow.index * COLS;
          const rowStickers = stickers.slice(startIdx, startIdx + COLS);

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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 py-1">
                {rowStickers.map((sticker) => {
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

      {popover && (
        <VariantPopover
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
        />
      )}
    </>
  );
}
