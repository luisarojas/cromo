export const DEFAULT_ALBUM_TYPE_KEY = 'fifa_world_cup_2026';

// Canonical literal unions + AlbumSettings live in @cromo/shared so the
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
} from '@cromo/shared';

// Canonical wire types. Every interface that describes a JSON response
// body lives in @cromo/shared and is re-exported here as the public
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
  BaseVariantPreference as SharedBaseVariantPreference,
  ProfileVisibility as SharedProfileVisibility,
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
  ExternalListItem as SharedExternalListItem,
  ExternalStickerRef as SharedExternalStickerRef,
  MatchAgainstMeResult as SharedMatchAgainstMeResult,
  MatchPairResult as SharedMatchPairResult,
  ScanListResult as SharedScanListResult,
  LiveTradeSession as SharedLiveTradeSession,
  LiveTradeStickerRef as SharedLiveTradeStickerRef,
  LiveTradeHistorySummary as SharedLiveTradeHistorySummary,
  TradeHistoryItem as SharedTradeHistoryItem,
  CreateLiveTradeResponse as SharedCreateLiveTradeResponse,
  JoinLiveTradeResponse as SharedJoinLiveTradeResponse,
} from '@cromo/shared';

// Infrastructure (apiFetch / retryFetch / toQueryString / BASE_URL) lives in
// apiClient.ts so this module can focus on endpoint surface area.
import { apiFetch, retryFetch, toQueryString, BASE_URL } from './apiClient';
export { retryFetch };

// ---------------------------------------------------------------------------
// Auth API
// ---------------------------------------------------------------------------

export type AuthUser = SharedAuthUser;

export async function loginApi(
  email: string,
  password: string,
): Promise<{ accessToken: string; user: AuthUser }> {
  const res = await retryFetch(`${BASE_URL}/api/v1/auth/login`, {
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
  const res = await retryFetch(`${BASE_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) return null;
  const data = await res.json() as { authenticated: boolean; accessToken?: string; user?: AuthUser };
  if (!data.authenticated) return null;
  return { accessToken: data.accessToken!, user: data.user! };
}

export async function logoutApi(): Promise<void> {
  await retryFetch(`${BASE_URL}/api/v1/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}

export async function registerApi(body: {
  email: string;
  username?: string;
  password: string;
  displayName?: string;
}): Promise<{ message: string; userId: string }> {
  const res = await retryFetch(`${BASE_URL}/api/v1/auth/register`, {
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

export async function verifyEmailApi(email: string, code: string): Promise<void> {
  const res = await retryFetch(`${BASE_URL}/api/v1/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
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
  await retryFetch(`${BASE_URL}/api/v1/auth/resend-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export async function forgotPasswordApi(email: string): Promise<void> {
  await retryFetch(`${BASE_URL}/api/v1/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export async function resetPasswordApi(email: string, code: string, password: string): Promise<void> {
  const res = await retryFetch(`${BASE_URL}/api/v1/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code, password }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    const err = new Error(data.message ?? 'Password reset failed') as Error & {
      statusCode?: number;
    };
    err.statusCode = res.status;
    throw err;
  }
}

export async function updateUsernameApi(
  username: string,
  token: string,
): Promise<{ username: string }> {
  const res = await retryFetch(`${BASE_URL}/api/v1/users/me/username`, {
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
  const res = await retryFetch(`${BASE_URL}/api/v1/users/me/display-name`, {
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
  const res = await retryFetch(`${BASE_URL}/api/v1/users/me/email`, {
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
  const res = await retryFetch(`${BASE_URL}/api/v1/users/me/password`, {
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
  const res = await retryFetch(`${BASE_URL}/api/v1/users/me`, {
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

// Internal helpers moved to apiClient.ts.

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

export async function fetchAllStickers(token?: string, albumTypeKey?: string): Promise<Sticker[]> {
  const version = await fetchCatalogVersion(token);
  const cacheKey = albumTypeKey ? `${version}:${albumTypeKey}` : version;
  const existing = inFlightCatalog.get(cacheKey);
  if (existing) return existing;

  const promise = (async () => {
    const all: Sticker[] = [];
    let cursor: number | undefined = undefined;
    for (let i = 0; i < 50; i++) {
      const result = await fetchStickers({ cursor, limit: 200, v: version, albumType: albumTypeKey }, token);
      all.push(...result.items);
      if (!result.nextCursor || result.items.length === 0) break;
      cursor = result.nextCursor;
      if (all.length >= 1200) break;
    }
    return all;
  })();

  inFlightCatalog.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    // Keep the resolved promise around so re-entrant callers can await the same
    // value; clear only on failure so the next attempt can retry.
    promise.catch(() => inFlightCatalog.delete(cacheKey));
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
    albumType?: string;
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
  stickerId?: string,
): Promise<StickerVariant[]> {
  const qs = stickerId ? `?stickerId=${encodeURIComponent(stickerId)}` : '';
  const { items } = await apiFetch<{ items: StickerVariant[] }>(
    `/api/v1/stickers/${albumCode}/variants${qs}`,
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

// AlbumSettings is re-exported from @cromo/shared at the top of this file.
import type { AlbumSettings } from '@cromo/shared';

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

// ---------------------------------------------------------------------------
// User preferences endpoints
// ---------------------------------------------------------------------------

export type City = SharedCity;
export type UserPreferences = SharedUserPreferences;
export type BaseVariantPreference = SharedBaseVariantPreference;
export type ProfileVisibility = SharedProfileVisibility;

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

export async function fetchAdminFeatureFlags(
  token: string,
): Promise<{ flags: Record<string, boolean> }> {
  return apiFetch<{ flags: Record<string, boolean> }>('/api/v1/admin/feature-flags', {}, token);
}

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
  opts?: { cursor?: string; limit?: number; showAll?: boolean },
): Promise<TradeMatchesPage> {
  const qs = toQueryString({ albumId, ...(opts ?? {}) });
  return apiFetch<TradeMatchesPage>(`/api/v1/trade/matches${qs}`, {}, token);
}

// ─── External-list matching (third-party / anonymous flows) ────────────────
export type ExternalListItem = SharedExternalListItem;
export type ExternalStickerRef = SharedExternalStickerRef;
export type MatchAgainstMeResult = SharedMatchAgainstMeResult;
export type MatchPairResult = SharedMatchPairResult;
export type ScanListResult = SharedScanListResult;

export async function matchAgainstMe(
  body: { albumId: string; theirOffered: ExternalListItem[]; theirWanted: ExternalListItem[] },
  token: string,
): Promise<MatchAgainstMeResult> {
  return apiFetch<MatchAgainstMeResult>(
    '/api/v1/trade/match-against-me',
    { method: 'POST', body: JSON.stringify(body) },
    token,
  );
}

export async function matchPair(body: {
  albumTypeKey?: string;
  a: { offered: ExternalListItem[]; wanted: ExternalListItem[] };
  b: { offered: ExternalListItem[]; wanted: ExternalListItem[] };
}): Promise<MatchPairResult> {
  return apiFetch<MatchPairResult>(
    '/api/v1/trade/match-pair',
    { method: 'POST', body: JSON.stringify(body) },
  );
}

/** Public list of all album types, used by the anonymous trade-match flow. */
export interface AlbumTypeOption { key: string; name: string }

export async function fetchAlbumTypes(): Promise<AlbumTypeOption[]> {
  const res = await apiFetch<{ items: AlbumTypeOption[] }>('/api/v1/album-types');
  return res.items;
}

/** Extract album codes from one or more images of a written/printed list. */
export async function scanList(
  files: File[],
  opts?: { albumTypeKey?: string; token?: string },
): Promise<ScanListResult> {
  const form = new FormData();
  for (const f of files) form.append('images', f, f.name);
  const qs = toQueryString({ albumTypeKey: opts?.albumTypeKey });
  // apiFetch always sets Content-Type: application/json on bodies, which
  // breaks multipart uploads. Use retryFetch directly so the browser can set
  // the multipart boundary itself.
  const res = await retryFetch(`${BASE_URL}/api/v1/scan/list${qs}`, {
    method: 'POST',
    headers: opts?.token ? { Authorization: `Bearer ${opts.token}` } : {},
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<ScanListResult>;
}

export type LiveTradeHistorySummary = SharedLiveTradeHistorySummary;
export type TradeHistoryItem = SharedTradeHistoryItem;

export interface TradesPage {
  items: TradeHistoryItem[];
  nextCursor: string | null;
}

export function isLiveTradeRow(item: TradeHistoryItem): item is LiveTradeHistorySummary {
  return item.kind === 'live';
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

export interface UnlockedAchievementDto {
  key: string;
  unlockedAt: string;
}

export async function fetchPublicAchievements(username: string): Promise<UnlockedAchievementDto[]> {
  const { items } = await apiFetch<{ items: UnlockedAchievementDto[] }>(
    `/api/v1/profiles/${encodeURIComponent(username)}/achievements`,
  );
  return items;
}

export async function evaluateMyAchievements(token: string): Promise<UnlockedAchievementDto[]> {
  const { items } = await apiFetch<{ items: UnlockedAchievementDto[] }>(
    '/api/v1/users/me/achievements/evaluate',
    { method: 'POST' },
    token,
  );
  return items;
}

// ── Trade invites (QR redirect into propose-trade flow) ─────────────────────

export interface TradeInvite {
  id: string;
  token: string;
  expiresAt: string;
  url: string;
}

export async function createTradeInvite(token: string): Promise<TradeInvite> {
  const { invite } = await apiFetch<{ invite: TradeInvite }>(
    '/api/v1/trade/invites',
    { method: 'POST' },
    token,
  );
  return invite;
}

export interface RedeemedTradeInvite {
  hostUserId: string;
  hostUsername: string;
}

export async function redeemTradeInvite(
  inviteToken: string,
  token: string,
): Promise<RedeemedTradeInvite> {
  return apiFetch<RedeemedTradeInvite>(
    `/api/v1/trade/invites/${encodeURIComponent(inviteToken)}/redeem`,
    { method: 'POST' },
    token,
  );
}

// ── Live trade sessions (in-person host + anonymous guest) ───────────────────

export type LiveTradeSession = SharedLiveTradeSession;
export type LiveTradeStickerRef = SharedLiveTradeStickerRef;
export type CreateLiveTradeResponse = SharedCreateLiveTradeResponse;
export type JoinLiveTradeResponse = SharedJoinLiveTradeResponse;

/** Host creates a session bound to one of their albums. */
export async function createLiveTradeSession(
  albumId: string,
  token: string,
): Promise<LiveTradeSession> {
  const { session } = await apiFetch<CreateLiveTradeResponse>(
    '/api/v1/live-trade',
    { method: 'POST', body: JSON.stringify({ albumId }) },
    token,
  );
  return session;
}

/** Guest joins via 6-digit code (or session id). No auth — issues a guest token. */
export async function joinLiveTradeSession(
  code: string,
  label?: string | null,
): Promise<JoinLiveTradeResponse> {
  return apiFetch<JoinLiveTradeResponse>(
    '/api/v1/live-trade/join',
    { method: 'POST', body: JSON.stringify({ code, label: label ?? null }) },
  );
}

interface LiveTradeAuth {
  /** Host's Bearer access token. Provide if the caller is the host. */
  token?: string;
  /** Guest's opaque session token. Provide if the caller is the guest. */
  guestToken?: string;
}

function liveTradeAuthHeaders(auth: LiveTradeAuth): HeadersInit | undefined {
  if (auth.token) return undefined; // apiFetch will set Authorization
  if (auth.guestToken) return { 'X-Live-Trade-Token': auth.guestToken };
  return undefined;
}

export async function fetchLiveTradeSession(
  sessionId: string,
  auth: LiveTradeAuth,
): Promise<LiveTradeSession> {
  const { session } = await apiFetch<{ session: LiveTradeSession }>(
    `/api/v1/live-trade/${encodeURIComponent(sessionId)}`,
    { headers: liveTradeAuthHeaders(auth) },
    auth.token,
  );
  return session;
}

export async function setLiveTradeList(
  sessionId: string,
  list: { offered: ExternalListItem[]; wanted: ExternalListItem[] },
  auth: LiveTradeAuth,
): Promise<LiveTradeSession> {
  const { session } = await apiFetch<{ session: LiveTradeSession }>(
    `/api/v1/live-trade/${encodeURIComponent(sessionId)}/list`,
    { method: 'POST', body: JSON.stringify(list), headers: liveTradeAuthHeaders(auth) },
    auth.token,
  );
  return session;
}

export async function setLiveTradeStaged(
  sessionId: string,
  items: Array<{ stickerVariantId: string; quantity: number }>,
  auth: LiveTradeAuth,
): Promise<LiveTradeSession> {
  const { session } = await apiFetch<{ session: LiveTradeSession }>(
    `/api/v1/live-trade/${encodeURIComponent(sessionId)}/stage`,
    { method: 'POST', body: JSON.stringify({ items }), headers: liveTradeAuthHeaders(auth) },
    auth.token,
  );
  return session;
}

export async function setLiveTradeLock(
  sessionId: string,
  locked: boolean,
  auth: LiveTradeAuth,
): Promise<LiveTradeSession> {
  const { session } = await apiFetch<{ session: LiveTradeSession }>(
    `/api/v1/live-trade/${encodeURIComponent(sessionId)}/lock`,
    { method: 'POST', body: JSON.stringify({ locked }), headers: liveTradeAuthHeaders(auth) },
    auth.token,
  );
  return session;
}

export async function completeLiveTradeSession(
  sessionId: string,
  token: string,
): Promise<LiveTradeSession> {
  const { session } = await apiFetch<{ session: LiveTradeSession }>(
    `/api/v1/live-trade/${encodeURIComponent(sessionId)}/complete`,
    { method: 'POST' },
    token,
  );
  return session;
}

export async function undoLiveTradeSession(
  sessionId: string,
  token: string,
): Promise<LiveTradeSession> {
  const { session } = await apiFetch<{ session: LiveTradeSession }>(
    `/api/v1/live-trade/${encodeURIComponent(sessionId)}/undo`,
    { method: 'POST' },
    token,
  );
  return session;
}

/** Mint a single-use ticket the EventSource will exchange for a stream. */
export async function mintLiveTradeStreamTicket(
  sessionId: string,
  auth: LiveTradeAuth,
): Promise<{ ticket: string; expiresIn: number }> {
  return apiFetch<{ ticket: string; expiresIn: number }>(
    `/api/v1/live-trade/${encodeURIComponent(sessionId)}/stream-ticket`,
    { method: 'POST', headers: liveTradeAuthHeaders(auth) },
    auth.token,
  );
}

/** Absolute URL for the SSE stream — EventSource needs a fully-qualified URL. */
export function liveTradeStreamUrl(sessionId: string, ticket: string): string {
  return `${BASE_URL}/api/v1/live-trade/${encodeURIComponent(sessionId)}/stream?ticket=${encodeURIComponent(ticket)}`;
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

export interface AdminReportPriorReport {
  id: string;
  category: string;
  status: string;
  reporterUsername: string;
  createdAt: string;
}

export interface AdminReportMessageRef {
  id: string;
  messageId: string;
  body: string;
  isSystem: boolean;
  sentAt: string;
  senderId: string | null;
  senderUsername: string | null;
}

export interface AdminReportAttachment {
  id: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  uploadedAt: string;
  url: string;
}

export interface AdminReportBanHistoryEntry {
  id: string;
  banType: string;
  reason: string;
  expiresAt: string | null;
  liftedAt: string | null;
  createdAt: string;
}

export interface AdminReportLinkedTrade {
  id: string;
  status: string;
  requesterUsername: string;
  recipientUsername: string;
  createdAt: string;
}

export interface AdminReportDetail extends AdminReport {
  resolutionNote: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  reporterDisplayName: string | null;
  reportedDisplayName: string | null;
  reportedUserTrustScore: TrustScore;
  reportedUserBanHistory: AdminReportBanHistoryEntry[];
  priorReports: AdminReportPriorReport[];
  linkedTrade: AdminReportLinkedTrade | null;
  messageRefs: AdminReportMessageRef[];
  attachments: AdminReportAttachment[];
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
  body: {
    category: string;
    description: string;
    tradeId?: string;
    messageIds?: string[];
    attachments?: File[];
  },
  token: string,
): Promise<{ id: string }> {
  const form = new FormData();
  form.append('category', body.category);
  form.append('description', body.description);
  if (body.tradeId) form.append('tradeId', body.tradeId);
  if (body.messageIds && body.messageIds.length > 0) {
    form.append('messageIds', JSON.stringify(body.messageIds));
  }
  for (const f of body.attachments ?? []) form.append('attachments', f);

  // Bypass apiFetch because FormData must NOT carry an explicit Content-Type
  // (the browser injects the multipart boundary). Direct fetch keeps the
  // boundary intact.
  const res = await fetch(`${BASE_URL}/api/v1/users/${userId}/reports`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function fetchAdminReports(
  params: { status?: string; category?: string; cursor?: string; limit?: number },
  token: string,
): Promise<AdminReportsPage> {
  const qs = toQueryString(params as Record<string, string | number | undefined>);
  return apiFetch<AdminReportsPage>(`/api/v1/admin/reports${qs}`, {}, token);
}

export async function fetchAdminReport(
  reportId: string,
  token: string,
): Promise<AdminReportDetail> {
  return apiFetch<AdminReportDetail>(`/api/v1/admin/reports/${reportId}`, {}, token);
}

export async function fetchAdminReportAttachmentBlob(
  url: string,
  token: string,
): Promise<Blob> {
  const res = await fetch(`${BASE_URL}${url}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Attachment fetch failed: ${res.status}`);
  return res.blob();
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
  variantToken: string | null;
  stickerType: string | null;
  confidence: number;
  reasoning: string;
}

export interface BatchScanEntry {
  index: number;
  results?: ScanResult[];
  error?: string;
}

export async function scanIdentify(file: File, token: string, albumTypeKey?: string): Promise<ScanResult[]> {
  const form = new FormData();
  form.append('file', file);
  const qs = albumTypeKey ? `?albumTypeKey=${encodeURIComponent(albumTypeKey)}` : '';
  const res = await retryFetch(`${BASE_URL}/api/v1/scan/identify${qs}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<ScanResult[]>;
}

export async function scanBatchStream(
  files: File[],
  token: string,
  onEvent: (entry: BatchScanEntry) => Promise<void> | void,
  albumTypeKey?: string,
): Promise<void> {
  const form = new FormData();
  for (const file of files) {
    form.append('files', file);
  }
  const qs = albumTypeKey ? `?albumTypeKey=${encodeURIComponent(albumTypeKey)}` : '';
  const res = await retryFetch(`${BASE_URL}/api/v1/scan/batch${qs}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${text}`);
  }
  if (!res.body) throw new Error('No response body from batch scan');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let pendingEvent = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          pendingEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ') && pendingEvent === 'result') {
          try {
            const entry = JSON.parse(line.slice(6)) as BatchScanEntry;
            await onEvent(entry);
          } catch { /* ignore malformed event */ }
          pendingEvent = '';
        } else if (line === '') {
          pendingEvent = '';
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
