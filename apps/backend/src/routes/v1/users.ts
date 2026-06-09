import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { verifyToken } from '../../middleware/auth.js';
import * as userService from '../../services/user.service.js';
import * as achievementsService from '../../services/achievements.service.js';
import { getBanStatus } from '../../services/trust-safety.service.js';
import { env } from '../../env.js';
import * as cognitoAdmin from '../../services/cognito-admin.js';

const CitySchema = z.object({
  label: z.string().min(1).max(200),
  placeId: z.number().int().positive(),
});

const PatchPreferencesBody = z.object({
  duplicatesCountAllVariants: z.boolean().optional(),
  cities: z.array(CitySchema).max(10).optional(),
  profileVisibility: z.enum(['public', 'private']).optional(),
  tradeMatchingEnabled: z.boolean().optional(),
});

const UpdateUsernameBody = z.object({
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9_-]+$/i, 'Username may only contain letters, numbers, underscores, hyphens.'),
});

const UpdateEmailBody = z.object({
  email: z.string().email(),
});

const UpdatePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

const UpdateDisplayNameBody = z.object({
  displayName: z.string().max(100).nullable(),
});

export async function usersRoutes(fastify: FastifyInstance): Promise<void> {
  const prefix = '/api/v1/users';

  /**
   * GET /api/v1/users/me/preferences
   */
  fastify.get(
    `${prefix}/me/preferences`,
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Users'],
        summary: 'Get user album preferences',
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              duplicatesCountAllVariants: { type: 'boolean' },
              cities: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, placeId: { type: 'integer' } } } },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const prefs = await userService.getPreferences(fastify.db, request.userId!);
      return reply.status(200).send(prefs);
    }
  );

  /**
   * PATCH /api/v1/users/me/preferences
   */
  fastify.patch(
    `${prefix}/me/preferences`,
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Users'],
        summary: 'Update user album preferences',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            duplicatesCountAllVariants: { type: 'boolean' },
            cities: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, placeId: { type: 'integer' } } } },
            profileVisibility: { type: 'string', enum: ['public', 'private'] },
            tradeMatchingEnabled: { type: 'boolean' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              duplicatesCountAllVariants: { type: 'boolean' },
              cities: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, placeId: { type: 'integer' } } } },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = PatchPreferencesBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }
      const prefs = await userService.updatePreferences(fastify.db, fastify.redis, request.userId!, parsed.data);
      return reply.status(200).send(prefs);
    }
  );

  /**
   * PATCH /api/v1/users/me/username
   */
  fastify.patch(
    `${prefix}/me/username`,
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Users'],
        summary: 'Update username',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['username'],
          properties: { username: { type: 'string', minLength: 3, maxLength: 30 } },
        },
        response: {
          200: {
            type: 'object',
            properties: { username: { type: 'string' } },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = UpdateUsernameBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }
      const result = await userService.updateUsername(fastify.db, request.userId!, parsed.data.username);
      return reply.status(200).send(result);
    }
  );

  /**
   * PATCH /api/v1/users/me/display-name
   */
  fastify.patch(
    `${prefix}/me/display-name`,
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Users'],
        summary: 'Update display name',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: { displayName: { type: ['string', 'null'], maxLength: 100 } },
        },
        response: {
          200: {
            type: 'object',
            properties: { displayName: { type: ['string', 'null'] } },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = UpdateDisplayNameBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }
      const result = await userService.updateDisplayName(fastify.db, request.userId!, parsed.data.displayName);
      return reply.status(200).send(result);
    }
  );

  /**
   * PATCH /api/v1/users/me/email
   */
  fastify.patch(
    `${prefix}/me/email`,
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Users'],
        summary: 'Update email — resets verification status',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['email'],
          properties: { email: { type: 'string', format: 'email' } },
        },
        response: {
          200: {
            type: 'object',
            properties: { email: { type: 'string' } },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = UpdateEmailBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }
      const result = await userService.updateEmail(fastify.db, fastify.redis, request.userId!, parsed.data.email);
      return reply.status(200).send(result);
    }
  );

  /**
   * PATCH /api/v1/users/me/password
   */
  fastify.patch(
    `${prefix}/me/password`,
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Users'],
        summary: 'Update password',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['currentPassword', 'newPassword'],
          properties: {
            currentPassword: { type: 'string' },
            newPassword: { type: 'string', minLength: 8, maxLength: 128 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: { message: { type: 'string' } },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = UpdatePasswordBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }
      await userService.updatePassword(fastify.db, request.userId!);
      return reply.status(200).send({ message: 'Password updated successfully.' });
    }
  );

  /**
   * GET /api/v1/users/me/ban-status
   */
  fastify.get(
    `${prefix}/me/ban-status`,
    { preHandler: [verifyToken] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const status = await getBanStatus(fastify.db, fastify.redis, request.userId!);
      return reply.status(200).send(status);
    },
  );

  /**
   * DELETE /api/v1/users/me
   */
  fastify.delete(
    `${prefix}/me`,
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Users'],
        summary: 'Delete account',
        security: [{ bearerAuth: [] }],
        response: {
          204: { type: 'null', description: 'Account deleted' },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const banStatus = await getBanStatus(fastify.db, fastify.redis, request.userId!);
      if (banStatus.banned) {
        return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Banned accounts cannot be self-deleted.' });
      }

      if (env.AUTH_MODE === 'cognito') {
        await cognitoAdmin.deleteUser(request.userId!).catch(() => {});
      }

      await userService.deleteAccount(fastify.db, request.userId!);
      return reply.status(204).send();
    }
  );

  /**
   * POST /api/v1/users/me/achievements/evaluate
   * Triggers re-evaluation of every achievement criterion for the caller
   * and persists any newly met ones. Idempotent — repeated calls just
   * return the current set without writing again.
   */
  fastify.post(
    '/api/v1/users/me/achievements/evaluate',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Users'],
        summary: 'Evaluate and return the caller\'s unlocked achievements',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const items = await achievementsService.evaluateAchievements(
        fastify.db,
        request.userId!,
      );
      return reply.status(200).send({ items });
    }
  );
}
