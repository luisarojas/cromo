import { apiFetch, toQueryString } from '../apiClient';
import type {
  AlbumSettings,
  AlbumStats,
  CollectionStats,
  CrossAlbum,
  FilterOptions,
  TradeInventoryVisibility,
  UserAlbum,
  UserAlbumWithStats,
} from './types';

/** Public list of all album types — used by the anonymous trade-match flow. */
export interface AlbumTypeOption { key: string; name: string }

export async function fetchAlbumTypes(): Promise<AlbumTypeOption[]> {
  const res = await apiFetch<{ items: AlbumTypeOption[] }>('/api/v1/album-types');
  return res.items;
}

export interface AlbumEditionOption {
  key: string;
  name: string;
}

export async function fetchAlbumEditions(albumTypeKey: string): Promise<AlbumEditionOption[]> {
  const { items } = await apiFetch<{ items: AlbumEditionOption[] }>(
    `/api/v1/album-types/${encodeURIComponent(albumTypeKey)}/editions`,
  );
  return items;
}

// Formats are the physical binding/material of the album (softcover, hardcover,
// metallised softcover, etc.) and are constrained per edition: each format
// carries the list of edition keys it is sold in, so the UI can filter the
// format dropdown when the user picks an edition without an extra round-trip.
export interface AlbumFormatOption {
  key: string;
  name: string;
  editions: string[];
}

export async function fetchAlbumFormats(albumTypeKey: string): Promise<AlbumFormatOption[]> {
  const { items } = await apiFetch<{ items: AlbumFormatOption[] }>(
    `/api/v1/album-types/${encodeURIComponent(albumTypeKey)}/formats`,
  );
  return items;
}

export function albumDisplayName(album: UserAlbum): string {
  return album.alias ?? album.albumTypeName;
}

export type AlbumSort =
  | 'default'
  | 'created_desc'
  | 'created_asc'
  | 'completion_desc'
  | 'completion_asc'
  | 'alias_asc';

export async function fetchUserAlbums(
  userId: string,
  token: string,
  sort?: AlbumSort,
  type?: string,
): Promise<UserAlbum[]> {
  const qs = toQueryString({
    ...(sort && sort !== 'default' ? { sort } : {}),
    ...(type && type !== 'all' ? { type } : {}),
  });
  const { items } = await apiFetch<{ items: UserAlbum[] }>(
    `/api/v1/users/${userId}/albums${qs}`,
    {},
    token,
  );
  return items;
}

/**
 * fetchUserAlbumsWithStats — bundled variant that returns each album with its
 * trigger-maintained completion counts inline. Lets the dashboard skip the
 * extra `/collection/stats` and `/albums/stats` round-trips.
 */
export async function fetchUserAlbumsWithStats(
  userId: string,
  token: string,
  sort?: AlbumSort,
  type?: string,
): Promise<UserAlbumWithStats[]> {
  const qs = toQueryString({
    withStats: true,
    ...(sort && sort !== 'default' ? { sort } : {}),
    ...(type && type !== 'all' ? { type } : {}),
  });
  const { items } = await apiFetch<{ items: UserAlbumWithStats[] }>(
    `/api/v1/users/${userId}/albums${qs}`,
    {},
    token,
  );
  return items;
}

export async function createUserAlbum(
  userId: string,
  body: { alias?: string | null; notes?: string | null; edition?: string; format?: string; settings?: AlbumSettings; tradeInventoryVisibility?: TradeInventoryVisibility },
  token: string,
): Promise<UserAlbumWithStats> {
  return apiFetch<UserAlbumWithStats>(
    `/api/v1/users/${userId}/albums`,
    { method: 'POST', body: JSON.stringify(body) },
    token,
  );
}

export async function updateUserAlbum(
  userId: string,
  albumId: string,
  patch: { alias?: string | null; notes?: string | null; edition?: string; format?: string; settings?: Partial<AlbumSettings>; tradeInventoryVisibility?: TradeInventoryVisibility },
  token: string,
): Promise<UserAlbumWithStats> {
  return apiFetch<UserAlbumWithStats>(
    `/api/v1/users/${userId}/albums/${albumId}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
    token,
  );
}

export async function deleteUserAlbum(
  userId: string,
  albumId: string,
  token: string,
): Promise<void> {
  return apiFetch<void>(
    `/api/v1/users/${userId}/albums/${albumId}`,
    { method: 'DELETE' },
    token,
  );
}

export async function setDefaultUserAlbum(
  userId: string,
  albumId: string,
  token: string,
): Promise<UserAlbum> {
  return apiFetch<UserAlbum>(
    `/api/v1/users/${userId}/albums/${albumId}/set-default`,
    { method: 'POST' },
    token,
  );
}

export async function fetchAlbumCrossAlbum(
  userId: string,
  albumId: string,
  token: string,
): Promise<CrossAlbum> {
  return apiFetch<CrossAlbum>(
    `/api/v1/users/${userId}/albums/${albumId}/cross-album`,
    {},
    token,
  );
}

// One-shot album-page payload — replaces the (fetchCollectionPage loop +
// fetchAlbumCrossAlbum) pair the page used to spin up on mount.
export interface OwnedVariantRow {
  stickerId: string;
  albumCode: string;
  variantType: string;
  stickerVariantId: string;
  quantity: number;
  tradeHidden: boolean;
  tradeForced: boolean;
  updatedAt: string;
}

export interface AlbumView {
  ownedVariants: OwnedVariantRow[];
  stats: CollectionStats;
  totalExtraCopies: number;
  filterOptions: FilterOptions;
  crossAlbum: CrossAlbum;
}

export async function fetchAlbumView(
  userId: string,
  albumId: string,
  token: string,
): Promise<AlbumView> {
  return apiFetch<AlbumView>(
    `/api/v1/users/${userId}/albums/${albumId}/view`,
    {},
    token,
  );
}

export async function fetchAlbumStats(
  userId: string,
  token: string,
): Promise<AlbumStats[]> {
  const { items } = await apiFetch<{ items: AlbumStats[] }>(
    `/api/v1/users/${userId}/albums/stats`,
    {},
    token,
  );
  return items;
}
