import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { verifyToken } from '../../middleware/auth.js';
import { checkSoftBan } from '../../middleware/ban-check.js';
import { env } from '../../env.js';
import {
  getTradeMatches,
  matchAgainstUserAlbum,
  matchPair,
} from '../../services/trade-matching.service.js';
import {
  deleteThirdPartyDraft as deleteThirdPartyDraftService,
  listThirdPartyDrafts,
  upsertThirdPartyDraft,
} from '../../services/third-party-drafts.service.js';
import {
  acceptTrade,
  cancelTrade,
  completeTrade,
  counterTrade,
  createTrade,
  declineTrade,
  editTrade,
  getTrade,
  listTradeHistory,
} from '../../services/trade-requests.service.js';
import * as messagingService from '../../services/messaging.service.js';
import { recordThirdPartyCompletion } from '../../services/live-trade.service.js';
import { lookupIdempotent, storeIdempotent } from '../../services/idempotency.service.js';
import { writeSSEEvent, writeSSEHead, writeSSEHeartbeat } from '../../utils/sse.js';

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

// External-list inputs are short hand-written/photographed lists. 500 codes
// is well above any realistic single-person list and bounds the catalog query
// cost on the unauthenticated /match-pair endpoint.
// Variant tokens are short snake_case identifiers (e.g. "red", "gold_crumple",
// "extra_purple"). The bound is the longest current token plus headroom for
// future ones — anything beyond that is almost certainly garbage.
const VariantTokenSchema = z.string().min(1).max(32);
const QuantitySchema = z.number().int().min(1).max(99);

const ListItemSchema = z.object({
  albumCode: z.string().min(1).max(16),
  variantToken: VariantTokenSchema.nullish(),
  quantity: QuantitySchema.default(1),
});
const ItemListSchema = z.array(ListItemSchema).max(500);

// Normalise Zod's `variantToken: string | null | undefined` down to the
// service's `string | null` contract.
function asListItems(items: { albumCode: string; variantToken?: string | null; quantity: number }[]) {
  return items.map((i) => ({
    albumCode: i.albumCode,
    variantToken: i.variantToken ?? null,
    quantity: i.quantity,
  }));
}

// albumTypeKey lands in a Redis cache-key suffix and a SQL parameter. The
// allow-list keeps an attacker from filling the cache namespace with garbage
// keys (e.g. `*`, `..`, slashes) and rules out any character that could be
// misread by downstream code expecting an identifier shape.
const AlbumTypeKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9_]+$/, 'albumTypeKey must match /^[a-z0-9_]+$/');

// Per-trade variant weight overrides. The caller's view of what's fair;
// merged on top of the global VARIANT_SCARCITY defaults inside the service.
// Bounded the same way variantToken keys are bounded; positive finite values
// only (the service enforces all three constraints again on receive).
const VariantWeightsSchema = z
  .record(
    VariantTokenSchema.regex(/^[a-z0-9_]+$/),
    z.number().positive().finite().max(100_000),
  )
  .refine((m) => Object.keys(m).length <= 64, {
    message: 'At most 64 variant weight overrides per trade.',
  });

const MatchAgainstMeBody = z.object({
  albumId: z.string().uuid(),
  theirOffered: ItemListSchema.default([]),
  theirWanted: ItemListSchema.default([]),
  variantWeights: VariantWeightsSchema.optional(),
});

const MatchPairBody = z.object({
  albumTypeKey: AlbumTypeKeySchema.default('fifa_world_cup_2026'),
  a: z.object({
    offered: ItemListSchema.default([]),
    wanted: ItemListSchema.default([]),
  }),
  b: z.object({
    offered: ItemListSchema.default([]),
    wanted: ItemListSchema.default([]),
  }),
  variantWeights: VariantWeightsSchema.optional(),
});

const ThirdPartyDeltaSchema = z.object({
  stickerVariantId: z.string().uuid(),
  quantity:         z.number().int().positive(),
});

const ThirdPartyCompleteBody = z.object({
  albumId:     z.string().uuid(),
  // Display-only — null/empty = the trade is logged with no partner name.
  partnerName: z.string().trim().max(80).optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  gave:        z.array(ThirdPartyDeltaSchema).default([]),
  received:    z.array(ThirdPartyDeltaSchema).default([]),
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
            albumId:  { type: 'string' },
            cursor:   { type: 'string' },
            limit:    { type: 'integer', minimum: 1, maximum: 200, default: 50 },
            // When 'true', candidates outside the user's search radius are
            // included (still ranked lower via the distance penalty).
            // Default false applies the configured radius as a hard filter.
            showAll:  { type: 'boolean', default: false },
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
      const q = request.query as { albumId?: string; cursor?: string; limit?: number; showAll?: boolean | string };
      if (!q.albumId) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'albumId is required.' });
      }
      // querystring may stringify booleans depending on client; accept both.
      const showAll = q.showAll === true || q.showAll === 'true';
      const page = await getTradeMatches(
        fastify.db, fastify.redis, request.userId!, q.albumId,
        { cursor: q.cursor, limit: q.limit, applyRadius: !showAll },
      );
      return reply.status(200).send(page);
    }
  );

  /**
   * POST /api/v1/trade/match-against-me
   * Ephemeral matching of a third-party's offered/wanted list against the
   * logged-in user's own collection. No persistence.
   */
  fastify.post(
    `${prefix}/match-against-me`,
    {
      preHandler: [verifyToken],
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
          keyGenerator: (request) => request.userId ?? request.ip,
        },
      },
      schema: {
        tags: ['Trade'],
        summary: 'Match a third-party list against the requester\'s collection',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = MatchAgainstMeBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400, error: 'Bad Request', message: parsed.error.message,
        });
      }
      try {
        const result = await matchAgainstUserAlbum(
          fastify.db, request.userId!, parsed.data.albumId,
          {
            theirOffered: asListItems(parsed.data.theirOffered),
            theirWanted: asListItems(parsed.data.theirWanted),
            variantWeights: parsed.data.variantWeights,
          },
        );
        return reply.status(200).send(result);
      } catch (err) {
        const e = err as { statusCode?: number; message?: string };
        return reply.status(e.statusCode ?? 500).send({
          statusCode: e.statusCode ?? 500,
          error: e.statusCode === 404 ? 'Not Found' : 'Internal Server Error',
          message: e.message ?? 'Failed to compute match.',
        });
      }
    },
  );

  /**
   * POST /api/v1/trade/match-pair
   * Public, anonymous-friendly matching of two ephemeral lists (Person A and
   * Person B). Returns the optimal sticker exchange between them.
   */
  fastify.post(
    `${prefix}/match-pair`,
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
          keyGenerator: (request) => request.userId ?? request.ip,
        },
      },
      schema: {
        tags: ['Trade'],
        summary: 'Match two ephemeral sticker lists (anonymous flow)',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = MatchPairBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400, error: 'Bad Request', message: parsed.error.message,
        });
      }
      const result = await matchPair(fastify.db, {
        a: {
          offered: asListItems(parsed.data.a.offered),
          wanted:  asListItems(parsed.data.a.wanted),
        },
        b: {
          offered: asListItems(parsed.data.b.offered),
          wanted:  asListItems(parsed.data.b.wanted),
        },
        albumTypeKey: parsed.data.albumTypeKey,
        variantWeights: parsed.data.variantWeights,
      });
      return reply.status(200).send(result);
    },
  );

  /**
   * POST /api/v1/trade/third-party/complete
   * Record a trade the user just made with someone off-platform: write the
   * deltas to user_stickers and persist a completion row so it shows up in
   * trade history alongside live and async trades.
   */
  fastify.post(
    `${prefix}/third-party/complete`,
    {
      preHandler: [verifyToken, checkSoftBan(fastify)],
      schema: {
        tags: ['Trade'],
        summary: 'Record an off-platform trade executed with a third party',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = ThirdPartyCompleteBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400, error: 'Bad Request', message: parsed.error.message,
        });
      }
      const result = await recordThirdPartyCompletion(fastify.db, fastify.redis, {
        userId: request.userId!,
        albumId: parsed.data.albumId,
        partnerName: parsed.data.partnerName,
        gave: parsed.data.gave,
        received: parsed.data.received,
      });
      return reply.status(201).send(result);
    },
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
      // The endpoint name predates live trades; for compatibility it still
      // serves both feeds — `listTradeHistory` returns a discriminated union.
      const page = await listTradeHistory(fastify.db, request.userId!, { status, cursor, limit });
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
      preHandler: [verifyToken, checkSoftBan(fastify)],
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
      preHandler: [verifyToken, checkSoftBan(fastify)],
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
      preHandler: [verifyToken, checkSoftBan(fastify)],
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
   *
   * Coverage note: this handler drags the aggregate coverage gate down (see
   * vitest.config.ts). Unit tests can't exercise the raw-socket lifecycle —
   * heartbeat interval, idle timer, Last-Event-ID replay, redis-fanout
   * subscription/unsubscribe — without an in-process EventSource client.
   * The trade Playwright spec covers the user-visible side; deeper streaming
   * tests are an open follow-up.
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

      writeSSEHead(reply);

      // ── Handle Last-Event-ID replay ────────────────────────────────────────
      const lastEventId = request.headers['last-event-id'] as string | undefined;
      if (lastEventId) {
        try {
          const replayRows = await messagingService.getMessagesAfter(
            fastify.db,
            tradeId,
            lastEventId,
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

  // ─── Third-party trade drafts ─────────────────────────────────────────────
  // Parked in-progress trade plans from the Third-Party tab. CRUD only —
  // there's no counterparty to notify and no Redis session to coordinate.

  const SaveDraftBody = z.object({
    id: z.string().uuid().nullish(),
    albumId: z.string().uuid(),
    partnerName: z.string().trim().max(80).optional()
      .transform((v) => (v && v.length > 0 ? v : null)),
    theirOffered: ItemListSchema.default([]),
    theirWanted: ItemListSchema.default([]),
    selectionIReceive: z.array(z.string().uuid()).max(500).default([]),
    selectionIGive: z.array(z.string().uuid()).max(500).default([]),
    iReceiveCashCents: z.number().int().min(0).max(10_000_000).default(0),
    iGiveCashCents: z.number().int().min(0).max(10_000_000).default(0),
  });

  fastify.post(
    `${prefix}/third-party/drafts`,
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Trade'],
        summary: 'Save or update a third-party trade draft',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = SaveDraftBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400, error: 'Bad Request', message: parsed.error.message,
        });
      }
      try {
        const draft = await upsertThirdPartyDraft(fastify.db, {
          id: parsed.data.id ?? null,
          userId: request.userId!,
          albumId: parsed.data.albumId,
          partnerName: parsed.data.partnerName ?? null,
          theirOffered: asListItems(parsed.data.theirOffered),
          theirWanted: asListItems(parsed.data.theirWanted),
          selectionIReceive: parsed.data.selectionIReceive,
          selectionIGive: parsed.data.selectionIGive,
          iReceiveCashCents: parsed.data.iReceiveCashCents,
          iGiveCashCents: parsed.data.iGiveCashCents,
        });
        return reply.status(parsed.data.id ? 200 : 201).send(draft);
      } catch (err) {
        const e = err as { statusCode?: number; message?: string };
        return reply.status(e.statusCode ?? 500).send({
          statusCode: e.statusCode ?? 500,
          error: e.statusCode === 404 ? 'Not Found' : 'Internal Server Error',
          message: e.message ?? 'Failed to save draft.',
        });
      }
    },
  );

  fastify.get(
    `${prefix}/third-party/drafts`,
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Trade'],
        summary: 'List the requester\'s third-party trade drafts',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const items = await listThirdPartyDrafts(fastify.db, request.userId!);
      return reply.status(200).send({ items });
    },
  );

  fastify.delete(
    `${prefix}/third-party/drafts/:id`,
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Trade'],
        summary: 'Delete a third-party trade draft',
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
      await deleteThirdPartyDraftService(fastify.db, request.userId!, id);
      return reply.status(204).send();
    },
  );
}
