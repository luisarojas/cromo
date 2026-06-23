import { Pool } from 'pg';
import { env } from '../env.js';

// Services consume the raw pg `Pool` directly (or a `PoolClient` inside a
// `withTx` block). The Drizzle schema in schema.ts is still the source of
// truth for migration generation, but the ORM surface is no longer wired up
// at runtime — query writing stays in raw SQL.
let _pool: Pool | null = null;

export function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });

    _pool.on('error', (err) => {
      console.error('Unexpected error on idle pg client', err);
    });
  }
  return _pool;
}
