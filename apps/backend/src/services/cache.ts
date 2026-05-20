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
