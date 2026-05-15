import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken, assertAccess } from '../../middleware/auth.js';
import * as collectionService from '../../services/collection.service.js';
import * as albumsService from '../../services/albums.service.js';
import { validateImageBuffer, saveAvatar } from '../../services/upload.service.js';

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
   */
  fastify.get(
    '/api/v1/users/:userId/collection',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Collection'],
        summary: "List a user's sticker collection with optional filters",
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
      };

      const albumId = await resolveAlbum(fastify, reply, userId, q.albumId);
      if (!albumId) return;

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

      await collectionService.addSticker(
        fastify.db, fastify.redis, userId, albumId, variantId, quantity
      );
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

      try {
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
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({
          statusCode: e.statusCode ?? 500,
          error: e.statusCode === 415 ? 'Unsupported Media Type' : 'Internal Server Error',
          message: e.message,
        });
      }
    }
  );
}
