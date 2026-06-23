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

// ─── Idempotency preHandler ──────────────────────────────────────────────────
//
// A Fastify preHandler that short-circuits the request if the caller previously
// succeeded with the same `Idempotency-Key`. Usage:
//
//   fastify.post('/route', {
//     preHandler: [verifyToken, idempotency(fastify, 'route-scope')],
//   }, handler);
//
// The handler MUST also call storeIdempotent(...) once it has computed the
// response body. We don't auto-store from the preHandler because the route
// handler is the only place that knows whether the operation succeeded — a
// 4xx or 5xx response should NOT poison the cache.

import type { FastifyInstance, FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';

export function idempotency(
  fastify: FastifyInstance,
  scope: string,
): preHandlerHookHandler {
  return async function idempotencyPreHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
    const userId = request.userId;
    if (!idempotencyKey || !userId) return;

    const cached = await lookupIdempotent<unknown>(fastify.redis, scope, userId, idempotencyKey);
    if (cached !== null) {
      reply.header('idempotent-replay', 'true');
      // `return reply` short-circuits the route handler; without it the
      // downstream handler also runs and would double-execute the side effect.
      return reply.status(200).send(cached);
    }
  };
}
