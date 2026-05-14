import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';

import {
  getStats,
  addSticker,
  removeSticker,
  updateSticker,
} from '../../src/services/collection.service.js';

// ─── Minimal mocks ─────────────────────────────────────────────────────────────

const mockDb = {
  query: vi.fn(),
  connect: vi.fn(),
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
  // Default: cache miss, no cached keys
  (mockRedis.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  (mockRedis.scan as ReturnType<typeof vi.fn>).mockResolvedValue(['0', []]);
});

// ─── getStats ──────────────────────────────────────────────────────────────────

describe('getStats', () => {
  it('calculates percentage as (owned / total * 100) rounded to 2 decimal places', async () => {
    (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rows: [{ total: '980', owned: '200', duplicates: '15' }],
    });

    const stats = await getStats(mockDb, mockRedis, 'user-1', 'album-1');

    expect(stats.total).toBe(980);
    expect(stats.owned).toBe(200);
    expect(stats.duplicates).toBe(15);
    expect(stats.missing).toBe(980 - 200); // 780
    expect(stats.percentage).toBe(parseFloat(((200 / 980) * 100).toFixed(2)));
  });

  it('returns percentage = 0 when total is 0', async () => {
    (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rows: [{ total: '0', owned: '0', duplicates: '0' }],
    });

    const stats = await getStats(mockDb, mockRedis, 'user-1', 'album-1');

    expect(stats.total).toBe(0);
    expect(stats.owned).toBe(0);
    expect(stats.missing).toBe(0);
    expect(stats.percentage).toBe(0);
  });

  it('returns cached result without querying the DB', async () => {
    const cached = { total: 980, owned: 200, missing: 780, duplicates: 15, percentage: 20.41 };
    (mockRedis.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(JSON.stringify(cached));

    const stats = await getStats(mockDb, mockRedis, 'user-1', 'album-1');

    expect(stats).toEqual(cached);
    expect(mockDb.query).not.toHaveBeenCalled();
  });

  it('caches the result after fetching from DB', async () => {
    (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rows: [{ total: '100', owned: '50', duplicates: '5' }],
    });

    await getStats(mockDb, mockRedis, 'user-1', 'album-1');

    expect(mockRedis.set).toHaveBeenCalledWith(
      'user:user-1:summary:album-1',
      expect.any(String),
      'EX',
      300
    );
  });
});

// ─── addSticker ────────────────────────────────────────────────────────────────

describe('addSticker', () => {
  it('calls db.query with the correct albumId and variantId', async () => {
    (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await addSticker(mockDb, mockRedis, 'user-42', 'album-42', 'variant-99');

    const [[sql, params]] = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls;
    expect(sql).toMatch(/INSERT INTO user_stickers/i);
    expect(params).toContain('album-42');
    expect(params).toContain('variant-99');
  });

  it('invalidates user caches after insert', async () => {
    (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [], rowCount: 1 });
    (mockRedis.scan as ReturnType<typeof vi.fn>).mockResolvedValue(['0', ['user:user-42:collection:abc']]);

    await addSticker(mockDb, mockRedis, 'user-42', 'album-42', 'variant-99');

    expect(mockRedis.scan).toHaveBeenCalled();
    expect(mockRedis.del).toHaveBeenCalled();
  });

  it('does not call del when no cache keys exist', async () => {
    (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [], rowCount: 1 });
    (mockRedis.scan as ReturnType<typeof vi.fn>).mockResolvedValue(['0', []]);

    await addSticker(mockDb, mockRedis, 'user-42', 'album-42', 'variant-99');

    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it('uses quantity = 1 by default', async () => {
    (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await addSticker(mockDb, mockRedis, 'user-42', 'album-42', 'variant-99');

    const [[, params]] = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls;
    expect(params).toContain(1);
  });
});

// ─── removeSticker ─────────────────────────────────────────────────────────────

describe('removeSticker', () => {
  it('calls db.query with albumId and variantId in a DELETE statement', async () => {
    (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await removeSticker(mockDb, mockRedis, 'user-42', 'album-42', 'variant-99');

    const [[sql, params]] = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls;
    expect(sql).toMatch(/DELETE FROM user_stickers/i);
    expect(params).toContain('album-42');
    expect(params).toContain('variant-99');
  });

  it('invalidates user caches after deletion', async () => {
    (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [], rowCount: 1 });
    (mockRedis.scan as ReturnType<typeof vi.fn>).mockResolvedValue(['0', ['user:user-42:summary:album-42']]);

    await removeSticker(mockDb, mockRedis, 'user-42', 'album-42', 'variant-99');

    expect(mockRedis.scan).toHaveBeenCalled();
    expect(mockRedis.del).toHaveBeenCalled();
  });
});

// ─── updateSticker ─────────────────────────────────────────────────────────────

describe('updateSticker', () => {
  it('runs an UPDATE query when quantity > 0', async () => {
    (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await updateSticker(mockDb, mockRedis, 'user-42', 'album-42', 'variant-99', 3);

    const [[sql, params]] = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls;
    expect(sql).toMatch(/UPDATE user_stickers/i);
    expect(params).toContain('album-42');
    expect(params).toContain('variant-99');
    expect(params).toContain(3);
  });

  it('runs a DELETE query when quantity = 0', async () => {
    (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await updateSticker(mockDb, mockRedis, 'user-42', 'album-42', 'variant-99', 0);

    const [[sql, params]] = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls;
    expect(sql).toMatch(/DELETE FROM user_stickers/i);
    expect(params).toContain('album-42');
    expect(params).toContain('variant-99');
  });

  it('runs a DELETE query when quantity < 0', async () => {
    (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await updateSticker(mockDb, mockRedis, 'user-42', 'album-42', 'variant-99', -1);

    const [[sql]] = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls;
    expect(sql).toMatch(/DELETE FROM user_stickers/i);
  });

  it('invalidates user caches after update', async () => {
    (mockDb.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ rows: [], rowCount: 1 });
    (mockRedis.scan as ReturnType<typeof vi.fn>).mockResolvedValue(['0', ['user:user-42:summary:album-42']]);

    await updateSticker(mockDb, mockRedis, 'user-42', 'album-42', 'variant-99', 2);

    expect(mockRedis.scan).toHaveBeenCalled();
    expect(mockRedis.del).toHaveBeenCalled();
  });
});
