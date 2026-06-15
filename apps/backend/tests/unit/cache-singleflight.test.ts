import { describe, it, expect, vi } from 'vitest';
import type { Redis } from 'ioredis';
import { singleflight } from '../../src/services/cache.js';

// Build an in-memory Redis stub that emulates the subset singleflight needs:
// get, set (incl. NX + PX), del. Lock acquisition follows SET … NX semantics.
function makeRedis(initial: Record<string, string> = {}) {
  const store = { ...initial };
  const set = vi.fn(async (key: string, value: string, ..._args: unknown[]) => {
    const argv = _args as (string | number)[];
    const nx = argv.includes('NX');
    if (nx && key in store) return null; // SET NX fails if exists
    store[key] = value;
    return 'OK';
  });
  const get = vi.fn(async (key: string) => (key in store ? store[key]! : null));
  const del = vi.fn(async (key: string) => {
    if (key in store) { delete store[key]; return 1; }
    return 0;
  });
  return {
    redis: { set, get, del } as unknown as Redis,
    store,
    set, get, del,
  };
}

describe('singleflight — cache hit (fast path)', () => {
  it('returns the cached value without calling compute or acquiring a lock', async () => {
    const { redis, set } = makeRedis({ key: JSON.stringify({ v: 42 }) });
    const compute = vi.fn();
    const out = await singleflight(redis, 'key', 60, compute);
    expect(out).toEqual({ v: 42 });
    expect(compute).not.toHaveBeenCalled();
    // No SET … NX lock attempt either.
    expect(set).not.toHaveBeenCalled();
  });

  it('falls through to compute when the cached JSON is corrupt', async () => {
    const { redis } = makeRedis({ key: '{not json' });
    const compute = vi.fn().mockResolvedValue({ v: 'fresh' });
    const out = await singleflight(redis, 'key', 60, compute);
    expect(out).toEqual({ v: 'fresh' });
    expect(compute).toHaveBeenCalledTimes(1);
  });
});

describe('singleflight — leader path', () => {
  it('acquires the lock, computes the value, populates the cache, then releases the lock', async () => {
    const { redis, store, set, del } = makeRedis();
    const compute = vi.fn().mockResolvedValue({ v: 'computed' });
    const out = await singleflight(redis, 'mykey', 30, compute);
    expect(out).toEqual({ v: 'computed' });
    expect(compute).toHaveBeenCalledTimes(1);

    // The cache key was populated with the JSON-stringified result.
    expect(store['mykey']).toBe(JSON.stringify({ v: 'computed' }));
    // The lock key was released (deleted).
    expect(store['mykey:lock']).toBeUndefined();
    expect(del).toHaveBeenCalledWith('mykey:lock');

    // The leader took the lock with SET key val PX <ms> NX (the args differ
    // slightly across ioredis variants; the key thing is NX appears).
    const setCall = set.mock.calls.find((c) => c[0] === 'mykey:lock');
    expect(setCall).toBeDefined();
    expect(setCall!.slice(2)).toContain('NX');
  });

  it('still returns the computed value when the leader\'s SET throws (Redis down)', async () => {
    const { redis } = makeRedis();
    // Replace `set` with one that throws to simulate connection failure.
    (redis as unknown as { set: () => Promise<string> }).set = vi.fn(async () => {
      throw new Error('redis down');
    });
    const compute = vi.fn().mockResolvedValue({ v: 'still works' });
    const out = await singleflight(redis, 'k', 30, compute);
    expect(out).toEqual({ v: 'still works' });
    expect(compute).toHaveBeenCalledTimes(1);
  });
});

describe('singleflight — waiter path', () => {
  it('a second caller sees the cache populated by the leader and skips its own compute', async () => {
    const { redis, store } = makeRedis();

    // Leader compute resolves after a short delay; during that window, a
    // second call enters the waiter path because the lock is taken.
    let leaderResolve!: (v: { v: number }) => void;
    const leaderCompute = vi.fn(
      () => new Promise<{ v: number }>((resolve) => { leaderResolve = resolve; }),
    );
    const waiterCompute = vi.fn();

    const leader = singleflight(redis, 'k', 30, leaderCompute);
    // Give the leader a microtask to take the lock.
    await new Promise((r) => setTimeout(r, 5));
    expect(store['k:lock']).toBeDefined();

    const waiter = singleflight(redis, 'k', 30, waiterCompute);
    // Resolve the leader; the waiter should poll and see the cached value.
    leaderResolve({ v: 7 });
    const [leaderResult, waiterResult] = await Promise.all([leader, waiter]);
    expect(leaderResult).toEqual({ v: 7 });
    expect(waiterResult).toEqual({ v: 7 });
    expect(leaderCompute).toHaveBeenCalledTimes(1);
    // Waiter saw the cached entry; never had to compute.
    expect(waiterCompute).not.toHaveBeenCalled();
  });
});
