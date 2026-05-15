import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { verifyToken } from '../../middleware/auth.js';
import type { JwtPayload } from '../../middleware/auth.js';
import { env } from '../../env.js';
import * as tradeService from '../../services/trade.service.js';
import * as messagingService from '../../services/messaging.service.js';

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const TradeItemSchema = z.object({
  variantId:  z.string().uuid(),
  direction:  z.enum(['offer', 'want']),
  quantity:   z.number().int().positive().default(1),
});

const CreateTradeBody = z.object({
  recipientId:      z.string().uuid(),
  items:            z.array(TradeItemSchema).min(0),
  offerCash:        z.number().int().min(0).default(0),
  wantCash:         z.number().int().min(0).default(0),
  requesterAlbumId: z.string().uuid().optional(),
});

const CounterTradeBody = z.object({
  items:     z.array(TradeItemSchema).min(0),
  offerCash: z.number().int().min(0).default(0),
  wantCash:  z.number().int().min(0).default(0),
});

const SendMessageBody = z.object({
  body: z.string().min(1).max(2000),
});

// ─── Route registration ───────────────────────────────────────────────────────

export async function tradeRoutes(fastify: FastifyInstance): Promise<void> {
  const prefix = '/api/v1/trade';

  /**
   * GET /api/v1/trade/matches
   * Find users with mutual sticker overlap for trading.
   */
  fastify.get(
    `${prefix}/matches`,
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Trade'],
        summary: 'Get trade match suggestions for a user album',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          required: ['albumId'],
          properties: { albumId: { type: 'string' } },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    user_id:        { type: 'string' },
                    username:       { type: 'string' },
                    display_name:   { type: 'string', nullable: true },
                    avatar_url:     { type: 'string', nullable: true },
                    mutual_overlap: { type: 'integer' },
                    they_have:      { type: 'array', items: { type: 'string' } },
                    you_have:       { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { albumId } = request.query as { albumId?: string };
      if (!albumId) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'albumId is required.' });
      }
      try {
        const items = await tradeService.getTradeMatches(
          fastify.db, fastify.redis, request.userId!, albumId
        );
        return reply.status(200).send({ items });
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({ statusCode: e.statusCode ?? 500, error: 'Internal Server Error', message: e.message });
      }
    }
  );

  /**
   * GET /api/v1/trade/requests
   * List trades for the authenticated user.
   */
  fastify.get(
    `${prefix}/requests`,
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Trade'],
        summary: 'List trade requests for the authenticated user',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['pending', 'accepted', 'declined', 'cancelled', 'completed', 'expired'],
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { status } = request.query as { status?: string };
      try {
        const items = await tradeService.listTrades(fastify.db, request.userId!, status);
        return reply.status(200).send({ items });
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({ statusCode: e.statusCode ?? 500, error: 'Internal Server Error', message: e.message });
      }
    }
  );

  /**
   * POST /api/v1/trade/requests
   * Create a new trade request.
   */
  fastify.post(
    `${prefix}/requests`,
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Trade'],
        summary: 'Create a new trade request',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['recipientId', 'items'],
          properties: {
            recipientId:      { type: 'string' },
            requesterAlbumId: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                required: ['variantId', 'direction'],
                properties: {
                  variantId: { type: 'string' },
                  direction: { type: 'string', enum: ['offer', 'want'] },
                  quantity:  { type: 'integer', minimum: 1, default: 1 },
                },
              },
            },
            offerCash: { type: 'integer', minimum: 0, default: 0 },
            wantCash:  { type: 'integer', minimum: 0, default: 0 },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: { id: { type: 'string' } },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = CreateTradeBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }
      try {
        const result = await tradeService.createTrade(
          fastify.db,
          fastify.redis,
          request.userId!,
          parsed.data.recipientId,
          parsed.data.items,
          parsed.data.offerCash,
          parsed.data.wantCash,
          parsed.data.requesterAlbumId
        );
        return reply.status(201).send(result);
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({ statusCode: e.statusCode ?? 500, error: 'Internal Server Error', message: e.message });
      }
    }
  );

  /**
   * GET /api/v1/trade/requests/:id
   * Get full trade detail.
   */
  fastify.get(
    `${prefix}/requests/:id`,
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Trade'],
        summary: 'Get trade detail',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      try {
        const trade = await tradeService.getTrade(fastify.db, request.userId!, id);
        if (!trade) {
          return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Trade not found.' });
        }
        return reply.status(200).send(trade);
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({ statusCode: e.statusCode ?? 500, error: 'Internal Server Error', message: e.message });
      }
    }
  );

  /**
   * POST /api/v1/trade/requests/:id/accept
   */
  fastify.post(
    `${prefix}/requests/:id/accept`,
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Trade'],
        summary: 'Accept a pending trade request',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        response: { 204: { type: 'null' } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      try {
        await tradeService.acceptTrade(fastify.db, fastify.redis, request.userId!, id);
        return reply.status(204).send();
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({ statusCode: e.statusCode ?? 500, error: 'Internal Server Error', message: e.message });
      }
    }
  );

  /**
   * POST /api/v1/trade/requests/:id/decline
   */
  fastify.post(
    `${prefix}/requests/:id/decline`,
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Trade'],
        summary: 'Decline a pending trade request',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        response: { 204: { type: 'null' } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      try {
        await tradeService.declineTrade(fastify.db, fastify.redis, request.userId!, id);
        return reply.status(204).send();
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({ statusCode: e.statusCode ?? 500, error: 'Internal Server Error', message: e.message });
      }
    }
  );

  /**
   * POST /api/v1/trade/requests/:id/counter
   */
  fastify.post(
    `${prefix}/requests/:id/counter`,
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Trade'],
        summary: 'Submit a counter offer for a trade',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['items'],
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                required: ['variantId', 'direction'],
                properties: {
                  variantId: { type: 'string' },
                  direction: { type: 'string', enum: ['offer', 'want'] },
                  quantity:  { type: 'integer', minimum: 1, default: 1 },
                },
              },
            },
            offerCash: { type: 'integer', minimum: 0, default: 0 },
            wantCash:  { type: 'integer', minimum: 0, default: 0 },
          },
        },
        response: { 204: { type: 'null' } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const parsed = CounterTradeBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }
      try {
        await tradeService.counterTrade(
          fastify.db, fastify.redis, request.userId!, id, parsed.data.items,
          parsed.data.offerCash, parsed.data.wantCash
        );
        return reply.status(204).send();
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({ statusCode: e.statusCode ?? 500, error: 'Internal Server Error', message: e.message });
      }
    }
  );

  /**
   * POST /api/v1/trade/requests/:id/cancel
   */
  fastify.post(
    `${prefix}/requests/:id/cancel`,
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Trade'],
        summary: 'Cancel a pending or accepted trade',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        response: { 204: { type: 'null' } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      try {
        await tradeService.cancelTrade(fastify.db, fastify.redis, request.userId!, id);
        return reply.status(204).send();
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({ statusCode: e.statusCode ?? 500, error: 'Internal Server Error', message: e.message });
      }
    }
  );

  /**
   * POST /api/v1/trade/requests/:id/complete
   */
  fastify.post(
    `${prefix}/requests/:id/complete`,
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Trade'],
        summary: 'Complete an accepted trade and update inventories',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        response: { 204: { type: 'null' } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      try {
        await tradeService.completeTrade(fastify.db, fastify.redis, request.userId!, id);
        return reply.status(204).send();
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({ statusCode: e.statusCode ?? 500, error: 'Internal Server Error', message: e.message });
      }
    }
  );

  /**
   * GET /api/v1/trade/requests/:id/messages
   * Paginated message history for a trade.
   */
  fastify.get(
    `${prefix}/requests/:id/messages`,
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Trade'],
        summary: 'Get messages for a trade',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        querystring: {
          type: 'object',
          properties: {
            cursor: { type: 'string' },
            limit:  { type: 'integer', minimum: 1, maximum: 200, default: 50 },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { cursor, limit } = request.query as { cursor?: string; limit?: number };
      try {
        const result = await messagingService.getMessages(
          fastify.db, request.userId!, id, cursor, limit
        );
        return reply.status(200).send(result);
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({ statusCode: e.statusCode ?? 500, error: 'Internal Server Error', message: e.message });
      }
    }
  );

  /**
   * POST /api/v1/trade/requests/:id/messages
   * Send a message on a trade.
   */
  fastify.post(
    `${prefix}/requests/:id/messages`,
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Trade'],
        summary: 'Send a message on a trade',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['body'],
          properties: { body: { type: 'string', minLength: 1, maxLength: 2000 } },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const parsed = SendMessageBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }
      const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
      try {
        const message = await messagingService.sendMessage(
          fastify.db, fastify.redis, request.userId!, id, parsed.data.body, idempotencyKey
        );
        return reply.status(201).send(message);
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({ statusCode: e.statusCode ?? 500, error: 'Internal Server Error', message: e.message });
      }
    }
  );

  /**
   * GET /api/v1/trade/requests/:id/stream
   * SSE stream for real-time trade events.
   * Does NOT use verifyToken preHandler because EventSource can't set custom headers.
   * Token is accepted via Authorization header OR ?token= query param.
   */
  fastify.get(
    `${prefix}/requests/:id/stream`,
    {
      // No preHandler — manual token verification below
      schema: {
        tags: ['Trade'],
        summary: 'SSE stream for real-time trade events',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        querystring: {
          type: 'object',
          properties: { token: { type: 'string' } },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id: tradeId } = request.params as { id: string };

      // ── Manual token verification ──────────────────────────────────────────
      const rawToken =
        (request.headers.authorization?.startsWith('Bearer ')
          ? request.headers.authorization.slice(7)
          : null) ??
        (request.query as { token?: string }).token ??
        null;

      if (!rawToken) {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Missing token. Provide Authorization header or ?token= query param.',
        });
      }

      let userId: string;
      try {
        const payload = jwt.verify(rawToken, env.JWT_SECRET) as JwtPayload;
        if (payload.type !== 'access') throw new Error('Invalid token type.');
        userId = payload.sub;
      } catch {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or expired token.' });
      }

      // ── Verify participant ─────────────────────────────────────────────────
      const { rows: tradeRows } = await fastify.db.query<{
        requester_id: string;
        recipient_id: string;
      }>(
        `SELECT requester_id, recipient_id FROM trade_requests WHERE id = $1`,
        [tradeId]
      );

      if (tradeRows.length === 0) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Trade not found.' });
      }

      const trade = tradeRows[0]!;
      if (trade.requester_id !== userId && trade.recipient_id !== userId) {
        return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'You are not a participant in this trade.' });
      }

      // ── Set SSE headers ────────────────────────────────────────────────────
      // reply.raw.writeHead bypasses Fastify's response pipeline, so CORS headers
      // set by the plugin in onRequest are never flushed. Carry them over manually.
      const corsOrigin = reply.getHeader('access-control-allow-origin') as string | undefined;
      reply.raw.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
        'X-Accel-Buffering': 'no',
        ...(corsOrigin && { 'Access-Control-Allow-Origin': corsOrigin }),
        'Access-Control-Allow-Credentials': 'true',
      });
      reply.raw.flushHeaders?.();

      // ── Handle Last-Event-ID replay ────────────────────────────────────────
      const lastEventId = request.headers['last-event-id'] as string | undefined;
      if (lastEventId) {
        try {
          const { rows: replayRows } = await fastify.db.query<{
            id: string;
            trade_id: string;
            sender_id: string;
            sender_username: string;
            sender_display_name: string | null;
            body: string;
            sent_at: string;
          }>(
            `SELECT
               tm.id,
               tm.trade_id,
               tm.sender_id,
               u.username      AS sender_username,
               u.display_name  AS sender_display_name,
               tm.body,
               tm.sent_at
             FROM trade_messages tm
             JOIN users u ON u.id = tm.sender_id
             WHERE tm.trade_id = $1
               AND tm.sent_at > (
                 SELECT sent_at FROM trade_messages WHERE id = $2 LIMIT 1
               )
             ORDER BY tm.sent_at ASC
             LIMIT 100`,
            [tradeId, lastEventId]
          );

          for (const msg of replayRows) {
            const data = JSON.stringify(msg);
            reply.raw.write(`event: new_message\nid: ${msg.id}\ndata: ${data}\n\n`);
          }
        } catch {
          // Ignore replay errors — just proceed with live stream
        }
      }

      // ── Subscribe to Redis channel ─────────────────────────────────────────
      // Must use a duplicate client — ioredis blocks subscribed connections
      const subscriber = fastify.redis.duplicate();
      await subscriber.subscribe(`trade:channel:${tradeId}`);

      const heartbeat = setInterval(() => {
        if (!reply.raw.writableEnded) {
          reply.raw.write(': heartbeat\n\n');
        }
      }, 30000);

      subscriber.on('message', (_channel: string, message: string) => {
        if (reply.raw.writableEnded) return;

        try {
          const parsed = JSON.parse(message) as { type: string; id?: string; [key: string]: unknown };
          const eventType = parsed.type ?? 'message';
          const eventId = parsed.id ?? crypto.randomUUID();
          const data = JSON.stringify(parsed);
          reply.raw.write(`event: ${eventType}\nid: ${eventId}\ndata: ${data}\n\n`);
        } catch {
          // Ignore malformed messages
        }
      });

      // ── Cleanup on client disconnect ───────────────────────────────────────
      request.raw.on('close', () => {
        clearInterval(heartbeat);
        subscriber.unsubscribe().catch(() => undefined);
        subscriber.quit().catch(() => undefined);
      });

      // Keep the handler alive — the response ends when the client disconnects
      await new Promise<void>((resolve) => {
        request.raw.on('close', resolve);
        request.raw.on('error', resolve);
      });
    }
  );
}
