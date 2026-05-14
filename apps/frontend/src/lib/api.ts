import type { AlbumEdition } from './albumPages';

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Auth API
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  role: string;
  emailVerifiedAt: string | null;
}

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
  return res.json() as Promise<{ accessToken: string; user: AuthUser }>;
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

export interface Sticker {
  id: string;
  number: number;
  album_code: string;
  player_name: string | null;
  position: string | null;
  sticker_type: string;
  is_foil: boolean;
  team_name: string | null;
  fifa_code: string | null;
  group_name: string | null;
  base_variant_id: string | null;
  team_pages: Partial<Record<AlbumEdition, [number, number]>> | null;
}

export interface CollectionItem extends Sticker {
  user_sticker_id: string;
  sticker_variant_id: string;
  variant_type: string;
  quantity: number;
}

// MissingItem is now sticker-shaped (a sticker the user owns zero variants of).
// base_variant_id is included for the default "+ Add" action.
export type MissingItem = Sticker;

export interface StickerVariant {
  id: string;
  sticker_id: string;
  variant_type: string;
  rarity_rank: number;
  availability: string;
}

export interface DuplicateItem {
  user_sticker_id: string;
  sticker_variant_id: string;
  variant_type: string;
  quantity: number;
  number: number;
  album_code: string;
  player_name: string | null;
  sticker_type: string;
  is_foil: boolean;
  team_name: string | null;
  fifa_code: string | null;
  group_name: string | null;
}

export interface CollectionStats {
  total: number;
  owned: number;
  missing: number;
  duplicates: number;
  percentage: number;
}

export interface PagedResult<T> {
  items: T[];
  nextCursor: number | null;
  total: number;
}

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

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const hasBody = options.body !== undefined;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...buildHeaders(token, hasBody),
      ...(options.headers ?? {}),
    },
  });

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

const STICKER_CACHE_KEY = 'stickfolio:sticker_catalog:v2';
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
// Album endpoints
// ---------------------------------------------------------------------------

export interface UserAlbum {
  id: string;
  user_id: string;
  album_type_id: string;
  album_type_key: string;
  album_edition_id: string;
  edition: string;
  alias: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export const ALBUM_TYPE_LABELS: Record<string, string> = {
  fifa_world_cup_2026: 'FIFA World Cup 2026™ Official Sticker Collection',
};

export function albumDisplayName(album: UserAlbum): string {
  return album.alias ?? ALBUM_TYPE_LABELS[album.album_type_key] ?? album.album_type_key;
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
  body: { alias?: string | null; edition?: string },
  token: string,
): Promise<UserAlbum> {
  return apiFetch<UserAlbum>(
    `/api/v1/users/${userId}/albums`,
    { method: 'POST', body: JSON.stringify(body) },
    token,
  );
}

export async function updateUserAlbum(
  userId: string,
  albumId: string,
  patch: { alias?: string | null; edition?: string },
  token: string,
): Promise<UserAlbum> {
  return apiFetch<UserAlbum>(
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

export interface AlbumSummary {
  album_id: string;
  owned_album_codes: string[];
  duplicate_album_codes: string[];
}

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

// ---------------------------------------------------------------------------
// User preferences endpoints
// ---------------------------------------------------------------------------

export interface UserPreferences {
  duplicatesCountAllVariants: boolean;
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
  created_at: string;
  deleted_at: string | null;
  is_banned: boolean;
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
