import type { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../env.js';
import { verifyCognitoJwt } from './cognito.js';

export interface JwtPayload {
  sub: string;       // user ID
  email: string;
  role: string;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

/**
 * Extracts the Bearer token from the Authorization header.
 */
function extractBearerToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

/**
 * verifyToken — pre-handler hook that validates the JWT access token.
 *
 * In AUTH_MODE=local:   any validly signed JWT (signed with JWT_SECRET) is accepted.
 * In AUTH_MODE=cognito: currently returns 501 (Phase B stub).
 *
 * Attach to individual routes or route prefixes that require authentication.
 */
export async function verifyToken(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const token = extractBearerToken(request);

  if (!token) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Missing or malformed Authorization header.',
    });
  }

  if (env.AUTH_MODE === 'cognito') {
    try {
      const claims = await verifyCognitoJwt(token);
      request.userId = claims.sub;
      request.userEmail = claims.email;
      request.userRole = claims.role;
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid Cognito token.';
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message,
      });
    }
  }

  // AUTH_MODE === 'local'
  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch (err) {
    const message =
      err instanceof jwt.TokenExpiredError
        ? 'Access token has expired.'
        : 'Invalid access token.';
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message,
    });
  }

  if (payload.type !== 'access') {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Token type must be "access".',
    });
  }

  request.userId = payload.sub;
  request.userEmail = payload.email;
  request.userRole = payload.role;
}

/**
 * requireRole — use after verifyToken to enforce a minimum role.
 */
export function requireRole(role: 'admin') {
  return async function roleGuard(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (request.userRole !== role) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'You do not have permission to access this resource.',
      });
    }
  };
}

/**
 * signAccessToken — creates a short-lived access token.
 */
export function signAccessToken(payload: Omit<JwtPayload, 'type' | 'iat' | 'exp'>): string {
  return jwt.sign({ ...payload, type: 'access' }, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL_SECONDS,
  });
}

/**
 * signRefreshToken — creates a long-lived refresh token.
 */
export function signRefreshToken(payload: Omit<JwtPayload, 'type' | 'iat' | 'exp'>): string {
  return jwt.sign({ ...payload, type: 'refresh' }, env.JWT_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL_SECONDS,
  });
}

/**
 * verifyRefreshToken — validates a refresh token JWT.
 */
export function verifyRefreshToken(token: string): JwtPayload {
  const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  if (payload.type !== 'refresh') {
    throw new Error('Token type must be "refresh".');
  }
  return payload;
}

/**
 * assertAccess — verifies the caller is either an admin or the target user.
 * Returns true when access is allowed, false (and sends a 403) when denied.
 */
export function assertAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  targetUserId: string,
  resource = 'this resource'
): boolean {
  if (request.userRole === 'admin') return true;
  if (request.userId === targetUserId) return true;
  reply.status(403).send({
    statusCode: 403,
    error: 'Forbidden',
    message: `You can only access your own ${resource}.`,
  });
  return false;
}
