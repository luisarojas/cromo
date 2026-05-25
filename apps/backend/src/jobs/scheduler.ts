// node-cron scheduler. Reads JOB_CATALOG, registers each job's cron, and
// checks the per-job feature flag before invoking the handler. Failure
// counters reset on success — three consecutive failures triggers the
// alert path described in docs/architecture/observability.md §20.3.

import cron, { type ScheduledTask } from 'node-cron';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { JOB_CATALOG } from './catalog.js';
import type { JobDefinition, JobLogger } from './types.js';

export interface SchedulerOptions {
  db: Pool;
  redis: Redis;
  log: JobLogger;
  /** Set to true when running in Phase B (cloud). Defaults to false. */
  cloud?: boolean;
}

const FAILURE_THRESHOLD = 3;

async function isJobEnabled(db: Pool, flagKey: string): Promise<boolean> {
  try {
    const { rows } = await db.query<{ enabled: boolean }>(
      `SELECT enabled FROM feature_flags WHERE key = $1`,
      [flagKey],
    );
    // Missing flag = enabled. Required flag rows are added in 06_feature_flags.sql;
    // if a future job hasn't been seeded yet we'd rather run it than silently skip.
    return rows[0]?.enabled ?? true;
  } catch {
    return true;
  }
}

function buildJobRunner(
  def: JobDefinition,
  opts: SchedulerOptions,
  failureCounts: Map<string, number>,
): () => Promise<void> {
  return async () => {
    const enabled = await isJobEnabled(opts.db, def.flagKey);
    if (!enabled) {
      opts.log.info(`[jobs] ${def.name} skipped (flag ${def.flagKey} disabled)`);
      return;
    }
    const startedAt = Date.now();
    try {
      const result = await def.handler({ db: opts.db, redis: opts.redis, log: opts.log });
      failureCounts.set(def.name, 0);
      opts.log.info(`[jobs] ${def.name} ok`, {
        durationMs: Date.now() - startedAt,
        affected: result.affected,
        ...result.details,
      });
    } catch (err) {
      const failures = (failureCounts.get(def.name) ?? 0) + 1;
      failureCounts.set(def.name, failures);
      opts.log.error(err, `[jobs] ${def.name} failed`, {
        durationMs: Date.now() - startedAt,
        consecutiveFailures: failures,
      });
      if (failures >= FAILURE_THRESHOLD) {
        opts.log.error(err, `[jobs] ${def.name} reached ${FAILURE_THRESHOLD} consecutive failures — alert`, {
          alert: true,
          job: def.name,
        });
      }
    }
  };
}

/**
 * registerJobs — wires every catalog entry into node-cron. Returns a `stop`
 * function that tears every task down (used in tests + graceful shutdown).
 */
export function registerJobs(opts: SchedulerOptions): () => void {
  const tasks: ScheduledTask[] = [];
  const failureCounts = new Map<string, number>();

  for (const def of JOB_CATALOG) {
    if (def.cloudOnly && !opts.cloud) continue;
    if (!cron.validate(def.cron)) {
      opts.log.error(new Error(`invalid cron expression`), `[jobs] cannot register ${def.name}: invalid cron '${def.cron}'`);
      continue;
    }
    const task = cron.schedule(def.cron, buildJobRunner(def, opts, failureCounts), {
      scheduled: true,
      timezone: 'UTC',
    });
    tasks.push(task);
    opts.log.info(`[jobs] registered ${def.name} (cron: ${def.cron})`);
  }

  return () => {
    for (const t of tasks) {
      try { t.stop(); } catch { /* ignore */ }
    }
  };
}
