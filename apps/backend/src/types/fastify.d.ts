import type { Pool } from 'pg';
import type Redis from 'ioredis';

declare module 'fastify' {
  interface FastifyInstance {
    db: Pool;
    redis: Redis;
  }

  interface FastifyRequest {
    /**
     * The authenticated user's ID (set by verifyToken hook).
     * Only present on protected routes.
     */
    userId?: string;
    userEmail?: string;
    userRole?: string;
  }
}
