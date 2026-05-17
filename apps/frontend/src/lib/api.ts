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

// Canonical wire types. Older code in this file used inline interface
// definitions; new code should import from @stickfolio/shared so backend
// and frontend stay in sync.
import type {
  AuthUser as SharedAuthUser,
  UserAlbumDto,
  AlbumStatsDto,
  AlbumSummaryDto,
  CollectionStatsDto,
  FilterOptionsDto,
  PagedResult as SharedPagedResult,
  UserAlbumWithStats as SharedUserAlbumWithStats,
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

export interface Sticker {
  id: string;
  number: number;
  albumCode: string;
  playerName: string | null;
  position: string | null;
  stickerType: string;
  isFoil: boolean;
  teamName: string | null;
  fifaCode: string | null;
  groupName: string | null;
  baseVariantId: string | null;
  teamPages: Record<string, [number, number]> | null;
  stickerPages: Record<string, { pageStart: number | null; pageEnd: number | null; description: string | null }> | null;
}

export interface CollectionItem extends Sticker {
  userStickerId: string;
  stickerVariantId: string;
  variantType: string;
  quantity: number;
  tradeHidden: boolean;
  tradeForced: boolean;
}

// MissingItem is now sticker-shaped (a sticker the user owns zero variants of).
// baseVariantId is included for the default "+ Add" action.
export type MissingItem = Sticker;

export interface StickerVariant {
  id: string;
  stickerId: string;
  variantType: string;
  rarity_rank: number;
  availability: string;
}

export interface DuplicateItem {
  userStickerId: string;
  stickerVariantId: string;
  variantType: string;
  quantity: number;
  number: number;
  albumCode: string;
  playerName: string | null;
  stickerType: string;
  isFoil: boolean;
  teamName: string | null;
  fifaCode: string | null;
  groupName: string | null;
}

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

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const hasBody = options.body !== undefined;

  // If the caller already passed a signal, respect it; otherwise apply a default timeout.
  const signal = options.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS);

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
// Sticker catalog — with localStorage cache (24h TTL, version-keyed)
// ---------------------------------------------------------------------------

const STICKER_CACHE_KEY = 'stickfolio:sticker_catalog:v11';
const STICKER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function fetchAllStickersCached(token?: string): Promise<Sticker[]> {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STICKER_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { data: Sticker[]; fetchedAt: number };
        if (Date.now() - parsed.fetchedAt < STICKER_CACHE_TTL_MS) return parsed.data;
      }
    } catch {}
  }

  const all: Sticker[] = [];
  let cursor: number | undefined = undefined;
  for (let i = 0; i < 50; i++) {
    const result = await fetchStickers({ cursor, limit: 200 }, token);
    all.push(...result.items);
    if (!result.nextCursor || result.items.length === 0) break;
    cursor = result.nextCursor;
    if (all.length >= 1200) break;
  }

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STICKER_CACHE_KEY, JSON.stringify({ data: all, fetchedAt: Date.now() }));
    } catch {}
  }

  return all;
}

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

export interface StickerLookup {
  albumCode: string;
  playerName: string | null;
  teamName: string | null;
  variants: StickerVariant[];
}

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

export async function fetchUserAlbums(
  userId: string,
  token: string,
): Promise<UserAlbum[]> {
  const { items } = await apiFetch<{ items: UserAlbum[] }>(
    `/api/v1/users/${userId}/albums`,
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

export type AlbumSummary = AlbumSummaryDto;

export async function fetchAlbumSummaries(
  userId: string,
  token: string,
): Promise<AlbumSummary[]> {
  const { items } = await apiFetch<{ items: AlbumSummary[] }>(
    `/api/v1/users/${userId}/albums/summary`,
    {},
    token,
  );
  return items;
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

export interface City {
  label: string;
  placeId: number;
}

export interface UserPreferences {
  duplicatesCountAllVariants: boolean;
  cities: City[];
}

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

export interface TradeMatch {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  mutualOverlap: number;
  theyHave: string[];             // album codes they have that you need
  theyHaveVariantIds: string[]; // all variant IDs they have as dupes for those stickers
  youHave: string[];              // album codes you have that they need
  cities: City[];                 // cities the matched user has set
}

export interface TradeItemDetail {
  id: string;
  stickerVariantId: string;
  variantType: string;
  direction: 'offer' | 'want';
  quantity: number;
  stickerNumber: number;
  albumCode: string;
  playerName: string | null;
  stickerType: string;
  teamName: string | null;
}

export interface TradeMessage {
  id: string;
  tradeId: string;
  senderId: string;
  senderUsername: string;
  senderDisplayName: string | null;
  body: string;
  sentAt: string;
}

export interface TradeSummary {
  id: string;
  requesterId: string;
  requesterUsername: string;
  recipientId: string;
  recipientUsername: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'completed' | 'expired';
  counterCount: number;
  offerCash: number;
  wantCash: number;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface TradeDetail extends TradeSummary {
  items: TradeItemDetail[];
  messages: TradeMessage[];
  acceptedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  expiresAt: string | null;
}

export interface ShareLink {
  id: string;
  userId: string;
  listType: 'missing' | 'duplicates' | 'full_collection';
  shareToken: string;
  expiresAt: string | null;
  createdAt: string;
  url: string;
}

export interface PublicListItem {
  stickerVariantId: string;
  number: number;
  albumCode: string;
  playerName: string | null;
  stickerType: string;
  teamName: string | null;
  variantType: string;
  quantity?: number;
}

export interface PublicList {
  owner: { username: string; displayName: string | null };
  listType: string;
  items: PublicListItem[];
  createdAt: string;
}

export interface PublicInventoryItem {
  stickerVariantId: string;
  number: number;
  albumCode: string;
  playerName: string | null;
  stickerType: string;
  teamName: string | null;
  variantType: string;
  quantity: number | null;
}

export interface PublicProfileAlbum {
  albumId: string;
  albumTypeName: string;
  editionName: string;
  formatName: string;
  alias: string | null;
  isDefault: boolean;
  offered: PublicInventoryItem[];
  wantedCount: number;
}

export interface PublicProfile {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  memberSince: string;
  tradingInventory: PublicProfileAlbum[];
}

export interface PublicWantedPage {
  items: PublicInventoryItem[];
  nextCursor: number | null;
  total: number;
}

// ---------------------------------------------------------------------------
// Trade API endpoints
// ---------------------------------------------------------------------------

export async function fetchTradeMatches(albumId: string, token: string): Promise<TradeMatch[]> {
  const qs = toQueryString({ albumId });
  const { items } = await apiFetch<{ items: TradeMatch[] }>(`/api/v1/trade/matches${qs}`, {}, token);
  return items;
}

export async function fetchTrades(
  params: { status?: string },
  token: string,
): Promise<TradeSummary[]> {
  const qs = toQueryString(params);
  const { items } = await apiFetch<{ items: TradeSummary[] }>(`/api/v1/trade/requests${qs}`, {}, token);
  return items;
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

export async function fetchPublicWanted(
  username: string,
  albumId: string,
  params: { cursor?: number; limit?: number } = {},
): Promise<PublicWantedPage> {
  const qs = toQueryString(params as Record<string, string | number | undefined>);
  return apiFetch<PublicWantedPage>(
    `/api/v1/profiles/${encodeURIComponent(username)}/albums/${albumId}/wanted${qs}`,
  );
}
