import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as sharingService from '../../services/sharing.service.js';

// ─── Route registration ───────────────────────────────────────────────────────

export async function profileRoutes(fastify: FastifyInstance): Promise<void> {

  /**
   * GET /api/v1/profiles/:username
   * Public endpoint — retrieve a user's public profile.
   * Returns 404 if the user does not exist or their profile_visibility is 'private'.
   */
  fastify.get(
    '/api/v1/profiles/:username',
    {
      schema: {
        tags: ['Profiles'],
        summary: 'Get a public user profile (no auth required)',
        params: {
          type: 'object',
          required: ['username'],
          properties: { username: { type: 'string' } },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              username:     { type: 'string' },
              display_name: { type: 'string', nullable: true },
              avatar_url:   { type: 'string', nullable: true },
              member_since: { type: 'string' },
              collection_stats: {
                nullable: true,
                type: 'object',
                properties: {
                  total:      { type: 'integer' },
                  owned:      { type: 'integer' },
                  missing:    { type: 'integer' },
                  duplicates: { type: 'integer' },
                  percentage: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { username } = request.params as { username: string };

      try {
        const profile = await sharingService.getPublicProfile(fastify.db, username);
        if (!profile) {
          return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Profile not found.' });
        }
        return reply.status(200).send(profile);
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({ statusCode: e.statusCode ?? 500, error: 'Internal Server Error', message: e.message });
      }
    }
  );
}
