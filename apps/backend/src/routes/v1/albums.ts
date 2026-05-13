import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { verifyToken } from '../../middleware/auth.js';
import * as albumsService from '../../services/albums.service.js';

const VALID_EDITIONS = ['north_america', 'international', 'swiss_gold', 'south_america'] as const;

const CreateAlbumBody = z.object({
  alias: z.string().min(1).max(100).optional().nullable(),
  edition: z.enum(VALID_EDITIONS).optional(),
});

const UpdateAlbumBody = z.object({
  alias: z.string().min(1).max(100).optional().nullable(),
  edition: z.enum(VALID_EDITIONS).optional(),
});

const MoveStickersBody = z.object({
  targetAlbumId: z.string().uuid(),
  quantity: z.number().int().min(1),
});

function assertAccess(request: FastifyRequest, reply: FastifyReply, targetUserId: string): boolean {
  if (request.userRole === 'admin') return true;
  if (request.userId === targetUserId) return true;
  reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'You can only access your own albums.' });
  return false;
}

export async function albumsRoutes(fastify: FastifyInstance): Promise<void> {

  /**
   * GET /api/v1/users/:userId/albums
   */
  fastify.get(
    '/api/v1/users/:userId/albums',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Albums'],
        summary: "List a user's albums",
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
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id:             { type: 'string' },
                    user_id:        { type: 'string' },
                    album_type_key: { type: 'string' },
                    alias:          { type: 'string', nullable: true },
                    edition:        { type: 'string' },
                    is_default:     { type: 'boolean' },
                    created_at:     { type: 'string' },
                    updated_at:     { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.params as { userId: string };
      if (!assertAccess(request, reply, userId)) return;

      try {
        const items = await albumsService.listAlbums(fastify.db, userId);
        return reply.status(200).send({ items });
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({ statusCode: e.statusCode ?? 500, error: 'Internal Server Error', message: e.message });
      }
    }
  );

  /**
   * POST /api/v1/users/:userId/albums
   */
  fastify.post(
    '/api/v1/users/:userId/albums',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Albums'],
        summary: 'Create a new album for a user',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string' } },
        },
        body: {
          type: 'object',
          properties: {
            alias:   { type: 'string', nullable: true, minLength: 1, maxLength: 100 },
            edition: { type: 'string', enum: VALID_EDITIONS },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.params as { userId: string };
      if (!assertAccess(request, reply, userId)) return;

      const parsed = CreateAlbumBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: parsed.error.issues.map((i) => i.message).join('; ') });
      }

      try {
        const album = await albumsService.createAlbum(fastify.db, userId, parsed.data);
        return reply.status(201).send(album);
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({ statusCode: e.statusCode ?? 500, error: 'Internal Server Error', message: e.message });
      }
    }
  );

  /**
   * PATCH /api/v1/users/:userId/albums/:albumId
   */
  fastify.patch(
    '/api/v1/users/:userId/albums/:albumId',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Albums'],
        summary: 'Update the alias of an album',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId', 'albumId'],
          properties: {
            userId:  { type: 'string' },
            albumId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            alias:   { type: 'string', nullable: true, minLength: 1, maxLength: 100 },
            edition: { type: 'string', enum: VALID_EDITIONS },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId, albumId } = request.params as { userId: string; albumId: string };
      if (!assertAccess(request, reply, userId)) return;

      const parsed = UpdateAlbumBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: parsed.error.issues.map((i) => i.message).join('; ') });
      }

      try {
        const album = await albumsService.updateAlbum(fastify.db, userId, albumId, parsed.data);
        if (!album) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Album not found.' });
        return reply.status(200).send(album);
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({ statusCode: e.statusCode ?? 500, error: 'Internal Server Error', message: e.message });
      }
    }
  );

  /**
   * DELETE /api/v1/users/:userId/albums/:albumId
   */
  fastify.delete(
    '/api/v1/users/:userId/albums/:albumId',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Albums'],
        summary: 'Delete a non-default album (must have no stickers)',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId', 'albumId'],
          properties: {
            userId:  { type: 'string' },
            albumId: { type: 'string' },
          },
        },
        response: {
          204: { type: 'null', description: 'Album deleted' },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId, albumId } = request.params as { userId: string; albumId: string };
      if (!assertAccess(request, reply, userId)) return;

      try {
        await albumsService.deleteAlbum(fastify.db, fastify.redis, userId, albumId);
        return reply.status(204).send();
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({ statusCode: e.statusCode ?? 500, error: 'Internal Server Error', message: e.message });
      }
    }
  );

  /**
   * POST /api/v1/users/:userId/albums/:albumId/stickers/:variantId/move
   */
  fastify.post(
    '/api/v1/users/:userId/albums/:albumId/stickers/:variantId/move',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Albums'],
        summary: 'Move sticker copies from one album to another',
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
        body: {
          type: 'object',
          required: ['targetAlbumId', 'quantity'],
          properties: {
            targetAlbumId: { type: 'string' },
            quantity:      { type: 'integer', minimum: 1 },
          },
        },
        response: {
          204: { type: 'null', description: 'Sticker moved successfully' },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId, albumId, variantId } = request.params as {
        userId: string; albumId: string; variantId: string;
      };
      if (!assertAccess(request, reply, userId)) return;

      const parsed = MoveStickersBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: parsed.error.issues.map((i) => i.message).join('; ') });
      }

      try {
        await albumsService.moveSticker(
          fastify.db,
          fastify.redis,
          userId,
          albumId,
          parsed.data.targetAlbumId,
          variantId,
          parsed.data.quantity
        );
        return reply.status(204).send();
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({ statusCode: e.statusCode ?? 500, error: 'Internal Server Error', message: e.message });
      }
    }
  );
}
