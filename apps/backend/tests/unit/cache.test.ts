import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Redis } from 'ioredis';
import {
  hashFilters,
  safeCacheGet,
  safeCacheSet,
  userCacheKey,
  invalidateUserCaches,
} from '../../src/services/cache.js';

// Minimal Redis surface used by cache.ts: get/set/incr. Each test gets a fresh
// in-memory mock so state doesn't leak between cases.
function makeRedis(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial };
  return {
    get: vi.fn(async (k: string) => store[k] ?? null),
    set: vi.fn(async (k: string, v: string, _mode?: string, _ttl?: number) => {
      // Mimic ioredis's SET with NX option: arg 3 is 'NX' when used as a flag.
      // Our tests only need: SET key value EX <ttl> OR SET key value NX.
      // We treat both the same — overwrite the store entry.
      store[k] = v;
      return 'OK';
    }),
    incr: vi.fn(async (k: string) => {
      const next = (Number.parseInt(store[k] ?? '0', 10) || 0) + 1;
      store[k] = String(next);
      return next;
    }),
    _store: store,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('hashFilters', () => {
  it('produces a stable 32-char md5 digest for a given input', () => {
    const h = hashFilters({ a: 1, b: ['x', 'y'] });
    expect(h).toMatch(/^[a-f0-9]{32}$/);
    expect(hashFilters({ a: 1, b: ['x', 'y'] })).toBe(h);
  });

  it('produces different hashes for structurally different inputs', () => {
    expect(hashFilters({ a: 1 })).not.toBe(hashFilters({ a: 2 }));
  });
});

describe('safeCacheGet', () => {
  it('returns the cached value on success', async () => {
    const redis = makeRedis({ k: 'v' });
    expect(await safeCacheGet(redis as unknown as Redis, 'k')).toBe('v');
  });

  it('swallows Redis errors and returns null (cache miss)', async () => {
    const redis = makeRedis();
    redis.get = vi.fn(async () => { throw new Error('redis down'); });
    expect(await safeCacheGet(redis as unknown as Redis, 'k')).toBeNull();
  });
});

describe('safeCacheSet', () => {
  it('writes the value with the requested TTL', async () => {
    const redis = makeRedis();
    await safeCacheSet(redis as unknown as Redis, 'k', 'v', 60);
    expect(redis.set).toHaveBeenCalledWith('k', 'v', 'EX', 60);
  });

  it('swallows Redis errors silently', async () => {
    const redis = makeRedis();
    redis.set = vi.fn(async () => { throw new Error('redis down'); });
    // Must not throw.
    await expect(safeCacheSet(redis as unknown as Redis, 'k', 'v', 30)).resolves.toBeUndefined();
  });
});

describe('userCacheKey', () => {
  it('embeds the user version and the suffix in the key', async () => {
    const redis = makeRedis({ 'user:u1:cv': '7' });
    const key = await userCacheKey(redis as unknown as Redis, 'u1', 'collection:al');
    expect(key).toBe('user:u1:v7:collection:al');
  });

  it('seeds the version at 1 when the user has no cached version yet', async () => {
    const redis = makeRedis();
    const key = await userCacheKey(redis as unknown as Redis, 'u2', 'x');
    expect(key).toBe('user:u2:v1:x');
    // The seed write should have happened.
    expect(redis.set).toHaveBeenCalledWith('user:u2:cv', '1', 'NX');
  });

  it('falls back to version 1 when Redis is unavailable', async () => {
    const redis = makeRedis();
    redis.get = vi.fn(async () => { throw new Error('down'); });
    const key = await userCacheKey(redis as unknown as Redis, 'u3', 'x');
    expect(key).toBe('user:u3:v1:x');
  });
});

describe('invalidateUserCaches', () => {
  it('bumps the user version so every previously-keyed entry is unreachable', async () => {
    const redis = makeRedis({ 'user:u1:cv': '3' });
    const before = await userCacheKey(redis as unknown as Redis, 'u1', 'col');
    await invalidateUserCaches(redis as unknown as Redis, 'u1');
    const after = await userCacheKey(redis as unknown as Redis, 'u1', 'col');
    expect(after).not.toBe(before);
    expect(after).toBe('user:u1:v4:col');
  });
});
