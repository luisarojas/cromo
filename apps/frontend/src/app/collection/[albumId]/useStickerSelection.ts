'use client';

import { useCallback, useMemo, useState } from 'react';
import type { Sticker } from '@/lib/api';
import type { OwnedVariantMap } from '../components/StickerGrid';

interface UseStickerSelectionParams {
  displayedStickers: Sticker[];
  ownedMap: Map<string, OwnedVariantMap>;
  favouriteSet: Set<string>;
}

export interface StickerSelectionApi {
  selectionMode: boolean;
  setSelectionMode: (next: boolean) => void;
  selectedStickerIds: Set<string>;
  setSelectedStickerIds: (ids: Set<string>) => void;
  selectedHasAnyOwned: boolean;
  selectedFavouriteState: 'all' | 'some' | 'none';
  removableVariantTypes: string[];
  handleToggleSelect: (stickerId: string) => void;
  handleRangeSelect: (stickerIds: string[]) => void;
  handleSelectAll: () => void;
  handleDeselectAll: () => void;
  handleExitSelection: () => void;
}

export function useStickerSelection({
  displayedStickers,
  ownedMap,
  favouriteSet,
}: UseStickerSelectionParams): StickerSelectionApi {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedStickerIds, setSelectedStickerIds] = useState<Set<string>>(new Set());

  const selectedHasAnyOwned = useMemo(() => {
    for (const id of selectedStickerIds) {
      if (ownedMap.has(id)) return true;
    }
    return false;
  }, [selectedStickerIds, ownedMap]);

  const selectedFavouriteState = useMemo<'all' | 'some' | 'none'>(() => {
    if (selectedStickerIds.size === 0) return 'none';
    let favCount = 0;
    for (const id of selectedStickerIds) {
      if (favouriteSet.has(id)) favCount++;
    }
    if (favCount === 0) return 'none';
    if (favCount === selectedStickerIds.size) return 'all';
    return 'some';
  }, [selectedStickerIds, favouriteSet]);

  const removableVariantTypes = useMemo(() => {
    const types = new Set<string>();
    for (const id of selectedStickerIds) {
      const variants = ownedMap.get(id);
      if (variants) {
        for (const vt of variants.keys()) types.add(vt);
      }
    }
    return [...types];
  }, [selectedStickerIds, ownedMap]);

  const handleToggleSelect = useCallback((stickerId: string) => {
    setSelectedStickerIds((prev) => {
      const next = new Set(prev);
      if (next.has(stickerId)) next.delete(stickerId);
      else next.add(stickerId);
      return next;
    });
  }, []);

  const handleRangeSelect = useCallback((stickerIds: string[]) => {
    setSelectedStickerIds((prev) => {
      const next = new Set(prev);
      for (const id of stickerIds) next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedStickerIds(new Set(displayedStickers.map((s) => s.id)));
  }, [displayedStickers]);

  const handleDeselectAll = useCallback(() => {
    setSelectedStickerIds(new Set());
  }, []);

  const handleExitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedStickerIds(new Set());
  }, []);

  return {
    selectionMode,
    setSelectionMode,
    selectedStickerIds,
    setSelectedStickerIds,
    selectedHasAnyOwned,
    selectedFavouriteState,
    removableVariantTypes,
    handleToggleSelect,
    handleRangeSelect,
    handleSelectAll,
    handleDeselectAll,
    handleExitSelection,
  };
}
