import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations(pool: Pool): Promise<void> {
  const schemaPath = path.resolve(__dirname, 'schema.sql');

  console.log('[migrate] Applying schema from:', schemaPath);

  const sql = await readFile(schemaPath, 'utf8');
  await pool.query(sql);

  console.log('[migrate] Schema applied.');
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
