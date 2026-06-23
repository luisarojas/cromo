import { apiFetch } from '../apiClient';

// Explicit per-variant wishlist. Distinct from /collection's "missing" view —
// missing = anything you don't yet own; wanted = the subset the user
// actively flagged. Powers trade-matching.

export interface WantedVariantEntry {
  variantId: string;
  stickerId: string;
}

export async function fetchAlbumWantedVariants(
  userId: string,
  albumId: string,
  token: string,
): Promise<WantedVariantEntry[]> {
  const data = await apiFetch<{ items: WantedVariantEntry[] }>(
    `/api/v1/users/${userId}/albums/${albumId}/wanted-variants`,
    {},
    token,
  );
  return data.items;
}

export async function addAlbumWantedVariant(
  userId: string,
  albumId: string,
  variantId: string,
  token: string,
): Promise<void> {
  return apiFetch<void>(
    `/api/v1/users/${userId}/albums/${albumId}/wanted-variants`,
    { method: 'POST', body: JSON.stringify({ variantId }) },
    token,
  );
}

export async function removeAlbumWantedVariant(
  userId: string,
  albumId: string,
  variantId: string,
  token: string,
): Promise<void> {
  return apiFetch<void>(
    `/api/v1/users/${userId}/albums/${albumId}/wanted-variants/${variantId}`,
    { method: 'DELETE' },
    token,
  );
}
