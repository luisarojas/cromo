import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getBanStatus } from '../services/trust-safety.service.js';

export function checkSoftBan(fastify: FastifyInstance) {
  return async function softBanGuard(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (!request.userId) return;

    const status = await getBanStatus(fastify.db, fastify.redis, request.userId);
    if (status.banned) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: status.message,
      });
    }
  };
}
