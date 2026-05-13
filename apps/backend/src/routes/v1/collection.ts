import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from '../../middleware/auth.js';
import * as collectionService from '../../services/collection.service.js';
import { validateImageBuffer, saveAvatar } from '../../services/upload.service.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function assertAccess(request: FastifyRequest, reply: FastifyReply, targetUserId: string): boolean {
  if (request.userRole === 'admin') return true;
  if (request.userId === targetUserId) return true;

  reply.status(403).send({
    statusCode: 403,
    error: 'Forbidden',
    message: 'You can only access your own collection.',
  });
  return false;
}

// ─── Route handler ────────────────────────────────────────────────────────────

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
            team:    { type: 'string' },
            group:   { type: 'string' },
            type:    { type: 'string' },
            variant: { type: 'string' },
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
                    sticker_id:         { type: 'string' },
                    number:             { type: 'integer' },
                    album_code:         { type: 'string' },
                    player_name:        { type: 'string', nullable: true },
                    position:           { type: 'string', nullable: true },
                    sticker_type:       { type: 'string' },
                    album_page:         { type: 'integer', nullable: true },
                    notes:              { type: 'string', nullable: true },
                    team_name:          { type: 'string', nullable: true },
                    fifa_code:          { type: 'string', nullable: true },
                    group_name:         { type: 'string', nullable: true },
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
      if (!assertAccess(request, reply, userId)) return;

      const q = request.query as {
        team?: string; group?: string; type?: string;
        variant?: string; cursor?: number; limit?: number;
      };

      try {
        const result = await collectionService.getCollection(
          fastify.db, fastify.redis, userId, q
        );
        return reply.status(200).send(result);
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({
          statusCode: e.statusCode ?? 500,
          error: 'Internal Server Error',
          message: e.message,
        });
      }
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
      if (!assertAccess(request, reply, userId)) return;

      try {
        const stats = await collectionService.getStats(fastify.db, fastify.redis, userId);
        return reply.status(200).send(stats);
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({
          statusCode: e.statusCode ?? 500,
          error: 'Internal Server Error',
          message: e.message,
        });
      }
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
                    variant_id:   { type: 'string' },
                    id:           { type: 'string' },
                    number:       { type: 'integer' },
                    album_code:   { type: 'string' },
                    player_name:  { type: 'string', nullable: true },
                    position:     { type: 'string', nullable: true },
                    sticker_type: { type: 'string' },
                    album_page:   { type: 'integer', nullable: true },
                    notes:        { type: 'string', nullable: true },
                    team_name:    { type: 'string', nullable: true },
                    fifa_code:    { type: 'string', nullable: true },
                    group_name:   { type: 'string', nullable: true },
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
      if (!assertAccess(request, reply, userId)) return;

      const q = request.query as {
        team?: string; group?: string; cursor?: number; limit?: number;
      };

      try {
        const result = await collectionService.getMissing(
          fastify.db, fastify.redis, userId, q
        );
        return reply.status(200).send(result);
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({
          statusCode: e.statusCode ?? 500,
          error: 'Internal Server Error',
          message: e.message,
        });
      }
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
      if (!assertAccess(request, reply, userId)) return;

      const q = request.query as { cursor?: number; limit?: number };

      try {
        const result = await collectionService.getDuplicates(
          fastify.db, fastify.redis, userId, q.cursor, q.limit
        );
        return reply.status(200).send(result);
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({
          statusCode: e.statusCode ?? 500,
          error: 'Internal Server Error',
          message: e.message,
        });
      }
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
            quantity:  { type: 'integer', minimum: 1, default: 1 },
          },
        },
        response: {
          204: { type: 'null', description: 'Sticker added successfully' },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.params as { userId: string };
      if (!assertAccess(request, reply, userId)) return;

      const { variantId, quantity } = request.body as { variantId: string; quantity?: number };

      try {
        await collectionService.addSticker(
          fastify.db, fastify.redis, userId, variantId, quantity
        );
        return reply.status(204).send();
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({
          statusCode: e.statusCode ?? 500,
          error: 'Internal Server Error',
          message: e.message,
        });
      }
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
        body: {
          type: 'object',
          required: ['quantity'],
          properties: {
            quantity: { type: 'integer', minimum: 0 },
          },
        },
        response: {
          204: { type: 'null', description: 'Sticker updated successfully' },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId, variantId } = request.params as { userId: string; variantId: string };
      if (!assertAccess(request, reply, userId)) return;

      const { quantity } = request.body as { quantity: number };

      try {
        await collectionService.updateSticker(
          fastify.db, fastify.redis, userId, variantId, quantity
        );
        return reply.status(204).send();
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({
          statusCode: e.statusCode ?? 500,
          error: 'Internal Server Error',
          message: e.message,
        });
      }
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
        response: {
          204: { type: 'null', description: 'Sticker removed successfully' },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId, variantId } = request.params as { userId: string; variantId: string };
      if (!assertAccess(request, reply, userId)) return;

      try {
        await collectionService.removeSticker(
          fastify.db, fastify.redis, userId, variantId
        );
        return reply.status(204).send();
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({
          statusCode: e.statusCode ?? 500,
          error: 'Internal Server Error',
          message: e.message,
        });
      }
    }
  );

  /**
   * POST /api/v1/users/:userId/avatar
   * Multipart upload — JPEG/PNG/WebP, max 10 MB, resized to 512×512.
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
            properties: {
              avatarUrl: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.params as { userId: string };
      if (!assertAccess(request, reply, userId)) return;

      try {
        const data = await request.file();

        if (!data) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: 'No file uploaded.',
          });
        }

        const buffer = await data.toBuffer();

        // Magic-byte validation
        await validateImageBuffer(buffer);

        // Resize, strip EXIF, save
        const avatarUrl = await saveAvatar(buffer, userId);

        // Persist the avatar URL to the database
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
