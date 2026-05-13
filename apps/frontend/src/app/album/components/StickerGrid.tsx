'use client';

import { useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Sticker } from '@/lib/api';
import { addSticker, patchSticker } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import StickerCard from './StickerCard';

interface OwnedEntry {
  quantity: number;
  variantId: string;
}

interface Props {
  stickers: Sticker[];
  ownedMap: Map<string, OwnedEntry>;
  userId: string;
  token: string;
  onCollectionChange: () => void;
  onOptimisticRemove: (albumCode: string) => void;
  onOptimisticRestore: (albumCode: string, entry: OwnedEntry) => void;
}

const COLS = 4;
const ROW_HEIGHT = 148; // px — approximate card height + gap

export default function StickerGrid({
  stickers,
  ownedMap,
  userId,
  token,
  onCollectionChange,
  onOptimisticRemove,
  onOptimisticRestore,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const { addToast } = useToast();

  const rows = Math.ceil(stickers.length / COLS);

  const virtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  const handleAdd = useCallback(
    async (sticker: Sticker) => {
      const variantId = sticker.base_variant_id;
      if (!variantId) {
        console.warn('No base_variant_id for sticker', sticker.album_code, '— Redis cache may be stale. Restart the API container to clear it.');
        return;
      }
      try {
        await addSticker(userId, variantId, 1, token || undefined);
        onCollectionChange();
      } catch (err) {
        console.error('Failed to add sticker', err);
        addToast('Failed to add sticker. Please try again.');
      }
    },
    [userId, token, onCollectionChange, addToast],
  );

  const handleRemove = useCallback(
    async (sticker: Sticker) => {
      const entry = ownedMap.get(sticker.album_code);
      if (!entry) return;
      onOptimisticRemove(sticker.album_code);
      try {
        await patchSticker(userId, entry.variantId, entry.quantity - 1, token || undefined);
        onCollectionChange();
      } catch (err) {
        console.error('Failed to remove sticker', err);
        addToast('Failed to remove sticker. Please try again.');
        onOptimisticRestore(sticker.album_code, entry);
      }
    },
    [userId, token, ownedMap, onCollectionChange, onOptimisticRemove, onOptimisticRestore, addToast],
  );

  if (stickers.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-gray-400 text-sm">
        No stickers found.
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="overflow-y-auto rounded-xl border border-gray-200"
      style={{ height: '70vh' }}
    >
      {/* Total height container for virtual scrolling */}
      <div
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
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-2 py-1">
                {rowStickers.map((sticker) => {
                  const entry = ownedMap.get(sticker.album_code);
                  return (
                    <StickerCard
                      key={sticker.album_code}
                      sticker={sticker}
                      owned={!!entry}
                      quantity={entry?.quantity}
                      onAdd={() => handleAdd(sticker)}
                      onRemove={() => handleRemove(sticker)}
                    />
                  );
                })}
                {/* Fill empty cells in the last row */}
                {rowStickers.length < COLS &&
                  [...Array(COLS - rowStickers.length)].map((_, i) => (
                    <div key={`empty-${i}`} />
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
