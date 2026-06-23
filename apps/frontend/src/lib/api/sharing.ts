import { apiFetch } from '../apiClient';
import type {
  PublicList,
  PublicProfile,
  PublicWantedPage,
  ShareLink,
} from './types';

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

export async function fetchPublicProfile(
  username: string,
  // When set, the matching unlisted album joins the returned trading
  // inventory. Slug acts as a capability token — anyone with it can view.
  unlistedSlug?: string | null,
): Promise<PublicProfile> {
  const qs = unlistedSlug ? `?album=${encodeURIComponent(unlistedSlug)}` : '';
  return apiFetch<PublicProfile>(`/api/v1/profiles/${encodeURIComponent(username)}${qs}`);
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
