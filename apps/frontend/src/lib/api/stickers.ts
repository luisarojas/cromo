import { apiFetch, toQueryString } from '../apiClient';
import type { PagedResult, Sticker, StickerVariant, StickerLookup } from './types';

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
