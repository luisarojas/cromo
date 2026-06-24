import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { getPool } from '../db/index.js';
import { runMigrations } from '../db/migrate.js';
import { runCatalogSeed } from '../db/seed.js';
import { env } from '../env.js';

const SLOW_QUERY_MS = 100;

async function databasePlugin(fastify: FastifyInstance): Promise<void> {
  const pool = getPool();

  // Run migrations before anything else
  await runMigrations(pool);

  // Reseed the catalog on every boot. Idempotent (ON CONFLICT … DO UPDATE),
  // so every deploy and every ASG scale-out picks up new catalog rows added
  // since the previous boot — fixes the drift mode where adding stickers
  // (e.g. CC regional alternates) was code-only and never reached the dev
  // RDS until someone remembered to `pnpm db:seed --remote` manually.
  // Skipped in tests: the CI test job runs scripts/seed-database.sh up front,
  // and re-running the ~14 files per buildApp() call would add real overhead.
  if (env.NODE_ENV !== 'test') {
    await runCatalogSeed(pool);
  }

  // Wrap pool.query so queries slower than SLOW_QUERY_MS are logged. Pool.query
  // has multiple overloads; we delegate to the original implementation and
  // only measure the wall-clock duration.
  const originalQuery = pool.query.bind(pool);
  (pool as unknown as { query: (...args: unknown[]) => Promise<unknown> }).query = async function patched(
    ...args: unknown[]
  ) {
    const start = process.hrtime.bigint();
    try {
      const result = await (originalQuery as (...a: unknown[]) => Promise<unknown>)(...args);
      const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
      if (ms > SLOW_QUERY_MS) {
        const text = typeof args[0] === 'string'
          ? args[0]
          : (args[0] as { text?: string })?.text ?? '<unknown>';
        fastify.log.warn(
          { ms: Math.round(ms), query: text.slice(0, 200) },
          '[db] slow query',
        );
      }
      return result;
    } catch (err) {
      const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
      const text = typeof args[0] === 'string'
        ? args[0]
        : (args[0] as { text?: string })?.text ?? '<unknown>';
      fastify.log.error(
        { err, ms: Math.round(ms), query: text.slice(0, 200) },
        '[db] query failed',
      );
      throw err;
    }
  };

  fastify.decorate('db', pool);

  fastify.addHook('onClose', async () => {
    fastify.log.info('Closing database pool...');
    await pool.end();
  });

  fastify.log.info('Database pool connected and migrations applied.');
}

// fp ensures the decoration is available to the entire Fastify instance (not scoped)
export const databasePluginWrapped = fp(databasePlugin, {
  name: 'database',
});
