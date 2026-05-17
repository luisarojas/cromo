import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import type { Redis } from 'ioredis';

import {
  getStats,
  addSticker,
  removeSticker,
  updateSticker,
  setTradeFlags,
} from '../../src/services/collection.service.js';

// ─── Minimal mocks ─────────────────────────────────────────────────────────────
//
// Mutating service functions now run inside `withTx` (db.connect + BEGIN/COMMIT
// + release), so the mock pool needs a fake `connect()` that returns a client
// with its own query function. Test assertions inspect `clientQuery.mock.calls`
// for SQL going through the transactional path, and `mockDb.query.mock.calls`
// for direct reads.

const clientQuery = vi.fn();
const clientRelease = vi.fn();
const fakeClient = {
  query: clientQuery,
  release: clientRelease,
} as unknown as PoolClient;

const mockDb = {
  query: vi.fn(),
  connect: vi.fn().mockImplementation(async () => fakeClient),
} as unknown as Pool;

const mockRedis = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
  setex: vi.fn().mockResolvedValue('OK'),
  scan: vi.fn().mockResolvedValue(['0', []]),
  del: vi.fn().mockResolvedValue(0),
} as unknown as Redis;

// ─── Helpers ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  (mockRedis.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  (mockRedis.scan as ReturnType<typeof vi.fn>).mockResolvedValue(['0', []]);
  // Default: every clientQuery call returns rowCount: 1 / empty rows. Tests
  // override the mutation-specific call when they need a particular row set.
  clientQuery.mockResolvedValue({ rows: [], rowCount: 1 });
});

// ─── getStats ──────────────────────────────────────────────────────────────────

describe('getStats', () => {
  it('reads denormalized owned/duplicate/total counts from user_albums', async () => {
    (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rows: [{ total: 980, owned: 200, duplicates: 15 }],
    });

    const stats = await getStats(mockDb, mockRedis, 'user-1', 'album-1');

    expect(stats.total).toBe(980);
    expect(stats.owned).toBe(200);
    expect(stats.duplicates).toBe(15);
    expect(stats.missing).toBe(780);
    expect(stats.percentage).toBe(parseFloat(((200 / 980) * 100).toFixed(2)));

    const [[sql]] = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls;
    expect(sql).toMatch(/FROM user_albums/i);
    expect(sql).toMatch(/owned_count/i);
  });

  it('returns percentage = 0 when total is 0', async () => {
    (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rows: [{ total: 0, owned: 0, duplicates: 0 }],
    });

    const stats = await getStats(mockDb, mockRedis, 'user-1', 'album-1');

    expect(stats.total).toBe(0);
    expect(stats.missing).toBe(0);
    expect(stats.percentage).toBe(0);
  });
});

// ─── addSticker ────────────────────────────────────────────────────────────────

describe('addSticker', () => {
  it('upserts the sticker variant inside a transaction', async () => {
    await addSticker(mockDb, mockRedis, 'user-42', 'album-42', 'variant-99');

    expect(mockDb.connect).toHaveBeenCalled();
    const insertCall = clientQuery.mock.calls.find(([sql]) =>
      typeof sql === 'string' && /INSERT INTO user_stickers/i.test(sql)
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toContain('album-42');
    expect(insertCall![1]).toContain('variant-99');
    expect(clientRelease).toHaveBeenCalled();
  });

  it('invalidates user caches after insert', async () => {
    (mockRedis.scan as ReturnType<typeof vi.fn>).mockResolvedValue(['0', ['user:user-42:collection:abc']]);
    await addSticker(mockDb, mockRedis, 'user-42', 'album-42', 'variant-99');
    expect(mockRedis.scan).toHaveBeenCalled();
    expect(mockRedis.del).toHaveBeenCalled();
  });

  it('uses quantity = 1 by default', async () => {
    await addSticker(mockDb, mockRedis, 'user-42', 'album-42', 'variant-99');
    const insertCall = clientQuery.mock.calls.find(([sql]) =>
      typeof sql === 'string' && /INSERT INTO user_stickers/i.test(sql)
    );
    expect(insertCall![1]).toContain(1);
  });
});

// ─── removeSticker ─────────────────────────────────────────────────────────────

describe('removeSticker', () => {
  it('issues a DELETE against the right (album_id, variant_id)', async () => {
    await removeSticker(mockDb, mockRedis, 'user-42', 'album-42', 'variant-99');
    const delCall = clientQuery.mock.calls.find(([sql]) =>
      typeof sql === 'string' && /DELETE FROM user_stickers/i.test(sql)
    );
    expect(delCall).toBeDefined();
    expect(delCall![1]).toContain('album-42');
    expect(delCall![1]).toContain('variant-99');
    expect(clientRelease).toHaveBeenCalled();
  });

  it('invalidates user caches after deletion', async () => {
    (mockRedis.scan as ReturnType<typeof vi.fn>).mockResolvedValue(['0', ['user:user-42:summary:album-42']]);
    await removeSticker(mockDb, mockRedis, 'user-42', 'album-42', 'variant-99');
    expect(mockRedis.del).toHaveBeenCalled();
  });
});

// ─── updateSticker ─────────────────────────────────────────────────────────────

describe('updateSticker', () => {
  it('upserts when quantity > 0', async () => {
    await updateSticker(mockDb, mockRedis, 'user-42', 'album-42', 'variant-99', 3);
    const upsertCall = clientQuery.mock.calls.find(([sql]) =>
      typeof sql === 'string' && /INSERT INTO user_stickers/i.test(sql)
    );
    expect(upsertCall).toBeDefined();
    expect(upsertCall![1]).toContain('album-42');
    expect(upsertCall![1]).toContain('variant-99');
    expect(upsertCall![1]).toContain(3);
  });

  it('deletes when quantity = 0', async () => {
    await updateSticker(mockDb, mockRedis, 'user-42', 'album-42', 'variant-99', 0);
    const delCall = clientQuery.mock.calls.find(([sql]) =>
      typeof sql === 'string' && /DELETE FROM user_stickers/i.test(sql)
    );
    expect(delCall).toBeDefined();
    expect(delCall![1]).toContain('album-42');
    expect(delCall![1]).toContain('variant-99');
  });

  it('deletes when quantity < 0', async () => {
    await updateSticker(mockDb, mockRedis, 'user-42', 'album-42', 'variant-99', -1);
    const delCall = clientQuery.mock.calls.find(([sql]) =>
      typeof sql === 'string' && /DELETE FROM user_stickers/i.test(sql)
    );
    expect(delCall).toBeDefined();
  });

  it('invalidates user caches after update', async () => {
    (mockRedis.scan as ReturnType<typeof vi.fn>).mockResolvedValue(['0', ['user:user-42:summary:album-42']]);
    await updateSticker(mockDb, mockRedis, 'user-42', 'album-42', 'variant-99', 2);
    expect(mockRedis.del).toHaveBeenCalled();
  });
});

// ─── setTradeFlags ─────────────────────────────────────────────────────────────
//
// setTradeFlags does NOT run inside a transaction (it only flips boolean flags
// on user_stickers; no stat columns depend on it), so it still uses db.query.

describe('setTradeFlags', () => {
  it('runs an UPDATE setting trade_hidden when only tradeHidden is provided', async () => {
    (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await setTradeFlags(mockDb, mockRedis, 'user-1', 'album-1', 'variant-1', { tradeHidden: true });
    const [[sql, params]] = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls;
    expect(sql).toMatch(/UPDATE user_stickers/i);
    expect(sql).toMatch(/trade_hidden/i);
    expect(params).toContain('album-1');
    expect(params).toContain('variant-1');
    expect(params).toContain(true);
  });

  it('also clears trade_forced when trade_hidden is set', async () => {
    (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await setTradeFlags(mockDb, mockRedis, 'user-1', 'album-1', 'variant-1', { tradeHidden: true });
    const [[sql, params]] = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls;
    expect(sql).toMatch(/trade_forced/i);
    expect(params).toContain(false);
  });

  it('runs an UPDATE setting trade_forced when only tradeForced is provided', async () => {
    (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await setTradeFlags(mockDb, mockRedis, 'user-1', 'album-1', 'variant-1', { tradeForced: true });
    const [[sql, params]] = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls;
    expect(sql).toMatch(/UPDATE user_stickers/i);
    expect(sql).toMatch(/trade_forced/i);
    expect(params).toContain(true);
  });

  it('also clears trade_hidden when trade_forced is set', async () => {
    (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await setTradeFlags(mockDb, mockRedis, 'user-1', 'album-1', 'variant-1', { tradeForced: true });
    const [[sql, params]] = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls;
    expect(sql).toMatch(/trade_hidden/i);
    expect(params).toContain(false);
  });

  it('updates both flags when both are explicitly provided', async () => {
    (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await setTradeFlags(mockDb, mockRedis, 'user-1', 'album-1', 'variant-1', {
      tradeHidden: false,
      tradeForced: false,
    });
    const [[sql, params]] = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls;
    expect(sql).toMatch(/UPDATE user_stickers/i);
    expect(params).toContain('album-1');
    expect(params).toContain('variant-1');
  });

  it('does not run a query when no flags are provided', async () => {
    await setTradeFlags(mockDb, mockRedis, 'user-1', 'album-1', 'variant-1', {});
    expect(mockDb.query).not.toHaveBeenCalled();
  });

  it('invalidates user caches after updating flags', async () => {
    (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [], rowCount: 1 });
    (mockRedis.scan as ReturnType<typeof vi.fn>).mockResolvedValue(['0', ['user:user-1:collection:album-1']]);
    await setTradeFlags(mockDb, mockRedis, 'user-1', 'album-1', 'variant-1', { tradeHidden: true });
    expect(mockRedis.del).toHaveBeenCalled();
  });

  it('does not invalidate caches when no query was run', async () => {
    await setTradeFlags(mockDb, mockRedis, 'user-1', 'album-1', 'variant-1', {});
    expect(mockRedis.scan).not.toHaveBeenCalled();
    expect(mockRedis.del).not.toHaveBeenCalled();
  });
});
