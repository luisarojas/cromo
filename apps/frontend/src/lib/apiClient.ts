// Shared HTTP client used by every endpoint helper in lib/api.ts.
// Lives in its own file so the per-domain api modules can import it without
// pulling in the whole public surface, and so api.ts can shrink to a barrel
// of domain endpoints rather than mixing infrastructure with surface area.

import { useAuthStore, type AuthUser } from '@/store/auth';

export const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// ---------------------------------------------------------------------------
// retryFetch
// Read-only requests (GET, HEAD) retry on transient failures: network errors,
// 502/503/504. Writes (POST/PUT/PATCH/DELETE) are NEVER retried automatically
// — they need idempotency keys to be safe, and the caller knows whether to
// retry. 5xx on a non-GET means the caller decides.
// ---------------------------------------------------------------------------
const TRANSIENT_STATUSES = new Set([502, 503, 504]);
const RETRYABLE_METHODS = new Set(['GET', 'HEAD', undefined]);
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 200;

export async function retryFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const retryable = RETRYABLE_METHODS.has(method);
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(input, init);
      if (retryable && TRANSIENT_STATUSES.has(res.status) && attempt < MAX_ATTEMPTS) {
        await res.text().catch(() => undefined);
      } else {
        return res;
      }
    } catch (err) {
      lastError = err;
      if (!retryable || attempt >= MAX_ATTEMPTS) throw err;
    }
    const jitter = Math.random() * BASE_DELAY_MS;
    await new Promise((r) => setTimeout(r, BASE_DELAY_MS * 2 ** (attempt - 1) + jitter));
  }
  throw lastError ?? new Error('retryFetch: exhausted attempts');
}

function buildHeaders(token?: string, hasBody = false): HeadersInit {
  const headers: Record<string, string> = {};
  if (hasBody) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

const DEFAULT_TIMEOUT_MS = 30_000;

// In-flight GET dedup: if two components hit the same path with the same token
// concurrently, share a single fetch. Cleared as soon as the promise settles
// — this is *not* a persistent cache, just a way to collapse stampedes during
// initial render. Mutations bypass this entirely.
const inFlightGets = new Map<string, Promise<unknown>>();

// Silent token refresh on 401. The access token is short-lived; the refresh
// token lives in an HTTP-only cookie. When apiFetch sees a 401, it calls
// /auth/refresh once and retries the original request with the new access
// token. Concurrent 401s share one refresh promise so we don't stampede the
// refresh endpoint when the page wakes from sleep and fires N requests.
let inFlightRefresh: Promise<string | null> | null = null;

function isAuthEndpoint(path: string): boolean {
  return path.startsWith('/api/v1/auth/');
}

async function performRefresh(): Promise<string | null> {
  if (inFlightRefresh) return inFlightRefresh;
  inFlightRefresh = (async () => {
    try {
      const res = await retryFetch(`${BASE_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        authenticated: boolean;
        accessToken?: string;
        user?: AuthUser;
      };
      if (!data.authenticated || !data.accessToken || !data.user) return null;
      useAuthStore.getState().setAuth(data.accessToken, data.user);
      return data.accessToken;
    } catch {
      return null;
    } finally {
      inFlightRefresh = null;
    }
  })();
  return inFlightRefresh;
}

function redirectToLogin(): void {
  if (typeof window === 'undefined') return;
  const current = window.location.pathname + window.location.search;
  if (window.location.pathname.startsWith('/login')) return;
  const next = encodeURIComponent(current);
  window.location.href = `/login?next=${next}&reason=session-expired`;
}

export async function apiFetch<T>(
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

  const signal = options.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS);

  const sendOnce = async (bearer: string | undefined): Promise<Response> => {
    try {
      return await retryFetch(`${BASE_URL}${path}`, {
        ...options,
        signal,
        headers: {
          ...buildHeaders(bearer, hasBody),
          ...(options.headers ?? {}),
        },
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        throw new Error(`API timeout after ${DEFAULT_TIMEOUT_MS}ms: ${path}`);
      }
      throw err;
    }
  };

  const run = (async (): Promise<T> => {
    let res = await sendOnce(token);

    // Silent refresh on 401 — only for authenticated, non-auth requests.
    // If refresh fails, clear the store and bounce to /login so the caller
    // never sees the expired-token error as a UI error.
    if (res.status === 401 && token && !isAuthEndpoint(path)) {
      const fresh = await performRefresh();
      if (fresh) {
        res = await sendOnce(fresh);
      } else {
        useAuthStore.getState().clearAuth();
        redirectToLogin();
        throw new Error('Session expired');
      }
    }

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`API error ${res.status}: ${text}`);
    }

    if (res.status === 204) return undefined as unknown as T;
    return res.json() as Promise<T>;
  })();

  if (key) {
    inFlightGets.set(key, run);
    run.finally(() => inFlightGets.delete(key)).catch(() => {});
  }
  return run;
}

export function toQueryString(
  params: Record<string, string | number | boolean | undefined>,
): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== '') {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(val))}`);
    }
  }
  return parts.length ? `?${parts.join('&')}` : '';
}
