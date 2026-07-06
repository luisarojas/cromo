import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';

// Mock the collaborators so user.service can run without touching real
// transactions, jobs, or caches.
vi.mock('../../src/db/transaction.js', () => ({
  withTx: vi.fn(async (_db: unknown, fn: (client: unknown) => unknown) => fn(_clientStub)),
}));
vi.mock('../../src/services/jobs.service.js', () => ({
  enqueue: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/services/cache.js', () => ({
  invalidateUserCaches: vi.fn().mockResolvedValue(undefined),
}));

let _clientStub: { query: ReturnType<typeof vi.fn> };

import {
  updateUsername,
  updateEmail,
  updateDisplayName,
  updatePassword,
  getPreferences,
  updatePreferences,
  deleteAccount,
} from '../../src/services/user.service.js';
import { enqueue } from '../../src/services/jobs.service.js';
import { invalidateUserCaches } from '../../src/services/cache.js';

// A factory for a pg.Pool-like object whose .query method we can script.
function makeDb() {
  const query = vi.fn();
  return { query, asPool: { query, connect: vi.fn() } as unknown as Pool };
}

function makeRedis() {
  return {
    smembers: vi.fn().mockResolvedValue([]),
    del: vi.fn().mockResolvedValue(0),
  } as unknown as Redis;
}

beforeEach(() => {
  // Reset the transaction-mock client between tests.
  _clientStub = { query: vi.fn() };
  vi.mocked(enqueue).mockClear();
  vi.mocked(invalidateUserCaches).mockClear();
});

// ─── updateUsername ──────────────────────────────────────────────────────────

describe('updateUsername', () => {
  it('lowercases + trims the requested username before checking uniqueness', async () => {
    const { query, asPool } = makeDb();
    query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // uniqueness check
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ username: 'luisa' }] }) // UPDATE
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // audit insert

    const out = await updateUsername(asPool, 'u-1', '  LUISA  ');
    expect(out).toEqual({ username: 'luisa' });

    const [uniquenessSql, uniquenessParams] = query.mock.calls[0]!;
    expect(uniquenessSql).toMatch(/WHERE username = \$1/);
    expect(uniquenessParams).toEqual(['luisa', 'u-1']);
  });

  it('throws 409 when the username is taken by another user', async () => {
    const { query, asPool } = makeDb();
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'other' }] });
    await expect(updateUsername(asPool, 'u-1', 'taken')).rejects.toMatchObject({
      message: expect.stringMatching(/already taken/i),
      statusCode: 409,
    });
  });

  it('throws 404 when the UPDATE matches no row (user deleted or missing)', async () => {
    const { query, asPool } = makeDb();
    query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(updateUsername(asPool, 'u-gone', 'free')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

// ─── updateEmail ─────────────────────────────────────────────────────────────

describe('updateEmail', () => {
  it('throws 409 when the email is registered to another user', async () => {
    const { query, asPool } = makeDb();
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'other' }] });
    await expect(updateEmail(asPool, makeRedis(), 'u-1', 'a@b.c')).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('updates inside a transaction, mints a verify code, and enqueues an email job', async () => {
    const { query, asPool } = makeDb();
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // pre-tx uniqueness
    // Inside withTx: UPDATE users → DELETE tokens → INSERT token → recordAudit
    _clientStub.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ username: 'luisa' }] }) // UPDATE
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // DELETE old tokens
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // INSERT new token
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // audit

    const redis = makeRedis();
    const out = await updateEmail(asPool, redis, 'u-1', '  NEW@X.com  ');
    expect(out).toEqual({ email: 'new@x.com' });

    // Job was enqueued with the lowercased email + the user's username.
    expect(vi.mocked(enqueue)).toHaveBeenCalledTimes(1);
    const enqueueArg = vi.mocked(enqueue).mock.calls[0]![1] as {
      type: string;
      email: string;
      username: string;
      code: string;
    };
    expect(enqueueArg.type).toBe('email:verify');
    expect(enqueueArg.email).toBe('new@x.com');
    expect(enqueueArg.username).toBe('luisa');
    expect(enqueueArg.code).toMatch(/^\d{6}$/);
  });

  it('throws 404 when the UPDATE inside the transaction matches no row', async () => {
    const { query, asPool } = makeDb();
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    _clientStub.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(updateEmail(asPool, makeRedis(), 'u-gone', 'a@b.c')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

// ─── updateDisplayName ───────────────────────────────────────────────────────

describe('updateDisplayName', () => {
  it('trims the display name and collapses empty strings to null', async () => {
    const { query, asPool } = makeDb();
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{ display_name: null }] });
    await updateDisplayName(asPool, 'u-1', '   ');
    const [, params] = query.mock.calls[0]!;
    expect(params?.[0]).toBeNull();
  });

  it('returns the saved display_name on success', async () => {
    const { query, asPool } = makeDb();
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{ display_name: 'Luisa Rojas' }] });
    expect(await updateDisplayName(asPool, 'u-1', '  Luisa Rojas  ')).toEqual({
      displayName: 'Luisa Rojas',
    });
  });

  it('throws 404 when the user is not found', async () => {
    const { query, asPool } = makeDb();
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(updateDisplayName(asPool, 'u-gone', 'x')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('accepts an explicit null displayName', async () => {
    const { query, asPool } = makeDb();
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{ display_name: null }] });
    expect(await updateDisplayName(asPool, 'u-1', null)).toEqual({ displayName: null });
  });
});

// ─── updatePassword ──────────────────────────────────────────────────────────

describe('updatePassword', () => {
  it('records an audit row and does not throw', async () => {
    const { query, asPool } = makeDb();
    query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    await updatePassword(asPool, 'u-1');
    expect(query).toHaveBeenCalled();
    const [sql] = query.mock.calls[0]!;
    expect(sql).toMatch(/INSERT INTO audit_log/);
  });
});

// ─── getPreferences ──────────────────────────────────────────────────────────

describe('getPreferences', () => {
  it('returns the schema defaults when the user has no settings row', async () => {
    const { query, asPool } = makeDb();
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const prefs = await getPreferences(asPool, 'u-1');
    expect(prefs).toEqual({
      cities: [],
      profileVisibility: 'public',
      tradeMatchingEnabled: true,
      searchRadiusKm: 50,
      emailTradeRequests: true,
      emailTradeMessages: true,
      emailMarketing: false,
    });
  });

  it('maps snake_case columns to camelCase and coerces missing city lat/lng to null', async () => {
    const { query, asPool } = makeDb();
    query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        cities: [
          { label: 'Montréal', placeId: 1, lat: 45.5, lng: -73.5 },
          { label: 'Toronto', placeId: 2 }, // missing lat/lng — must coerce
        ],
        profile_visibility: 'private',
        trade_matching_enabled: false,
        search_radius_km: '120', // numeric returned as string by pg
        email_trade_requests: false,
        email_trade_messages: true,
        email_marketing: true,
      }],
    });
    const prefs = await getPreferences(asPool, 'u-1');
    expect(prefs.profileVisibility).toBe('private');
    expect(prefs.tradeMatchingEnabled).toBe(false);
    expect(prefs.searchRadiusKm).toBe(120); // string → number
    expect(prefs.cities).toEqual([
      { label: 'Montréal', placeId: 1, lat: 45.5, lng: -73.5 },
      { label: 'Toronto', placeId: 2, lat: null, lng: null },
    ]);
  });

  it('treats a null cities column as an empty array', async () => {
    const { query, asPool } = makeDb();
    query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        cities: null,
        profile_visibility: 'public',
        trade_matching_enabled: true,
        search_radius_km: 50,
        email_trade_requests: true,
        email_trade_messages: true,
        email_marketing: false,
      }],
    });
    expect((await getPreferences(asPool, 'u-1')).cities).toEqual([]);
  });
});

// ─── updatePreferences ───────────────────────────────────────────────────────

describe('updatePreferences', () => {
  it('short-circuits to a fresh getPreferences read when the patch is empty', async () => {
    const { query, asPool } = makeDb();
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // getPreferences → default
    const prefs = await updatePreferences(asPool, makeRedis(), 'u-1', {});
    expect(prefs.tradeMatchingEnabled).toBe(true);
    expect(query).toHaveBeenCalledTimes(1); // no UPDATE issued
  });

  it('builds a dynamic SET clause from the patch keys', async () => {
    const { query, asPool } = makeDb();
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // UPDATE
      .mockResolvedValueOnce({ rowCount: 1, rows: [{
        cities: [],
        profile_visibility: 'private',
        trade_matching_enabled: true,
        search_radius_km: 25,
        email_trade_requests: true,
        email_trade_messages: false,
        email_marketing: false,
      }] });

    await updatePreferences(asPool, makeRedis(), 'u-1', {
      profileVisibility: 'private',
      searchRadiusKm: 25,
      emailTradeMessages: false,
    });

    const [updateSql, params] = query.mock.calls[0]!;
    expect(updateSql).toMatch(/UPDATE user_settings SET/);
    expect(updateSql).toMatch(/profile_visibility = \$1/);
    expect(updateSql).toMatch(/search_radius_km = \$2/);
    expect(updateSql).toMatch(/email_trade_messages = \$3/);
    expect(updateSql).toMatch(/WHERE user_id = \$4/);
    expect(params).toEqual(['private', 25, false, 'u-1']);
  });

  it('busts the trade-matches cache index when cities or searchRadiusKm change', async () => {
    const { query, asPool } = makeDb();
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // UPDATE
      .mockResolvedValueOnce({ rowCount: 1, rows: [{
        cities: [],
        profile_visibility: 'public', trade_matching_enabled: true, search_radius_km: 100,
        email_trade_requests: true, email_trade_messages: true, email_marketing: false,
      }] });
    const redis = {
      smembers: vi.fn().mockResolvedValue(['user:u-1:matches:cacheA', 'user:u-1:matches:cacheB']),
      del: vi.fn().mockResolvedValue(0),
    } as unknown as Redis;

    await updatePreferences(asPool, redis, 'u-1', { searchRadiusKm: 100 });
    expect(redis.smembers).toHaveBeenCalledWith('trade:matches:idx:u-1');
    expect(redis.del).toHaveBeenCalledWith(
      'user:u-1:matches:cacheA',
      'user:u-1:matches:cacheB',
      'trade:matches:idx:u-1',
    );
  });
});

// ─── deleteAccount ───────────────────────────────────────────────────────────

describe('deleteAccount', () => {
  it('records an audit row then deletes the user', async () => {
    const { query, asPool } = makeDb();
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // audit
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // DELETE
    await deleteAccount(asPool, 'u-1');
    expect(query.mock.calls[0]![0]).toMatch(/INSERT INTO audit_log/);
    expect(query.mock.calls[1]![0]).toMatch(/DELETE FROM users WHERE id = \$1/);
  });

  it('throws 404 when the user does not exist', async () => {
    const { query, asPool } = makeDb();
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(deleteAccount(asPool, 'u-gone')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
