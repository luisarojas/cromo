#!/usr/bin/env tsx
// One-off CLI runner: `pnpm --filter @cromo/backend job <name>` invokes a
// single scheduled job synchronously and exits with the appropriate code.
// Used by ops to force a job to run outside its cadence (e.g., after a fix)
// and by the runbook's smoke checks.

import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { env } from '../env.js';
import { findJob, JOB_CATALOG } from './catalog.js';
import type { JobLogger } from './types.js';

const consoleLog: JobLogger = {
  info: (msg, fields) => console.log(msg, fields ?? ''),
  warn: (msg, fields) => console.warn(msg, fields ?? ''),
  error: (err, msg, fields) => console.error(msg ?? '', err, fields ?? ''),
};

async function main(): Promise<void> {
  const name = process.argv[2];
  if (!name) {
    console.error('Usage: pnpm --filter @cromo/backend job <name>');
    console.error('Available jobs:');
    for (const j of JOB_CATALOG) {
      console.error(`  ${j.name.padEnd(38)} cron=${j.cron}${j.cloudOnly ? '  (cloud-only)' : ''}`);
    }
    process.exit(2);
  }

  const def = findJob(name);
  if (!def) {
    console.error(`No such job: ${name}`);
    process.exit(2);
  }

  const db = new Pool({ connectionString: env.DATABASE_URL, max: 2 });
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 });

  try {
    const result = await def.handler({ db, redis, log: consoleLog });
    console.log(`[jobs] ${def.name} ok`, result);
  } catch (err) {
    console.error(`[jobs] ${def.name} failed`, err);
    process.exitCode = 1;
  } finally {
    await db.end().catch(() => undefined);
    redis.disconnect();
  }
}

main();
