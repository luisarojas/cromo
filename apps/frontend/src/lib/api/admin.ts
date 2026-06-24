import { apiFetch, toQueryString } from '../apiClient';
import type { Sticker } from './types';

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

/**
 * `seedPush` describes where the seed-file rewrite landed:
 * - `github` — a PR was opened; `pullRequestUrl` is the URL to merge.
 * - `local` — dev fallback wrote `localPath` directly; commit it manually.
 * - `skipped` — nothing to ship (notes-only edit, NODE_ENV=test, or the
 *   seed-write/PR step failed — `error` carries the message in that last case).
 */
export type SeedPushOutcome =
  | { mode: 'github'; pullRequestUrl: string; branch: string }
  | { mode: 'local'; localPath: string }
  | { mode: 'skipped'; reason?: string; error?: string };

export type PatchAdminStickerResponse = Sticker & {
  seedPush: SeedPushOutcome;
};

export async function patchAdminSticker(
  id: string,
  body: {
    playerName?: string;
    position?: string;
    notes?: string;
  },
  token?: string,
): Promise<PatchAdminStickerResponse> {
  return apiFetch<PatchAdminStickerResponse>(
    `/api/v1/admin/stickers/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
    token,
  );
}
