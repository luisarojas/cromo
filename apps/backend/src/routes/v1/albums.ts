import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken, assertAccess } from '../../middleware/auth.js';
import * as albumsService from '../../services/albums.service.js';
import * as collectionService from '../../services/collection.service.js';
import * as favouritesService from '../../services/favourites.service.js';

const albumSettingsShape = {
  type: 'object',
  properties: {
    includeExtras:       { type: 'boolean' },
    includeCocaCola:     { type: 'boolean' },
    defaultBaseVariant:  { type: 'string', enum: ['base_border', 'base_borderless'] },
  },
} as const;

const albumShape = {
  type: 'object',
  properties: {
    id:                          { type: 'string' },
    user_id:                     { type: 'string' },
    album_type_id:               { type: 'string' },
    album_type_key:              { type: 'string' },
    album_type_name:             { type: 'string' },
    album_edition_id:            { type: 'string' },
    edition:                     { type: 'string' },
    edition_name:                { type: 'string' },
    album_format_id:             { type: 'string' },
    format:                      { type: 'string' },
    format_name:                 { type: 'string' },
    alias:                       { type: 'string', nullable: true },
    notes:                       { type: 'string', nullable: true },
    is_default:                  { type: 'boolean' },
    settings:                    albumSettingsShape,
    is_trade_inventory_public:   { type: 'boolean' },
    created_at:                  { type: 'string' },
    updated_at:                  { type: 'string' },
  },
} as const;

const albumStatsShape = {
  type: 'object',
  properties: {
    album_id:   { type: 'string' },
    total:      { type: 'integer' },
    owned:      { type: 'integer' },
    missing:    { type: 'integer' },
    duplicates: { type: 'integer' },
    percentage: { type: 'number' },
  },
} as const;

const albumWithStatsShape = {
  type: 'object',
  properties: {
    ...albumShape.properties,
    stats: albumStatsShape,
  },
} as const;

export async function albumsRoutes(fastify: FastifyInstance): Promise<void> {

  /**
   * GET /api/v1/users/:userId/albums
   */
  fastify.get(
    '/api/v1/users/:userId/albums',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Albums'],
        summary: "List a user's albums",
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string' } },
        },
        querystring: {
          type: 'object',
          properties: {
            sort: {
              type: 'string',
              enum: [
                'default',
                'created_desc',
                'created_asc',
                'completion_desc',
                'completion_asc',
                'alias_asc',
              ],
              default: 'default',
            },
            type: { type: 'string' },
            withStats: { type: 'boolean', default: false },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.params as { userId: string };
      if (!assertAccess(request, reply, userId, 'albums')) return;
      const { sort, type, withStats } = request.query as {
        sort?: string; type?: string; withStats?: boolean;
      };
      const items = withStats
        ? await albumsService.listAlbumsWithStats(fastify.db, userId, sort, type)
        : await albumsService.listAlbums(fastify.db, userId, sort, type);
      return reply.status(200).send({ items });
    }
  );

  /**
   * GET /api/v1/users/:userId/albums/stats
   * Per-album completion stats computed server-side (replaces the client-side
   * `computeAlbumStats` that used to filter the entire sticker catalog in JS).
   */
  fastify.get(
    '/api/v1/users/:userId/albums/stats',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Albums'],
        summary: 'Get per-album completion stats',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string' } },
        },
        response: {
          200: {
            type: 'object',
            properties: { items: { type: 'array', items: albumStatsShape } },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.params as { userId: string };
      if (!assertAccess(request, reply, userId, 'albums')) return;
      const items = await albumsService.getAlbumStats(fastify.db, fastify.redis, userId);
      return reply.status(200).send({ items });
    }
  );

  /**
   * GET /api/v1/users/:userId/albums/:albumId/view
   *
   * The album detail page's single source of truth. Bundles every payload the
   * page used to fetch separately:
   *   - ownedVariants  (was: 50-iteration fetchCollection loop)
   *   - stats          (denormalized on user_albums)
   *   - totalExtraCopies
   *   - filterOptions  (distinct (group, team, type, variant) in the album)
   *   - crossAlbum     ({neededIn, availableIn, presentIn} for indicators)
   * One round-trip end-to-end; one cache lookup per sub-payload.
   */
  fastify.get(
    '/api/v1/users/:userId/albums/:albumId/view',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Albums'],
        summary: 'Bundled album-page payload (owned + stats + filters + cross-album)',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId', 'albumId'],
          properties: { userId: { type: 'string' }, albumId: { type: 'string' } },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId, albumId } = request.params as { userId: string; albumId: string };
      if (!assertAccess(request, reply, userId, 'albums')) return;

      const [ownedVariants, statsAndExtras, filterOptions, crossAlbum] = await Promise.all([
        collectionService.getOwnedVariants(fastify.db, fastify.redis, userId, albumId),
        collectionService.getStatsAndExtras(fastify.db, albumId),
        collectionService.getFilterOptions(fastify.db, fastify.redis, userId, albumId),
        albumsService.getCrossAlbum(fastify.db, fastify.redis, userId, albumId),
      ]);

      return reply.status(200).send({
        ownedVariants,
        stats: statsAndExtras.stats,
        totalExtraCopies: statsAndExtras.totalExtraCopies,
        filterOptions,
        crossAlbum,
      });
    },
  );

  /**
   * GET /api/v1/users/:userId/albums/:albumId/cross-album
   * Returns three maps keyed by sticker album_code for the active album:
   *   neededIn    — other albums that do NOT own a code this album owns
   *   availableIn — other albums where a code has duplicates (qty > 1)
   *   presentIn   — other albums that also own a code
   *
   * Replaces three client-side useMemo passes over /albums/summary.
   */
  fastify.get(
    '/api/v1/users/:userId/albums/:albumId/cross-album',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Albums'],
        summary: 'Cross-album sticker indicators for the active album',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId', 'albumId'],
          properties: { userId: { type: 'string' }, albumId: { type: 'string' } },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId, albumId } = request.params as { userId: string; albumId: string };
      if (!assertAccess(request, reply, userId, 'albums')) return;
      const result = await albumsService.getCrossAlbum(fastify.db, fastify.redis, userId, albumId);
      return reply.status(200).send(result);
    },
  );

  /**
   * GET /api/v1/users/:userId/albums/:albumId
   */
  fastify.get(
    '/api/v1/users/:userId/albums/:albumId',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Albums'],
        summary: 'Get a single album',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId', 'albumId'],
          properties: { userId: { type: 'string' }, albumId: { type: 'string' } },
        },
        response: { 200: albumShape },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId, albumId } = request.params as { userId: string; albumId: string };
      if (!assertAccess(request, reply, userId, 'albums')) return;
      const album = await albumsService.getAlbum(fastify.db, userId, albumId);
      if (!album) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Album not found.' });
      return reply.status(200).send(album);
    }
  );

  /**
   * POST /api/v1/users/:userId/albums
   */
  fastify.post(
    '/api/v1/users/:userId/albums',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Albums'],
        summary: 'Create a new album for a user',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId'],
          properties: { userId: { type: 'string' } },
        },
        body: {
          type: 'object',
          properties: {
            alias:                     { type: 'string', nullable: true, minLength: 1, maxLength: 100 },
            notes:                     { type: 'string', nullable: true, maxLength: 500 },
            edition:                   { type: 'string' },
            format:                    { type: 'string' },
            settings:                  albumSettingsShape,
            isTradeInventoryPublic:    { type: 'boolean' },
          },
        },
        response: { 201: albumWithStatsShape },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.params as { userId: string };
      if (!assertAccess(request, reply, userId, 'albums')) return;
      const body = request.body as { alias?: string | null; notes?: string | null; edition?: string; format?: string; settings?: { includeExtras?: boolean; includeCocaCola?: boolean; defaultBaseVariant?: 'base_border' | 'base_borderless' }; isTradeInventoryPublic?: boolean };
      const album = await albumsService.createAlbum(fastify.db, fastify.redis, userId, body);
      const stats = await albumsService.getAlbumStatsForOne(fastify.db, fastify.redis, userId, album.id);
      return reply.status(201).send({ ...album, stats });
    }
  );

  /**
   * PATCH /api/v1/users/:userId/albums/:albumId
   */
  fastify.patch(
    '/api/v1/users/:userId/albums/:albumId',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Albums'],
        summary: 'Update album alias, edition, format, notes, and/or settings',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId', 'albumId'],
          properties: { userId: { type: 'string' }, albumId: { type: 'string' } },
        },
        body: {
          type: 'object',
          properties: {
            alias:                     { type: 'string', nullable: true, minLength: 1, maxLength: 100 },
            notes:                     { type: 'string', nullable: true, maxLength: 500 },
            edition:                   { type: 'string' },
            format:                    { type: 'string' },
            settings:                  albumSettingsShape,
            isTradeInventoryPublic:    { type: 'boolean' },
          },
        },
        response: { 200: albumWithStatsShape },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId, albumId } = request.params as { userId: string; albumId: string };
      if (!assertAccess(request, reply, userId, 'albums')) return;
      const body = request.body as { alias?: string | null; notes?: string | null; edition?: string; format?: string; settings?: { includeExtras?: boolean; includeCocaCola?: boolean; defaultBaseVariant?: 'base_border' | 'base_borderless' }; isTradeInventoryPublic?: boolean };
      const album = await albumsService.updateAlbum(fastify.db, fastify.redis, userId, albumId, body);
      if (!album) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Album not found.' });
      const stats = await albumsService.getAlbumStatsForOne(fastify.db, fastify.redis, userId, album.id);
      return reply.status(200).send({ ...album, stats });
    }
  );

  /**
   * POST /api/v1/users/:userId/albums/:albumId/set-default
   */
  fastify.post(
    '/api/v1/users/:userId/albums/:albumId/set-default',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Albums'],
        summary: 'Set an album as the default',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId', 'albumId'],
          properties: { userId: { type: 'string' }, albumId: { type: 'string' } },
        },
        response: { 200: albumShape },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId, albumId } = request.params as { userId: string; albumId: string };
      if (!assertAccess(request, reply, userId, 'albums')) return;
      const album = await albumsService.setDefaultAlbum(fastify.db, userId, albumId);
      return reply.status(200).send(album);
    }
  );

  /**
   * DELETE /api/v1/users/:userId/albums/:albumId
   */
  fastify.delete(
    '/api/v1/users/:userId/albums/:albumId',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Albums'],
        summary: 'Delete a non-default album (cascades to its stickers)',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId', 'albumId'],
          properties: { userId: { type: 'string' }, albumId: { type: 'string' } },
        },
        response: { 204: { type: 'null', description: 'Album deleted' } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId, albumId } = request.params as { userId: string; albumId: string };
      if (!assertAccess(request, reply, userId, 'albums')) return;
      await albumsService.deleteAlbum(fastify.db, fastify.redis, userId, albumId);
      return reply.status(204).send();
    }
  );

  /**
   * POST /api/v1/users/:userId/albums/:albumId/stickers/:variantId/move
   */
  fastify.post(
    '/api/v1/users/:userId/albums/:albumId/stickers/:variantId/move',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Albums'],
        summary: 'Move sticker copies from one album to another',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId', 'albumId', 'variantId'],
          properties: {
            userId:    { type: 'string' },
            albumId:   { type: 'string' },
            variantId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['targetAlbumId', 'quantity'],
          properties: {
            targetAlbumId: { type: 'string' },
            quantity:      { type: 'integer', minimum: 1 },
          },
        },
        response: { 204: { type: 'null', description: 'Sticker moved successfully' } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId, albumId, variantId } = request.params as {
        userId: string; albumId: string; variantId: string;
      };
      if (!assertAccess(request, reply, userId, 'albums')) return;
      const { targetAlbumId, quantity } = request.body as {
        targetAlbumId: string; quantity: number;
      };
      await albumsService.moveSticker(
        fastify.db, fastify.redis, userId, albumId, targetAlbumId, variantId, quantity
      );
      return reply.status(204).send();
    }
  );

  /**
   * GET /api/v1/users/:userId/albums/:albumId/favourites
   * Returns the album_codes the user has favourited inside this album.
   */
  fastify.get(
    '/api/v1/users/:userId/albums/:albumId/favourites',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Albums'],
        summary: "List a user's favourited stickers in an album",
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId', 'albumId'],
          properties: { userId: { type: 'string' }, albumId: { type: 'string' } },
        },
        response: {
          200: {
            type: 'object',
            properties: { items: { type: 'array', items: { type: 'string' } } },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId, albumId } = request.params as { userId: string; albumId: string };
      if (!assertAccess(request, reply, userId, 'albums')) return;
      const items = await favouritesService.listFavourites(fastify.db, albumId);
      return reply.status(200).send({ items });
    },
  );

  /**
   * PUT /api/v1/users/:userId/albums/:albumId/favourites
   * Replace the full favourites set in one statement. The body lists sticker
   * IDs (UUIDs), not album_codes — keeps the API canonical even though the
   * frontend often refers to stickers by album_code.
   */
  fastify.put(
    '/api/v1/users/:userId/albums/:albumId/favourites',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Albums'],
        summary: "Replace the user's favourite stickers for an album",
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId', 'albumId'],
          properties: { userId: { type: 'string' }, albumId: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['stickerIds'],
          properties: {
            stickerIds: {
              type: 'array',
              items: { type: 'string' },
              maxItems: 5000,
            },
          },
        },
        response: { 204: { type: 'null', description: 'Favourites updated' } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId, albumId } = request.params as { userId: string; albumId: string };
      if (!assertAccess(request, reply, userId, 'albums')) return;
      const { stickerIds } = request.body as { stickerIds: string[] };
      await favouritesService.setFavourites(fastify.db, albumId, stickerIds);
      return reply.status(204).send();
    },
  );

  /**
   * POST /api/v1/users/:userId/albums/:albumId/favourites/:stickerId/toggle
   */
  fastify.post(
    '/api/v1/users/:userId/albums/:albumId/favourites/:stickerId/toggle',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Albums'],
        summary: 'Toggle a single sticker as favourited in an album',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId', 'albumId', 'stickerId'],
          properties: {
            userId: { type: 'string' },
            albumId: { type: 'string' },
            stickerId: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: { favourited: { type: 'boolean' } },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId, albumId, stickerId } = request.params as {
        userId: string; albumId: string; stickerId: string;
      };
      if (!assertAccess(request, reply, userId, 'albums')) return;
      const result = await favouritesService.toggleFavourite(fastify.db, albumId, stickerId);
      return reply.status(200).send(result);
    },
  );

  /**
   * GET /api/v1/album-types/:typeKey/editions
   * Public — returns the ordered list of editions for an album type.
   */
  fastify.get(
    '/api/v1/album-types/:typeKey/editions',
    {
      schema: {
        tags: ['Albums'],
        summary: 'List editions for an album type',
        params: {
          type: 'object',
          required: ['typeKey'],
          properties: { typeKey: { type: 'string', maxLength: 64 } },
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
                    key:  { type: 'string' },
                    name: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { typeKey } = request.params as { typeKey: string };
      const cacheKey = `album_editions:${typeKey}`;
      const cached = await fastify.redis.get(cacheKey);
      if (cached) return reply.status(200).send({ items: JSON.parse(cached) });

      const { rows } = await fastify.db.query<{ key: string; name: string }>(
        `SELECT ae.key, ae.name
         FROM album_editions ae
         JOIN album_types at ON at.id = ae.album_type_id
         WHERE at.key = $1
         ORDER BY ae.created_at ASC`,
        [typeKey],
      );

      if (rows.length === 0) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Album type not found.' });
      }

      await fastify.redis.set(cacheKey, JSON.stringify(rows), 'EX', 86400);
      return reply.status(200).send({ items: rows });
    }
  );

  /**
   * GET /api/v1/album-types/:typeKey/formats
   * Public — returns every format for an album type, each annotated with the
   * editions it's available for. Lets the client filter the format dropdown
   * client-side when the user picks an edition (rather than re-fetching).
   */
  fastify.get(
    '/api/v1/album-types/:typeKey/formats',
    {
      schema: {
        tags: ['Albums'],
        summary: 'List formats for an album type (with per-edition availability)',
        params: {
          type: 'object',
          required: ['typeKey'],
          properties: { typeKey: { type: 'string', maxLength: 64 } },
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
                    key:      { type: 'string' },
                    name:     { type: 'string' },
                    editions: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { typeKey } = request.params as { typeKey: string };
      const cacheKey = `album_formats:${typeKey}`;
      const cached = await fastify.redis.get(cacheKey);
      if (cached) return reply.status(200).send({ items: JSON.parse(cached) });

      // Both `af` and (via the junction) `ae` are constrained to the same
      // album_type_id, so the query is naturally scoped to `typeKey`.
      const { rows } = await fastify.db.query<{ key: string; name: string; editions: string[] }>(
        `SELECT af.key,
                af.name,
                COALESCE(
                  ARRAY_AGG(ae.key ORDER BY ae.created_at) FILTER (WHERE ae.key IS NOT NULL),
                  '{}'
                ) AS editions
         FROM album_formats af
         JOIN album_types at ON at.id = af.album_type_id
         LEFT JOIN album_edition_formats aef
                ON aef.album_format_id = af.id
               AND aef.album_type_id   = af.album_type_id
         LEFT JOIN album_editions ae
                ON ae.id = aef.album_edition_id
               AND ae.album_type_id = af.album_type_id
         WHERE at.key = $1
         GROUP BY af.id, af.key, af.name, af.created_at
         ORDER BY af.created_at ASC`,
        [typeKey],
      );

      if (rows.length === 0) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Album type not found.' });
      }

      await fastify.redis.set(cacheKey, JSON.stringify(rows), 'EX', 86400);
      return reply.status(200).send({ items: rows });
    }
  );
}
