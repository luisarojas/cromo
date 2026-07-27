import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import * as wc2026Service from '../../services/wc2026.service.js';
import { tournamentBySlug } from '../../wc2026/registry.js';

// Public, no auth — the standings page is reachable without an account.
// Responses are camelCase plain objects; the global serializer passes them
// through unchanged. Heavy work is cached in the service (singleflight bundle),
// per tournament. `:slug` selects the tournament from the registry (e.g.
// 'wc-2026'); an unknown slug 404s.
export async function wc2026Routes(fastify: FastifyInstance): Promise<void> {
  const prefix = '/api/v1/tournaments';

  fastify.get(
    `${prefix}/:slug/overview`,
    {
      schema: {
        tags: ['Tournaments'],
        summary: 'Group standings, knockout bracket, champion odds, and the winner (once decided)',
        params: {
          type: 'object',
          required: ['slug'],
          properties: { slug: { type: 'string', minLength: 2, maxLength: 40 } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { slug: string } }>, reply: FastifyReply) => {
      const tournament = tournamentBySlug(request.params.slug);
      if (!tournament) return reply.status(404).send({ error: 'Tournament not found' });
      const overview = await wc2026Service.getOverview(fastify.redis, tournament);
      return reply.status(200).send(overview);
    },
  );

  fastify.get(
    `${prefix}/:slug/teams/:code`,
    {
      schema: {
        tags: ['Tournaments'],
        summary: 'Team detail: standing, projected opponents, odds, squad, history',
        params: {
          type: 'object',
          required: ['slug', 'code'],
          properties: {
            slug: { type: 'string', minLength: 2, maxLength: 40 },
            code: { type: 'string', minLength: 2, maxLength: 3 },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { slug: string; code: string } }>, reply: FastifyReply) => {
      const tournament = tournamentBySlug(request.params.slug);
      if (!tournament) return reply.status(404).send({ error: 'Tournament not found' });
      const detail = await wc2026Service.getTeamDetail(fastify.redis, tournament, request.params.code);
      if (!detail) return reply.status(404).send({ error: 'Team not found' });
      return reply.status(200).send(detail);
    },
  );
}
