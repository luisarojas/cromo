import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken, assertAccess } from '../../middleware/auth.js';
import * as collectionService from '../../services/collection.service.js';
import * as albumsService from '../../services/albums.service.js';
import { validateImageBuffer, saveAvatar } from '../../services/upload.service.js';
import { lookupIdempotent, storeIdempotent } from '../../services/idempotency.service.js';

async function resolveAlbum(
  fastify: FastifyInstance,
  reply: FastifyReply,
  userId: string,
  albumId?: string
): Promise<string | null> {
  const resolved = await albumsService.resolveAlbumId(fastify.db, userId, albumId);
  if (!resolved) {
    reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: albumId ? 'Album not found.' : 'No default album found.',
    });
    return null;
  }
  return resolved;
}

export async function collectionRoutes(fastify: FastifyInstance): Promise<void> {

  /**
   * GET /api/v1/users/:userId/collection
   *
   * Album-view filtering surface for the UI. The collection endpoint accepts
   * the static facets (team, group, type, variant). Status-based filtering
   * (have / missing / duplicate) is split across sibling endpoints:
   *
   *   - have       → GET /api/v1/users/:userId/collection           (this route)
   *   - missing    → GET /api/v1/users/:userId/missing
   *   - duplicate  → GET /api/v1/users/:userId/duplicates
   *
   * Album page-range filtering (`pageFrom`/`pageTo`) is applied client-side
   * after a `bundle=page` fetch so the UI can combine it with the other
   * facets without re-querying. The server-side query intentionally does not
   * accept page-range — sticker_album_pages is per-edition and joining it on
   * every paginated read would regress the hot path.
   */
  fastify.get(
    '/api/v1/users/:userId/collection',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Collection'],
        summary: "List a user's sticker collection with optional filters",
        description:
          'Filters: team (FIFA code), group (A–L), type (player|badge|team_photo|intro|coca_cola_special|extra), variant. Use bundle=page for the single-call album-view payload (items + stats + filter options). Status filtering: see /missing and /duplicates for the other two statuses; album page-range is filtered client-side.',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string' } },
        },
        querystring: {
          type: 'object',
          properties: {
            albumId: { type: 'string' },
            team:    { type: 'string', maxLength: 8 },
            group:   { type: 'string', maxLength: 2 },
            type:    { type: 'string', maxLength: 32 },
            variant: { type: 'string', maxLength: 32 },
            cursor:  { type: 'integer' },
            limit:   { type: 'integer', minimum: 1, maximum: 1000, default: 50 },
            bundle:  { type: 'string', enum: ['page'] },
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
                    user_sticker_id:    { type: 'string' },
                    sticker_variant_id: { type: 'string' },
                    variant_type:       { type: 'string' },
                    quantity:           { type: 'integer' },
                    trade_hidden:       { type: 'boolean' },
                    trade_forced:       { type: 'boolean' },
                    sticker_id:         { type: 'string' },
                    number:             { type: 'integer' },
                    album_code:         { type: 'string' },
                    player_name:        { type: 'string', nullable: true },
                    position:           { type: 'string', nullable: true },
                    sticker_type:       { type: 'string' },
                    notes:              { type: 'string', nullable: true },
                    team_name:          { type: 'string', nullable: true },
                    fifa_code:          { type: 'string', nullable: true },
                    group_name:         { type: 'string', nullable: true },
                    team_pages:         { type: 'object', nullable: true, additionalProperties: { type: 'array', items: { type: 'integer' } } },
                  },
                },
              },
              nextCursor: { type: 'integer', nullable: true },
              total:      { type: 'integer' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.params as { userId: string };
      if (!assertAccess(request, reply, userId, 'collection')) return;

      const q = request.query as {
        albumId?: string; team?: string; group?: string; type?: string;
        variant?: string; cursor?: number; limit?: number;
        bundle?: 'page';
      };

      const albumId = await resolveAlbum(fastify, reply, userId, q.albumId);
      if (!albumId) return;

      // Opt-in bundled response: items + stats + filter options + extra-copies
      // count in a single round trip. Used by the album detail page so the UI
      // can stop running three useMemo passes over the full catalog.
      if (q.bundle === 'page') {
        const result = await collectionService.getCollectionPage(
          fastify.db, fastify.redis, userId, albumId, q,
        );
        return reply.status(200).send(result);
      }

      const result = await collectionService.getCollection(
        fastify.db, fastify.redis, userId, albumId, q
      );
      return reply.status(200).send(result);
    }
  );

  /**
   * GET /api/v1/users/:userId/collection/stats
   */
  fastify.get(
    '/api/v1/users/:userId/collection/stats',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Collection'],
        summary: 'Get completion statistics for a user collection',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string' } },
        },
        querystring: {
          type: 'object',
          properties: { albumId: { type: 'string' } },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              total:      { type: 'integer' },
              owned:      { type: 'integer' },
              missing:    { type: 'integer' },
              duplicates: { type: 'integer' },
              percentage: { type: 'number' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.params as { userId: string };
      if (!assertAccess(request, reply, userId, 'collection')) return;

      const q = request.query as { albumId?: string };
      const albumId = await resolveAlbum(fastify, reply, userId, q.albumId);
      if (!albumId) return;

      const stats = await collectionService.getStats(fastify.db, fastify.redis, userId, albumId);
      return reply.status(200).send(stats);
    }
  );

  /**
   * GET /api/v1/users/:userId/missing
   */
  fastify.get(
    '/api/v1/users/:userId/missing',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Collection'],
        summary: 'List stickers missing from a user collection',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string' } },
        },
        querystring: {
          type: 'object',
          properties: {
            albumId: { type: 'string' },
            team:   { type: 'string' },
            group:  { type: 'string' },
            cursor: { type: 'integer' },
            limit:  { type: 'integer', minimum: 1, maximum: 1000, default: 50 },
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
                    id:              { type: 'string' },
                    number:          { type: 'integer' },
                    album_code:      { type: 'string' },
                    player_name:     { type: 'string', nullable: true },
                    position:        { type: 'string', nullable: true },
                    sticker_type:    { type: 'string' },
                    is_foil:         { type: 'boolean' },
                    notes:           { type: 'string', nullable: true },
                    team_name:       { type: 'string', nullable: true },
                    fifa_code:       { type: 'string', nullable: true },
                    group_name:      { type: 'string', nullable: true },
                    base_variant_id: { type: 'string', nullable: true },
                    team_pages:      { type: 'object', nullable: true, additionalProperties: { type: 'array', items: { type: 'integer' } } },
                  },
                },
              },
              nextCursor: { type: 'integer', nullable: true },
              total:      { type: 'integer' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.params as { userId: string };
      if (!assertAccess(request, reply, userId, 'collection')) return;

      const q = request.query as {
        albumId?: string; team?: string; group?: string; cursor?: number; limit?: number;
      };

      const albumId = await resolveAlbum(fastify, reply, userId, q.albumId);
      if (!albumId) return;

      const result = await collectionService.getMissing(
        fastify.db, fastify.redis, userId, albumId, q
      );
      return reply.status(200).send(result);
    }
  );

  /**
   * GET /api/v1/users/:userId/duplicates
   */
  fastify.get(
    '/api/v1/users/:userId/duplicates',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Collection'],
        summary: 'List duplicate stickers in a user collection (quantity > 1)',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string' } },
        },
        querystring: {
          type: 'object',
          properties: {
            albumId: { type: 'string' },
            cursor: { type: 'integer' },
            limit:  { type: 'integer', minimum: 1, maximum: 1000, default: 50 },
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
                    user_sticker_id:    { type: 'string' },
                    sticker_variant_id: { type: 'string' },
                    variant_type:       { type: 'string' },
                    quantity:           { type: 'integer' },
                    trade_hidden:       { type: 'boolean' },
                    trade_forced:       { type: 'boolean' },
                    sticker_id:         { type: 'string' },
                    number:             { type: 'integer' },
                    album_code:         { type: 'string' },
                    player_name:        { type: 'string', nullable: true },
                    team_name:          { type: 'string', nullable: true },
                    fifa_code:          { type: 'string', nullable: true },
                  },
                },
              },
              nextCursor: { type: 'integer', nullable: true },
              total:      { type: 'integer' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.params as { userId: string };
      if (!assertAccess(request, reply, userId, 'collection')) return;

      const q = request.query as { albumId?: string; cursor?: number; limit?: number };
      const albumId = await resolveAlbum(fastify, reply, userId, q.albumId);
      if (!albumId) return;

      const result = await collectionService.getDuplicates(
        fastify.db, fastify.redis, userId, albumId, q.cursor, q.limit
      );
      return reply.status(200).send(result);
    }
  );

  /**
   * POST /api/v1/users/:userId/stickers
   */
  fastify.post(
    '/api/v1/users/:userId/stickers',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Collection'],
        summary: 'Add a sticker variant to a user collection',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['variantId'],
          properties: {
            variantId: { type: 'string' },
            albumId:   { type: 'string' },
            quantity:  { type: 'integer', minimum: 1, default: 1 },
          },
        },
        response: { 204: { type: 'null', description: 'Sticker added successfully' } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.params as { userId: string };
      if (!assertAccess(request, reply, userId, 'collection')) return;

      const { variantId, albumId: bodyAlbumId, quantity } = request.body as {
        variantId: string; albumId?: string; quantity?: number;
      };

      const albumId = await resolveAlbum(fastify, reply, userId, bodyAlbumId);
      if (!albumId) return;

      const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
      const cached = await lookupIdempotent<{ ok: true }>(
        fastify.redis, 'collection:add', userId, idempotencyKey,
      );
      if (cached) return reply.status(204).send();

      await collectionService.addSticker(
        fastify.db, fastify.redis, userId, albumId, variantId, quantity
      );
      await storeIdempotent(fastify.redis, 'collection:add', userId, idempotencyKey, { ok: true });
      return reply.status(204).send();
    }
  );

  /**
   * PATCH /api/v1/users/:userId/stickers/:variantId
   */
  fastify.patch(
    '/api/v1/users/:userId/stickers/:variantId',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Collection'],
        summary: 'Update the quantity of a sticker variant (0 removes it)',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId', 'variantId'],
          properties: {
            userId:    { type: 'string' },
            variantId: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: { albumId: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['quantity'],
          properties: { quantity: { type: 'integer', minimum: 0 } },
        },
        response: { 204: { type: 'null', description: 'Sticker updated successfully' } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId, variantId } = request.params as { userId: string; variantId: string };
      if (!assertAccess(request, reply, userId, 'collection')) return;

      const { albumId: qAlbumId } = request.query as { albumId?: string };
      const { quantity } = request.body as { quantity: number };

      const albumId = await resolveAlbum(fastify, reply, userId, qAlbumId);
      if (!albumId) return;

      await collectionService.updateSticker(
        fastify.db, fastify.redis, userId, albumId, variantId, quantity
      );
      return reply.status(204).send();
    }
  );

  /**
   * DELETE /api/v1/users/:userId/stickers/:variantId
   */
  fastify.delete(
    '/api/v1/users/:userId/stickers/:variantId',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Collection'],
        summary: 'Remove a sticker variant from a user collection',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId', 'variantId'],
          properties: {
            userId:    { type: 'string' },
            variantId: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: { albumId: { type: 'string' } },
        },
        response: { 204: { type: 'null', description: 'Sticker removed successfully' } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId, variantId } = request.params as { userId: string; variantId: string };
      if (!assertAccess(request, reply, userId, 'collection')) return;

      const { albumId: qAlbumId } = request.query as { albumId?: string };
      const albumId = await resolveAlbum(fastify, reply, userId, qAlbumId);
      if (!albumId) return;

      await collectionService.removeSticker(
        fastify.db, fastify.redis, userId, albumId, variantId
      );
      return reply.status(204).send();
    }
  );

  /**
   * PATCH /api/v1/users/:userId/stickers/:variantId/trade-flags
   */
  fastify.patch(
    '/api/v1/users/:userId/stickers/:variantId/trade-flags',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Collection'],
        summary: 'Update trade visibility flags for a sticker variant',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId', 'variantId'],
          properties: {
            userId:    { type: 'string' },
            variantId: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: { albumId: { type: 'string' } },
        },
        body: {
          type: 'object',
          properties: {
            tradeHidden: { type: 'boolean' },
            tradeForced: { type: 'boolean' },
          },
        },
        response: { 204: { type: 'null', description: 'Flags updated' } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId, variantId } = request.params as { userId: string; variantId: string };
      if (!assertAccess(request, reply, userId, 'collection')) return;

      const { albumId: qAlbumId } = request.query as { albumId?: string };
      const body = request.body as { tradeHidden?: boolean; tradeForced?: boolean };

      const albumId = await resolveAlbum(fastify, reply, userId, qAlbumId);
      if (!albumId) return;

      await collectionService.setTradeFlags(
        fastify.db, fastify.redis, userId, albumId, variantId, body
      );
      return reply.status(204).send();
    }
  );

  /**
   * POST /api/v1/users/:userId/stickers/bulk
   *
   * One-shot mutation for mass-actions on the album page. Replaces the
   * previous client-side pattern of N sequential PATCH/DELETE/POST calls.
   * All ops execute in a single transaction; cache is invalidated once.
   */
  fastify.post(
    '/api/v1/users/:userId/stickers/bulk',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Collection'],
        summary: 'Bulk apply add/set/remove/flags ops to a user collection',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['ops'],
          properties: {
            albumId: { type: 'string' },
            ops: {
              type: 'array',
              minItems: 1,
              maxItems: 500,
              items: {
                type: 'object',
                required: ['op', 'variantId'],
                properties: {
                  op:          { type: 'string', enum: ['add', 'set', 'remove', 'flags'] },
                  variantId:   { type: 'string' },
                  quantity:    { type: 'integer', minimum: 0 },
                  tradeHidden: { type: 'boolean' },
                  tradeForced: { type: 'boolean' },
                },
              },
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: { applied: { type: 'integer' } },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.params as { userId: string };
      if (!assertAccess(request, reply, userId, 'collection')) return;

      const { albumId: bodyAlbumId, ops } = request.body as {
        albumId?: string;
        ops: collectionService.BulkOp[];
      };

      const albumId = await resolveAlbum(fastify, reply, userId, bodyAlbumId);
      if (!albumId) return;

      const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
      const cached = await lookupIdempotent<{ applied: number }>(
        fastify.redis, 'collection:bulk', userId, idempotencyKey,
      );
      if (cached) return reply.status(200).send(cached);

      const result = await collectionService.applyBulk(
        fastify.db, fastify.redis, userId, albumId, ops,
      );
      await storeIdempotent(fastify.redis, 'collection:bulk', userId, idempotencyKey, result);
      return reply.status(200).send(result);
    },
  );

  /**
   * POST /api/v1/users/:userId/avatar
   */
  fastify.post(
    '/api/v1/users/:userId/avatar',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Collection'],
        summary: 'Upload or replace a user avatar (JPEG/PNG/WebP, max 10 MB)',
        security: [{ bearerAuth: [] }],
        consumes: ['multipart/form-data'],
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string' } },
        },
        response: {
          200: {
            type: 'object',
            properties: { avatarUrl: { type: 'string' } },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.params as { userId: string };
      if (!assertAccess(request, reply, userId, 'avatar')) return;

      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'No file uploaded.' });
      }
      const buffer = await data.toBuffer();
      await validateImageBuffer(buffer);
      const avatarUrl = await saveAvatar(buffer, userId);
      await fastify.db.query(
        `UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2`,
        [avatarUrl, userId]
      );
      return reply.status(200).send({ avatarUrl });
    }
  );

  /**
   * GET /api/v1/users/:userId/albums/:albumId/wanted-variants
   */
  fastify.get(
    '/api/v1/users/:userId/albums/:albumId/wanted-variants',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Collection'],
        summary: 'List explicitly wanted variant IDs for an album',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId', 'albumId'],
          properties: { userId: { type: 'string' }, albumId: { type: 'string' } },
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
                    variantId: { type: 'string' },
                    stickerId: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId, albumId } = request.params as { userId: string; albumId: string };
      if (!assertAccess(request, reply, userId, 'collection')) return;

      const items = await collectionService.getWantedVariants(fastify.db, userId, albumId);
      return reply.status(200).send({ items });
    },
  );

  /**
   * POST /api/v1/users/:userId/albums/:albumId/wanted-variants
   */
  fastify.post(
    '/api/v1/users/:userId/albums/:albumId/wanted-variants',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Collection'],
        summary: 'Mark a sticker variant as explicitly wanted',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId', 'albumId'],
          properties: { userId: { type: 'string' }, albumId: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['variantId'],
          properties: { variantId: { type: 'string' } },
        },
        response: { 204: { type: 'null' } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId, albumId } = request.params as { userId: string; albumId: string };
      if (!assertAccess(request, reply, userId, 'collection')) return;

      const { variantId } = request.body as { variantId: string };
      await collectionService.addWantedVariant(fastify.db, userId, albumId, variantId);
      return reply.status(204).send();
    },
  );

  /**
   * DELETE /api/v1/users/:userId/albums/:albumId/wanted-variants/:variantId
   */
  fastify.delete(
    '/api/v1/users/:userId/albums/:albumId/wanted-variants/:variantId',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Collection'],
        summary: 'Remove a sticker variant from the explicit wanted list',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId', 'albumId', 'variantId'],
          properties: {
            userId:    { type: 'string' },
            albumId:   { type: 'string' },
            variantId: { type: 'string' },
          },
        },
        response: { 204: { type: 'null' } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId, albumId, variantId } = request.params as {
        userId: string; albumId: string; variantId: string;
      };
      if (!assertAccess(request, reply, userId, 'collection')) return;

      await collectionService.removeWantedVariant(fastify.db, userId, albumId, variantId);
      return reply.status(204).send();
    },
  );
}
