import { apiFetch, toQueryString } from '../apiClient';
import type {
  PagedResult,
  CollectionItem,
  CollectionStats,
  FilterOptions,
  MissingItem,
  DuplicateItem,
} from './types';

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
