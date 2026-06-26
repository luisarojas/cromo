import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import * as wc2026Service from '../../services/wc2026.service.js';

// Public, no auth — the standings page is reachable without an account.
// Responses are camelCase plain objects; the global serializer passes them
// through unchanged. Heavy work is cached in the service (singleflight bundle).
export async function wc2026Routes(fastify: FastifyInstance): Promise<void> {
  const prefix = '/api/v1/wc2026';

  fastify.get(
    `${prefix}/overview`,
    {
      schema: {
        tags: ['WC2026'],
        summary: 'Group standings, knockout bracket, and champion odds for WC 2026',
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const overview = await wc2026Service.getOverview(fastify.redis);
      return reply.status(200).send(overview);
    },
  );

  fastify.get(
    `${prefix}/teams/:code`,
    {
      schema: {
        tags: ['WC2026'],
        summary: 'Team detail: standing, projected opponents, odds, squad, history',
        params: {
          type: 'object',
          required: ['code'],
          properties: { code: { type: 'string', minLength: 2, maxLength: 3 } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { code: string } }>, reply: FastifyReply) => {
      const detail = await wc2026Service.getTeamDetail(fastify.redis, request.params.code);
      if (!detail) return reply.status(404).send({ error: 'Team not found' });
      return reply.status(200).send(detail);
    },
  );
}
