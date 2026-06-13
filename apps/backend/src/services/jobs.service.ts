import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendRatingReminderEmail,
} from './email.service.js';

// Lightweight Redis-list-backed job queue. We don't need BullMQ's full feature
// set (priorities, repeatables, rate limiting); a single FIFO queue with a
// blocking pop loop is enough to (1) survive process restarts and (2) keep
// SMTP latency off the request path.

const QUEUE_KEY = 'jobs:queue';
const DEAD_KEY = 'jobs:dead';
const MAX_ATTEMPTS = 3;

export type Job =
  | { type: 'email:verify'; email: string; username: string; code: string }
  | { type: 'email:reset'; email: string; username: string; code: string }
  | { type: 'email:rating-reminder'; email: string; username: string; tradeId: string; userId: string };

interface QueueEntry {
  id: string;
  job: Job;
  attempts: number;
  enqueuedAt: string;
}

export async function enqueue(redis: Redis, job: Job): Promise<void> {
  const entry: QueueEntry = {
    id: crypto.randomUUID(),
    job,
    attempts: 0,
    enqueuedAt: new Date().toISOString(),
  };
  await redis.lpush(QUEUE_KEY, JSON.stringify(entry));
}

async function runJob(db: Pool, job: Job): Promise<void> {
  switch (job.type) {
    case 'email:verify':
      await sendVerificationEmail(db, job.email, job.username, job.code);
      return;
    case 'email:reset':
      await sendPasswordResetEmail(db, job.email, job.username, job.code);
      return;
    case 'email:rating-reminder':
      await sendRatingReminderEmail(db, job.email, job.username, job.tradeId, job.userId);
      return;
  }
}

/**
 * startWorker — start a single in-process consumer. The worker uses a
 * dedicated ioredis connection because BRPOP blocks the connection.
 * Returns a stop function for graceful shutdown.
 */
export function startWorker(
  redis: Redis,
  db: Pool,
  log: { info: (msg: string) => void; error: (err: unknown, msg?: string) => void },
): () => Promise<void> {
  // Disable commandTimeout on the consumer: BRPOP intentionally blocks for
  // `blockSeconds` and the inherited 2s timeout fires before it completes.
  // Must use `undefined` (not 0) — ioredis checks `typeof commandTimeout === "number"`,
  // so 0 would set a 0ms timeout and reject every command immediately.
  const consumer = redis.duplicate({ commandTimeout: undefined });
  let running = true;

  async function loop(): Promise<void> {
    while (running) {
      try {
        const result = await consumer.brpop(QUEUE_KEY, 5);
        if (!result) continue;
        const [, raw] = result;
        let entry: QueueEntry;
        try {
          entry = JSON.parse(raw) as QueueEntry;
        } catch (err) {
          log.error(err, `[jobs] malformed entry, discarding`);
          continue;
        }

        try {
          await runJob(db, entry.job);
        } catch (err) {
          entry.attempts += 1;
          if (entry.attempts < MAX_ATTEMPTS) {
            // Re-enqueue at the tail so other jobs aren't starved.
            await redis.lpush(QUEUE_KEY, JSON.stringify(entry));
            log.error(err, `[jobs] ${entry.job.type} failed (attempt ${entry.attempts}), retrying`);
          } else {
            await redis.lpush(DEAD_KEY, JSON.stringify(entry));
            log.error(err, `[jobs] ${entry.job.type} dead-lettered after ${entry.attempts} attempts`);
          }
        }
      } catch (err) {
        // brpop itself failed (connection drop). Wait briefly to avoid a tight
        // loop and let ioredis reconnect.
        log.error(err, `[jobs] worker loop error`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  loop().catch((err) => log.error(err, '[jobs] worker crashed'));

  return async () => {
    running = false;
    await consumer.quit().catch(() => undefined);
  };
}
