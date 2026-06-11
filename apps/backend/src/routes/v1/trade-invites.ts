import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from '../../middleware/auth.js';
import * as tradeInvitesService from '../../services/trade-invites.service.js';

// QR-based invite into the existing propose-trade flow. The host mints an
// invite, hands the URL to whoever they want to trade with, and the
// scanner is redirected to the same /trade?tab=find&recipient=<username>
// entry the profile's "Start a trade" button uses. Tokens are single-use
// with a 30-min TTL set at the DB column default.

export async function tradeInvitesRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/api/v1/trade/invites',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Trade'],
        summary: 'Create a single-use trade invite token',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const invite = await tradeInvitesService.createInvite(fastify.db, request.userId!);
      return reply.status(201).send({ invite });
    },
  );

  fastify.post(
    '/api/v1/trade/invites/:token/redeem',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Trade'],
        summary: 'Redeem a trade invite token',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['token'],
          properties: { token: { type: 'string' } },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { token } = request.params as { token: string };
      const result = await tradeInvitesService.redeemInvite(
        fastify.db,
        token,
        request.userId!,
      );
      return reply.status(200).send(result);
    },
  );
}
