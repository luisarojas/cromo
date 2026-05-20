import type { Pool, PoolClient } from 'pg';

/**
 * Runs `fn` inside a single Postgres transaction, COMMITting on success and
 * ROLLBACKing on any thrown error. The client is always released.
 *
 * Services should reach for this instead of issuing their own BEGIN/COMMIT
 * sequences so that error handling and client-release semantics stay uniform
 * across the codebase.
 */
export async function withTx<T>(
  db: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
