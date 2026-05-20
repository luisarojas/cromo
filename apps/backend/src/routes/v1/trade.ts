import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { verifyToken } from '../../middleware/auth.js';
import { env } from '../../env.js';
import { getTradeMatches } from '../../services/trade-matching.service.js';
import {
  acceptTrade,
  cancelTrade,
  completeTrade,
  counterTrade,
  createTrade,
  declineTrade,
  editTrade,
  getTrade,
  listTrades,
} from '../../services/trade-requests.service.js';
import * as messagingService from '../../services/messaging.service.js';
import { lookupIdempotent, storeIdempotent } from '../../services/idempotency.service.js';
import { writeSSEEvent, writeSSEHeartbeat } from '../../utils/sse.js';

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
      config: {
        // /trade/matches runs a heavy CTE that's only cached for 2 min.
        // Cap per-user request rate so a logged-in client can't hammer the DB.
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
          keyGenerator: (request) => request.userId ?? request.ip,
        },
      },
      schema: {
        tags: ['Trade'],
        summary: 'Get trade match suggestions for a user album',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          required: ['albumId'],
          properties: {
            albumId: { type: 'string' },
            cursor:  { type: 'string' },
            limit:   { type: 'integer', minimum: 1, maximum: 200, default: 50 },
          },
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
                    cities:         { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, placeId: { type: 'integer' } } } },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const q = request.query as { albumId?: string; cursor?: string; limit?: number };
      if (!q.albumId) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'albumId is required.' });
      }
      const page = await getTradeMatches(
        fastify.db, fastify.redis, request.userId!, q.albumId,
        { cursor: q.cursor, limit: q.limit },
      );
      return reply.status(200).send(page);
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
            cursor: { type: 'string' },
            limit:  { type: 'integer', minimum: 1, maximum: 200, default: 50 },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { status, cursor, limit } = request.query as {
        status?: string; cursor?: string; limit?: number;
      };
      const page = await listTrades(fastify.db, request.userId!, { status, cursor, limit });
      return reply.status(200).send(page);
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
      const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
      const cached = await lookupIdempotent<{ id: string }>(
        fastify.redis, 'trade:create', request.userId!, idempotencyKey,
      );
      if (cached) return reply.status(201).send(cached);

      const result = await createTrade(
        fastify.db,
        fastify.redis,
        request.userId!,
        parsed.data.recipientId,
        parsed.data.items,
        parsed.data.offerCash,
        parsed.data.wantCash,
        parsed.data.requesterAlbumId
      );
      await storeIdempotent(fastify.redis, 'trade:create', request.userId!, idempotencyKey, result);
      return reply.status(201).send(result);
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
      const trade = await getTrade(fastify.db, request.userId!, id);
      if (!trade) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Trade not found.' });
      }
      return reply.status(200).send(trade);
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
      await acceptTrade(fastify.db, fastify.redis, request.userId!, id);
      return reply.status(204).send();
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
      await declineTrade(fastify.db, fastify.redis, request.userId!, id);
      return reply.status(204).send();
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
      await counterTrade(
        fastify.db, fastify.redis, request.userId!, id, parsed.data.items,
        parsed.data.offerCash, parsed.data.wantCash
      );
      return reply.status(204).send();
    }
  );

  /**
   * POST /api/v1/trade/requests/:id/edit
   * Requester edits their pending counter-offer in place (no role swap, no counter_count bump).
   */
  fastify.post(
    `${prefix}/requests/:id/edit`,
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Trade'],
        summary: 'Edit a pending counter-offer',
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
      await editTrade(
        fastify.db, fastify.redis, request.userId!, id, parsed.data.items,
        parsed.data.offerCash, parsed.data.wantCash
      );
      return reply.status(204).send();
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
      await cancelTrade(fastify.db, fastify.redis, request.userId!, id);
      return reply.status(204).send();
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
      await completeTrade(fastify.db, fastify.redis, request.userId!, id);
      return reply.status(204).send();
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
      const result = await messagingService.getMessages(
        fastify.db, request.userId!, id, cursor, limit
      );
      return reply.status(200).send(result);
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
      const message = await messagingService.sendMessage(
        fastify.db, fastify.redis, request.userId!, id, parsed.data.body, idempotencyKey
      );
      return reply.status(201).send(message);
    }
  );

  /**
   * POST /api/v1/trade/requests/:id/stream-ticket
   * Mints a single-use, short-lived ticket for the SSE stream below. EventSource
   * cannot send custom headers, and putting the access token in the query
   * string would leak it into proxy logs / browser history / Referer headers.
   * Clients call this endpoint with a normal Bearer token, then open the SSE
   * stream with ?ticket=… instead.
   */
  const SSE_TICKET_TTL_SECONDS = 30;
  fastify.post(
    `${prefix}/requests/:id/stream-ticket`,
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Trade'],
        summary: 'Mint a single-use SSE ticket for a trade stream',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id: tradeId } = request.params as { id: string };
      const userId = request.userId!;

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

      const ticket = crypto.randomBytes(24).toString('base64url');
      await fastify.redis.set(
        `sse:trade:ticket:${ticket}`,
        JSON.stringify({ userId, tradeId }),
        'EX',
        SSE_TICKET_TTL_SECONDS,
      );
      return reply.status(201).send({ ticket, expiresIn: SSE_TICKET_TTL_SECONDS });
    }
  );

  /**
   * GET /api/v1/trade/requests/:id/stream
   * SSE stream for real-time trade events.
   * EventSource can't set custom headers, so authentication is done with a
   * single-use ticket obtained from POST :id/stream-ticket. A standard
   * Authorization header is also accepted for non-EventSource clients.
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
          properties: { ticket: { type: 'string' } },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id: tradeId } = request.params as { id: string };

      // ── Auth: header (non-browser clients) or single-use ticket ────────────
      let userId: string | null = null;
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        try {
          const payload = jwt.verify(authHeader.slice(7), env.JWT_SECRET) as { sub: string; type: string };
          if (payload.type === 'access') userId = payload.sub;
        } catch { /* fall through to ticket */ }
      }

      if (!userId) {
        const ticket = (request.query as { ticket?: string }).ticket;
        if (!ticket || !/^[A-Za-z0-9_-]{1,128}$/.test(ticket)) {
          return reply.status(401).send({
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Missing or invalid SSE ticket.',
          });
        }
        // GETDEL consumes the ticket atomically — single use.
        const raw = await fastify.redis.getdel(`sse:trade:ticket:${ticket}`);
        if (!raw) {
          return reply.status(401).send({
            statusCode: 401,
            error: 'Unauthorized',
            message: 'SSE ticket is invalid or expired.',
          });
        }
        try {
          const parsed = JSON.parse(raw) as { userId: string; tradeId: string };
          if (parsed.tradeId !== tradeId) {
            return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Ticket does not match this trade.' });
          }
          userId = parsed.userId;
        } catch {
          return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Malformed SSE ticket.' });
        }
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
      // reply.raw.writeHead bypasses Fastify's response pipeline, so CORS
      // headers set by the plugin in onRequest are never flushed. Carry every
      // CORS header from the prepared reply over to the raw socket so changes
      // to the CORS plugin (origin / credentials / exposed headers) flow here
      // without a code edit.
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

      // ── Handle Last-Event-ID replay ────────────────────────────────────────
      const lastEventId = request.headers['last-event-id'] as string | undefined;
      if (lastEventId) {
        try {
          const { rows: replayRows } = await fastify.db.query<{
            id: string;
            trade_id: string;
            sender_id: string | null;
            sender_username: string | null;
            sender_display_name: string | null;
            body: string;
            sent_at: string;
            is_system: boolean;
          }>(
            `SELECT
               tm.id,
               tm.trade_id,
               tm.sender_id,
               u.username      AS sender_username,
               u.display_name  AS sender_display_name,
               tm.body,
               tm.sent_at,
               tm.is_system
             FROM trade_messages tm
             LEFT JOIN users u ON u.id = tm.sender_id
             WHERE tm.trade_id = $1
               AND tm.sent_at > (
                 SELECT sent_at FROM trade_messages WHERE id = $2 LIMIT 1
               )
             ORDER BY tm.sent_at ASC
             LIMIT 100`,
            [tradeId, lastEventId]
          );

          for (const msg of replayRows) {
            writeSSEEvent(reply, 'new_message', msg, msg.id);
          }
        } catch {
          // Ignore replay errors — just proceed with live stream
        }
      }

      // ── Subscribe via shared trade bus ─────────────────────────────────────
      // The tradeBus plugin holds a single Redis pSubscribe connection and
      // fans messages out in-process. This replaces the old pattern of
      // `fastify.redis.duplicate()` per SSE connection, which allocated one
      // Redis client per open trade-detail tab.
      const SSE_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
      let idleTimer: NodeJS.Timeout | null = null;
      const resetIdleTimer = (): void => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          if (!reply.raw.writableEnded) reply.raw.end();
        }, SSE_IDLE_TIMEOUT_MS);
      };
      resetIdleTimer();

      const heartbeat = setInterval(() => writeSSEHeartbeat(reply), 30000);

      const unsubscribe = fastify.tradeBus.subscribe(tradeId, (message: string) => {
        if (reply.raw.writableEnded) return;
        try {
          const parsed = JSON.parse(message) as { type: string; id?: string; [key: string]: unknown };
          const eventType = parsed.type ?? 'message';
          const eventId = parsed.id ?? crypto.randomUUID();
          writeSSEEvent(reply, eventType, parsed, eventId);
          resetIdleTimer();
        } catch {
          // Ignore malformed messages
        }
      });

      // ── Cleanup on client disconnect ───────────────────────────────────────
      const cleanup = (): void => {
        clearInterval(heartbeat);
        if (idleTimer) clearTimeout(idleTimer);
        unsubscribe();
      };
      request.raw.on('close', cleanup);

      // Keep the handler alive — the response ends when the client disconnects
      await new Promise<void>((resolve) => {
        request.raw.on('close', resolve);
        request.raw.on('error', resolve);
      });
    }
  );
}
