import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { verifyToken, assertAccess } from '../../middleware/auth.js';
import * as sharingService from '../../services/sharing.service.js';
import { idempotency, storeIdempotent } from '../../services/idempotency.service.js';

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
      preHandler: [verifyToken, idempotency(fastify, 'sharing:create-token')],
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

      const link = await sharingService.createShareLink(
        fastify.db, userId, parsed.data.listType, parsed.data.albumId
      );

      // Cache so a retry with the same Idempotency-Key returns the same token
      // rather than minting a fresh one (which would invalidate the prior link).
      const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
      await storeIdempotent(fastify.redis, 'sharing:create-token', userId, idempotencyKey, link);

      return reply.status(201).send(link);
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

      const items = await sharingService.listShareLinks(fastify.db, userId);
      return reply.status(200).send({ items });
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

      await sharingService.revokeShareLink(fastify.db, userId, token);
      return reply.status(204).send();
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

      const result = await sharingService.getPublicList(fastify.db, token);
      if (!result) {
        return reply.status(410).send({ statusCode: 410, error: 'Gone', message: 'This share link no longer exists or has expired.' });
      }
      return reply.status(200).send(result);
    }
  );
}
