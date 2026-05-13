import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from '../../middleware/auth.js';

// ─── Route handler ────────────────────────────────────────────────────────────

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {

  /**
   * PATCH /api/v1/admin/stickers/:id
   * Admin only — partial update of sticker metadata. Writes to audit_log.
   */
  fastify.patch(
    '/api/v1/admin/stickers/:id',
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Admin'],
        summary: 'Partially update sticker metadata (admin only)',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          minProperties: 1,
          properties: {
            playerName: { type: 'string', nullable: true },
            position:   { type: 'string', nullable: true },
            notes:      { type: 'string', nullable: true },
            albumPage:  { type: 'integer', nullable: true },
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
              album_page:   { type: 'integer', nullable: true },
              notes:        { type: 'string', nullable: true },
            },
          },
          403: {
            type: 'object',
            properties: {
              statusCode: { type: 'integer' },
              error:      { type: 'string' },
              message:    { type: 'string' },
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
      // Admin-only guard
      if (request.userRole !== 'admin') {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'This endpoint is restricted to administrators.',
        });
      }

      const { id } = request.params as { id: string };
      const body = request.body as {
        playerName?: string | null;
        position?: string | null;
        notes?: string | null;
        albumPage?: number | null;
      };

      // Build SET clause dynamically from provided fields
      const setClauses: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if ('playerName' in body) {
        setClauses.push(`player_name = $${paramIndex++}`);
        values.push(body.playerName ?? null);
      }
      if ('position' in body) {
        setClauses.push(`position = $${paramIndex++}`);
        values.push(body.position ?? null);
      }
      if ('notes' in body) {
        setClauses.push(`notes = $${paramIndex++}`);
        values.push(body.notes ?? null);
      }
      if ('albumPage' in body) {
        setClauses.push(`album_page = $${paramIndex++}`);
        values.push(body.albumPage ?? null);
      }

      if (setClauses.length === 0) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'No updatable fields provided.',
        });
      }

      setClauses.push(`updated_at = NOW()`);
      values.push(id); // last param — the WHERE clause

      try {
        const { rows } = await fastify.db.query<{
          id: string;
          number: number;
          album_code: string;
          player_name: string | null;
          position: string | null;
          sticker_type: string;
          album_page: number | null;
          notes: string | null;
        }>(
          `UPDATE stickers
           SET ${setClauses.join(', ')}
           WHERE id = $${paramIndex}
           RETURNING id, number, album_code, player_name, position,
                     sticker_type, album_page, notes`,
          values
        );

        if (rows.length === 0) {
          return reply.status(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: `Sticker with id "${id}" not found.`,
          });
        }

        const updated = rows[0];

        // Audit log
        await fastify.db.query(
          `INSERT INTO audit_log (user_id, action, metadata)
           VALUES ($1, 'sticker_updated', $2::jsonb)`,
          [
            request.userId,
            JSON.stringify({ sticker_id: id, changes: body }),
          ]
        );

        return reply.status(200).send(updated);
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
