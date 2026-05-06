import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /health
   * Liveness check — returns 200 if the process is alive.
   */
  fastify.get(
    '/health',
    {
      schema: {
        tags: ['Health'],
        summary: 'Liveness check',
        description: 'Returns 200 if the API process is running.',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', example: 'ok' },
              timestamp: { type: 'string', format: 'date-time' },
              version: { type: 'string' },
            },
          },
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.status(200).send({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: process.env['APP_VERSION'] ?? '0.0.0-local',
      });
    }
  );

  /**
   * GET /health/ready
   * Readiness check — verifies DB and Redis connectivity.
   */
  fastify.get(
    '/health/ready',
    {
      schema: {
        tags: ['Health'],
        summary: 'Readiness check',
        description: 'Returns 200 only if the API can reach both the database and Redis.',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', example: 'ready' },
              checks: {
                type: 'object',
                properties: {
                  database: { type: 'string', example: 'ok' },
                  redis: { type: 'string', example: 'ok' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              status: { type: 'string', example: 'not_ready' },
              checks: {
                type: 'object',
                properties: {
                  database: { type: 'string' },
                  redis: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const checks: { database: string; redis: string } = {
        database: 'ok',
        redis: 'ok',
      };

      let allHealthy = true;

      // Check database
      try {
        await fastify.db.query('SELECT 1');
      } catch (err) {
        checks.database = `error: ${(err as Error).message}`;
        allHealthy = false;
      }

      // Check Redis
      try {
        const pong = await fastify.redis.ping();
        if (pong !== 'PONG') {
          checks.redis = 'unexpected response';
          allHealthy = false;
        }
      } catch (err) {
        checks.redis = `error: ${(err as Error).message}`;
        allHealthy = false;
      }

      const statusCode = allHealthy ? 200 : 503;
      const status = allHealthy ? 'ready' : 'not_ready';

      return reply.status(statusCode).send({ status, checks });
    }
  );
}
