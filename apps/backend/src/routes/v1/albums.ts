import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken, assertAccess } from '../../middleware/auth.js';
import * as albumsService from '../../services/albums.service.js';

const albumSettingsShape = {
  type: 'object',
  properties: {
    include_all_stickers:     { type: 'boolean' },
    include_coca_cola:        { type: 'boolean' },
    include_non_album_museum: { type: 'boolean' },
  },
} as const;

const albumShape = {
  type: 'object',
  properties: {
    id:               { type: 'string' },
    user_id:          { type: 'string' },
    album_type_id:    { type: 'string' },
    album_type_key:   { type: 'string' },
    album_edition_id: { type: 'string' },
    edition:          { type: 'string' },
    alias:            { type: 'string', nullable: true },
    is_default:       { type: 'boolean' },
    settings:         albumSettingsShape,
    created_at:       { type: 'string' },
    updated_at:       { type: 'string' },
  },
} as const;

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
            properties: { items: { type: 'array', items: albumShape } },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.params as { userId: string };
      if (!assertAccess(request, reply, userId, 'albums')) return;
      const items = await albumsService.listAlbums(fastify.db, userId);
      return reply.status(200).send({ items });
    }
  );

  /**
   * GET /api/v1/users/:userId/albums/summary
   */
  fastify.get(
    '/api/v1/users/:userId/albums/summary',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Albums'],
        summary: 'Get owned/duplicate album_code sets for all albums (cross-album indicators)',
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
                    album_id:              { type: 'string' },
                    owned_album_codes:     { type: 'array', items: { type: 'string' } },
                    duplicate_album_codes: { type: 'array', items: { type: 'string' } },
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
      if (!assertAccess(request, reply, userId, 'albums')) return;
      const items = await albumsService.getAlbumSummaries(fastify.db, fastify.redis, userId);
      return reply.status(200).send({ items });
    }
  );

  /**
   * GET /api/v1/users/:userId/albums/:albumId
   */
  fastify.get(
    '/api/v1/users/:userId/albums/:albumId',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Albums'],
        summary: 'Get a single album',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId', 'albumId'],
          properties: { userId: { type: 'string' }, albumId: { type: 'string' } },
        },
        response: { 200: albumShape },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId, albumId } = request.params as { userId: string; albumId: string };
      if (!assertAccess(request, reply, userId, 'albums')) return;
      const album = await albumsService.getAlbum(fastify.db, userId, albumId);
      if (!album) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Album not found.' });
      return reply.status(200).send(album);
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
            edition: { type: 'string' },
          },
        },
        response: { 201: albumShape },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.params as { userId: string };
      if (!assertAccess(request, reply, userId, 'albums')) return;
      const body = request.body as { alias?: string | null; edition?: string };
      const album = await albumsService.createAlbum(fastify.db, userId, body);
      return reply.status(201).send(album);
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
        summary: 'Update album alias and/or edition',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId', 'albumId'],
          properties: { userId: { type: 'string' }, albumId: { type: 'string' } },
        },
        body: {
          type: 'object',
          properties: {
            alias:    { type: 'string', nullable: true, minLength: 1, maxLength: 100 },
            edition:  { type: 'string' },
            settings: albumSettingsShape,
          },
        },
        response: { 200: albumShape },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId, albumId } = request.params as { userId: string; albumId: string };
      if (!assertAccess(request, reply, userId, 'albums')) return;
      const body = request.body as { alias?: string | null; edition?: string; settings?: { include_all_stickers?: boolean; include_coca_cola?: boolean; include_non_album_museum?: boolean } };
      const album = await albumsService.updateAlbum(fastify.db, userId, albumId, body);
      if (!album) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Album not found.' });
      return reply.status(200).send(album);
    }
  );

  /**
   * POST /api/v1/users/:userId/albums/:albumId/set-default
   */
  fastify.post(
    '/api/v1/users/:userId/albums/:albumId/set-default',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Albums'],
        summary: 'Set an album as the default',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId', 'albumId'],
          properties: { userId: { type: 'string' }, albumId: { type: 'string' } },
        },
        response: { 200: albumShape },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId, albumId } = request.params as { userId: string; albumId: string };
      if (!assertAccess(request, reply, userId, 'albums')) return;
      const album = await albumsService.setDefaultAlbum(fastify.db, userId, albumId);
      return reply.status(200).send(album);
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
        summary: 'Delete a non-default album (cascades to its stickers)',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId', 'albumId'],
          properties: { userId: { type: 'string' }, albumId: { type: 'string' } },
        },
        response: { 204: { type: 'null', description: 'Album deleted' } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId, albumId } = request.params as { userId: string; albumId: string };
      if (!assertAccess(request, reply, userId, 'albums')) return;
      await albumsService.deleteAlbum(fastify.db, fastify.redis, userId, albumId);
      return reply.status(204).send();
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
        response: { 204: { type: 'null', description: 'Sticker moved successfully' } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId, albumId, variantId } = request.params as {
        userId: string; albumId: string; variantId: string;
      };
      if (!assertAccess(request, reply, userId, 'albums')) return;
      const { targetAlbumId, quantity } = request.body as {
        targetAlbumId: string; quantity: number;
      };
      await albumsService.moveSticker(
        fastify.db, fastify.redis, userId, albumId, targetAlbumId, variantId, quantity
      );
      return reply.status(204).send();
    }
  );
}
