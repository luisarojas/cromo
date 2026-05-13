'use client';

import { useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Sticker } from '@/lib/api';
import { addSticker, deleteSticker } from '@/lib/api';
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
}

const COLS = 4;
const ROW_HEIGHT = 148; // px — approximate card height + gap

export default function StickerGrid({
  stickers,
  ownedMap,
  userId,
  token,
  onCollectionChange,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rows = Math.ceil(stickers.length / COLS);

  const virtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  const handleAdd = useCallback(
    async (sticker: Sticker) => {
      if (!sticker.base_variant_id) return;
      try {
        await addSticker(userId, sticker.base_variant_id, 1, token || undefined);
        onCollectionChange();
      } catch (err) {
        console.error('Failed to add sticker', err);
      }
    },
    [userId, token, onCollectionChange],
  );

  const handleRemove = useCallback(
    async (sticker: Sticker) => {
      const entry = ownedMap.get(sticker.album_code);
      if (!entry) return;
      try {
        await deleteSticker(userId, entry.variantId, token || undefined);
        onCollectionChange();
      } catch (err) {
        console.error('Failed to remove sticker', err);
      }
    },
    [userId, token, ownedMap, onCollectionChange],
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
