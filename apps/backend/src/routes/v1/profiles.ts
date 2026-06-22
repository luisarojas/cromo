import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as sharingService from '../../services/sharing.service.js';
import * as achievementsService from '../../services/achievements.service.js';

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
    fifa_code:          { type: 'string', nullable: true },
    variant_type:       { type: 'string', nullable: true },
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
        querystring: {
          type: 'object',
          properties: {
            // Optional album slug. When set AND the slug matches an
            // unlisted album, that album joins the trading_inventory.
            // Acts as a capability token — anyone with the slug can view.
            album: { type: 'string', maxLength: 64 },
          },
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
                    album_type_key:  { type: 'string' },
                    album_type_name: { type: 'string' },
                    edition_name:    { type: 'string' },
                    format_name:     { type: 'string' },
                    alias:           { type: 'string', nullable: true },
                    is_default:      { type: 'boolean' },
                    slug:            { type: 'string' },
                    trade_inventory_visibility: { type: 'string', enum: ['public', 'unlisted'] },
                    offered_count:   { type: 'integer' },
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
      const { album } = request.query as { album?: string };

      const profile = await sharingService.getPublicProfile(
        fastify.db,
        fastify.redis,
        username,
        album?.trim() || null,
      );
      if (!profile) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Profile not found.' });
      }
      return reply.status(200).send(profile);
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
    }
  );

  /**
   * GET /api/v1/profiles/:username/albums/:albumId/offered
   * Public — paginated Offered list. Mirror of the wanted endpoint so the
   * profile page does server-side filtering on both tabs.
   */
  fastify.get(
    '/api/v1/profiles/:username/albums/:albumId/offered',
    {
      config: { rateLimit: PUBLIC_PROFILE_RATE_LIMIT },
      schema: {
        tags: ['Profiles'],
        summary: "Paginated offered-stickers list for a user's public album",
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

      const page = await sharingService.getPublicAlbumOffered(
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
        },
      );
      if (!page) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Album not found or not public.' });
      }
      return reply.status(200).send(page);
    }
  );

  /**
   * GET /api/v1/profiles/:username/achievements
   * Public — returns the user's persisted achievements (no re-evaluation,
   * since that's the owner's responsibility via the auth'd endpoint).
   */
  fastify.get(
    '/api/v1/profiles/:username/achievements',
    {
      config: { rateLimit: PUBLIC_PROFILE_RATE_LIMIT },
      schema: {
        tags: ['Profiles'],
        summary: 'List unlocked achievements for a public profile',
        params: {
          type: 'object',
          required: ['username'],
          properties: { username: { type: 'string' } },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { username } = request.params as { username: string };
      const { rows } = await fastify.db.query<{ id: string }>(
        `SELECT id FROM users WHERE username = $1 AND deleted_at IS NULL LIMIT 1`,
        [username],
      );
      if (!rows[0]) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Profile not found.' });
      }
      // Public-read path: no evaluation, just whatever has been persisted.
      const { rows: achievements } = await fastify.db.query<{ achievement_key: string; unlocked_at: Date }>(
        `SELECT achievement_key, unlocked_at
           FROM user_achievements
          WHERE user_id = $1
          ORDER BY unlocked_at`,
        [rows[0].id],
      );
      return reply.status(200).send({
        items: achievements.map((r) => ({
          key: r.achievement_key,
          unlockedAt: r.unlocked_at.toISOString(),
        })),
      });
    }
  );
}

// Re-export so callers (like users.ts) can trigger the evaluator. Kept here
// so the route module is the single source of "how to evaluate on read."
export { achievementsService };
