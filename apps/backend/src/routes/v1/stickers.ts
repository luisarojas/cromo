import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as stickersService from '../../services/stickers.service.js';

// ─── Route handler ────────────────────────────────────────────────────────────

export async function stickersRoutes(fastify: FastifyInstance): Promise<void> {
  const prefix = '/api/v1/stickers';

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
            team:   { type: 'string', description: 'FIFA code of the team (e.g. ARG)' },
            group:  { type: 'string', description: 'Group letter (A-L)' },
            type:   { type: 'string', description: 'Sticker type (e.g. base, legend)' },
            search: { type: 'string', description: 'Player name search (case-insensitive)' },
            cursor: { type: 'integer', description: 'Last sticker number seen (cursor)' },
            limit:  { type: 'integer', minimum: 1, maximum: 200, default: 50 },
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
                    album_page:       { type: 'integer', nullable: true },
                    notes:            { type: 'string', nullable: true },
                    team_name:        { type: 'string', nullable: true },
                    fifa_code:        { type: 'string', nullable: true },
                    group_name:       { type: 'string', nullable: true },
                    base_variant_id:  { type: 'string', nullable: true },
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
      };

      try {
        const result = await stickersService.listStickers(fastify.db, fastify.redis, {
          team: q.team,
          group: q.group,
          type: q.type,
          search: q.search,
          cursor: q.cursor,
          limit: q.limit,
        });
        return reply.status(200).send(result);
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
              album_page:   { type: 'integer', nullable: true },
              notes:        { type: 'string', nullable: true },
              team_name:    { type: 'string', nullable: true },
              fifa_code:    { type: 'string', nullable: true },
              group_name:   { type: 'string', nullable: true },
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

      try {
        const sticker = await stickersService.getStickerByAlbumCode(fastify.db, albumCode);
        if (!sticker) {
          return reply.status(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: `Sticker with album code "${albumCode}" not found.`,
          });
        }
        return reply.status(200).send(sticker);
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

      try {
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
