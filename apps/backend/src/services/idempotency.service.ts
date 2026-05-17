import type { Redis } from 'ioredis';
import crypto from 'node:crypto';

const TTL_SECONDS = 24 * 60 * 60;

function key(scope: string, userId: string, idempotencyKey: string): string {
  // Hash so the cache key length is bounded regardless of client input.
  const hash = crypto.createHash('sha256')
    .update(`${userId}:${idempotencyKey}`)
    .digest('hex');
  return `idempotency:${scope}:${hash}`;
}

/**
 * Look up a cached response for a previously-seen idempotency key. Returns
 * null when no key is given or no cached entry exists.
 */
export async function lookupIdempotent<T>(
  redis: Redis,
  scope: string,
  userId: string,
  idempotencyKey: string | undefined,
): Promise<T | null> {
  if (!idempotencyKey) return null;
  const raw = await redis.get(key(scope, userId, idempotencyKey));
  return raw ? (JSON.parse(raw) as T) : null;
}

/**
 * Store the response body so a retry with the same key returns the same
 * result instead of re-executing the side-effect.
 */
export async function storeIdempotent<T>(
  redis: Redis,
  scope: string,
  userId: string,
  idempotencyKey: string | undefined,
  value: T,
): Promise<void> {
  if (!idempotencyKey) return;
  await redis.set(key(scope, userId, idempotencyKey), JSON.stringify(value), 'EX', TTL_SECONDS);
}
