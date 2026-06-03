'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchFavourites,
  replaceFavourites,
  toggleFavourite as toggleFavouriteApi,
} from '@/lib/api';

interface UseFavouritesArgs {
  userId: string | null;
  albumId: string;
  token: string | null;
}

/**
 * useFavourites — manages the per-album favourites set server-side, keyed by
 * sticker UUID. The album_code is a display label and can be shared by multiple
 * stickers (CC regional alternates), so identity flows through sticker IDs only.
 */
export function useFavourites({ userId, albumId, token }: UseFavouritesArgs) {
  const [favouriteSet, setFavouriteSet] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId || !token) return;
    let cancelled = false;
    fetchFavourites(userId, albumId, token)
      .then((ids) => { if (!cancelled) { setFavouriteSet(new Set(ids)); setLoaded(true); } })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [userId, albumId, token]);

  const toggle = useCallback((stickerId: string) => {
    if (!userId || !token) return;
    // Optimistic local update — server confirms.
    setFavouriteSet((prev) => {
      const next = new Set(prev);
      if (next.has(stickerId)) next.delete(stickerId);
      else next.add(stickerId);
      return next;
    });
    toggleFavouriteApi(userId, albumId, stickerId, token).catch((err) => {
      console.error('Favourite toggle failed', err);
    });
  }, [userId, albumId, token]);

  const setBulk = useCallback((stickerIds: string[], on: boolean) => {
    if (!userId || !token) return;
    setFavouriteSet((prev) => {
      const next = new Set(prev);
      for (const id of stickerIds) {
        if (on) next.add(id);
        else next.delete(id);
      }
      replaceFavourites(userId, albumId, [...next], token).catch((err) => {
        console.error('Bulk favourites update failed', err);
      });
      return next;
    });
  }, [userId, albumId, token]);

  return { favouriteSet, loaded, toggle, setBulk };
}
