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
  selectedCodes: Set<string>;
  setSelectedCodes: (codes: Set<string>) => void;
  selectedHasAnyOwned: boolean;
  selectedFavouriteState: 'all' | 'some' | 'none';
  removableVariantTypes: string[];
  handleToggleSelect: (albumCode: string) => void;
  handleRangeSelect: (albumCodes: string[]) => void;
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
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());

  const selectedHasAnyOwned = useMemo(() => {
    for (const code of selectedCodes) {
      if (ownedMap.has(code)) return true;
    }
    return false;
  }, [selectedCodes, ownedMap]);

  const selectedFavouriteState = useMemo<'all' | 'some' | 'none'>(() => {
    if (selectedCodes.size === 0) return 'none';
    let favCount = 0;
    for (const code of selectedCodes) {
      if (favouriteSet.has(code)) favCount++;
    }
    if (favCount === 0) return 'none';
    if (favCount === selectedCodes.size) return 'all';
    return 'some';
  }, [selectedCodes, favouriteSet]);

  const removableVariantTypes = useMemo(() => {
    const types = new Set<string>();
    for (const code of selectedCodes) {
      const variants = ownedMap.get(code);
      if (variants) {
        for (const vt of variants.keys()) types.add(vt);
      }
    }
    return [...types];
  }, [selectedCodes, ownedMap]);

  const handleToggleSelect = useCallback((albumCode: string) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(albumCode)) next.delete(albumCode);
      else next.add(albumCode);
      return next;
    });
  }, []);

  const handleRangeSelect = useCallback((albumCodes: string[]) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      for (const code of albumCodes) next.add(code);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedCodes(new Set(displayedStickers.map((s) => s.albumCode)));
  }, [displayedStickers]);

  const handleDeselectAll = useCallback(() => {
    setSelectedCodes(new Set());
  }, []);

  const handleExitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedCodes(new Set());
  }, []);

  return {
    selectionMode,
    setSelectionMode,
    selectedCodes,
    setSelectedCodes,
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
