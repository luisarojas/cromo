export const DEFAULT_ALBUM_TYPE_KEY = 'fifa_world_cup_2026';

// Canonical literal unions + AlbumSettings live in @stickfolio/shared so the
// backend (Drizzle schema, response shapes) and the frontend (api.ts, pages)
// agree on names and casing. Add new shared types there, not here.
export type {
  AlbumSettings,
  StickerType,
  VariantType,
  Position,
  TradeStatus,
  ListType,
  UserRole,
} from '@stickfolio/shared';

// Canonical wire types. Every interface that describes a JSON response
// body lives in @stickfolio/shared and is re-exported here as the public
// API surface for frontend consumers.
import type {
  AuthUser as SharedAuthUser,
  UserAlbumDto,
  AlbumStatsDto,
  CrossAlbumDto,
  CollectionStatsDto,
  FilterOptionsDto,
  PagedResult as SharedPagedResult,
  UserAlbumWithStats as SharedUserAlbumWithStats,
  Sticker as SharedSticker,
  StickerVariant as SharedStickerVariant,
  StickerLookup as SharedStickerLookup,
  CollectionItem as SharedCollectionItem,
  MissingItem as SharedMissingItem,
  DuplicateItem as SharedDuplicateItem,
  City as SharedCity,
  UserPreferences as SharedUserPreferences,
  TradeMatch as SharedTradeMatch,
  TradeItemDetail as SharedTradeItemDetail,
  TradeMessage as SharedTradeMessage,
  TradeSummary as SharedTradeSummary,
  TradeDetail as SharedTradeDetail,
  ShareLink as SharedShareLink,
  PublicListItem as SharedPublicListItem,
  PublicList as SharedPublicList,
  PublicInventoryItem as SharedPublicInventoryItem,
  PublicProfileAlbum as SharedPublicProfileAlbum,
  PublicProfile as SharedPublicProfile,
  PublicWantedPage as SharedPublicWantedPage,
} from '@stickfolio/shared';

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Auth API
// ---------------------------------------------------------------------------

export type AuthUser = SharedAuthUser;

export async function loginApi(
  email: string,
  password: string,
): Promise<{ accessToken: string; user: AuthUser }> {
  const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message ?? 'Login failed');
  }
  return res.json() as Promise<{ accessToken: string; user: AuthUser }>;
}

export async function refreshApi(): Promise<{ accessToken: string; user: AuthUser } | null> {
  const res = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) return null;
  const data = await res.json() as { authenticated: boolean; accessToken?: string; user?: AuthUser };
  if (!data.authenticated) return null;
  return { accessToken: data.accessToken!, user: data.user! };
}

export async function logoutApi(): Promise<void> {
  await fetch(`${BASE_URL}/api/v1/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}

export async function registerApi(body: {
  email: string;
  username: string;
  password: string;
  displayName?: string;
}): Promise<{ message: string; userId: string }> {
  const res = await fetch(`${BASE_URL}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message ?? 'Registration failed');
  }
  return res.json() as Promise<{ message: string; userId: string }>;
}

export async function verifyEmailApi(token: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/v1/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    const err = new Error(data.message ?? 'Verification failed') as Error & {
      statusCode?: number;
    };
    err.statusCode = res.status;
    throw err;
  }
}

export async function resendVerificationApi(email: string): Promise<void> {
  await fetch(`${BASE_URL}/api/v1/auth/resend-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export async function updateUsernameApi(
  username: string,
  token: string,
): Promise<{ username: string }> {
  const res = await fetch(`${BASE_URL}/api/v1/users/me/username`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ username }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message ?? 'Failed to update username');
  }
  return res.json() as Promise<{ username: string }>;
}

export async function updateDisplayNameApi(
  displayName: string | null,
  token: string,
): Promise<{ displayName: string | null }> {
  const res = await fetch(`${BASE_URL}/api/v1/users/me/display-name`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ displayName }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message ?? 'Failed to update display name');
  }
  return res.json() as Promise<{ displayName: string | null }>;
}

export async function updateEmailApi(
  email: string,
  token: string,
): Promise<{ email: string }> {
  const res = await fetch(`${BASE_URL}/api/v1/users/me/email`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message ?? 'Failed to update email');
  }
  return res.json() as Promise<{ email: string }>;
}

export async function updatePasswordApi(
  currentPassword: string,
  newPassword: string,
  token: string,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/v1/users/me/password`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message ?? 'Failed to update password');
  }
}

export async function deleteAccountApi(token: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/v1/users/me`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message ?? 'Failed to delete account');
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// camelizeKeys (backend serializer) converts dict keys too, so "north_america" → "northAmerica" inside teamPages/stickerPages
export function toEditionKey(edition: string): string {
  return edition.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

export type Sticker = SharedSticker;
export type CollectionItem = SharedCollectionItem;
export type MissingItem = SharedMissingItem;
export type StickerVariant = SharedStickerVariant;
export type DuplicateItem = SharedDuplicateItem;
export type CollectionStats = CollectionStatsDto;
export type PagedResult<T> = SharedPagedResult<T>;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildHeaders(token?: string, hasBody = false): HeadersInit {
  const headers: Record<string, string> = {};
  if (hasBody) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

const DEFAULT_TIMEOUT_MS = 30_000;

// In-flight GET dedup: if two components hit the same path with the same token
// concurrently, share a single fetch. Cleared as soon as the promise settles
// — this is *not* a persistent cache, just a way to collapse stampedes during
// initial render. Mutations bypass this entirely.
const inFlightGets = new Map<string, Promise<unknown>>();

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const hasBody = options.body !== undefined;
  const dedupable = method === 'GET' && !hasBody && !options.signal;
  const key = dedupable ? `${token ?? ''}|${path}` : null;

  if (key) {
    const existing = inFlightGets.get(key) as Promise<T> | undefined;
    if (existing) return existing;
  }

  // If the caller already passed a signal, respect it; otherwise apply a default timeout.
  const signal = options.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS);

  const run = (async (): Promise<T> => {
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}${path}`, {
        ...options,
        signal,
        headers: {
          ...buildHeaders(token, hasBody),
          ...(options.headers ?? {}),
        },
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        throw new Error(`API timeout after ${DEFAULT_TIMEOUT_MS}ms: ${path}`);
      }
      throw err;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`API error ${res.status}: ${text}`);
    }

    // DELETE returns 204 with no body
    if (res.status === 204) return undefined as unknown as T;

    return res.json() as Promise<T>;
  })();

  if (key) {
    inFlightGets.set(key, run);
    run.finally(() => inFlightGets.delete(key));
  }
  return run;
}

function toQueryString(
  params: Record<string, string | number | undefined>,
): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== '') {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(val)}`);
    }
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

// ---------------------------------------------------------------------------
// Sticker catalog — relies on HTTP caching, not localStorage.
//
// The frontend probes /api/v1/stickers/version (cheap: a single MAX(updated_at)
// query, cached in Redis for 5 min) and embeds the result as `?v=<version>` on
// catalog requests. Each (version, cursor) combination is therefore a unique URL
// that the backend serves with `Cache-Control: public, max-age=86400,
// stale-while-revalidate=604800` — browser + CDN cache it freely. An admin edit
// bumps the version, produces a fresh URL on next page load, and old entries
// fall out of the cache on their own.
//
// Concurrent callers are deduplicated via the in-flight registry below so that
// two components mounting at once don't fire two pagination loops.
// ---------------------------------------------------------------------------

async function fetchCatalogVersion(token?: string): Promise<string> {
  try {
    const { version } = await apiFetch<{ version: string }>(
      '/api/v1/stickers/version', {}, token
    );
    return version || 'unversioned';
  } catch {
    return 'unversioned';
  }
}

const inFlightCatalog = new Map<string, Promise<Sticker[]>>();

export async function fetchAllStickers(token?: string): Promise<Sticker[]> {
  const version = await fetchCatalogVersion(token);
  const existing = inFlightCatalog.get(version);
  if (existing) return existing;

  const promise = (async () => {
    const all: Sticker[] = [];
    let cursor: number | undefined = undefined;
    for (let i = 0; i < 50; i++) {
      const result = await fetchStickers({ cursor, limit: 200, v: version }, token);
      all.push(...result.items);
      if (!result.nextCursor || result.items.length === 0) break;
      cursor = result.nextCursor;
      if (all.length >= 1200) break;
    }
    return all;
  })();

  inFlightCatalog.set(version, promise);
  try {
    return await promise;
  } finally {
    // Keep the resolved promise around so re-entrant callers can await the same
    // value; clear only on failure so the next attempt can retry.
    promise.catch(() => inFlightCatalog.delete(version));
  }
}

// Back-compat shim while older call sites are migrated. Identical semantics:
// HTTP cache makes this fast on repeat calls.
export const fetchAllStickersCached = fetchAllStickers;

// ---------------------------------------------------------------------------
// Sticker endpoints
// ---------------------------------------------------------------------------

export async function fetchStickers(
  params?: {
    team?: string;
    group?: string;
    type?: string;
    search?: string;
    cursor?: number;
    limit?: number;
    // Catalog version embedded in the URL so HTTP/CDN caches treat each
    // version as a distinct, immutable resource. The backend ignores the
    // param; admin edits bump the version and produce a fresh URL.
    v?: string;
  },
  token?: string,
): Promise<PagedResult<Sticker>> {
  const qs = toQueryString(params ?? {});
  return apiFetch<PagedResult<Sticker>>(`/api/v1/stickers${qs}`, {}, token);
}

export async function fetchStickerByAlbumCode(
  albumCode: string,
  token?: string,
): Promise<Sticker> {
  return apiFetch<Sticker>(`/api/v1/stickers/${albumCode}`, {}, token);
}

export async function fetchStickerVariants(
  albumCode: string,
  token?: string,
): Promise<StickerVariant[]> {
  const { items } = await apiFetch<{ items: StickerVariant[] }>(
    `/api/v1/stickers/${albumCode}/variants`,
    {},
    token,
  );
  return items;
}

export type StickerLookup = SharedStickerLookup;

export async function fetchStickersBulk(
  codes: string[],
  token?: string,
): Promise<StickerLookup[]> {
  if (codes.length === 0) return [];
  const { items } = await apiFetch<{ items: StickerLookup[] }>(
    '/api/v1/stickers/lookup',
    { method: 'POST', body: JSON.stringify({ codes }) },
    token,
  );
  return items;
}

// ---------------------------------------------------------------------------
// Collection endpoints
// ---------------------------------------------------------------------------

export async function fetchCollection(
  userId: string,
  params?: {
    albumId?: string;
    team?: string;
    group?: string;
    type?: string;
    variant?: string;
    cursor?: number;
    limit?: number;
  },
  token?: string,
): Promise<PagedResult<CollectionItem>> {
  const qs = toQueryString(params ?? {});
  return apiFetch<PagedResult<CollectionItem>>(
    `/api/v1/users/${userId}/collection${qs}`,
    {},
    token,
  );
}

export type FilterOptions = FilterOptionsDto;

export interface CollectionPage extends PagedResult<CollectionItem> {
  stats: CollectionStats;
  totalExtraCopies: number;
  filterOptions: FilterOptions;
}

/**
 * fetchCollectionPage — bundled response (items + stats + filter options +
 * extra-copies count) so the album page can stop running 3 useMemo passes
 * over the full catalog on every keystroke.
 */
export async function fetchCollectionPage(
  userId: string,
  params: {
    albumId?: string;
    team?: string;
    group?: string;
    type?: string;
    variant?: string;
    cursor?: number;
    limit?: number;
  },
  token: string,
): Promise<CollectionPage> {
  const qs = toQueryString({ ...params, bundle: 'page' });
  return apiFetch<CollectionPage>(
    `/api/v1/users/${userId}/collection${qs}`,
    {},
    token,
  );
}

export async function fetchStats(
  userId: string,
  token?: string,
  albumId?: string,
): Promise<CollectionStats> {
  const qs = albumId ? `?albumId=${encodeURIComponent(albumId)}` : '';
  return apiFetch<CollectionStats>(
    `/api/v1/users/${userId}/collection/stats${qs}`,
    {},
    token,
  );
}

export async function fetchMissing(
  userId: string,
  params?: { albumId?: string; team?: string; group?: string; cursor?: number; limit?: number },
  token?: string,
): Promise<PagedResult<MissingItem>> {
  const qs = toQueryString(params ?? {});
  return apiFetch<PagedResult<MissingItem>>(
    `/api/v1/users/${userId}/missing${qs}`,
    {},
    token,
  );
}

export async function fetchDuplicates(
  userId: string,
  params?: { albumId?: string; cursor?: number; limit?: number },
  token?: string,
): Promise<PagedResult<DuplicateItem>> {
  const qs = toQueryString(params ?? {});
  return apiFetch<PagedResult<DuplicateItem>>(
    `/api/v1/users/${userId}/duplicates${qs}`,
    {},
    token,
  );
}

// ---------------------------------------------------------------------------
// Album editions catalog
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Album formats catalog
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Album endpoints
// ---------------------------------------------------------------------------

// AlbumSettings is re-exported from @stickfolio/shared at the top of this file.
import type { AlbumSettings } from '@stickfolio/shared';

export type UserAlbum = UserAlbumDto;

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
  body: { alias?: string | null; notes?: string | null; edition?: string; format?: string; settings?: AlbumSettings; isTradeInventoryPublic?: boolean },
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
  patch: { alias?: string | null; notes?: string | null; edition?: string; format?: string; settings?: Partial<AlbumSettings>; isTradeInventoryPublic?: boolean },
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

export type CrossAlbum = CrossAlbumDto;

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

export type AlbumStats = AlbumStatsDto;
export type UserAlbumWithStats = SharedUserAlbumWithStats;

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

// ---------------------------------------------------------------------------
// Favourites
// ---------------------------------------------------------------------------

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

export async function addSticker(
  userId: string,
  variantId: string,
  quantity?: number,
  token?: string,
  albumId?: string,
): Promise<CollectionItem> {
  return apiFetch<CollectionItem>(
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

// ---------------------------------------------------------------------------
// User preferences endpoints
// ---------------------------------------------------------------------------

export type City = SharedCity;
export type UserPreferences = SharedUserPreferences;

export async function fetchUserPreferences(token: string): Promise<UserPreferences> {
  return apiFetch<UserPreferences>('/api/v1/users/me/preferences', {}, token);
}

export async function patchUserPreferences(
  patch: Partial<UserPreferences>,
  token: string,
): Promise<UserPreferences> {
  return apiFetch<UserPreferences>(
    '/api/v1/users/me/preferences',
    { method: 'PATCH', body: JSON.stringify(patch) },
    token,
  );
}

// ---------------------------------------------------------------------------
// Admin endpoints
// ---------------------------------------------------------------------------

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  role: string;
  createdAt: string;
  deletedAt: string | null;
  isBanned: boolean;
}

export interface AdminUsersResult {
  items: AdminUser[];
  total: number;
  page: number;
  limit: number;
}

export async function fetchAdminUsers(
  params: { search?: string; page?: number; limit?: number },
  token: string,
): Promise<AdminUsersResult> {
  const qs = toQueryString(params);
  return apiFetch<AdminUsersResult>(`/api/v1/admin/users${qs}`, {}, token);
}

export async function patchAdminUserRole(
  id: string,
  role: 'user' | 'admin',
  token: string,
): Promise<{ id: string; username: string; role: string }> {
  return apiFetch(
    `/api/v1/admin/users/${id}/role`,
    { method: 'PATCH', body: JSON.stringify({ role }) },
    token,
  );
}

export async function banAdminUser(
  id: string,
  reason: string,
  token: string,
): Promise<{ id: string; userId: string }> {
  return apiFetch(
    `/api/v1/admin/users/${id}/ban`,
    { method: 'POST', body: JSON.stringify({ reason, banType: 'soft' }) },
    token,
  );
}

export async function unbanAdminUser(id: string, token: string): Promise<void> {
  return apiFetch(
    `/api/v1/admin/users/${id}/ban`,
    { method: 'DELETE' },
    token,
  );
}

export async function deleteAdminUser(id: string, token: string): Promise<void> {
  return apiFetch(
    `/api/v1/admin/users/${id}`,
    { method: 'DELETE' },
    token,
  );
}

export async function patchAdminSticker(
  id: string,
  body: {
    playerName?: string;
    position?: string;
    notes?: string;
  },
  token?: string,
): Promise<Sticker> {
  return apiFetch<Sticker>(
    `/api/v1/admin/stickers/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
    token,
  );
}

// ---------------------------------------------------------------------------
// Trade & sharing types
// ---------------------------------------------------------------------------

export type TradeMatch = SharedTradeMatch;
export type TradeItemDetail = SharedTradeItemDetail;
export type TradeMessage = SharedTradeMessage;
export type TradeSummary = SharedTradeSummary;
export type TradeDetail = SharedTradeDetail;
export type ShareLink = SharedShareLink;
export type PublicListItem = SharedPublicListItem;
export type PublicList = SharedPublicList;
export type PublicInventoryItem = SharedPublicInventoryItem;
export type PublicProfileAlbum = SharedPublicProfileAlbum;
export type PublicProfile = SharedPublicProfile;
export type PublicWantedPage = SharedPublicWantedPage;

// ---------------------------------------------------------------------------
// Trade API endpoints
// ---------------------------------------------------------------------------

export interface TradeMatchesPage {
  items: TradeMatch[];
  nextCursor: string | null;
  total: number;
}

export async function fetchTradeMatches(
  albumId: string,
  token: string,
  opts?: { cursor?: string; limit?: number },
): Promise<TradeMatchesPage> {
  const qs = toQueryString({ albumId, ...(opts ?? {}) });
  return apiFetch<TradeMatchesPage>(`/api/v1/trade/matches${qs}`, {}, token);
}

export interface TradesPage {
  items: TradeSummary[];
  nextCursor: string | null;
}

export async function fetchTrades(
  params: { status?: string; cursor?: string; limit?: number },
  token: string,
): Promise<TradesPage> {
  const qs = toQueryString(params);
  return apiFetch<TradesPage>(`/api/v1/trade/requests${qs}`, {}, token);
}

export async function fetchTrade(id: string, token: string): Promise<TradeDetail> {
  return apiFetch<TradeDetail>(`/api/v1/trade/requests/${id}`, {}, token);
}

export async function createTrade(
  body: {
    recipientId: string;
    requesterAlbumId?: string;
    items: { variantId: string; direction: 'offer' | 'want'; quantity: number }[];
    offerCash?: number;
    wantCash?: number;
  },
  token: string,
): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(
    '/api/v1/trade/requests',
    { method: 'POST', body: JSON.stringify(body) },
    token,
  );
}

export async function acceptTrade(id: string, token: string): Promise<void> {
  return apiFetch<void>(
    `/api/v1/trade/requests/${id}/accept`,
    { method: 'POST' },
    token,
  );
}

export async function declineTrade(id: string, token: string): Promise<void> {
  return apiFetch<void>(
    `/api/v1/trade/requests/${id}/decline`,
    { method: 'POST' },
    token,
  );
}

export async function counterTrade(
  id: string,
  body: {
    items: { variantId: string; direction: 'offer' | 'want'; quantity: number }[];
    offerCash?: number;
    wantCash?: number;
  },
  token: string,
): Promise<void> {
  return apiFetch<void>(
    `/api/v1/trade/requests/${id}/counter`,
    { method: 'POST', body: JSON.stringify(body) },
    token,
  );
}

export async function editTrade(
  id: string,
  body: {
    items: { variantId: string; direction: 'offer' | 'want'; quantity: number }[];
    offerCash?: number;
    wantCash?: number;
  },
  token: string,
): Promise<void> {
  return apiFetch<void>(
    `/api/v1/trade/requests/${id}/edit`,
    { method: 'POST', body: JSON.stringify(body) },
    token,
  );
}

export async function cancelTrade(id: string, token: string): Promise<void> {
  return apiFetch<void>(
    `/api/v1/trade/requests/${id}/cancel`,
    { method: 'POST' },
    token,
  );
}

export async function completeTrade(id: string, token: string): Promise<void> {
  return apiFetch<void>(
    `/api/v1/trade/requests/${id}/complete`,
    { method: 'POST' },
    token,
  );
}

export async function fetchTradeMessages(
  id: string,
  params: { cursor?: string; limit?: number },
  token: string,
): Promise<{ items: TradeMessage[]; nextCursor: string | null }> {
  const qs = toQueryString(params as Record<string, string | number | undefined>);
  return apiFetch<{ items: TradeMessage[]; nextCursor: string | null }>(
    `/api/v1/trade/requests/${id}/messages${qs}`,
    {},
    token,
  );
}

export async function sendTradeMessage(
  id: string,
  body: string,
  token: string,
  idempotencyKey?: string,
): Promise<TradeMessage> {
  const headers: Record<string, string> = {};
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }
  return apiFetch<TradeMessage>(
    `/api/v1/trade/requests/${id}/messages`,
    { method: 'POST', body: JSON.stringify({ body }), headers },
    token,
  );
}

export async function fetchTradeStreamTicket(
  id: string,
  token: string,
): Promise<{ ticket: string; expiresIn: number }> {
  return apiFetch<{ ticket: string; expiresIn: number }>(
    `/api/v1/trade/requests/${id}/stream-ticket`,
    { method: 'POST' },
    token,
  );
}

// ---------------------------------------------------------------------------
// Share link endpoints
// ---------------------------------------------------------------------------

export async function createShareLink(
  userId: string,
  body: { listType: string },
  token: string,
): Promise<ShareLink> {
  return apiFetch<ShareLink>(
    `/api/v1/users/${userId}/share`,
    { method: 'POST', body: JSON.stringify(body) },
    token,
  );
}

export async function fetchShareLinks(userId: string, token: string): Promise<ShareLink[]> {
  return apiFetch<ShareLink[]>(`/api/v1/users/${userId}/share`, {}, token);
}

export async function revokeShareLink(
  userId: string,
  shareToken: string,
  token: string,
): Promise<void> {
  return apiFetch<void>(
    `/api/v1/users/${userId}/share/${shareToken}`,
    { method: 'DELETE' },
    token,
  );
}

export async function fetchPublicList(shareToken: string): Promise<PublicList> {
  return apiFetch<PublicList>(`/api/v1/share/${shareToken}`);
}

export async function fetchPublicProfile(username: string): Promise<PublicProfile> {
  return apiFetch<PublicProfile>(`/api/v1/profiles/${encodeURIComponent(username)}`);
}

interface PublicInventoryQueryParams {
  cursor?: number;
  limit?: number;
  stickerTypes?: string[];
  teams?: string[];
  variantTypes?: string[];
  search?: string;
}

function buildPublicInventoryQS(params: PublicInventoryQueryParams): string {
  const { cursor, limit, stickerTypes, teams, variantTypes, search } = params;
  const parts: string[] = [];
  if (cursor !== undefined) parts.push(`cursor=${cursor}`);
  if (limit !== undefined) parts.push(`limit=${limit}`);
  if (stickerTypes?.length) parts.push(`stickerType=${encodeURIComponent(stickerTypes.join(','))}`);
  if (teams?.length) parts.push(`team=${encodeURIComponent(teams.join(','))}`);
  if (variantTypes?.length) parts.push(`variantType=${encodeURIComponent(variantTypes.join(','))}`);
  if (search?.trim()) parts.push(`q=${encodeURIComponent(search.trim())}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export async function fetchPublicWanted(
  username: string,
  albumId: string,
  params: PublicInventoryQueryParams = {},
): Promise<PublicWantedPage> {
  return apiFetch<PublicWantedPage>(
    `/api/v1/profiles/${encodeURIComponent(username)}/albums/${albumId}/wanted${buildPublicInventoryQS(params)}`,
  );
}

export async function fetchPublicOffered(
  username: string,
  albumId: string,
  params: PublicInventoryQueryParams = {},
): Promise<PublicWantedPage> {
  return apiFetch<PublicWantedPage>(
    `/api/v1/profiles/${encodeURIComponent(username)}/albums/${albumId}/offered${buildPublicInventoryQS(params)}`,
  );
}

// ---------------------------------------------------------------------------
// Wanted variants — explicit per-variant wishlist
// ---------------------------------------------------------------------------

export async function fetchAlbumWantedVariants(
  userId: string,
  albumId: string,
  token: string,
): Promise<string[]> {
  const data = await apiFetch<{ variantIds: string[] }>(
    `/api/v1/users/${userId}/albums/${albumId}/wanted-variants`,
    {},
    token,
  );
  return data.variantIds;
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

// ---------------------------------------------------------------------------
// Trust & Safety endpoints
// ---------------------------------------------------------------------------

export type TrustTier = 'new_trader' | 'good_trader' | 'trusted_trader' | 'caution';

export interface TrustScore {
  tier: TrustTier;
  totalRatings: number;
  positiveCount: number;
  negativeCount: number;
  positivePercent: number;
}

export interface BanStatus {
  banned: false;
}

export interface BanStatusActive {
  banned: true;
  type: 'soft' | 'hard';
  expiresAt: string | null;
  message: string;
}

export type BanStatusResult = BanStatus | BanStatusActive;

export interface TradeRating {
  id: string;
  tradeId: string;
  raterId: string;
  raterUsername: string;
  raterDisplayName?: string | null;
  ratedUserId: string;
  isPositive: boolean;
  comment: string | null;
  createdAt: string;
}

export interface UserRatingsPage {
  trustScore: TrustScore;
  items: TradeRating[];
  nextCursor: string | null;
}

export interface AdminReport {
  id: string;
  reporterId: string;
  reporterUsername: string;
  reportedUserId: string;
  reportedUsername: string;
  category: string;
  description: string;
  status: string;
  tradeId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminReportsPage {
  items: AdminReport[];
  nextCursor: string | null;
}

export interface AdminBan {
  id: string;
  banType: string;
  reason: string;
  expiresAt: string | null;
  liftedAt: string | null;
  createdAt: string;
}

export interface AdminTrustSummary {
  userId: string;
  username: string;
  trustScore: TrustScore;
  banHistory: AdminBan[];
  openReportsCount: number;
  recentRatings: TradeRating[];
}

export async function fetchBanStatus(token: string): Promise<BanStatusResult> {
  return apiFetch<BanStatusResult>('/api/v1/users/me/ban-status', {}, token);
}

export async function submitRating(
  tradeId: string,
  body: { isPositive: boolean; comment?: string },
  token: string,
): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(
    `/api/v1/trade/requests/${tradeId}/ratings`,
    { method: 'POST', body: JSON.stringify(body) },
    token,
  );
}

export async function fetchTradeRatings(
  tradeId: string,
  token: string,
): Promise<{ items: TradeRating[] }> {
  return apiFetch<{ items: TradeRating[] }>(
    `/api/v1/trade/requests/${tradeId}/ratings`,
    {},
    token,
  );
}

export async function fetchUserRatings(
  userId: string,
  token?: string,
  params?: { cursor?: string; limit?: number },
): Promise<UserRatingsPage> {
  const qs = toQueryString(params ?? {});
  return apiFetch<UserRatingsPage>(`/api/v1/users/${userId}/ratings${qs}`, {}, token);
}

export async function submitReport(
  userId: string,
  body: { category: string; description: string; tradeId?: string },
  token: string,
): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(
    `/api/v1/users/${userId}/reports`,
    { method: 'POST', body: JSON.stringify(body) },
    token,
  );
}

export async function fetchAdminReports(
  params: { status?: string; category?: string; cursor?: string; limit?: number },
  token: string,
): Promise<AdminReportsPage> {
  const qs = toQueryString(params as Record<string, string | number | undefined>);
  return apiFetch<AdminReportsPage>(`/api/v1/admin/reports${qs}`, {}, token);
}

export async function patchAdminReport(
  reportId: string,
  body: { status: string; resolutionNote?: string },
  token: string,
): Promise<{ id: string; status: string }> {
  return apiFetch(
    `/api/v1/admin/reports/${reportId}`,
    { method: 'PATCH', body: JSON.stringify(body) },
    token,
  );
}

export async function createAdminBan(
  userId: string,
  body: { banType: 'soft' | 'hard'; reason: string; reportId?: string; expiresAt?: string },
  token: string,
): Promise<{ id: string; userId: string }> {
  return apiFetch(
    `/api/v1/admin/users/${userId}/bans`,
    { method: 'POST', body: JSON.stringify(body) },
    token,
  );
}

export async function fetchAdminUserBans(
  userId: string,
  token: string,
): Promise<{ items: AdminBan[] }> {
  return apiFetch(`/api/v1/admin/users/${userId}/bans`, {}, token);
}

export async function liftAdminBan(
  userId: string,
  banId: string,
  body: { liftReason: string },
  token: string,
): Promise<{ id: string; liftedAt: string }> {
  return apiFetch(
    `/api/v1/admin/users/${userId}/bans/${banId}/lift`,
    { method: 'POST', body: JSON.stringify(body) },
    token,
  );
}

export async function fetchAdminTrustSummary(
  userId: string,
  token: string,
): Promise<AdminTrustSummary> {
  return apiFetch(`/api/v1/admin/users/${userId}/trust-summary`, {}, token);
}

// ---------------------------------------------------------------------------
// AI Scanning
// ---------------------------------------------------------------------------

export interface ScanResult {
  stickerNumber: number | null;
  albumCode: string | null;
  playerName: string | null;
  teamFifaCode: string | null;
  borderColor: string | null;
  confidence: number;
  reasoning: string;
}

export interface BatchScanEntry {
  index: number;
  result?: ScanResult;
  error?: string;
}

export async function scanIdentify(file: File, token: string): Promise<ScanResult> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE_URL}/api/v1/scan/identify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<ScanResult>;
}

export async function scanBatch(files: File[], token: string): Promise<BatchScanEntry[]> {
  const form = new FormData();
  for (const file of files) {
    form.append('files', file);
  }
  const res = await fetch(`${BASE_URL}/api/v1/scan/batch`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${text}`);
  }
  const data = await res.json() as { results: BatchScanEntry[] };
  return data.results;
}
