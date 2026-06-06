import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as stickersService from '../../services/stickers.service.js';

// ─── Route handler ────────────────────────────────────────────────────────────

export async function stickersRoutes(fastify: FastifyInstance): Promise<void> {
  const prefix = '/api/v1/stickers';

  /**
   * GET /api/v1/stickers/version
   * Opaque catalog version. The frontend keys its localStorage cache off this
   * value so a backend catalog reseed invalidates every browser automatically
   * (replaces the manual STICKER_CACHE_KEY bump). Public — no auth required.
   */
  fastify.get(
    `${prefix}/version`,
    {
      schema: {
        tags: ['Stickers'],
        summary: 'Opaque catalog version for client cache keying',
        response: {
          200: {
            type: 'object',
            properties: { version: { type: 'string' } },
          },
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const version = await stickersService.getCatalogVersion(fastify.db, fastify.redis);
      return reply.status(200).send({ version });
    }
  );

  /**
   * GET /api/v1/stickers
   * Public — no auth required.
   */
  fastify.get(
    prefix,
    {
      schema: {
        tags: ['Stickers'],
        summary: 'List all stickers with optional filters and cursor-based pagination',
        querystring: {
          type: 'object',
          properties: {
            team:          { type: 'string', maxLength: 8,  description: 'FIFA code of the team (e.g. ARG)' },
            group:         { type: 'string', maxLength: 2,  description: 'Group letter (A-L)' },
            type:          { type: 'string', maxLength: 32, description: 'Sticker type (e.g. base, legend)' },
            search:        { type: 'string', maxLength: 50, description: 'Player name search (case-insensitive)' },
            cursor:        { type: 'integer', description: 'Last sticker number seen (cursor)' },
            limit:         { type: 'integer', minimum: 1, maximum: 200, default: 50 },
            albumType:     { type: 'string', maxLength: 64, description: 'Album type key (e.g. wc_2026)' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id:               { type: 'string' },
                    number:           { type: 'integer' },
                    album_code:       { type: 'string' },
                    player_name:      { type: 'string', nullable: true },
                    position:         { type: 'string', nullable: true },
                    sticker_type:     { type: 'string' },
                    is_foil:          { type: 'boolean' },
                    team_id:          { type: 'string', nullable: true },
                    notes:            { type: 'string', nullable: true },
                    team_name:        { type: 'string', nullable: true },
                    fifa_code:        { type: 'string', nullable: true },
                    group_name:       { type: 'string', nullable: true },
                    base_variant_id:  { type: 'string', nullable: true },
                    team_pages:       { type: 'object', nullable: true, additionalProperties: { type: 'array', items: { type: 'integer' } } },
                    sticker_pages:    {
                      type: 'object', nullable: true,
                      additionalProperties: {
                        type: 'object',
                        properties: {
                          page_start:  { type: 'integer', nullable: true },
                          page_end:    { type: 'integer', nullable: true },
                          description: { type: 'string', nullable: true },
                        },
                      },
                    },
                  },
                },
              },
              nextCursor: { type: 'integer', nullable: true },
              total:      { type: 'integer' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const q = request.query as {
        team?: string;
        group?: string;
        type?: string;
        search?: string;
        cursor?: number;
        limit?: number;
        albumType?: string;
      };

      const result = await stickersService.listStickers(fastify.db, fastify.redis, {
        team: q.team,
        group: q.group,
        type: q.type,
        search: q.search,
        cursor: q.cursor,
        limit: q.limit,
        albumTypeKey: q.albumType,
      });
      // Catalog is effectively static between admin edits, and the client passes
      // ?v=<catalogVersion> on each URL (busts the cache on any catalog mutation).
      // Treat each (version, filter) combo as immutable: long max-age, short SWR
      // window. Browser + CDN can cache freely; admin edits bump the version and
      // produce a fresh URL on next page load.
      reply.header('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      return reply.status(200).send(result);
    }
  );

  /**
   * POST /api/v1/stickers/lookup
   * Bulk fetch sticker display info + all variants for a list of album codes.
   * Used by the trade sticker picker to avoid N×2 individual requests.
   * Public — no auth required.
   */
  fastify.post(
    `${prefix}/lookup`,
    {
      schema: {
        tags: ['Stickers'],
        summary: 'Bulk lookup sticker info and variants by album codes',
        body: {
          type: 'object',
          required: ['codes'],
          properties: {
            codes: { type: 'array', items: { type: 'string' }, maxItems: 100 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    album_code:  { type: 'string' },
                    player_name: { type: 'string', nullable: true },
                    team_name:   { type: 'string', nullable: true },
                    fifa_code:   { type: 'string', nullable: true },
                    group_name:  { type: 'string', nullable: true },
                    variants: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id:           { type: 'string' },
                          sticker_id:   { type: 'string' },
                          variant_type: { type: 'string' },
                          rarity_rank:  { type: 'integer' },
                          availability: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { codes } = request.body as { codes: string[] };
      const items = await stickersService.getStickersByAlbumCodes(fastify.db, codes);
      return reply.status(200).send({ items });
    }
  );

  /**
   * GET /api/v1/stickers/:albumCode
   * Public — no auth required.
   */
  fastify.get(
    `${prefix}/:albumCode`,
    {
      schema: {
        tags: ['Stickers'],
        summary: 'Get a single sticker by its album code',
        params: {
          type: 'object',
          required: ['albumCode'],
          properties: {
            albumCode: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id:           { type: 'string' },
              number:       { type: 'integer' },
              album_code:   { type: 'string' },
              player_name:  { type: 'string', nullable: true },
              position:     { type: 'string', nullable: true },
              sticker_type: { type: 'string' },
              team_id:      { type: 'string', nullable: true },
              notes:        { type: 'string', nullable: true },
              team_name:    { type: 'string', nullable: true },
              fifa_code:    { type: 'string', nullable: true },
              group_name:   { type: 'string', nullable: true },
              team_pages:   { type: 'object', nullable: true, additionalProperties: { type: 'array', items: { type: 'integer' } } },
            },
          },
          404: {
            type: 'object',
            properties: {
              statusCode: { type: 'integer' },
              error:      { type: 'string' },
              message:    { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { albumCode } = request.params as { albumCode: string };

      const sticker = await stickersService.getStickerByAlbumCode(fastify.db, albumCode);
      if (!sticker) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Sticker with album code "${albumCode}" not found.`,
        });
      }
      return reply.status(200).send(sticker);
    }
  );

  /**
   * GET /api/v1/stickers/:albumCode/variants
   * Public — no auth required.
   */
  fastify.get(
    `${prefix}/:albumCode/variants`,
    {
      schema: {
        tags: ['Stickers'],
        summary: 'Get all variants for a sticker',
        params: {
          type: 'object',
          required: ['albumCode'],
          properties: {
            albumCode: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id:           { type: 'string' },
                    sticker_id:   { type: 'string' },
                    variant_type: { type: 'string' },
                    label:        { type: 'string', nullable: true },
                    print_run:    { type: 'integer', nullable: true },
                    rarity:       { type: 'string', nullable: true },
                    created_at:   { type: 'string' },
                  },
                },
              },
            },
          },
          404: {
            type: 'object',
            properties: {
              statusCode: { type: 'integer' },
              error:      { type: 'string' },
              message:    { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { albumCode } = request.params as { albumCode: string };
      const { stickerId } = request.query as { stickerId?: string };

      // If the caller passes ?stickerId=<uuid> the album code in the path is
      // treated as documentation only and variants are scoped to that exact
      // sticker. Needed for CC regional alternates that share an album_code.
      if (stickerId) {
        const variants = await stickersService.getStickerVariantsByStickerId(fastify.db, stickerId);
        return reply.status(200).send({ items: variants });
      }

      // Verify parent sticker exists
      const sticker = await stickersService.getStickerByAlbumCode(fastify.db, albumCode);
      if (!sticker) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Sticker with album code "${albumCode}" not found.`,
        });
      }

      const variants = await stickersService.getStickerVariants(fastify.db, albumCode);
      return reply.status(200).send({ items: variants });
    }
  );
}
