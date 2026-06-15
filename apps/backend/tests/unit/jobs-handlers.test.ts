import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import type { JobDeps, JobLogger } from '../../src/jobs/types.js';
import {
  expirePendingTrades,
  expireAcceptedTrades,
  purgeTradeMessages,
  redactOldReports,
  autoFlagSweep,
  ratingReminderEmail,
  truncateAuditLogIps,
  purgeEmailVerificationTokens,
  purgeStalePushSubscriptions,
  purgeOldShareTokens,
  cacheWarmStickers,
  dmarcReportAggregation,
  syntheticCanaryWarmAurora,
} from '../../src/jobs/handlers.js';

// JobLogger stub that swallows everything but records calls so tests can
// assert on the message at the end of a handler.
function makeLog(): JobLogger & { calls: { level: string; msg: string; fields?: unknown }[] } {
  const calls: { level: string; msg: string; fields?: unknown }[] = [];
  return {
    info: (msg, fields) => calls.push({ level: 'info', msg, fields }),
    warn: (msg, fields) => calls.push({ level: 'warn', msg, fields }),
    error: (_err, msg, fields) => calls.push({ level: 'error', msg: msg ?? '', fields }),
    calls,
  };
}

function makeDeps(initialDbResponses: unknown[] = [], initialRedisResponses: unknown[] = []) {
  const dbQuery = vi.fn();
  for (const r of initialDbResponses) dbQuery.mockResolvedValueOnce(r);
  const redis = {
    lpush: vi.fn().mockResolvedValue(1),
    set: vi.fn().mockResolvedValue('OK'),
    ping: vi.fn().mockResolvedValue('PONG'),
  };
  for (const r of initialRedisResponses) (redis.lpush as ReturnType<typeof vi.fn>).mockResolvedValueOnce(r);
  const log = makeLog();
  return {
    deps: { db: { query: dbQuery } as unknown as Pool, redis: redis as unknown as Redis, log } as JobDeps,
    dbQuery,
    redis,
    log,
  };
}

beforeEach(() => {
  vi.useRealTimers();
});

// ─── Simple UPDATE handlers — rowCount → affected ────────────────────────────

describe('expirePendingTrades', () => {
  it('expires every pending trade idle for 30+ days and returns the affected count', async () => {
    const { deps, dbQuery, log } = makeDeps([{ rowCount: 4, rows: [] }]);
    const res = await expirePendingTrades(deps);
    expect(res).toEqual({ affected: 4 });
    expect(dbQuery.mock.calls[0]![0]).toMatch(/UPDATE trade_requests/);
    expect(dbQuery.mock.calls[0]![0]).toMatch(/status = 'pending'/);
    expect(log.calls[0]?.fields).toMatchObject({ affected: 4 });
  });

  it('reports 0 affected when rowCount is null', async () => {
    const { deps } = makeDeps([{ rowCount: null, rows: [] }]);
    expect(await expirePendingTrades(deps)).toEqual({ affected: 0 });
  });
});

describe('expireAcceptedTrades', () => {
  it('expires accepted trades past their expires_at', async () => {
    const { deps, dbQuery } = makeDeps([{ rowCount: 2 }]);
    const res = await expireAcceptedTrades(deps);
    expect(res).toEqual({ affected: 2 });
    const sql = dbQuery.mock.calls[0]![0] as string;
    expect(sql).toMatch(/status = 'accepted'/);
    expect(sql).toMatch(/expires_at < now\(\)/);
  });
});

describe('purgeTradeMessages', () => {
  it('deletes messages on trades closed 90+ days ago', async () => {
    const { deps, dbQuery } = makeDeps([{ rowCount: 17 }]);
    const res = await purgeTradeMessages(deps);
    expect(res).toEqual({ affected: 17 });
    const sql = dbQuery.mock.calls[0]![0] as string;
    expect(sql).toMatch(/DELETE FROM trade_messages/);
    expect(sql).toMatch(/'90 days'/);
  });
});

describe('redactOldReports', () => {
  it("replaces resolved reports' descriptions with '[redacted]' after 2 years", async () => {
    const { deps, dbQuery } = makeDeps([{ rowCount: 3 }]);
    expect(await redactOldReports(deps)).toEqual({ affected: 3 });
    const sql = dbQuery.mock.calls[0]![0] as string;
    expect(sql).toMatch(/SET description = '\[redacted\]'/);
    expect(sql).toMatch(/'2 years'/);
  });
});

// ─── autoFlagSweep — soft-bans users with 3 reports in 30 days ───────────────

describe('autoFlagSweep', () => {
  it('inserts one soft-ban per eligible user and reports evaluated/banned counts', async () => {
    const { deps, dbQuery, log } = makeDeps([
      // Eligible candidates (SELECT)
      { rows: [{ reported_user_id: 'u-1' }, { reported_user_id: 'u-2' }] },
      // INSERT bans
      { rowCount: 1 },
      { rowCount: 1 },
    ]);
    const res = await autoFlagSweep(deps);
    expect(res).toEqual({ affected: 2, details: { evaluated: 2 } });
    expect(dbQuery).toHaveBeenCalledTimes(3); // 1 SELECT + 2 INSERTs
    expect(dbQuery.mock.calls[1]![0]).toMatch(/INSERT INTO user_bans/);
    expect(dbQuery.mock.calls[1]![1]).toEqual(['u-1']);
    expect(log.calls[0]?.fields).toMatchObject({ evaluated: 2, banned: 2 });
  });

  it('is a no-op when no users meet the threshold', async () => {
    const { deps, dbQuery } = makeDeps([{ rows: [] }]);
    expect(await autoFlagSweep(deps)).toEqual({ affected: 0, details: { evaluated: 0 } });
    expect(dbQuery).toHaveBeenCalledTimes(1);
  });
});

// ─── ratingReminderEmail — enqueue + stamp ───────────────────────────────────

describe('ratingReminderEmail', () => {
  it('enqueues a reminder per eligible (user, trade) and stamps the trades', async () => {
    const { deps, dbQuery, redis } = makeDeps([
      // SELECT eligible
      { rows: [
        { user_id: 'u-1', email: 'a@x', username: 'a', trade_id: 't-1' },
        { user_id: 'u-2', email: 'b@x', username: 'b', trade_id: 't-1' },
        { user_id: 'u-1', email: 'a@x', username: 'a', trade_id: 't-2' },
      ] },
      // UPDATE last_reminded_at
      { rowCount: 2 },
    ]);
    const res = await ratingReminderEmail(deps);
    expect(res).toEqual({ affected: 3 });
    // Three LPUSH calls — one per reminder enqueued.
    expect(redis.lpush).toHaveBeenCalledTimes(3);
    // The UPDATE was issued with the deduplicated trade id list.
    const [updateSql, updateParams] = dbQuery.mock.calls[1]!;
    expect(updateSql).toMatch(/UPDATE trade_requests SET last_reminded_at/);
    expect((updateParams as [string[]])[0].sort()).toEqual(['t-1', 't-2']);
  });

  it('skips the UPDATE entirely when nobody is eligible', async () => {
    const { deps, dbQuery, redis } = makeDeps([{ rows: [] }]);
    expect(await ratingReminderEmail(deps)).toEqual({ affected: 0 });
    expect(redis.lpush).not.toHaveBeenCalled();
    expect(dbQuery).toHaveBeenCalledTimes(1); // only the SELECT
  });
});

// ─── Single-statement maintenance handlers ───────────────────────────────────

describe('truncateAuditLogIps', () => {
  it('masks v4 to /24 and v6 to /48 on rows older than 90 days', async () => {
    const { deps, dbQuery } = makeDeps([{ rowCount: 10 }]);
    expect(await truncateAuditLogIps(deps)).toEqual({ affected: 10 });
    const sql = dbQuery.mock.calls[0]![0] as string;
    expect(sql).toMatch(/set_masklen\(ip_address, 24\)/);
    expect(sql).toMatch(/set_masklen\(ip_address, 48\)/);
  });
});

describe('purgeEmailVerificationTokens', () => {
  it('deletes tokens expired 7+ days ago', async () => {
    const { deps, dbQuery } = makeDeps([{ rowCount: 5 }]);
    expect(await purgeEmailVerificationTokens(deps)).toEqual({ affected: 5 });
    expect(dbQuery.mock.calls[0]![0]).toMatch(/DELETE FROM email_verification_tokens/);
  });
});

describe('purgeStalePushSubscriptions', () => {
  it('deletes push subscriptions not seen in 90+ days', async () => {
    const { deps, dbQuery } = makeDeps([{ rowCount: 3 }]);
    expect(await purgeStalePushSubscriptions(deps)).toEqual({ affected: 3 });
    expect(dbQuery.mock.calls[0]![0]).toMatch(/DELETE FROM push_subscriptions/);
  });
});

describe('purgeOldShareTokens', () => {
  it('deletes public_lists past their expires_at', async () => {
    const { deps, dbQuery } = makeDeps([{ rowCount: 7 }]);
    expect(await purgeOldShareTokens(deps)).toEqual({ affected: 7 });
    expect(dbQuery.mock.calls[0]![0]).toMatch(/DELETE FROM public_lists/);
  });
});

// ─── cacheWarmStickers ───────────────────────────────────────────────────────

describe('cacheWarmStickers', () => {
  it('serialises the sticker rows into the stickers:all Redis key with a 1h TTL', async () => {
    const stickers = [{ id: 's-1', album_code: 'BRA5' }, { id: 's-2', album_code: 'ARG7' }];
    const { deps, redis } = makeDeps([{ rows: stickers }]);
    const res = await cacheWarmStickers(deps);
    expect(res).toEqual({ affected: 2 });
    expect(redis.set).toHaveBeenCalledWith('stickers:all', JSON.stringify(stickers), 'EX', 3600);
  });
});

// ─── Cloud-only handlers ─────────────────────────────────────────────────────

describe('dmarcReportAggregation', () => {
  it('logs a warning and returns 0 (placeholder until SES inbox rules ship)', async () => {
    const { deps, log } = makeDeps();
    expect(await dmarcReportAggregation(deps)).toEqual({ affected: 0 });
    expect(log.calls[0]?.level).toBe('warn');
  });
});

describe('syntheticCanaryWarmAurora', () => {
  it('pings the DB and Redis and reports affected=1', async () => {
    const { deps, dbQuery, redis } = makeDeps([{ rows: [] }]);
    expect(await syntheticCanaryWarmAurora(deps)).toEqual({ affected: 1 });
    expect(dbQuery.mock.calls[0]![0]).toBe('SELECT 1');
    expect(redis.ping).toHaveBeenCalled();
  });
});
