import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from '../../middleware/auth.js';
import { checkSoftBan } from '../../middleware/ban-check.js';
import {
  getTrustScore,
  checkAutoFlag,
  isFeatureFlagEnabled,
} from '../../services/trust-safety.service.js';
import { recordAudit } from '../../utils/audit.js';
import { safeCacheGet, safeCacheSet } from '../../services/cache.js';
import {
  validateImageBuffer,
  saveReportAttachment,
  readReportAttachment,
} from '../../services/upload.service.js';

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

async function requireAdmin(req: FastifyRequest, rep: FastifyReply): Promise<boolean> {
  if (req.userRole !== 'admin') {
    rep.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Admin only.' });
    return false;
  }
  return true;
}

const FEATURE_KEY = 'FEATURE_TRUST_SAFETY';

async function guardFeature(
  fastify: FastifyInstance,
  reply: FastifyReply,
): Promise<boolean> {
  const enabled = await isFeatureFlagEnabled(fastify.db, FEATURE_KEY);
  if (!enabled) {
    reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Feature not available.' });
    return false;
  }
  return true;
}

export async function trustSafetyRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── POST /api/v1/trade/requests/:tradeId/ratings ────────────────────────────

  fastify.post(
    '/api/v1/trade/requests/:tradeId/ratings',
    { preHandler: [verifyToken, checkSoftBan(fastify)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!await guardFeature(fastify, reply)) return;

      const { tradeId } = request.params as { tradeId: string };
      const { isPositive, comment } = request.body as { isPositive: boolean; comment?: string };

      if (typeof isPositive !== 'boolean') {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'isPositive must be a boolean.' });
      }
      if (comment !== undefined && (typeof comment !== 'string' || comment.length > 500)) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Comment must be 500 characters or fewer.' });
      }

      const { rows: tradeRows } = await fastify.db.query<{
        requester_id: string;
        recipient_id: string;
        rating_eligible_at: string | null;
      }>(
        `SELECT requester_id, recipient_id, rating_eligible_at
         FROM trade_requests
         WHERE id = $1`,
        [tradeId],
      );

      if (tradeRows.length === 0) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Trade not found.' });
      }

      const trade = tradeRows[0]!;

      if (trade.rating_eligible_at === null) {
        return reply.status(422).send({
          statusCode: 422,
          error: 'Unprocessable Entity',
          message: 'Trade has not progressed far enough to be rated.',
          details: 'Rate once the offer has been accepted by both parties, after both sides have proposed a counteroffer, or after the trade completes.',
        });
      }

      const userId = request.userId!;
      const isRequester = trade.requester_id === userId;
      const isRecipient = trade.recipient_id === userId;

      if (!isRequester && !isRecipient) {
        return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'You are not a party to this trade.' });
      }

      const eligibleAt = new Date(trade.rating_eligible_at);
      const cutoff = new Date(eligibleAt.getTime() + 7 * 24 * 60 * 60 * 1000);
      if (new Date() > cutoff) {
        return reply.status(422).send({
          statusCode: 422,
          error: 'Unprocessable Entity',
          message: 'Rating window has closed.',
          details: 'Ratings must be submitted within 7 days of the trade becoming eligible to rate.',
        });
      }

      const { rows: existingRows } = await fastify.db.query<{ id: string }>(
        `SELECT id FROM trade_ratings WHERE trade_id = $1 AND rater_id = $2`,
        [tradeId, userId],
      );

      if (existingRows.length > 0) {
        return reply.status(409).send({ statusCode: 409, error: 'Conflict', message: 'You have already rated this trade.' });
      }

      const ratedUserId = isRequester ? trade.recipient_id : trade.requester_id;

      const { rows } = await fastify.db.query<{ id: string }>(
        `INSERT INTO trade_ratings (trade_id, rater_id, rated_user_id, is_positive, comment)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [tradeId, userId, ratedUserId, isPositive, comment ?? null],
      );

      await fastify.redis.del(`user:${ratedUserId}:trust_score`).catch(() => undefined);

      await recordAudit(fastify.db, userId, 'trade_rating_submitted', {
        tradeId,
        ratedUserId,
        isPositive,
      });

      return reply.status(201).send({ id: rows[0]!.id });
    },
  );

  // ─── GET /api/v1/users/:userId/ratings ───────────────────────────────────────

  fastify.get(
    '/api/v1/users/:userId/ratings',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!await guardFeature(fastify, reply)) return;

      const { userId } = request.params as { userId: string };
      const { cursor, limit: limitStr } = request.query as { cursor?: string; limit?: string };
      const limit = Math.min(50, Math.max(1, parseInt(limitStr ?? '20', 10)));

      const cacheKey = `user:${userId}:ratings:${cursor ?? ''}:${limit}`;
      const cached = await safeCacheGet(fastify.redis, cacheKey);
      if (cached) return reply.status(200).send(JSON.parse(cached));

      const trustScore = await getTrustScore(fastify.db, fastify.redis, userId);

      const { rows } = await fastify.db.query<{
        id: string;
        trade_id: string;
        rater_id: string;
        rater_username: string;
        rater_display_name: string | null;
        is_positive: boolean;
        comment: string | null;
        created_at: string;
      }>(
        `SELECT
           r.id, r.trade_id, r.rater_id,
           u.username AS rater_username,
           u.display_name AS rater_display_name,
           r.is_positive, r.comment, r.created_at
         FROM trade_ratings r
         JOIN users u ON u.id = r.rater_id
         WHERE r.rated_user_id = $1
           ${cursor ? `AND r.created_at < $3` : ''}
         ORDER BY r.created_at DESC
         LIMIT $2`,
        cursor ? [userId, limit, cursor] : [userId, limit],
      );

      const result = {
        trustScore,
        items: rows,
        nextCursor: rows.length === limit ? rows[rows.length - 1]!.created_at : null,
      };

      await safeCacheSet(fastify.redis, cacheKey, JSON.stringify(result), 120);
      return reply.status(200).send(result);
    },
  );

  // ─── GET /api/v1/trade/requests/:tradeId/ratings ─────────────────────────────

  fastify.get(
    '/api/v1/trade/requests/:tradeId/ratings',
    { preHandler: [verifyToken] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!await guardFeature(fastify, reply)) return;

      const { tradeId } = request.params as { tradeId: string };
      const userId = request.userId!;

      const { rows: tradeRows } = await fastify.db.query<{
        requester_id: string;
        recipient_id: string;
      }>(
        `SELECT requester_id, recipient_id FROM trade_requests WHERE id = $1`,
        [tradeId],
      );

      if (tradeRows.length === 0) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Trade not found.' });
      }

      const trade = tradeRows[0]!;
      if (trade.requester_id !== userId && trade.recipient_id !== userId) {
        return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'You are not a party to this trade.' });
      }

      const { rows } = await fastify.db.query<{
        id: string;
        rater_id: string;
        rater_username: string;
        rated_user_id: string;
        is_positive: boolean;
        comment: string | null;
        created_at: string;
      }>(
        `SELECT r.id, r.rater_id, u.username AS rater_username,
                r.rated_user_id, r.is_positive, r.comment, r.created_at
         FROM trade_ratings r
         JOIN users u ON u.id = r.rater_id
         WHERE r.trade_id = $1`,
        [tradeId],
      );

      return reply.status(200).send({ items: rows });
    },
  );

  // ─── POST /api/v1/users/:id/reports ──────────────────────────────────────────

  fastify.post(
    '/api/v1/users/:id/reports',
    { preHandler: [verifyToken] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!await guardFeature(fastify, reply)) return;

      const { id: reportedUserId } = request.params as { id: string };
      const reporterId = request.userId!;

      if (reporterId === reportedUserId) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'You cannot report yourself.' });
      }

      // Multipart parsing — collect text fields and up to MAX_ATTACHMENTS image
      // buffers. Anything beyond the limit is rejected before any DB writes.
      let category: string | undefined;
      let description: string | undefined;
      let tradeId: string | undefined;
      let messageIdsRaw: string | undefined;
      const fileBuffers: Buffer[] = [];

      if (!request.isMultipart()) {
        return reply.status(415).send({ statusCode: 415, error: 'Unsupported Media Type', message: 'Submit reports as multipart/form-data.' });
      }

      try {
        for await (const part of request.parts()) {
          if (part.type === 'field') {
            const value = typeof part.value === 'string' ? part.value : '';
            switch (part.fieldname) {
              case 'category':    category = value; break;
              case 'description': description = value; break;
              case 'tradeId':     tradeId = value || undefined; break;
              case 'messageIds':  messageIdsRaw = value || undefined; break;
            }
          } else {
            if (fileBuffers.length >= MAX_ATTACHMENTS) {
              // Drain the rest of the stream so the connection closes cleanly
              // before we reject — otherwise the client may see ECONNRESET.
              part.file.resume();
              return reply.status(400).send({
                statusCode: 400,
                error: 'Bad Request',
                message: `Up to ${MAX_ATTACHMENTS} attachments allowed.`,
              });
            }
            const chunks: Buffer[] = [];
            let total = 0;
            let oversize = false;
            for await (const chunk of part.file) {
              total += chunk.length;
              if (total > MAX_ATTACHMENT_BYTES) {
                oversize = true;
                break;
              }
              chunks.push(chunk);
            }
            if (oversize) {
              return reply.status(400).send({
                statusCode: 400,
                error: 'Bad Request',
                message: `Each attachment must be ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB or smaller.`,
              });
            }
            fileBuffers.push(Buffer.concat(chunks));
          }
        }
      } catch (err) {
        request.log.error({ err }, 'report submission: multipart parse failed');
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Failed to parse upload.' });
      }

      const validCategories = ['harassment','cancelled_after_accept','no_show','fake_stickers','damaged_stickers','spam','underage','other'];
      if (!category || !validCategories.includes(category)) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid category.' });
      }
      if (!description || description.length < 10 || description.length > 2000) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Description must be between 10 and 2000 characters.' });
      }

      let messageIds: string[] = [];
      if (messageIdsRaw) {
        try {
          const parsed = JSON.parse(messageIdsRaw);
          if (!Array.isArray(parsed) || !parsed.every((m) => typeof m === 'string')) {
            throw new Error('messageIds must be a JSON array of strings');
          }
          messageIds = Array.from(new Set(parsed));
        } catch {
          return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'messageIds must be a JSON array of strings.' });
        }
      }

      if (messageIds.length > 0 && !tradeId) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'messageIds require a tradeId.' });
      }

      // Validate every attachment buffer's magic bytes before touching the DB.
      for (const buf of fileBuffers) {
        try {
          await validateImageBuffer(buf);
        } catch (err) {
          const e = err as { statusCode?: number; message?: string };
          return reply.status(e.statusCode ?? 400).send({
            statusCode: e.statusCode ?? 400,
            error: e.statusCode === 415 ? 'Unsupported Media Type' : 'Bad Request',
            message: e.message ?? 'Unsupported attachment.',
          });
        }
      }

      const { rows: userRows } = await fastify.db.query<{ email_verified_at: string | null }>(
        `SELECT email_verified_at FROM users WHERE id = $1 AND deleted_at IS NULL`,
        [reporterId],
      );
      if (userRows.length === 0) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'User not found.' });
      }
      if (!userRows[0]!.email_verified_at) {
        return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Email verification required to submit reports.' });
      }

      const { rows: targetRows } = await fastify.db.query<{ id: string }>(
        `SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL`,
        [reportedUserId],
      );
      if (targetRows.length === 0) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'User not found.' });
      }

      // When a tradeId is provided, confirm the reporter was a party to that
      // trade — otherwise message references are out of context.
      if (tradeId) {
        const { rows: tradeRows } = await fastify.db.query<{
          requester_id: string;
          recipient_id: string;
        }>(
          `SELECT requester_id, recipient_id FROM trade_requests WHERE id = $1`,
          [tradeId],
        );
        if (tradeRows.length === 0) {
          return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Trade not found.' });
        }
        const t = tradeRows[0]!;
        if (t.requester_id !== reporterId && t.recipient_id !== reporterId) {
          return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'You were not a party to that trade.' });
        }
      }

      // Every cited message must belong to the linked trade. We don't require
      // it to have been sent by the reported user — a reporter may want to cite
      // their own messages too (e.g. "I asked them to stop"). The trade scope
      // is the only access check.
      if (messageIds.length > 0) {
        const { rows: msgRows } = await fastify.db.query<{ id: string }>(
          `SELECT id FROM trade_messages WHERE id = ANY($1::uuid[]) AND trade_id = $2`,
          [messageIds, tradeId],
        );
        if (msgRows.length !== messageIds.length) {
          return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'One or more messageIds do not belong to the linked trade.' });
        }
      }

      const { rows: dupRows } = await fastify.db.query<{ id: string }>(
        `SELECT id FROM user_reports
         WHERE reporter_id = $1
           AND reported_user_id = $2
           AND category = $3
           AND status IN ('open', 'under_review')`,
        [reporterId, reportedUserId, category],
      );
      if (dupRows.length > 0) {
        return reply.status(409).send({ statusCode: 409, error: 'Conflict', message: 'You already have an open report for this user with the same category.' });
      }

      const initialStatus = category === 'underage' ? 'under_review' : 'open';

      const { rows } = await fastify.db.query<{ id: string }>(
        `INSERT INTO user_reports (reporter_id, reported_user_id, trade_id, category, description, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [reporterId, reportedUserId, tradeId ?? null, category, description, initialStatus],
      );

      const reportId = rows[0]!.id;

      if (messageIds.length > 0) {
        await fastify.db.query(
          `INSERT INTO report_message_refs (report_id, message_id)
           SELECT $1, unnest($2::uuid[])`,
          [reportId, messageIds],
        );
      }

      // Process attachments after the report row exists so storage keys can be
      // namespaced by reportId. S3 PUTs aren't transactional — orphaned objects
      // on a later failure are cheap and can be swept later if needed.
      for (const buf of fileBuffers) {
        const saved = await saveReportAttachment(buf, reportId);
        await fastify.db.query(
          `INSERT INTO report_attachments (report_id, storage_key, mime_type, byte_size, width, height)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [reportId, saved.storageKey, saved.mimeType, saved.byteSize, saved.width, saved.height],
        );
      }

      await recordAudit(fastify.db, reporterId, 'user_report_submitted', {
        reportId,
        reportedUserId,
        category,
        attachmentCount: fileBuffers.length,
        messageRefCount: messageIds.length,
      });

      await checkAutoFlag(fastify.db, reportedUserId, fastify.redis);

      return reply.status(201).send({ id: reportId });
    },
  );

  // ─── GET /api/v1/users/me/reports/submitted ──────────────────────────────────

  fastify.get(
    '/api/v1/users/me/reports/submitted',
    { preHandler: [verifyToken] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!await guardFeature(fastify, reply)) return;

      const { cursor, limit: limitStr } = request.query as { cursor?: string; limit?: string };
      const limit = Math.min(50, Math.max(1, parseInt(limitStr ?? '20', 10)));
      const userId = request.userId!;

      const { rows } = await fastify.db.query<{
        id: string;
        reported_user_id: string;
        reported_username: string;
        category: string;
        description: string;
        status: string;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT r.id, r.reported_user_id, u.username AS reported_username,
                r.category, r.description, r.status, r.created_at, r.updated_at
         FROM user_reports r
         JOIN users u ON u.id = r.reported_user_id
         WHERE r.reporter_id = $1
           ${cursor ? `AND r.created_at < $3` : ''}
         ORDER BY r.created_at DESC
         LIMIT $2`,
        cursor ? [userId, limit, cursor] : [userId, limit],
      );

      return reply.status(200).send({
        items: rows,
        nextCursor: rows.length === limit ? rows[rows.length - 1]!.created_at : null,
      });
    },
  );

  // ─── GET /api/v1/admin/reports ───────────────────────────────────────────────

  fastify.get(
    '/api/v1/admin/reports',
    { preHandler: [verifyToken, async (req, rep) => {
      if (req.userRole !== 'admin') {
        return rep.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Admin only.' });
      }
    }] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!await guardFeature(fastify, reply)) return;

      const { status, category, cursor, limit: limitStr } = request.query as {
        status?: string;
        category?: string;
        cursor?: string;
        limit?: string;
      };

      const limit = Math.min(100, Math.max(1, parseInt(limitStr ?? '50', 10)));

      const conditions: string[] = ['1=1'];
      const params: unknown[] = [limit];
      let pi = 2;

      if (status) {
        conditions.push(`r.status = $${pi++}`);
        params.push(status);
      }
      if (category) {
        conditions.push(`r.category = $${pi++}`);
        params.push(category);
      }
      if (cursor) {
        conditions.push(`r.created_at > $${pi++}`);
        params.push(cursor);
      }

      const where = conditions.join(' AND ');

      const { rows } = await fastify.db.query<{
        id: string;
        reporter_id: string;
        reporter_username: string;
        reported_user_id: string;
        reported_username: string;
        category: string;
        description: string;
        status: string;
        trade_id: string | null;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT
           r.id, r.reporter_id,
           ru.username AS reporter_username,
           r.reported_user_id,
           u.username AS reported_username,
           r.category, r.description, r.status, r.trade_id,
           r.created_at, r.updated_at
         FROM user_reports r
         JOIN users ru ON ru.id = r.reporter_id
         JOIN users u ON u.id = r.reported_user_id
         WHERE ${where}
         ORDER BY r.created_at ASC
         LIMIT $1`,
        params,
      );

      return reply.status(200).send({
        items: rows,
        nextCursor: rows.length === limit ? rows[rows.length - 1]!.created_at : null,
      });
    },
  );

  // ─── GET /api/v1/admin/reports/:reportId ─────────────────────────────────────

  fastify.get(
    '/api/v1/admin/reports/:reportId',
    { preHandler: [verifyToken, async (req, rep) => {
      if (req.userRole !== 'admin') {
        return rep.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Admin only.' });
      }
    }] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!await guardFeature(fastify, reply)) return;

      const { reportId } = request.params as { reportId: string };

      const { rows: reportRows } = await fastify.db.query<{
        id: string;
        reporter_id: string;
        reporter_username: string;
        reporter_display_name: string | null;
        reported_user_id: string;
        reported_username: string;
        reported_display_name: string | null;
        category: string;
        description: string;
        status: string;
        trade_id: string | null;
        resolution_note: string | null;
        resolved_by: string | null;
        resolved_at: string | null;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT
           r.id, r.reporter_id,
           ru.username AS reporter_username, ru.display_name AS reporter_display_name,
           r.reported_user_id,
           u.username AS reported_username, u.display_name AS reported_display_name,
           r.category, r.description, r.status, r.trade_id,
           r.resolution_note, r.resolved_by, r.resolved_at,
           r.created_at, r.updated_at
         FROM user_reports r
         JOIN users ru ON ru.id = r.reporter_id
         JOIN users u ON u.id = r.reported_user_id
         WHERE r.id = $1`,
        [reportId],
      );

      if (reportRows.length === 0) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Report not found.' });
      }

      const report = reportRows[0]!;

      const trustScore = await getTrustScore(fastify.db, fastify.redis, report.reported_user_id);

      const { rows: banHistory } = await fastify.db.query<{
        id: string;
        ban_type: string;
        reason: string;
        expires_at: string | null;
        lifted_at: string | null;
        created_at: string;
      }>(
        `SELECT id, ban_type, reason, expires_at, lifted_at, created_at
         FROM user_bans
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [report.reported_user_id],
      );

      const { rows: priorReports } = await fastify.db.query<{
        id: string;
        category: string;
        status: string;
        reporter_username: string;
        created_at: string;
      }>(
        `SELECT r.id, r.category, r.status, u.username AS reporter_username, r.created_at
         FROM user_reports r
         JOIN users u ON u.id = r.reporter_id
         WHERE r.reported_user_id = $1 AND r.id <> $2
         ORDER BY r.created_at DESC
         LIMIT 20`,
        [report.reported_user_id, reportId],
      );

      let linkedTrade = null;
      if (report.trade_id) {
        const { rows: tradeRows } = await fastify.db.query<{
          id: string;
          status: string;
          requester_username: string;
          recipient_username: string;
          created_at: string;
        }>(
          `SELECT tr.id, tr.status,
                  ru.username AS requester_username,
                  rec.username AS recipient_username,
                  tr.created_at
           FROM trade_requests tr
           JOIN users ru ON ru.id = tr.requester_id
           JOIN users rec ON rec.id = tr.recipient_id
           WHERE tr.id = $1`,
          [report.trade_id],
        );
        if (tradeRows.length > 0) linkedTrade = tradeRows[0];
      }

      const { rows: messageRefs } = await fastify.db.query<{
        id: string;
        message_id: string;
        body: string;
        is_system: boolean;
        sent_at: string;
        sender_id: string | null;
        sender_username: string | null;
      }>(
        `SELECT
           rmr.id, rmr.message_id,
           tm.body, tm.is_system, tm.sent_at,
           tm.sender_id,
           u.username AS sender_username
         FROM report_message_refs rmr
         JOIN trade_messages tm ON tm.id = rmr.message_id
         LEFT JOIN users u ON u.id = tm.sender_id
         WHERE rmr.report_id = $1
         ORDER BY tm.sent_at ASC`,
        [reportId],
      );

      const { rows: attachmentRows } = await fastify.db.query<{
        id: string;
        mime_type: string;
        byte_size: number;
        width: number;
        height: number;
        uploaded_at: string;
      }>(
        `SELECT id, mime_type, byte_size, width, height, uploaded_at
         FROM report_attachments
         WHERE report_id = $1
         ORDER BY uploaded_at ASC`,
        [reportId],
      );

      const attachments = attachmentRows.map((a) => ({
        ...a,
        url: `/api/v1/admin/reports/${reportId}/attachments/${a.id}`,
      }));

      return reply.status(200).send({
        ...report,
        reportedUserTrustScore: trustScore,
        reportedUserBanHistory: banHistory,
        priorReports,
        linkedTrade,
        messageRefs,
        attachments,
      });
    },
  );

  // ─── GET /api/v1/admin/reports/:reportId/attachments/:attachmentId ───────────
  // Streams the attachment bytes back to the admin client. Gated by admin role.

  fastify.get(
    '/api/v1/admin/reports/:reportId/attachments/:attachmentId',
    { preHandler: [verifyToken, async (req, rep) => { await requireAdmin(req, rep); }] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!await guardFeature(fastify, reply)) return;

      const { reportId, attachmentId } = request.params as { reportId: string; attachmentId: string };

      const { rows } = await fastify.db.query<{
        storage_key: string;
        mime_type: string;
      }>(
        `SELECT storage_key, mime_type
         FROM report_attachments
         WHERE id = $1 AND report_id = $2`,
        [attachmentId, reportId],
      );

      if (rows.length === 0) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Attachment not found.' });
      }

      try {
        const bytes = await readReportAttachment(rows[0]!.storage_key);
        reply
          .header('content-type', rows[0]!.mime_type)
          .header('cache-control', 'private, max-age=60');
        return reply.send(bytes);
      } catch (err) {
        request.log.error({ err, attachmentId }, 'failed to read report attachment');
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Attachment unavailable.' });
      }
    },
  );

  // ─── PATCH /api/v1/admin/reports/:reportId ───────────────────────────────────

  fastify.patch(
    '/api/v1/admin/reports/:reportId',
    { preHandler: [verifyToken, async (req, rep) => {
      if (req.userRole !== 'admin') {
        return rep.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Admin only.' });
      }
    }] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!await guardFeature(fastify, reply)) return;

      const { reportId } = request.params as { reportId: string };
      const { status, resolutionNote } = request.body as {
        status: string;
        resolutionNote?: string;
      };

      const validStatuses = ['under_review', 'resolved', 'dismissed'];
      if (!validStatuses.includes(status)) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: `Status must be one of: ${validStatuses.join(', ')}.` });
      }

      if (resolutionNote !== undefined && resolutionNote.length > 1000) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Resolution note must be 1000 characters or fewer.' });
      }

      const isResolved = status === 'resolved' || status === 'dismissed';

      const { rows } = await fastify.db.query<{ id: string }>(
        `UPDATE user_reports
         SET status = $1,
             resolution_note = COALESCE($2, resolution_note),
             resolved_by = CASE WHEN $3 THEN $4::uuid ELSE resolved_by END,
             resolved_at = CASE WHEN $3 THEN NOW() ELSE resolved_at END,
             updated_at = NOW()
         WHERE id = $5
         RETURNING id`,
        [status, resolutionNote ?? null, isResolved, request.userId, reportId],
      );

      if (rows.length === 0) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Report not found.' });
      }

      await recordAudit(fastify.db, request.userId!, 'report_status_changed', {
        reportId,
        status,
      });

      return reply.status(200).send({ id: rows[0]!.id, status });
    },
  );
}
