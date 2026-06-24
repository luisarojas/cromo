import type { Pool } from 'pg';
import { env } from '../env.js';
import { getPool } from './index.js';
import { runMigrations } from './migrate.js';
import { runCatalogSeed } from './seed.js';

/**
 * Pre-flight DB setup before Fastify plugins register. Migrations plus the
 * catalog seed can take minutes on a cold database — too slow for avvio's
 * default plugin timeout. buildApp() awaits this once so server.ts and the
 * integration tests share the same startup path.
 */
export async function bootstrapDatabase(pool: Pool = getPool()): Promise<void> {
  await runMigrations(pool);

  // Reseed on every boot. Idempotent (ON CONFLICT … DO UPDATE), so every
  // deploy and ASG scale-out picks up new catalog rows. Skipped in tests: CI
  // runs scripts/seed-database.sh up front; re-running ~14 files per
  // buildApp() call would add real overhead.
  if (env.NODE_ENV !== 'test') {
    await runCatalogSeed(pool);
  }
}
