'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchAlbumWantedVariants,
  addAlbumWantedVariant,
  removeAlbumWantedVariant,
} from '@/lib/api';

interface UseWantedVariantsArgs {
  userId: string | null;
  albumId: string;
  token: string | null;
}

interface WantedEntry { variantId: string; stickerId: string }

export function useWantedVariants({ userId, albumId, token }: UseWantedVariantsArgs) {
  const [entries, setEntries] = useState<WantedEntry[]>([]);

  useEffect(() => {
    if (!userId || !token) return;
    let cancelled = false;
    fetchAlbumWantedVariants(userId, albumId, token)
      .then((items) => { if (!cancelled) setEntries(items); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId, albumId, token]);

  const wantedVariantIds = useMemo(
    () => new Set(entries.map((e) => e.variantId)),
    [entries],
  );

  const wantedStickerIds = useMemo(
    () => new Set(entries.map((e) => e.stickerId)),
    [entries],
  );

  const toggle = useCallback(async (variantId: string, stickerId: string) => {
    if (!userId || !token) return;
    const already = entries.some((e) => e.variantId === variantId);
    setEntries((prev) =>
      already
        ? prev.filter((e) => e.variantId !== variantId)
        : [...prev, { variantId, stickerId }],
    );
    try {
      if (already) {
        await removeAlbumWantedVariant(userId, albumId, variantId, token);
      } else {
        await addAlbumWantedVariant(userId, albumId, variantId, token);
      }
    } catch (err) {
      console.error('Failed to update wanted', err);
      setEntries((prev) =>
        already
          ? [...prev, { variantId, stickerId }]
          : prev.filter((e) => e.variantId !== variantId),
      );
    }
  }, [entries, userId, albumId, token]);

  return { wantedVariantIds, wantedStickerIds, toggle };
}
