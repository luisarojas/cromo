import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { verifyToken } from '../../middleware/auth.js';
import * as localAuthService from '../../services/auth.service.js';
import * as cognitoAuthService from '../../services/cognito-auth.service.js';
import { env } from '../../env.js';

// Pick the auth backend once at module load. Both modules expose the same
// surface (register/login/refresh/verifyEmail/resendVerification/
// forgotPassword/resetPassword) with matching {email, code} contracts.
const authService = env.AUTH_MODE === 'cognito' ? cognitoAuthService : localAuthService;

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
  email: z.string().email(),
  code: z.string().min(4).max(10),
});

const ResendVerificationBody = z.object({
  email: z.string().email(),
});

const ForgotPasswordBody = z.object({
  email: z.string().email(),
});

const ResetPasswordBody = z.object({
  email: z.string().email(),
  code: z.string().min(4).max(10),
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
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (env.AUTH_MODE === 'cognito') {
        const authHeader = request.headers.authorization;
        const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
        await cognitoAuthService.logout(token);
      }
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
        summary: 'Verify email address with a code',
        body: {
          type: 'object',
          required: ['email', 'code'],
          properties: {
            email: { type: 'string', format: 'email' },
            code: { type: 'string', minLength: 4, maxLength: 10 },
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
          message: 'A valid email and code are required.',
        });
      }

      await authService.verifyEmail(fastify.drizzle, parsed.data.email, parsed.data.code);
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
        summary: 'Reset password using a code from the email',
        body: {
          type: 'object',
          required: ['email', 'code', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            code: { type: 'string', minLength: 4, maxLength: 10 },
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

      await authService.resetPassword(
        fastify.drizzle,
        parsed.data.email,
        parsed.data.code,
        parsed.data.password,
      );
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
              username: { type: 'string' },
              displayName: { type: 'string', nullable: true },
              role: { type: 'string' },
              emailVerifiedAt: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Cognito access tokens don't carry email/username, so read the profile
      // from the DB by id. Role comes from the token claim, which is the
      // authority (cognito:groups in cognito mode, JWT in local mode).
      const { rows } = await fastify.db.query<{
        email: string;
        username: string;
        display_name: string | null;
        email_verified_at: Date | null;
      }>(
        `SELECT email, username, display_name, email_verified_at
           FROM users WHERE id = $1 AND deleted_at IS NULL`,
        [request.userId],
      );

      if (rows.length === 0) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'User not found.',
        });
      }

      const u = rows[0]!;
      return reply.status(200).send({
        id: request.userId,
        email: u.email,
        username: u.username,
        displayName: u.display_name,
        role: request.userRole,
        emailVerifiedAt: u.email_verified_at,
      });
    }
  );
}
