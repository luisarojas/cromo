import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { verifyToken, assertAccess } from '../../middleware/auth.js';
import * as sharingService from '../../services/sharing.service.js';

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const CreateShareLinkBody = z.object({
  listType: z.enum(['missing', 'duplicates', 'full_collection']),
  albumId:  z.string().uuid(),
});

// ─── Route registration ───────────────────────────────────────────────────────

export async function sharingRoutes(fastify: FastifyInstance): Promise<void> {

  /**
   * POST /api/v1/users/:userId/share
   * Create a new share link (must be own user).
   */
  fastify.post(
    '/api/v1/users/:userId/share',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Sharing'],
        summary: 'Create a share link for a sticker list',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['listType', 'albumId'],
          properties: {
            listType: { type: 'string', enum: ['missing', 'duplicates', 'full_collection'] },
            albumId:  { type: 'string' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id:          { type: 'string' },
              user_id:     { type: 'string' },
              list_type:   { type: 'string' },
              share_token: { type: 'string' },
              expires_at:  { type: 'string', nullable: true },
              created_at:  { type: 'string' },
              url:         { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.params as { userId: string };
      if (!assertAccess(request, reply, userId, 'share links')) return;

      const parsed = CreateShareLinkBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }

      try {
        const link = await sharingService.createShareLink(
          fastify.db, userId, parsed.data.listType, parsed.data.albumId
        );
        return reply.status(201).send(link);
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({ statusCode: e.statusCode ?? 500, error: 'Internal Server Error', message: e.message });
      }
    }
  );

  /**
   * GET /api/v1/users/:userId/share
   * List share links for a user (must be own user).
   */
  fastify.get(
    '/api/v1/users/:userId/share',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Sharing'],
        summary: "List a user's share links",
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
                    id:          { type: 'string' },
                    user_id:     { type: 'string' },
                    list_type:   { type: 'string' },
                    share_token: { type: 'string' },
                    expires_at:  { type: 'string', nullable: true },
                    created_at:  { type: 'string' },
                    url:         { type: 'string' },
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
      if (!assertAccess(request, reply, userId, 'share links')) return;

      try {
        const items = await sharingService.listShareLinks(fastify.db, userId);
        return reply.status(200).send({ items });
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({ statusCode: e.statusCode ?? 500, error: 'Internal Server Error', message: e.message });
      }
    }
  );

  /**
   * DELETE /api/v1/users/:userId/share/:token
   * Revoke a share link (must be own user).
   */
  fastify.delete(
    '/api/v1/users/:userId/share/:token',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Sharing'],
        summary: 'Revoke a share link',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId', 'token'],
          properties: {
            userId: { type: 'string' },
            token:  { type: 'string' },
          },
        },
        response: { 204: { type: 'null', description: 'Share link revoked' } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId, token } = request.params as { userId: string; token: string };
      if (!assertAccess(request, reply, userId, 'share links')) return;

      try {
        await sharingService.revokeShareLink(fastify.db, userId, token);
        return reply.status(204).send();
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        const statusCode = e.statusCode ?? 500;
        return reply.status(statusCode).send({ statusCode, error: statusCode === 404 ? 'Not Found' : 'Internal Server Error', message: e.message });
      }
    }
  );

  /**
   * GET /api/v1/share/:token
   * Public endpoint — retrieve the sticker list for a share token.
   * Returns 410 Gone if the token is not found (revoked or never existed).
   */
  fastify.get(
    '/api/v1/share/:token',
    {
      schema: {
        tags: ['Sharing'],
        summary: 'Get a shared sticker list (public, no auth required)',
        params: {
          type: 'object',
          required: ['token'],
          properties: { token: { type: 'string' } },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { token } = request.params as { token: string };

      try {
        const result = await sharingService.getPublicList(fastify.db, token);
        if (!result) {
          return reply.status(410).send({ statusCode: 410, error: 'Gone', message: 'This share link no longer exists or has expired.' });
        }
        return reply.status(200).send(result);
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({ statusCode: e.statusCode ?? 500, error: 'Internal Server Error', message: e.message });
      }
    }
  );
}
