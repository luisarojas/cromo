import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import jwt from 'jsonwebtoken';

import { env } from './env.js';
import { bootstrapDatabase } from './db/bootstrap.js';
import { getPool } from './db/index.js';
import { camelizeKeys } from './utils/casing.js';
import { corsPlugin } from './plugins/cors.js';
import { helmetPlugin } from './plugins/helmet.js';
import { swaggerPlugin } from './plugins/swagger.js';
import { databasePluginWrapped } from './plugins/database.js';
import { redisPluginWrapped } from './plugins/redis.js';
import { tradeBusPluginWrapped } from './plugins/tradeBus.js';
import { liveTradeBusPluginWrapped } from './plugins/liveTradeBus.js';
import { startWorker } from './services/jobs.service.js';
import { registerJobs } from './jobs/scheduler.js';

import { healthRoutes } from './routes/v1/health.js';
import { versionRoutes } from './routes/v1/version.js';
import { authRoutes } from './routes/v1/auth.js';
import { stickersRoutes } from './routes/v1/stickers.js';
import { collectionRoutes } from './routes/v1/collection.js';
import { adminRoutes } from './routes/v1/admin.js';
import { usersRoutes } from './routes/v1/users.js';
import { albumsRoutes } from './routes/v1/albums.js';
import { tradeRoutes } from './routes/v1/trade.js';
import { tradeInvitesRoutes } from './routes/v1/trade-invites.js';
import { liveTradeRoutes } from './routes/v1/live-trade.js';
import { sharingRoutes } from './routes/v1/sharing.js';
import { profileRoutes } from './routes/v1/profiles.js';
import { trustSafetyRoutes } from './routes/v1/trust-safety.js';
import { scanRoutes } from './routes/v1/scan.js';
import { pushRoutes } from './routes/v1/push.js';
import { unsubscribeRoutes } from './routes/v1/unsubscribe.js';
import { startSesPoller } from './services/ses-poller.service.js';

export async function buildApp(): Promise<FastifyInstance> {
  // Migrations + catalog seed run here, not inside databasePlugin — cold boot
  // can take minutes and exceeds avvio's default plugin timeout.
  await bootstrapDatabase(getPool());

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
  // Services issue raw SQL via the pg Pool and return Postgres-shaped snake_case
  // row objects. This serializer normalises every response payload to camelCase
  // so the wire format matches the canonical types in @cromo/shared. Response
  // schemas in routes are now documentation only (fast-json-stringify is
  // bypassed). setSerializerCompiler runs for routes with a response schema;
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

  // ── Rate-limit key hydration ──────────────────────────────────────────────
  // `verifyToken` populates `request.userId` as a route-level preHandler, but
  // @fastify/rate-limit runs in onRequest — before any preHandler. Without this
  // hook every `keyGenerator: (req) => req.userId ?? req.ip` (here and on the
  // per-route configs in trade.ts / live-trade.ts) would silently fall through
  // to IP, and authenticated traffic would share one bucket per IP. We decode
  // (not verify) the bearer token here purely to derive a bucket key; real auth
  // still happens at `verifyToken`. A forged sub only buys an attacker the same
  // bucket isolation they could get by rotating IPs, so this is a key-shape
  // change, not a trust change.
  fastify.addHook('onRequest', (request, _reply, done) => {
    const auth = request.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      try {
        const decoded = jwt.decode(auth.slice(7)) as { sub?: string } | null;
        if (decoded?.sub) request.userId = decoded.sub;
      } catch {
        // Malformed header — leave userId unset, rate-limit falls back to IP.
      }
    }
    done();
  });

  // ── Rate limiting ─────────────────────────────────────────────────────────
  await fastify.register(fastifyRateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    // Bucket authenticated traffic per-user so one user's page churn (or a
    // shared dev IP) can't exhaust the global limit. Anonymous traffic still
    // groups by IP. Per-route configs reuse the same pattern.
    keyGenerator: (request) => request.userId ?? request.ip,
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
  // The catalog seed (run in bootstrapDatabase) bumps stickers.updated_at
  // via trigger, but the `cromo:catalog_version` Redis key (5-min TTL) keeps
  // serving the pre-seed value until it expires — and every `/stickers?v=…`
  // URL is keyed off that, so browsers + the CDN keep loading the old
  // snapshot for up to 5 min after a deploy that added/updated catalog rows.
  // Dropping the key here means the next /version probe recomputes from the
  // post-seed MAX(updated_at) + COUNT and clients see fresh data immediately.
  if (env.NODE_ENV !== 'test') {
    await fastify.redis.del('cromo:catalog_version');
  }
  await fastify.register(tradeBusPluginWrapped);
  await fastify.register(liveTradeBusPluginWrapped);

  // ── Background job worker ────────────────────────────────────────────────
  // Single in-process consumer drains Redis-backed job queue. Tests skip the
  // worker since they never enqueue, and SMTP transport would dangle.
  if (env.NODE_ENV !== 'test') {
    const stopWorker = startWorker(fastify.redis, fastify.db, {
      info: (msg) => fastify.log.info(msg),
      error: (err, msg) => fastify.log.error({ err }, msg ?? '[jobs]'),
    });
    fastify.addHook('onClose', async () => { await stopWorker(); });

    // SES bounce/complaint poller — long-polls the SQS queue populated by
    // SES via SNS. No-op when SES_QUEUE_URL is unset (local dev).
    const stopSesPoller = startSesPoller(fastify.db, {
      info: (msg, fields) => fastify.log.info(fields ?? {}, msg),
      warn: (msg, fields) => fastify.log.warn(fields ?? {}, msg),
      error: (err, msg) => fastify.log.error({ err }, msg ?? '[ses-poller]'),
    });
    fastify.addHook('onClose', async () => { await stopSesPoller(); });
  }

  // ── Scheduled jobs (node-cron, §34 catalog) ──────────────────────────────
  // Skipped in tests and when JOBS_MODE=disabled (default for local dev to
  // keep iteration fast). Set JOBS_MODE=enabled in .env.local to exercise.
  if (env.NODE_ENV !== 'test' && env.JOBS_MODE === 'enabled') {
    const stopScheduler = registerJobs({
      db: fastify.db,
      redis: fastify.redis,
      log: {
        info:  (msg, fields) => fastify.log.info(fields ?? {}, msg),
        warn:  (msg, fields) => fastify.log.warn(fields ?? {}, msg),
        error: (err, msg, fields) => fastify.log.error({ err, ...(fields ?? {}) }, msg ?? '[jobs]'),
      },
      cloud: env.NODE_ENV === 'production',
    });
    fastify.addHook('onClose', async () => { stopScheduler(); });
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
  await fastify.register(tradeInvitesRoutes);
  await fastify.register(liveTradeRoutes);
  await fastify.register(sharingRoutes);
  await fastify.register(profileRoutes);
  await fastify.register(trustSafetyRoutes);
  await fastify.register(scanRoutes);
  await fastify.register(pushRoutes);
  await fastify.register(unsubscribeRoutes);

  // ── Global error handler ──────────────────────────────────────────────────
  // Standard HTTP labels per status code, so every route returns a consistent
  // `error` field without each handler having to map it manually.
  const ERROR_LABELS: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    410: 'Gone',
    415: 'Unsupported Media Type',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
  };
  fastify.setErrorHandler<FastifyError>((error, request, reply) => {
    const statusCode = error.statusCode ?? 500;
    // Bind the request id so production logs can be correlated with the
    // X-Request-ID response header the client sees.
    request.log.error({ err: error, reqId: request.id, statusCode }, 'request failed');
    reply.header('x-request-id', request.id).status(statusCode).send({
      statusCode,
      error: ERROR_LABELS[statusCode] ?? 'Internal Server Error',
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
