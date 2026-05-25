import type { Redis } from 'ioredis';
import crypto from 'node:crypto';

export function hashFilters(filters: object): string {
  return crypto.createHash('md5').update(JSON.stringify(filters)).digest('hex');
}

/**
 * safeCacheGet — wrap a Redis read so a slow or unavailable cache server
 * never fails the originating request. Callers should treat a `null` result
 * as a cache miss and fall through to the database.
 */
export async function safeCacheGet(redis: Redis, key: string): Promise<string | null> {
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
}

/**
 * safeCacheSet — fire-and-forget Redis write. A timeout or connection failure
 * is swallowed so the request still completes; the only downside is the next
 * read will miss.
 */
export async function safeCacheSet(
  redis: Redis,
  key: string,
  value: string,
  ttlSeconds: number,
): Promise<void> {
  try {
    await redis.set(key, value, 'EX', ttlSeconds);
  } catch {
    /* cache write failures are non-fatal */
  }
}

// ─── Versioned per-user cache keys ────────────────────────────────────────────
// Every user has a monotonically increasing `cache_version` integer. All user
// cache keys embed that version, so invalidation is a single INCR — old keys
// simply become unreachable and expire on their own TTL. This replaces the
// previous SCAN-and-DELETE-across-8-patterns approach, which was O(keys) and
// blocked Redis on large accounts.

function versionKey(userId: string): string {
  return `user:${userId}:cv`;
}

async function readUserVersion(redis: Redis, userId: string): Promise<number> {
  // Failures here must not error the request — fall through with version 1
  // and let the caller skip the cache entirely.
  try {
    const raw = await redis.get(versionKey(userId));
    if (raw) return Number.parseInt(raw, 10) || 1;
    // Seed with 1 on first read. SET NX so concurrent reads agree on a value.
    await redis.set(versionKey(userId), '1', 'NX');
    return 1;
  } catch {
    return 1;
  }
}

/**
 * userCacheKey — produce a versioned key for a per-user cache entry. The
 * `suffix` is appended after the version (e.g. `collection:<albumId>:<hash>`).
 * Use this for every `redis.get`/`redis.set` whose validity is tied to a
 * user's mutations.
 */
export async function userCacheKey(
  redis: Redis,
  userId: string,
  suffix: string,
): Promise<string> {
  const ver = await readUserVersion(redis, userId);
  return `user:${userId}:v${ver}:${suffix}`;
}

/**
 * invalidateUserCaches — bumps the user's cache version. Every key built via
 * `userCacheKey` is immediately unreachable; entries expire on their own TTL.
 * O(1) regardless of how many cached responses the user has.
 */
export async function invalidateUserCaches(redis: Redis, userId: string): Promise<void> {
  try {
    await redis.incr(versionKey(userId));
  } catch {
    // If Redis is unreachable we cannot bump the version, but the request
    // succeeding is more important than this guarantee — entries will fall
    // out via TTL.
  }
}

// ─── Singleflight: stampede protection on hot cache keys ─────────────────────
//
// Problem: when a cached value expires under load, N concurrent requests all
// miss the cache, all hit the expensive backing query at once, and all rewrite
// the entry. Stampede = thundering herd against the DB.
//
// Fix: the first miss takes a short-lived Redis lock and computes the value;
// concurrent misses see the lock, busy-wait (with bounded retries) for the
// computed result, then read the freshly populated cache entry. If the lock
// holder dies before completing, the lock TTL releases the queue.
//
// This is intentionally NOT a distributed mutex — it is a best-effort hint.
// It is correct under contention and degrades to the original behaviour
// (everyone recomputes) when Redis is unreachable.

const LOCK_TTL_MS = 5_000;
const LOCK_POLL_MS = 50;
const LOCK_MAX_WAIT_MS = 4_000;

export async function singleflight<T>(
  redis: Redis,
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
): Promise<T> {
  // Fast path: cache hit.
  const cached = await safeCacheGet(redis, key);
  if (cached !== null) {
    try { return JSON.parse(cached) as T; } catch { /* fall through and recompute */ }
  }

  const lockKey = `${key}:lock`;
  const lockId = crypto.randomUUID();
  let acquired = false;
  try {
    acquired = (await redis.set(lockKey, lockId, 'PX', LOCK_TTL_MS, 'NX')) === 'OK';
  } catch {
    // Redis unreachable: compute directly, no caching.
    return compute();
  }

  if (acquired) {
    try {
      const value = await compute();
      await safeCacheSet(redis, key, JSON.stringify(value), ttlSeconds);
      return value;
    } finally {
      // Best-effort release; only delete if we still own the lock.
      try {
        const held = await redis.get(lockKey);
        if (held === lockId) await redis.del(lockKey);
      } catch { /* ignore */ }
    }
  }

  // Waiter path: poll the cache key briefly, give up and compute on timeout.
  const deadline = Date.now() + LOCK_MAX_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, LOCK_POLL_MS));
    const settled = await safeCacheGet(redis, key);
    if (settled !== null) {
      try { return JSON.parse(settled) as T; } catch { break; }
    }
  }
  // The lock holder may have crashed or computed something un-parseable.
  // Fall back to recomputing — we accept one extra DB hit over an infinite hang.
  return compute();
}
