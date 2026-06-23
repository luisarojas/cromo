import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { getPool } from '../db/index.js';
import { runMigrations } from '../db/migrate.js';

const SLOW_QUERY_MS = 100;

async function databasePlugin(fastify: FastifyInstance): Promise<void> {
  const pool = getPool();

  // Run migrations before anything else
  await runMigrations(pool);

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
