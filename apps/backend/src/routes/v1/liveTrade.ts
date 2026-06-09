import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import { verifyToken } from '../../middleware/auth.js';
import * as liveTradeService from '../../services/liveTrade.service.js';
import { writeSSEEvent, writeSSEHeartbeat } from '../../utils/sse.js';

// Live trade session routes. The two-collector room is namespaced inside
// the existing trade bus by using channel `trade:channel:live:<sessionId>`
// — the bus's pSubscribe pattern picks it up automatically, so this file
// doesn't have to spin up a new Redis subscriber.

export async function liveTradeRoutes(fastify: FastifyInstance): Promise<void> {

  /**
   * POST /api/v1/trade/live
   * Auth — create a new session. The caller becomes the host. The token
   * returned in the response is also embedded in `inviteUrl` for sharing
   * directly without a second round-trip.
   */
  fastify.post(
    '/api/v1/trade/live',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Trade'],
        summary: 'Create a live trade session',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = await liveTradeService.createSession(fastify.db, request.userId!);
      return reply.status(201).send({ session });
    }
  );

  /**
   * GET /api/v1/trade/live/:token
   * Auth — returns session metadata. The caller doesn't have to be a
   * participant yet (they may be the about-to-join guest), but they must
   * be authenticated so we know who they are when they later POST /join.
   */
  fastify.get(
    '/api/v1/trade/live/:token',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Trade'],
        summary: 'Get live trade session by invite token',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['token'],
          properties: { token: { type: 'string' } },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { token } = request.params as { token: string };
      const session = await liveTradeService.getSessionByToken(fastify.db, token);
      if (!session) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Session not found.' });
      }
      return reply.status(200).send({ session });
    }
  );

  /**
   * POST /api/v1/trade/live/:token/join
   * Auth — mark the caller as the guest. Idempotent if the caller is
   * already the guest of the same session.
   */
  fastify.post(
    '/api/v1/trade/live/:token/join',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Trade'],
        summary: 'Join a live trade session as the guest',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { token } = request.params as { token: string };
      const session = await liveTradeService.joinSession(fastify.db, token, request.userId!);
      // Broadcast a presence event so the host's open SSE stream sees the
      // guest arrive without a manual reload.
      await liveTradeService.appendAction(
        fastify.db,
        fastify.redis,
        session.id,
        request.userId!,
        'message',
        { kind: 'system', text: `${session.guest?.displayName ?? session.guest?.username ?? 'Someone'} joined` },
      );
      return reply.status(200).send({ session });
    }
  );

  /**
   * GET /api/v1/trade/live/:token/actions
   * Auth — paginated history of the session log. Used by the client to
   * cold-load before opening the SSE stream so we don't have to replay
   * the entire history on every reconnect.
   */
  fastify.get(
    '/api/v1/trade/live/:token/actions',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Trade'],
        summary: 'List actions for a live trade session',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { token } = request.params as { token: string };
      const session = await liveTradeService.requireParticipant(
        fastify.db, { token }, request.userId!,
      );
      const items = await liveTradeService.listActions(fastify.db, session.id);
      return reply.status(200).send({ items });
    }
  );

  /**
   * POST /api/v1/trade/live/:token/actions
   * Auth — append an action and broadcast it via the bus.
   */
  fastify.post(
    '/api/v1/trade/live/:token/actions',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Trade'],
        summary: 'Send an action in a live trade session',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['actionType'],
          properties: {
            actionType: { type: 'string' },
            payload:    { type: 'object', additionalProperties: true },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { token } = request.params as { token: string };
      const body = request.body as { actionType: string; payload?: Record<string, unknown> };
      const session = await liveTradeService.requireParticipant(
        fastify.db, { token }, request.userId!,
      );
      if (session.status === 'closed' || session.status === 'expired') {
        return reply.status(410).send({ statusCode: 410, error: 'Gone', message: 'Session is no longer active.' });
      }
      const action = await liveTradeService.appendAction(
        fastify.db,
        fastify.redis,
        session.id,
        request.userId!,
        body.actionType,
        body.payload ?? {},
      );
      return reply.status(201).send({ action });
    }
  );

  /**
   * GET /api/v1/trade/live/:token/stream
   * Auth — SSE stream of session events. Reuses the trade bus's pattern
   * subscription via the "live:<sessionId>" virtual trade ID.
   */
  fastify.get(
    '/api/v1/trade/live/:token/stream',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Trade'],
        summary: 'SSE stream for a live trade session',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { token } = request.params as { token: string };
      const session = await liveTradeService.requireParticipant(
        fastify.db, { token }, request.userId!,
      );

      // ── Set SSE headers (matches /api/v1/trade/:id/stream) ────────────────
      const corsHeaders: Record<string, string> = {};
      for (const h of [
        'access-control-allow-origin',
        'access-control-allow-credentials',
        'access-control-expose-headers',
        'vary',
      ]) {
        const v = reply.getHeader(h);
        if (typeof v === 'string') corsHeaders[h] = v;
      }
      reply.raw.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
        'X-Accel-Buffering': 'no',
        ...corsHeaders,
      });
      reply.raw.flushHeaders?.();

      // Replay any actions that landed after the client's last seen id.
      const lastEventId = request.headers['last-event-id'] as string | undefined;
      if (lastEventId) {
        try {
          const replay = await liveTradeService.listActions(fastify.db, session.id, lastEventId);
          for (const a of replay) {
            writeSSEEvent(reply, 'action', a, a.id);
          }
        } catch {
          // ignore replay errors
        }
      }

      const SSE_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
      let idleTimer: NodeJS.Timeout | null = null;
      const resetIdleTimer = (): void => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          if (!reply.raw.writableEnded) reply.raw.end();
        }, SSE_IDLE_TIMEOUT_MS);
      };
      resetIdleTimer();

      const heartbeat = setInterval(() => writeSSEHeartbeat(reply), 30000);

      const unsubscribe = fastify.tradeBus.subscribe(
        liveTradeService.liveSessionChannel(session.id),
        (message: string) => {
          if (reply.raw.writableEnded) return;
          try {
            const parsed = JSON.parse(message) as { type: string; id?: string; [key: string]: unknown };
            const eventType = parsed.type ?? 'action';
            const eventId = parsed.id ?? crypto.randomUUID();
            writeSSEEvent(reply, eventType, parsed, eventId);
            resetIdleTimer();
          } catch {
            // ignore malformed messages
          }
        },
      );

      const cleanup = (): void => {
        clearInterval(heartbeat);
        if (idleTimer) clearTimeout(idleTimer);
        unsubscribe();
      };
      request.raw.on('close', cleanup);

      await new Promise<void>((resolve) => {
        request.raw.on('close', resolve);
        request.raw.on('error', resolve);
      });
    }
  );
}
