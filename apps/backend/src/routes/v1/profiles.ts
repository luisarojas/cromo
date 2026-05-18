import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as sharingService from '../../services/sharing.service.js';

function parseCSV(val: string | undefined): string[] | undefined {
  if (!val?.trim()) return undefined;
  return val.split(',').map((s) => s.trim()).filter(Boolean);
}

// Public, unauthenticated endpoints — tighter rate limit than the global
// 100/min to make scraping more expensive. The same limiter store is shared
// with the global config, so legitimate same-IP browsing of a few profiles
// still fits comfortably.
const PUBLIC_PROFILE_RATE_LIMIT = { max: 30, timeWindow: '1 minute' };

const inventoryItemShape = {
  type: 'object',
  properties: {
    sticker_variant_id: { type: 'string' },
    number:             { type: 'integer' },
    album_code:         { type: 'string' },
    player_name:        { type: 'string', nullable: true },
    sticker_type:       { type: 'string' },
    team_name:          { type: 'string', nullable: true },
    variant_type:       { type: 'string' },
    quantity:           { type: 'integer', nullable: true },
  },
} as const;

export async function profileRoutes(fastify: FastifyInstance): Promise<void> {

  /**
   * GET /api/v1/profiles/:username
   * Public — returns header info + per-album Offered list + Wanted counts.
   * The full Wanted list is fetched lazily via the endpoint below.
   */
  fastify.get(
    '/api/v1/profiles/:username',
    {
      config: { rateLimit: PUBLIC_PROFILE_RATE_LIMIT },
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
              user_id:      { type: 'string' },
              username:     { type: 'string' },
              display_name: { type: 'string', nullable: true },
              avatar_url:   { type: 'string', nullable: true },
              member_since: { type: 'string' },
              trading_inventory: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    album_id:        { type: 'string' },
                    album_type_name: { type: 'string' },
                    edition_name:    { type: 'string' },
                    format_name:     { type: 'string' },
                    alias:           { type: 'string', nullable: true },
                    is_default:      { type: 'boolean' },
                    offered:         { type: 'array', items: inventoryItemShape },
                    wanted_count:    { type: 'integer' },
                  },
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
        const profile = await sharingService.getPublicProfile(
          fastify.db,
          fastify.redis,
          username
        );
        if (!profile) {
          return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Profile not found.' });
        }
        return reply.status(200).send(profile);
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({
          statusCode: e.statusCode ?? 500,
          error: 'Internal Server Error',
          message: e.message,
        });
      }
    }
  );

  /**
   * GET /api/v1/profiles/:username/albums/:albumId/wanted
   * Public — paginated Wanted list for one of the user's public albums.
   * Cursor is the previous page's last sticker number.
   */
  fastify.get(
    '/api/v1/profiles/:username/albums/:albumId/wanted',
    {
      config: { rateLimit: PUBLIC_PROFILE_RATE_LIMIT },
      schema: {
        tags: ['Profiles'],
        summary: "Paginated wanted-stickers list for a user's public album",
        params: {
          type: 'object',
          required: ['username', 'albumId'],
          properties: {
            username: { type: 'string' },
            albumId:  { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            cursor:       { type: 'integer' },
            limit:        { type: 'integer', minimum: 1, maximum: 500 },
            stickerType:  { type: 'string' },
            team:         { type: 'string' },
            variantType:  { type: 'string' },
            q:            { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              items:       { type: 'array', items: inventoryItemShape },
              next_cursor: { type: 'integer', nullable: true },
              total:       { type: 'integer' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { username, albumId } = request.params as { username: string; albumId: string };
      const { cursor, limit, stickerType, team, variantType, q } = request.query as {
        cursor?: number;
        limit?: number;
        stickerType?: string;
        team?: string;
        variantType?: string;
        q?: string;
      };

      try {
        const page = await sharingService.getPublicAlbumWanted(
          fastify.db,
          fastify.redis,
          username,
          albumId,
          cursor ?? null,
          limit ?? 100,
          {
            stickerTypes: parseCSV(stickerType),
            teams:        parseCSV(team),
            variantTypes: parseCSV(variantType),
            search:       q,
          }
        );
        if (!page) {
          return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Album not found or not public.' });
        }
        return reply.status(200).send(page);
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        return reply.status(e.statusCode ?? 500).send({
          statusCode: e.statusCode ?? 500,
          error: 'Internal Server Error',
          message: e.message,
        });
      }
    }
  );
}
