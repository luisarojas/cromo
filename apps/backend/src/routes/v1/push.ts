import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { verifyToken } from '../../middleware/auth.js';
import { isFeatureFlagEnabled } from '../../services/trust-safety.service.js';
import {
  saveSubscription,
  removeSubscription,
} from '../../services/push.service.js';
import { env } from '../../env.js';

const FEATURE_KEY = 'FEATURE_WEB_PUSH';

const SubscribeBody = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const UnsubscribeBody = z.object({
  endpoint: z.string().url(),
});

async function guardFeature(fastify: FastifyInstance, reply: FastifyReply): Promise<boolean> {
  const enabled = await isFeatureFlagEnabled(fastify.db, FEATURE_KEY);
  if (!enabled) {
    reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Feature not available.' });
    return false;
  }
  return true;
}

export async function pushRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/push/vapid-public-key
   * Public endpoint — the frontend needs this to call PushManager.subscribe().
   * Returns 404 when the feature is off or VAPID is not configured (degraded mode).
   */
  fastify.get('/api/v1/push/vapid-public-key', async (_request, reply) => {
    if (!await guardFeature(fastify, reply)) return;
    if (!env.VAPID_PUBLIC_KEY) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Push is not configured on this server.',
      });
    }
    return reply.status(200).send({ publicKey: env.VAPID_PUBLIC_KEY });
  });

  /**
   * POST /api/v1/push/subscribe
   * Persist a browser-generated subscription for the current user. Idempotent —
   * re-submitting the same endpoint refreshes last_seen_at.
   */
  fastify.post(
    '/api/v1/push/subscribe',
    { preHandler: [verifyToken] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!await guardFeature(fastify, reply)) return;
      const parsed = SubscribeBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }
      await saveSubscription(fastify.db, request.userId!, {
        endpoint: parsed.data.endpoint,
        keys: parsed.data.keys,
        userAgent: request.headers['user-agent'],
      });
      return reply.status(204).send();
    },
  );

  /**
   * POST /api/v1/push/unsubscribe
   * Forget a subscription. Fires when the browser fails to renew the
   * subscription, or the user opts out.
   */
  fastify.post(
    '/api/v1/push/unsubscribe',
    { preHandler: [verifyToken] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!await guardFeature(fastify, reply)) return;
      const parsed = UnsubscribeBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }
      await removeSubscription(fastify.db, request.userId!, parsed.data.endpoint);
      return reply.status(204).send();
    },
  );
}
