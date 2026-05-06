import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations(pool: Pool): Promise<void> {
  const db = drizzle(pool);
  const migrationsFolder = path.resolve(__dirname, 'migrations');

  console.log('[migrate] Running database migrations from:', migrationsFolder);

  await migrate(db, { migrationsFolder });

  console.log('[migrate] Migrations complete.');
}

// Allow running directly: tsx src/db/migrate.ts
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 1,
  });

  runMigrations(pool)
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
