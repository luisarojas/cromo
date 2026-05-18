import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';

import { env } from './env.js';
import { camelizeKeys } from './utils/casing.js';
import { corsPlugin } from './plugins/cors.js';
import { helmetPlugin } from './plugins/helmet.js';
import { swaggerPlugin } from './plugins/swagger.js';
import { databasePluginWrapped } from './plugins/database.js';
import { redisPluginWrapped } from './plugins/redis.js';
import { tradeBusPluginWrapped } from './plugins/tradeBus.js';
import { startWorker } from './services/jobs.service.js';

import { healthRoutes } from './routes/v1/health.js';
import { versionRoutes } from './routes/v1/version.js';
import { authRoutes } from './routes/v1/auth.js';
import { stickersRoutes } from './routes/v1/stickers.js';
import { collectionRoutes } from './routes/v1/collection.js';
import { adminRoutes } from './routes/v1/admin.js';
import { usersRoutes } from './routes/v1/users.js';
import { albumsRoutes } from './routes/v1/albums.js';
import { tradeRoutes } from './routes/v1/trade.js';
import { sharingRoutes } from './routes/v1/sharing.js';
import { profileRoutes } from './routes/v1/profiles.js';

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

  // ── Response serializer: convert snake_case keys → camelCase ──────────────
  // The DB uses snake_case columns; Drizzle exposes camelCase TS fields; but the
  // legacy raw-SQL services emit snake_case row objects. This serializer
  // normalises every response payload to camelCase so the wire format matches
  // the canonical types in @stickfolio/shared. Response schemas in routes are
  // now documentation only (fast-json-stringify is bypassed).
  // setSerializerCompiler runs for routes with a response schema;
  // setReplySerializer is the fallback for routes without one (otherwise
  // Fastify's default JSON.stringify would leak snake_case).
  fastify.setSerializerCompiler(() => (data) => JSON.stringify(camelizeKeys(data)));
  fastify.setReplySerializer((payload) => JSON.stringify(camelizeKeys(payload)));

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
    // The refresh endpoint is gated by an HTTP-only cookie so the global
    // limit adds no security value but does cause spurious 429s when other
    // API calls saturate the window.
    allowList: (request) => request.url === '/api/v1/auth/refresh',
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
  await fastify.register(tradeBusPluginWrapped);

  // ── Background job worker ────────────────────────────────────────────────
  // Single in-process consumer drains Redis-backed job queue. Tests skip the
  // worker since they never enqueue, and SMTP transport would dangle.
  if (env.NODE_ENV !== 'test') {
    const stopWorker = startWorker(fastify.redis, {
      info: (msg) => fastify.log.info(msg),
      error: (err, msg) => fastify.log.error({ err }, msg ?? '[jobs]'),
    });
    fastify.addHook('onClose', async () => { await stopWorker(); });
  }

  // ── Routes ────────────────────────────────────────────────────────────────
  await fastify.register(healthRoutes);
  await fastify.register(versionRoutes);
  await fastify.register(authRoutes);
  await fastify.register(stickersRoutes);
  await fastify.register(collectionRoutes);
  await fastify.register(adminRoutes);
  await fastify.register(usersRoutes);
  await fastify.register(albumsRoutes);
  await fastify.register(tradeRoutes);
  await fastify.register(sharingRoutes);
  await fastify.register(profileRoutes);

  // ── Global error handler ──────────────────────────────────────────────────
  fastify.setErrorHandler<FastifyError>((error, request, reply) => {
    const statusCode = error.statusCode ?? 500;
    // Bind the request id so production logs can be correlated with the
    // X-Request-ID response header the client sees.
    request.log.error({ err: error, reqId: request.id, statusCode }, 'request failed');
    reply.header('x-request-id', request.id).status(statusCode).send({
      statusCode,
      error: error.name ?? 'Internal Server Error',
      message:
        env.NODE_ENV === 'production' && statusCode === 500
          ? 'An unexpected error occurred.'
          : error.message,
      requestId: request.id,
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
