import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { verifyToken } from '../../middleware/auth.js';
import * as authService from '../../services/auth.service.js';
import { env } from '../../env.js';

// ─── Input schemas ─────────────────────────────────────────────────────────────

const RegisterBody = z.object({
  email: z.string().email(),
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9_-]+$/i, 'Username may only contain letters, numbers, underscores, hyphens.'),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(100).optional(),
});

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const VerifyEmailBody = z.object({
  token: z.string().length(64),
});

const ResendVerificationBody = z.object({
  email: z.string().email(),
});

const ForgotPasswordBody = z.object({
  email: z.string().email(),
});

const ResetPasswordBody = z.object({
  token: z.string().length(64),
  password: z.string().min(8).max(128),
});

// ─── Cookie helper ─────────────────────────────────────────────────────────────

const REFRESH_COOKIE_NAME = 'refreshToken';

function setRefreshCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: env.JWT_REFRESH_TTL_SECONDS,
  });
}

function clearRefreshCookie(reply: FastifyReply): void {
  reply.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/v1/auth' });
}

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  const prefix = '/api/v1/auth';

  /**
   * POST /api/v1/auth/register
   */
  fastify.post(
    `${prefix}/register`,
    {
      schema: {
        tags: ['Auth'],
        summary: 'Register a new user',
        body: {
          type: 'object',
          required: ['email', 'username', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            username: { type: 'string', minLength: 3, maxLength: 30 },
            password: { type: 'string', minLength: 8, maxLength: 128 },
            displayName: { type: 'string', minLength: 1, maxLength: 100 },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              userId: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = RegisterBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }

      const { userId } = await authService.register(fastify.drizzle, fastify.redis, parsed.data);
      return reply.status(201).send({
        message: 'Registration successful. Please check your email to verify your account.',
        userId,
      });
    }
  );

  /**
   * POST /api/v1/auth/login
   */
  fastify.post(
    `${prefix}/login`,
    {
      schema: {
        tags: ['Auth'],
        summary: 'Log in and receive tokens',
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              accessToken: { type: 'string' },
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  email: { type: 'string' },
                  username: { type: 'string' },
                  displayName: { type: 'string', nullable: true },
                  role: { type: 'string' },
                  emailVerifiedAt: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = LoginBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }

      const { accessToken, refreshToken, user } = await authService.login(
        fastify.drizzle,
        parsed.data
      );

      setRefreshCookie(reply, refreshToken);

      return reply.status(200).send({ accessToken, user });
    }
  );

  /**
   * POST /api/v1/auth/logout
   */
  fastify.post(
    `${prefix}/logout`,
    {
      schema: {
        tags: ['Auth'],
        summary: 'Log out — clears the refresh token cookie',
        response: {
          204: { type: 'null', description: 'Logged out successfully' },
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      clearRefreshCookie(reply);
      return reply.status(204).send();
    }
  );

  /**
   * POST /api/v1/auth/refresh
   */
  fastify.post(
    `${prefix}/refresh`,
    {
      schema: {
        tags: ['Auth'],
        summary: 'Refresh access token using the refresh token cookie',
        response: {
          200: {
            type: 'object',
            properties: {
              accessToken: { type: 'string' },
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  email: { type: 'string' },
                  username: { type: 'string' },
                  role: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const token = (request.cookies as Record<string, string | undefined>)[REFRESH_COOKIE_NAME];

      if (!token) {
        return reply.status(200).send({ authenticated: false });
      }

      try {
        const { accessToken, refreshToken, user } = await authService.refresh(
          fastify.drizzle,
          token
        );

        setRefreshCookie(reply, refreshToken);

        return reply.status(200).send({ authenticated: true, accessToken, user });
      } catch {
        clearRefreshCookie(reply);
        return reply.status(200).send({ authenticated: false });
      }
    }
  );

  /**
   * POST /api/v1/auth/verify-email
   */
  fastify.post(
    `${prefix}/verify-email`,
    {
      schema: {
        tags: ['Auth'],
        summary: 'Verify email address with a token',
        body: {
          type: 'object',
          required: ['token'],
          properties: {
            token: { type: 'string', minLength: 64, maxLength: 64 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = VerifyEmailBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid token format.',
        });
      }

      await authService.verifyEmail(fastify.drizzle, parsed.data.token);
      return reply.status(200).send({ message: 'Email verified successfully.' });
    }
  );

  /**
   * POST /api/v1/auth/resend-verification
   */
  fastify.post(
    `${prefix}/resend-verification`,
    {
      schema: {
        tags: ['Auth'],
        summary: 'Resend email verification link',
        body: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email' },
          },
        },
        response: {
          204: { type: 'null', description: 'Verification email sent (if account exists)' },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = ResendVerificationBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(204).send(); // Anti-enumeration: always 204
      }

      await authService.resendVerification(fastify.drizzle, fastify.redis, parsed.data.email);
      return reply.status(204).send();
    }
  );

  /**
   * POST /api/v1/auth/forgot-password
   */
  fastify.post(
    `${prefix}/forgot-password`,
    {
      schema: {
        tags: ['Auth'],
        summary: 'Request a password reset email',
        body: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email' },
          },
        },
        response: {
          204: { type: 'null', description: 'Reset email sent (if account exists)' },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = ForgotPasswordBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(204).send(); // Anti-enumeration
      }

      await authService.forgotPassword(fastify.drizzle, fastify.redis, parsed.data.email);
      return reply.status(204).send();
    }
  );

  /**
   * POST /api/v1/auth/reset-password
   */
  fastify.post(
    `${prefix}/reset-password`,
    {
      schema: {
        tags: ['Auth'],
        summary: 'Reset password using a token from the email',
        body: {
          type: 'object',
          required: ['token', 'password'],
          properties: {
            token: { type: 'string', minLength: 64, maxLength: 64 },
            password: { type: 'string', minLength: 8, maxLength: 128 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = ResetPasswordBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        });
      }

      await authService.resetPassword(fastify.drizzle, parsed.data.token, parsed.data.password);
      return reply.status(200).send({ message: 'Password reset successfully.' });
    }
  );

  /**
   * GET /api/v1/auth/me — protected route example
   */
  fastify.get(
    `${prefix}/me`,
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Auth'],
        summary: 'Get current authenticated user',
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              email: { type: 'string' },
              role: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return reply.status(200).send({
        id: request.userId,
        email: request.userEmail,
        role: request.userRole,
      });
    }
  );
}
