'use client';

import { useRef, useCallback, useState, useEffect } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { Sticker } from '@/lib/api';
import { addSticker, patchSticker, moveSticker } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import StickerCard from './StickerCard';
import VariantPopover, { type OwnedVariantEntry } from './VariantPopover';

export type OwnedVariantMap = Map<string, OwnedVariantEntry>; // variantType -> entry

interface Props {
  stickers: Sticker[];
  ownedMap: Map<string, OwnedVariantMap>; // album_code -> variantType -> entry
  userId: string;
  albumId: string;
  token: string;
  onCollectionChange: (options?: { reloadSummaries?: boolean }) => void;
  onOptimisticAdjust: (
    albumCode: string,
    variantType: string,
    variantId: string,
    delta: number,
  ) => void;
  // album_code -> Set of other album IDs that are missing this sticker
  crossAlbumNeeded?: Map<string, string[]>;
  // album_code -> Set of other album IDs that have extras of this sticker
  crossAlbumAvailable?: Map<string, string[]>;
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
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const { addToast } = useToast();
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
    if (!popover) return;
    const close = () => setPopover(null);
    window.addEventListener('scroll', close, { passive: true });
    return () => window.removeEventListener('scroll', close);
  }, [popover]);

  const handleOpenPopover = useCallback(
    (sticker: Sticker, anchor: HTMLElement) => {
      setPopover({ sticker, rect: anchor.getBoundingClientRect() });
    },
    [],
  );

  const handleAdjust = useCallback(
    async (
      sticker: Sticker,
      variantId: string,
      variantType: string,
      delta: 1 | -1,
    ) => {
      const current =
        ownedMap.get(sticker.album_code)?.get(variantType)?.quantity ?? 0;
      const next = current + delta;
      onOptimisticAdjust(sticker.album_code, variantType, variantId, delta);
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
        onOptimisticAdjust(sticker.album_code, variantType, variantId, -delta);
      }
    },
    [userId, albumId, token, ownedMap, onCollectionChange, onOptimisticAdjust, addToast],
  );

  const handleAddNew = useCallback(
    async (sticker: Sticker, variantId: string, variantType: string) => {
      onOptimisticAdjust(sticker.album_code, variantType, variantId, 1);
      try {
        await addSticker(userId, variantId, 1, token || undefined, albumId);
        onCollectionChange();
      } catch (err) {
        console.error('Failed to add variant', err);
        addToast('Failed to add variant. Please try again.');
        onOptimisticAdjust(sticker.album_code, variantType, variantId, -1);
      }
    },
    [userId, token, albumId, onCollectionChange, onOptimisticAdjust, addToast],
  );

  const handleMove = useCallback(
    async (variantId: string, targetAlbumId: string, quantity: number) => {
      try {
        await moveSticker(userId, albumId, variantId, targetAlbumId, quantity, token);
        onCollectionChange({ reloadSummaries: true });
      } catch (err) {
        console.error('Failed to move sticker', err);
        addToast('Failed to move sticker. Please try again.');
      }
    },
    [userId, albumId, token, onCollectionChange, addToast],
  );

  if (stickers.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-gray-400 text-sm">
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
                  const ownedVariants = ownedMap.get(sticker.album_code);
                  const totalQuantity = ownedVariants
                    ? Array.from(ownedVariants.values()).reduce((sum, e) => sum + e.quantity, 0)
                    : 0;
                  return (
                    <StickerCard
                      key={sticker.album_code}
                      sticker={sticker}
                      ownedVariants={ownedVariants}
                      crossAlbumNeededBy={totalQuantity > 1 ? crossAlbumNeeded?.get(sticker.album_code) : undefined}
                      crossAlbumAvailableIn={crossAlbumAvailable?.get(sticker.album_code)}
                      onOpenPopover={(anchor) =>
                        handleOpenPopover(sticker, anchor)
                      }
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
            ownedMap.get(popover.sticker.album_code) ?? new Map()
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
        />
      )}
    </>
  );
}
