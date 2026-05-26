import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolves to .../src/db/migrations in dev (ts-source) and .../dist/db/migrations
// in the production image — the Dockerfile copies the migrations dir into
// dist/ so the same relative path works either way.
const MIGRATIONS_FOLDER = path.resolve(__dirname, 'migrations');

export async function runMigrations(pool: Pool): Promise<void> {
  console.log('[migrate] Applying Drizzle migrations from:', MIGRATIONS_FOLDER);

  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  console.log('[migrate] Migrations applied.');
}

// Drops public + drizzle schemas so the next migrate run starts from scratch.
// Dev-only — refuses to touch a DB whose URL doesn't look local.
async function resetSchema(pool: Pool): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw new Error('[migrate] --reset is disabled in production');
  }
  console.log('[migrate] DROPPING public + drizzle schemas (destructive!)');
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
  await pool.query('CREATE SCHEMA public');
}

// Allow running directly: tsx src/db/migrate.ts [--reset]
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const shouldReset = process.argv.includes('--reset');
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 1,
  });

  (async () => {
    if (shouldReset) await resetSchema(pool);
    await runMigrations(pool);
  })()
    .then(() => {
      console.log('[migrate] Done.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[migrate] Failed:', err);
      process.exit(1);
    })
    .finally(() => pool.end());
}
