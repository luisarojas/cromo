'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchFavourites,
  replaceFavourites,
  toggleFavourite as toggleFavouriteApi,
  type Sticker,
} from '@/lib/api';

interface UseFavouritesArgs {
  userId: string | null;
  albumId: string;
  token: string | null;
  stickersByAlbumCode: Map<string, Sticker>;
}

/**
 * useFavourites — manages the per-album favourites set server-side. Replaces
 * the localStorage JSON blob the page used to read/write on every toggle.
 *
 * The API canonicalises stickers by UUID, but the UI references them by
 * album_code. We translate at the boundary so callers can keep using
 * album_code (which is what they have in hand when rendering a sticker card).
 */
export function useFavourites({ userId, albumId, token, stickersByAlbumCode }: UseFavouritesArgs) {
  const [favouriteSet, setFavouriteSet] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId || !token) return;
    let cancelled = false;
    fetchFavourites(userId, albumId, token)
      .then((codes) => { if (!cancelled) { setFavouriteSet(new Set(codes)); setLoaded(true); } })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [userId, albumId, token]);

  const toggle = useCallback((albumCode: string) => {
    const sticker = stickersByAlbumCode.get(albumCode);
    if (!sticker || !userId || !token) return;
    // Optimistic local update — server confirms.
    setFavouriteSet((prev) => {
      const next = new Set(prev);
      if (next.has(albumCode)) next.delete(albumCode);
      else next.add(albumCode);
      return next;
    });
    toggleFavouriteApi(userId, albumId, sticker.id, token).catch((err) => {
      console.error('Favourite toggle failed', err);
    });
  }, [stickersByAlbumCode, userId, albumId, token]);

  const setBulk = useCallback((albumCodes: string[], on: boolean) => {
    if (!userId || !token) return;
    setFavouriteSet((prev) => {
      const next = new Set(prev);
      for (const code of albumCodes) {
        if (on) next.add(code);
        else next.delete(code);
      }
      // Persist the full set after the bulk change.
      const stickerIds: string[] = [];
      for (const code of next) {
        const sticker = stickersByAlbumCode.get(code);
        if (sticker) stickerIds.push(sticker.id);
      }
      replaceFavourites(userId, albumId, stickerIds, token).catch((err) => {
        console.error('Bulk favourites update failed', err);
      });
      return next;
    });
  }, [stickersByAlbumCode, userId, albumId, token]);

  return { favouriteSet, loaded, toggle, setBulk };
}
