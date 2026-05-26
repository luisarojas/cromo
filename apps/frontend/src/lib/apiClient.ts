// Shared HTTP client used by every endpoint helper in lib/api.ts.
// Lives in its own file so the per-domain api modules can import it without
// pulling in the whole public surface, and so api.ts can shrink to a barrel
// of domain endpoints rather than mixing infrastructure with surface area.

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

  const run = (async (): Promise<T> => {
    let res: Response;
    try {
      res = await retryFetch(`${BASE_URL}${path}`, {
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
