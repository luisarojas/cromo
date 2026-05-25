import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Pool } from 'pg';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from '../../middleware/auth.js';
import { validateImageBuffer } from '../../services/upload.service.js';
import { identifySticker, type ScanResult } from '../../services/scan.service.js';
import { getStickerByAlbumCode, getStickerByPlayerName } from '../../services/stickers.service.js';
import { isFeatureFlagEnabled } from '../../services/trust-safety.service.js';
import { idempotency, storeIdempotent } from '../../services/idempotency.service.js';
import { writeSSEEvent } from '../../utils/sse.js';

const SCANS_DIR = '/app/uploads/scans';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

async function guardFeature(
  fastify: FastifyInstance,
  flagKey: string,
  reply: FastifyReply,
): Promise<boolean> {
  const enabled = await isFeatureFlagEnabled(fastify.db, flagKey);
  if (!enabled) {
    reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Feature not available.' });
    return false;
  }
  return true;
}

async function readUploadedImage(
  request: FastifyRequest,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const data = await request.file();
  if (!data) return null;

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of data.file) {
    total += chunk.length;
    if (total > MAX_FILE_SIZE) {
      throw Object.assign(new Error('File too large. Maximum size is 10 MB.'), { statusCode: 413 });
    }
    chunks.push(chunk);
  }
  return { buffer: Buffer.concat(chunks), mimeType: data.mimetype };
}

async function saveScanTemp(buffer: Buffer, ext: string): Promise<string> {
  await fs.mkdir(SCANS_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}${ext}`;
  const filePath = path.join(SCANS_DIR, name);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

async function deleteScanTemp(filePath: string): Promise<void> {
  await fs.unlink(filePath).catch(() => undefined);
}

async function getAlbumTypeInfo(
  db: Pool,
  userId: string,
  albumTypeKey?: string,
): Promise<{ name: string; scanPrompt: string | null }> {
  if (albumTypeKey) {
    const { rows } = await db.query<{ name: string; scan_prompt: string | null }>(
      `SELECT name, scan_prompt FROM album_types WHERE key = $1 LIMIT 1`,
      [albumTypeKey],
    );
    if (rows[0]) return { name: rows[0].name, scanPrompt: rows[0].scan_prompt };
  }
  const { rows } = await db.query<{ name: string; scan_prompt: string | null }>(
    `SELECT at.name, at.scan_prompt FROM user_albums ua
     JOIN album_types at ON at.id = ua.album_type_id
     WHERE ua.user_id = $1 AND ua.is_default = true
     LIMIT 1`,
    [userId],
  );
  return { name: rows[0]?.name ?? 'sticker collection', scanPrompt: rows[0]?.scan_prompt ?? null };
}

// The scan prompt instructs the model to leave stickerType null on back-of-sticker
// scans (only the album code is visible). Forward that catalog value to the client
// so downstream UI labels and variant defaults stay correct without a second lookup.
function catalogStickerType(rowType: string): 'extra' | 'coca_cola_special' | null {
  if (rowType === 'extra') return 'extra';
  if (rowType === 'coca_cola_special') return 'coca_cola_special';
  return null;
}

async function enrichFromCatalog(db: Pool, result: ScanResult, albumTypeKey?: string): Promise<ScanResult> {
  try {
    if (result.albumCode) {
      const row = await getStickerByAlbumCode(db, result.albumCode, albumTypeKey);
      if (row) {
        return {
          ...result,
          stickerNumber: result.stickerNumber ?? row.number,
          playerName: result.playerName ?? row.player_name,
          teamFifaCode: result.teamFifaCode ?? row.fifa_code,
          stickerType: result.stickerType ?? catalogStickerType(row.sticker_type),
        };
      }
    } else if (result.playerName) {
      // When stickerType is null the AI identified a core sticker. Exclude special types
      // (extra, coca_cola_special) to avoid returning the wrong row for players who
      // appear in multiple subsets (Mbappé, Messi, Yamal, etc.).
      const row = await getStickerByPlayerName(
        db, result.playerName, albumTypeKey, result.stickerType ?? undefined,
        result.stickerType === null,
      );
      if (row) {
        return {
          ...result,
          albumCode: row.album_code,
          stickerNumber: result.stickerNumber ?? row.number,
          teamFifaCode: result.teamFifaCode ?? row.fifa_code,
          stickerType: result.stickerType ?? catalogStickerType(row.sticker_type),
        };
      }
    }
  } catch {
    // Catalog lookup is best-effort; return original result on failure
  }
  return result;
}

export async function scanRoutes(fastify: FastifyInstance): Promise<void> {

  // ── POST /api/v1/scan/identify ────────────────────────────────────────────────

  fastify.post(
    '/api/v1/scan/identify',
    {
      preHandler: [verifyToken, idempotency(fastify, 'scan:identify')],
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 hour',
          keyGenerator: (req) => (req as FastifyRequest).userId ?? req.ip,
        },
      },
      schema: {
        tags: ['AI Scanning'],
        summary: 'Identify a single sticker from an uploaded image',
        security: [{ bearerAuth: [] }],
        consumes: ['multipart/form-data'],
        querystring: {
          type: 'object',
          properties: {
            albumTypeKey: { type: 'string', maxLength: 64, description: 'Album type key to scope catalog lookups' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!await guardFeature(fastify, 'FEATURE_AI_SCANNING', reply)) return;

      const { albumTypeKey } = request.query as { albumTypeKey?: string };

      let uploaded: { buffer: Buffer; mimeType: string } | null = null;
      try {
        uploaded = await readUploadedImage(request);
      } catch (err) {
        const e = err as { statusCode?: number; message?: string };
        return reply.status(e.statusCode ?? 400).send({
          statusCode: e.statusCode ?? 400,
          error: 'Bad Request',
          message: e.message ?? 'Failed to read uploaded file.',
        });
      }

      if (!uploaded) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'No file uploaded. Send a multipart/form-data request with an image field.',
        });
      }

      try {
        await validateImageBuffer(uploaded.buffer);
      } catch (err) {
        const e = err as { statusCode?: number; message?: string };
        return reply.status(e.statusCode ?? 415).send({
          statusCode: e.statusCode ?? 415,
          error: 'Unsupported Media Type',
          message: e.message ?? 'Unsupported file type.',
        });
      }

      // Save temp file (deleted below; retained ≤24h if server crashes — see §6.3)
      const ext = uploaded.mimeType === 'image/png' ? '.png'
        : uploaded.mimeType === 'image/webp' ? '.webp'
        : '.jpg';
      const tempPath = await saveScanTemp(uploaded.buffer, ext);

      const { name: collectionName, scanPrompt } = await getAlbumTypeInfo(fastify.db, request.userId!, albumTypeKey);

      let results;
      try {
        results = await identifySticker(uploaded.buffer, uploaded.mimeType, collectionName, scanPrompt);
      } catch (err) {
        request.log.error({ err }, 'identifySticker failed');
        await deleteScanTemp(tempPath);
        return reply.status(503).send({
          statusCode: 503,
          error: 'Service Unavailable',
          message: 'AI scanning is temporarily unavailable. Please try again later.',
        });
      }

      await deleteScanTemp(tempPath);
      const enriched = await Promise.all(results.map((r) => enrichFromCatalog(fastify.db, r, albumTypeKey)));

      // Cache the successful response so a retry with the same Idempotency-Key
      // returns the same enriched results instead of burning another Groq call.
      const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
      await storeIdempotent(fastify.redis, 'scan:identify', request.userId!, idempotencyKey, enriched);

      return reply.status(200).send(enriched);
    },
  );

  // ── POST /api/v1/scan/batch ───────────────────────────────────────────────────
  // Streams results as Server-Sent Events — one "result" event per image as each
  // finishes, then a "done" event when all images have been processed.

  fastify.post(
    '/api/v1/scan/batch',
    {
      preHandler: [verifyToken],
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 hour',
          keyGenerator: (req) => (req as FastifyRequest).userId ?? req.ip,
        },
      },
      schema: {
        tags: ['AI Scanning'],
        summary: 'Identify multiple stickers from uploaded images (SSE stream)',
        security: [{ bearerAuth: [] }],
        consumes: ['multipart/form-data'],
        querystring: {
          type: 'object',
          properties: {
            albumTypeKey: { type: 'string', maxLength: 64, description: 'Album type key to scope catalog lookups' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!await guardFeature(fastify, 'FEATURE_AI_SCANNING', reply)) return;
      if (!await guardFeature(fastify, 'FEATURE_BATCH_SCANNING', reply)) return;

      const { albumTypeKey } = request.query as { albumTypeKey?: string };
      const { name: collectionName, scanPrompt } = await getAlbumTypeInfo(fastify.db, request.userId!, albumTypeKey);

      // Carry CORS headers set by the plugin over to the raw socket.
      // reply.raw.writeHead bypasses Fastify's response pipeline so the plugin's
      // onRequest-phase headers are never flushed automatically.
      const corsHeaders: Record<string, string> = {};
      for (const h of ['access-control-allow-origin', 'access-control-allow-credentials', 'access-control-expose-headers', 'vary']) {
        const v = reply.getHeader(h);
        if (typeof v === 'string') corsHeaders[h] = v;
      }
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        ...corsHeaders,
      });
      reply.raw.flushHeaders?.();

      const parts = request.files();
      const tempPaths: string[] = [];
      let index = 0;

      try {
        for await (const part of parts) {
          const chunks: Buffer[] = [];
          let total = 0;
          for await (const chunk of part.file) {
            total += chunk.length;
            if (total > MAX_FILE_SIZE) break;
            chunks.push(chunk);
          }

          const buffer = Buffer.concat(chunks);
          const mimeType = part.mimetype;

          try {
            await validateImageBuffer(buffer);
            const ext = mimeType === 'image/png' ? '.png'
              : mimeType === 'image/webp' ? '.webp'
              : '.jpg';
            const tempPath = await saveScanTemp(buffer, ext);
            tempPaths.push(tempPath);
            const scanResults = await identifySticker(buffer, mimeType, collectionName, scanPrompt);
            const enriched = await Promise.all(scanResults.map((r) => enrichFromCatalog(fastify.db, r, albumTypeKey)));
            writeSSEEvent(reply, 'result', { index, results: enriched });
          } catch (err) {
            const e = err as { message?: string };
            request.log.warn({ err, index }, 'batch scan: image processing failed');
            writeSSEEvent(reply, 'result', { index, error: e.message ?? 'Failed to process image.' });
          }

          index++;
        }
      } catch (err) {
        // Outer catch: multipart parse error or other unexpected failure. Log it so
        // we can diagnose, then fall through to write the done event so the client
        // stream closes cleanly rather than hanging.
        request.log.error({ err, index }, 'batch scan: multipart iteration failed');
      } finally {
        for (const p of tempPaths) {
          await deleteScanTemp(p);
        }
      }

      writeSSEEvent(reply, 'done', { total: index });
      reply.raw.end();
    },
  );
}
