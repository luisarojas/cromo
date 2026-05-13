import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { verifyToken } from '../../middleware/auth.js';
import * as userService from '../../services/user.service.js';

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

export async function usersRoutes(fastify: FastifyInstance): Promise<void> {
  const prefix = '/api/v1/users';

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
      try {
        const result = await userService.updateUsername(fastify.db, request.userId!, parsed.data.username);
        return reply.status(200).send(result);
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({
          statusCode: e.statusCode ?? 500,
          error: e.statusCode === 409 ? 'Conflict' : 'Internal Server Error',
          message: e.message,
        });
      }
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
      try {
        const result = await userService.updateEmail(fastify.db, request.userId!, parsed.data.email);
        return reply.status(200).send(result);
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({
          statusCode: e.statusCode ?? 500,
          error: e.statusCode === 409 ? 'Conflict' : 'Internal Server Error',
          message: e.message,
        });
      }
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
      try {
        await userService.updatePassword(fastify.db, request.userId!);
        return reply.status(200).send({ message: 'Password updated successfully.' });
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
   * DELETE /api/v1/users/me
   */
  fastify.delete(
    `${prefix}/me`,
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Users'],
        summary: 'Delete (deactivate) account',
        security: [{ bearerAuth: [] }],
        response: {
          204: { type: 'null', description: 'Account deleted' },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await userService.deleteAccount(fastify.db, request.userId!);
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
}
