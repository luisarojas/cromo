import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../../env.js';

export async function versionRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/api/v1/version',
    {
      schema: {
        tags: ['Version'],
        summary: 'API version',
        description: 'Returns the current API version and environment.',
        response: {
          200: {
            type: 'object',
            properties: {
              version: { type: 'string' },
              env: { type: 'string' },
              authMode: { type: 'string' },
            },
          },
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.status(200).send({
        version: env.APP_VERSION,
        env: env.NODE_ENV,
        authMode: env.AUTH_MODE,
      });
    }
  );
}
