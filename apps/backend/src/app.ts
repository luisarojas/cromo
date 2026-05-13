import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';

import { env } from './env.js';
import { corsPlugin } from './plugins/cors.js';
import { helmetPlugin } from './plugins/helmet.js';
import { swaggerPlugin } from './plugins/swagger.js';
import { databasePluginWrapped } from './plugins/database.js';
import { redisPluginWrapped } from './plugins/redis.js';

import { healthRoutes } from './routes/v1/health.js';
import { versionRoutes } from './routes/v1/version.js';
import { authRoutes } from './routes/v1/auth.js';
import { stickersRoutes } from './routes/v1/stickers.js';
import { collectionRoutes } from './routes/v1/collection.js';
import { adminRoutes } from './routes/v1/admin.js';
import { usersRoutes } from './routes/v1/users.js';

export async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger:
      env.NODE_ENV === 'test'
        ? false
        : {
            level: env.NODE_ENV === 'production' ? 'info' : 'debug',
            transport:
              env.NODE_ENV !== 'production'
                ? { target: 'pino-pretty', options: { colorize: true } }
                : undefined,
          },
    trustProxy: true,
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  // ── Security plugins ─────────────────────────────────────────────────────
  await helmetPlugin(fastify);
  await corsPlugin(fastify);

  // ── Cookie support (required for refresh token) ──────────────────────────
  await fastify.register(fastifyCookie, {
    secret: env.JWT_SECRET, // Signs cookies for integrity
  });

  // ── Multipart (file uploads) ──────────────────────────────────────────────
  await fastify.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });

  // ── Rate limiting ─────────────────────────────────────────────────────────
  await fastify.register(fastifyRateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)}s.`,
    }),
  });

  // ── Swagger / OpenAPI ─────────────────────────────────────────────────────
  if (env.NODE_ENV !== 'test') {
    await swaggerPlugin(fastify);
  }

  // ── Database & Redis (run migrations before routes) ───────────────────────
  await fastify.register(databasePluginWrapped);
  await fastify.register(redisPluginWrapped);

  // ── Routes ────────────────────────────────────────────────────────────────
  await fastify.register(healthRoutes);
  await fastify.register(versionRoutes);
  await fastify.register(authRoutes);
  await fastify.register(stickersRoutes);
  await fastify.register(collectionRoutes);
  await fastify.register(adminRoutes);
  await fastify.register(usersRoutes);

  // ── Global error handler ──────────────────────────────────────────────────
  fastify.setErrorHandler<FastifyError>((error, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    fastify.log.error(error);
    reply.status(statusCode).send({
      statusCode,
      error: error.name ?? 'Internal Server Error',
      message:
        env.NODE_ENV === 'production' && statusCode === 500
          ? 'An unexpected error occurred.'
          : error.message,
    });
  });

  // ── 404 handler ───────────────────────────────────────────────────────────
  fastify.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: 'Route not found.',
    });
  });

  return fastify;
}
