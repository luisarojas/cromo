import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken, requireRole } from '../../middleware/auth.js';
import { recordAudit } from '../../utils/audit.js';

const adminOnly = { preHandler: [verifyToken, requireRole('admin')] };

// ─── Route handler ────────────────────────────────────────────────────────────

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── User management ────────────────────────────────────────────────────────

  /**
   * GET /api/v1/admin/users
   * Admin only — list all users with ban status.
   */
  fastify.get(
    '/api/v1/admin/users',
    adminOnly,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { search, page, limit } = request.query as {
        search?: string;
        page?: string;
        limit?: string;
      };

      const pageNum = Math.max(1, parseInt(page ?? '1', 10));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit ?? '20', 10)));
      const offset = (pageNum - 1) * limitNum;
      const trimmedSearch = search?.slice(0, 100);
      const searchParam = trimmedSearch ? `%${trimmedSearch}%` : null;

      const { rows } = await fastify.db.query<{
        id: string;
        username: string;
        email: string;
        role: string;
        created_at: string;
        deleted_at: string | null;
        is_banned: boolean;
        total_count: string;
      }>(
        `SELECT
           u.id, u.username, u.email, u.role, u.created_at, u.deleted_at,
           EXISTS(
             SELECT 1 FROM user_bans b
             WHERE b.user_id = u.id
               AND b.lifted_at IS NULL
               AND (b.expires_at IS NULL OR b.expires_at > NOW())
           ) AS is_banned,
           COUNT(*) OVER () AS total_count
         FROM users u
         WHERE ($1::text IS NULL OR u.username ILIKE $1 OR u.email ILIKE $1)
         ORDER BY u.created_at DESC
         LIMIT $2 OFFSET $3`,
        [searchParam, limitNum, offset],
      );

      const total = rows.length > 0 ? parseInt(rows[0]!.total_count, 10) : 0;
      const items = rows.map(({ total_count: _t, ...rest }) => rest);

      return reply.status(200).send({
        items,
        total,
        page: pageNum,
        limit: limitNum,
      });
    },
  );

  /**
   * PATCH /api/v1/admin/users/:id/role
   * Admin only — change a user's role.
   */
  fastify.patch(
    '/api/v1/admin/users/:id/role',
    adminOnly,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { role } = request.body as { role: string };

      if (id === request.userId) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Cannot change your own role.' });
      }

      if (!['user', 'admin'].includes(role)) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Role must be "user" or "admin".' });
      }

      const { rows } = await fastify.db.query<{ id: string; username: string; role: string }>(
        `UPDATE users SET role = $1, updated_at = NOW()
         WHERE id = $2 AND deleted_at IS NULL
         RETURNING id, username, role`,
        [role, id],
      );

      if (rows.length === 0) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'User not found.' });
      }

      await recordAudit(fastify.db, request.userId!, 'user_role_changed', {
        targetUserId: id,
        newRole: role,
      });

      return reply.status(200).send(rows[0]);
    },
  );

  /**
   * POST /api/v1/admin/users/:id/ban
   * Admin only — ban a user.
   */
  fastify.post(
    '/api/v1/admin/users/:id/ban',
    adminOnly,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { reason, banType } = request.body as { reason: string; banType?: string };

      if (id === request.userId) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Cannot ban yourself.' });
      }

      if (!reason || reason.length < 5 || reason.length > 500) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Reason must be between 5 and 500 characters.' });
      }

      const resolvedBanType = ['soft', 'hard'].includes(banType ?? '') ? banType : 'soft';

      const { rows: userRows } = await fastify.db.query<{ id: string }>(
        `SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL`,
        [id],
      );
      if (userRows.length === 0) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'User not found.' });
      }

      const { rows } = await fastify.db.query<{ id: string }>(
        `INSERT INTO user_bans (user_id, ban_type, reason, banned_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [id, resolvedBanType, reason, request.userId],
      );

      await recordAudit(fastify.db, request.userId!, 'user_banned', {
        targetUserId: id,
        banId: rows[0].id,
        banType: resolvedBanType!,
      });

      return reply.status(201).send({ id: rows[0].id, userId: id });
    },
  );

  /**
   * DELETE /api/v1/admin/users/:id/ban
   * Admin only — lift the active ban on a user.
   */
  fastify.delete(
    '/api/v1/admin/users/:id/ban',
    adminOnly,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { liftReason } = (request.body as { liftReason?: string }) ?? {};

      if (liftReason && liftReason.length > 500) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Lift reason must be 500 characters or fewer.' });
      }

      const { rowCount } = await fastify.db.query(
        `UPDATE user_bans
         SET lifted_at = NOW(), lifted_by = $1, lift_reason = $2
         WHERE user_id = $3
           AND lifted_at IS NULL
           AND (expires_at IS NULL OR expires_at > NOW())`,
        [request.userId, liftReason ?? null, id],
      );

      if (!rowCount || rowCount === 0) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'No active ban found for this user.' });
      }

      await recordAudit(fastify.db, request.userId!, 'user_unbanned', {
        targetUserId: id,
      });

      return reply.status(204).send();
    },
  );

  /**
   * DELETE /api/v1/admin/users/:id
   * Admin only — soft-delete a user account.
   */
  fastify.delete(
    '/api/v1/admin/users/:id',
    adminOnly,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      if (id === request.userId) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Cannot delete your own account.' });
      }

      const { rows } = await fastify.db.query<{ id: string }>(
        `UPDATE users SET deleted_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING id`,
        [id],
      );

      if (rows.length === 0) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'User not found.' });
      }

      await recordAudit(fastify.db, request.userId!, 'user_deleted', {
        targetUserId: id,
      });

      return reply.status(204).send();
    },
  );

  // ─── Sticker management ─────────────────────────────────────────────────────

  /**
   * PATCH /api/v1/admin/stickers/:id
   * Admin only — partial update of sticker metadata. Writes to audit_log.
   */
  fastify.patch(
    '/api/v1/admin/stickers/:id',
    {
      preHandler: [verifyToken, requireRole('admin')],
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
      const { id } = request.params as { id: string };
      const body = request.body as {
        playerName?: string | null;
        position?: string | null;
        notes?: string | null;
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

      if (setClauses.length === 0) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'No updatable fields provided.',
        });
      }

      setClauses.push(`updated_at = NOW()`);
      values.push(id); // last param — the WHERE clause

      const { rows } = await fastify.db.query<{
        id: string;
        number: number;
        album_code: string;
        player_name: string | null;
        position: string | null;
        sticker_type: string;
        notes: string | null;
      }>(
        `UPDATE stickers
         SET ${setClauses.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING id, number, album_code, player_name, position,
                   sticker_type, notes`,
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

      await recordAudit(fastify.db, request.userId!, 'sticker_updated', {
        stickerId: id,
        changes: body as Record<string, unknown>,
      });

      // Bust the catalog version cache so every browser refetches.
      await fastify.redis.del('stickfolio:catalog_version').catch(() => undefined);

      return reply.status(200).send(updated);
    }
  );
}
