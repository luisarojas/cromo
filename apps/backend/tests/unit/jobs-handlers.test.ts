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
//
// These unit tests verify the dispatcher behaviour: each handler issues one
// query, maps pg's rowCount to JobResult.affected, and logs the count. The
// actual SQL is exercised by the scheduled cron in dev/prod (the job runs
// hourly) — asserting on its literal text here would couple every refactor
// to a string match without adding real safety. Keep these focused on
// observable shape: result object + log payload.

describe('expirePendingTrades', () => {
  it('returns { affected: N } from pg rowCount and logs the same value', async () => {
    const { deps, dbQuery, log } = makeDeps([{ rowCount: 4, rows: [] }]);
    const res = await expirePendingTrades(deps);
    expect(res).toEqual({ affected: 4 });
    expect(dbQuery).toHaveBeenCalledTimes(1);
    expect(log.calls[0]?.fields).toMatchObject({ affected: 4 });
  });

  it('reports 0 affected when pg returns rowCount: null', async () => {
    const { deps } = makeDeps([{ rowCount: null, rows: [] }]);
    expect(await expirePendingTrades(deps)).toEqual({ affected: 0 });
  });
});

describe('expireAcceptedTrades', () => {
  it('returns { affected: N }', async () => {
    const { deps, dbQuery } = makeDeps([{ rowCount: 2 }]);
    expect(await expireAcceptedTrades(deps)).toEqual({ affected: 2 });
    expect(dbQuery).toHaveBeenCalledTimes(1);
  });
});

describe('purgeTradeMessages', () => {
  it('returns { affected: N }', async () => {
    const { deps, dbQuery } = makeDeps([{ rowCount: 17 }]);
    expect(await purgeTradeMessages(deps)).toEqual({ affected: 17 });
    expect(dbQuery).toHaveBeenCalledTimes(1);
  });
});

describe('redactOldReports', () => {
  it('returns { affected: N }', async () => {
    const { deps, dbQuery } = makeDeps([{ rowCount: 3 }]);
    expect(await redactOldReports(deps)).toEqual({ affected: 3 });
    expect(dbQuery).toHaveBeenCalledTimes(1);
  });
});

// ─── autoFlagSweep — soft-bans users with 3 reports in 30 days ───────────────

describe('autoFlagSweep', () => {
  it('issues one INSERT per eligible user and counts both evaluated and banned', async () => {
    const { deps, dbQuery, log } = makeDeps([
      // Eligible candidates (SELECT)
      { rows: [{ reported_user_id: 'u-1' }, { reported_user_id: 'u-2' }] },
      // INSERT bans
      { rowCount: 1 },
      { rowCount: 1 },
    ]);
    expect(await autoFlagSweep(deps)).toEqual({ affected: 2, details: { evaluated: 2 } });
    expect(dbQuery).toHaveBeenCalledTimes(3); // 1 SELECT + N INSERTs
    // Each INSERT is parameterised with exactly the user id that failed the
    // 3-reports-in-30-days check — verify the dispatch wires the right id
    // (not just "an" id) to "a" ban row.
    expect(dbQuery.mock.calls[1]![1]).toEqual(['u-1']);
    expect(dbQuery.mock.calls[2]![1]).toEqual(['u-2']);
    expect(log.calls[0]?.fields).toMatchObject({ evaluated: 2, banned: 2 });
  });

  it('skips the INSERT loop entirely when nobody meets the threshold', async () => {
    const { deps, dbQuery } = makeDeps([{ rows: [] }]);
    expect(await autoFlagSweep(deps)).toEqual({ affected: 0, details: { evaluated: 0 } });
    expect(dbQuery).toHaveBeenCalledTimes(1);
  });
});

// ─── ratingReminderEmail — enqueue + stamp ───────────────────────────────────

describe('ratingReminderEmail', () => {
  it('enqueues a reminder per eligible (user, trade) and dedupes trade ids for the stamp UPDATE', async () => {
    const { deps, dbQuery, redis } = makeDeps([
      // SELECT eligible: 3 rows but only 2 distinct trade ids (t-1, t-2).
      { rows: [
        { user_id: 'u-1', email: 'a@x', username: 'a', trade_id: 't-1' },
        { user_id: 'u-2', email: 'b@x', username: 'b', trade_id: 't-1' },
        { user_id: 'u-1', email: 'a@x', username: 'a', trade_id: 't-2' },
      ] },
      { rowCount: 2 }, // UPDATE last_reminded_at
    ]);
    expect(await ratingReminderEmail(deps)).toEqual({ affected: 3 });
    // One LPUSH per reminder (3 reminders → 3 enqueues, no dedup at the
    // user level — both participants get reminded).
    expect(redis.lpush).toHaveBeenCalledTimes(3);
    // The UPDATE's trade-id array is the DEDUPED set so we don't stamp
    // the same trade twice. Without dedup, a popular trade with many
    // participants would burn through pg parameter limits over time.
    const updateParams = dbQuery.mock.calls[1]![1] as [string[]];
    expect(updateParams[0].sort()).toEqual(['t-1', 't-2']);
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
  it('returns { affected: N }', async () => {
    const { deps } = makeDeps([{ rowCount: 10 }]);
    expect(await truncateAuditLogIps(deps)).toEqual({ affected: 10 });
  });
});

describe('purgeEmailVerificationTokens', () => {
  it('returns { affected: N }', async () => {
    const { deps } = makeDeps([{ rowCount: 5 }]);
    expect(await purgeEmailVerificationTokens(deps)).toEqual({ affected: 5 });
  });
});

describe('purgeStalePushSubscriptions', () => {
  it('returns { affected: N }', async () => {
    const { deps } = makeDeps([{ rowCount: 3 }]);
    expect(await purgeStalePushSubscriptions(deps)).toEqual({ affected: 3 });
  });
});

describe('purgeOldShareTokens', () => {
  it('returns { affected: N }', async () => {
    const { deps } = makeDeps([{ rowCount: 7 }]);
    expect(await purgeOldShareTokens(deps)).toEqual({ affected: 7 });
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
  it('issues one DB query AND one Redis ping (both required to confirm reachability)', async () => {
    const { deps, dbQuery, redis } = makeDeps([{ rows: [] }]);
    expect(await syntheticCanaryWarmAurora(deps)).toEqual({ affected: 1 });
    // Canary passes only if BOTH dependencies are touched; one-sided
    // success would mask a half-broken environment.
    expect(dbQuery).toHaveBeenCalledTimes(1);
    expect(redis.ping).toHaveBeenCalledTimes(1);
  });
});
