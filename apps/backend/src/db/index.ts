import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';
import { env } from '../env.js';

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

export function getDrizzle(pool: Pool) {
  return drizzle(pool, { schema });
}

export type Drizzle = ReturnType<typeof getDrizzle>;
