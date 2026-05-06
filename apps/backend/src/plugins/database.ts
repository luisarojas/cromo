import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { getPool, getDrizzle } from '../db/index.js';
import { runMigrations } from '../db/migrate.js';

async function databasePlugin(fastify: FastifyInstance): Promise<void> {
  const pool = getPool();

  // Run migrations before anything else
  await runMigrations(pool);

  const drizzleClient = getDrizzle(pool);

  fastify.decorate('db', pool);
  fastify.decorate('drizzle', drizzleClient);

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
