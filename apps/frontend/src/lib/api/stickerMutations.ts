import { apiFetch } from '../apiClient';
import type { CollectionItem } from './types';

// Per-sticker mutations (favourites, ownership, trade flags). Lives alongside
// /albums because the URLs are all under /users/:id/albums/:id/… or
// /users/:id/stickers/….

export async function fetchFavourites(
  userId: string,
  albumId: string,
  token: string,
): Promise<string[]> {
  const { items } = await apiFetch<{ items: string[] }>(
    `/api/v1/users/${userId}/albums/${albumId}/favourites`,
    {},
    token,
  );
  return items;
}

export async function replaceFavourites(
  userId: string,
  albumId: string,
  stickerIds: string[],
  token: string,
): Promise<void> {
  return apiFetch<void>(
    `/api/v1/users/${userId}/albums/${albumId}/favourites`,
    { method: 'PUT', body: JSON.stringify({ stickerIds }) },
    token,
  );
}

export async function toggleFavourite(
  userId: string,
  albumId: string,
  stickerId: string,
  token: string,
): Promise<{ favourited: boolean }> {
  return apiFetch<{ favourited: boolean }>(
    `/api/v1/users/${userId}/albums/${albumId}/favourites/${stickerId}/toggle`,
    { method: 'POST' },
    token,
  );
}

export async function moveSticker(
  userId: string,
  sourceAlbumId: string,
  variantId: string,
  targetAlbumId: string,
  quantity: number,
  token: string,
): Promise<void> {
  return apiFetch<void>(
    `/api/v1/users/${userId}/albums/${sourceAlbumId}/stickers/${variantId}/move`,
    { method: 'POST', body: JSON.stringify({ targetAlbumId, quantity }) },
    token,
  );
}

// Bulk mutation — single round-trip for mass actions. The previous
// `runBatched(items, 10, fn)` pattern collapsed into one POST.
export interface BulkOp {
  op: 'add' | 'set' | 'remove' | 'flags';
  variantId: string;
  quantity?: number;
  tradeHidden?: boolean;
  tradeForced?: boolean;
}

export async function bulkStickers(
  userId: string,
  albumId: string,
  ops: BulkOp[],
  token: string,
): Promise<{ applied: number }> {
  return apiFetch<{ applied: number }>(
    `/api/v1/users/${userId}/stickers/bulk`,
    {
      method: 'POST',
      body: JSON.stringify({ albumId, ops }),
    },
    token,
  );
}

export async function addSticker(
  userId: string,
  variantId: string,
  quantity?: number,
  token?: string,
  albumId?: string,
): Promise<{ quantity: number }> {
  return apiFetch<{ quantity: number }>(
    `/api/v1/users/${userId}/stickers`,
    {
      method: 'POST',
      body: JSON.stringify({ variantId, quantity, albumId }),
    },
    token,
  );
}

export async function patchSticker(
  userId: string,
  variantId: string,
  quantity: number,
  token?: string,
  albumId?: string,
): Promise<CollectionItem> {
  const qs = albumId ? `?albumId=${encodeURIComponent(albumId)}` : '';
  return apiFetch<CollectionItem>(
    `/api/v1/users/${userId}/stickers/${variantId}${qs}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    },
    token,
  );
}

export async function deleteSticker(
  userId: string,
  variantId: string,
  token?: string,
  albumId?: string,
): Promise<void> {
  const qs = albumId ? `?albumId=${encodeURIComponent(albumId)}` : '';
  return apiFetch<void>(
    `/api/v1/users/${userId}/stickers/${variantId}${qs}`,
    { method: 'DELETE' },
    token,
  );
}

export async function setTradeFlags(
  userId: string,
  variantId: string,
  flags: { tradeHidden?: boolean; tradeForced?: boolean },
  token: string,
  albumId?: string,
): Promise<void> {
  const qs = albumId ? `?albumId=${encodeURIComponent(albumId)}` : '';
  return apiFetch<void>(
    `/api/v1/users/${userId}/stickers/${variantId}/trade-flags${qs}`,
    { method: 'PATCH', body: JSON.stringify(flags) },
    token,
  );
}
