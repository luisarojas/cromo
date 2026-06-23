// Coverage note: this file sits in the aggregate-only coverage floor (see
// vitest.config.ts). Unit-testing the upload + multipart parsing + AI provider
// call surface would require either booking real Gemini/Groq calls or a
// network-mocking layer we haven't built. Integration tests cover the happy
// path; the rest is intentionally left to drag the aggregate gate down by a
// few percent until we add a streamed-mock provider.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Pool } from 'pg';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from '../../middleware/auth.js';
import { validateImageBuffer } from '../../services/upload.service.js';
import { identifySticker, extractListFromImage, normalizeAlbumCode, type ScanResult } from '../../services/scan.service.js';
import { getStickerByAlbumCode, getStickerByPlayerName } from '../../services/stickers.service.js';
import { isFeatureFlagEnabled } from '../../services/trust-safety.service.js';
import { idempotency, storeIdempotent } from '../../services/idempotency.service.js';
import { writeSSEEvent, writeSSEHead } from '../../utils/sse.js';

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

function tooLarge(): Error & { statusCode: number } {
  return Object.assign(new Error('File too large. Maximum size is 10 MB.'), { statusCode: 413 });
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
    if (total > MAX_FILE_SIZE) throw tooLarge();
    chunks.push(chunk);
  }
  // @fastify/multipart's `limits.fileSize` truncates the stream at its
  // configured cap before our `total > MAX_FILE_SIZE` guard would trip, so
  // the check above never fires for an oversized upload — we'd silently
  // send a 10MB truncated blob to the AI provider. The `truncated` flag
  // is the real signal; gate on it explicitly.
  if (data.file.truncated) throw tooLarge();
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
      request.log.info(
        { reasoning: results.map((r) => ({ albumCode: r.albumCode, playerName: r.playerName, variantToken: r.variantToken, reasoning: r.reasoning })) },
        'scan identify reasoning',
      );
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

      writeSSEHead(reply);

      const parts = request.files();
      const tempPaths: string[] = [];
      let index = 0;

      try {
        for await (const part of parts) {
          const chunks: Buffer[] = [];
          let total = 0;
          let oversize = false;
          for await (const chunk of part.file) {
            total += chunk.length;
            if (total > MAX_FILE_SIZE) { oversize = true; break; }
            chunks.push(chunk);
          }
          // See readUploadedImage: @fastify/multipart's `limits.fileSize`
          // truncates the stream, so `oversize` rarely fires and we have to
          // gate on `part.file.truncated` as well to catch the truncation
          // case. Either signal means we drop this image and tell the
          // client which index failed, instead of running the AI on a
          // garbage 10MB buffer.
          if (oversize || part.file.truncated) {
            writeSSEEvent(reply, 'error', { index, message: 'File too large. Maximum size is 10 MB.' });
            index += 1;
            continue;
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
            request.log.info(
              { index, reasoning: scanResults.map((r) => ({ albumCode: r.albumCode, playerName: r.playerName, variantToken: r.variantToken, reasoning: r.reasoning })) },
              'scan batch reasoning',
            );
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

  // ── POST /api/v1/scan/list ────────────────────────────────────────────────
  // Extract album codes from images of a written/printed sticker list. Public
  // (no auth) so the anonymous third-party-pair flow on /trade/match can use
  // it; the only side effect is one AI call, gated by a per-IP rate limit.

  fastify.post(
    '/api/v1/scan/list',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 hour',
          keyGenerator: (req) => (req as FastifyRequest).userId ?? req.ip,
        },
      },
      schema: {
        tags: ['AI Scanning'],
        summary: 'Extract album codes from one or more images of a written list',
        consumes: ['multipart/form-data'],
        querystring: {
          type: 'object',
          properties: {
            // Allow-listed identifier shape — same regex Zod enforces on
            // /trade/match-pair. Keeps the public surface narrow and rules out
            // cache-key garbage from anonymous probes.
            albumTypeKey: { type: 'string', maxLength: 64, pattern: '^[a-z0-9_]+$' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!await guardFeature(fastify, 'FEATURE_AI_SCANNING', reply)) return;

      const { albumTypeKey } = request.query as { albumTypeKey?: string };
      const { rows: typeRows } = await fastify.db.query<{ name: string }>(
        `SELECT name FROM album_types WHERE key = $1 LIMIT 1`,
        [albumTypeKey ?? 'fifa_world_cup_2026'],
      );
      const collectionName = typeRows[0]?.name ?? 'sticker collection';

      const parts = request.files();
      const offeredAcc: string[] = [];
      const wantedAcc: string[] = [];
      const tempPaths: string[] = [];
      let imageCount = 0;

      try {
        for await (const part of parts) {
          imageCount++;
          if (imageCount > 5) {
            // Cap so a single anonymous request can't trigger 100 AI calls.
            return reply.status(413).send({
              statusCode: 413,
              error: 'Payload Too Large',
              message: 'At most 5 images per request.',
            });
          }

          const chunks: Buffer[] = [];
          let total = 0;
          let oversize = false;
          for await (const chunk of part.file) {
            total += chunk.length;
            if (total > MAX_FILE_SIZE) { oversize = true; break; }
            chunks.push(chunk);
          }
          // See readUploadedImage: must also check the multipart truncation
          // flag, otherwise an oversize image silently becomes a truncated
          // 10MB blob fed to the AI.
          if (oversize || part.file.truncated) {
            request.log.warn({ imageIndex: imageCount - 1 }, 'list scan: image rejected (>10MB)');
            continue;
          }
          const buffer = Buffer.concat(chunks);

          try {
            await validateImageBuffer(buffer);
            const ext = part.mimetype === 'image/png' ? '.png'
              : part.mimetype === 'image/webp' ? '.webp'
              : '.jpg';
            tempPaths.push(await saveScanTemp(buffer, ext));
            const buckets = await extractListFromImage(buffer, part.mimetype, collectionName);
            offeredAcc.push(...buckets.offered);
            wantedAcc.push(...buckets.wanted);
          } catch (err) {
            request.log.warn({ err }, 'list scan: image processing failed');
          }
        }
      } finally {
        for (const p of tempPaths) await deleteScanTemp(p);
      }

      // Dedup + normalize per bucket. If a code lands in both buckets across
      // multiple images, keep it in "wanted" (the more recent intent) and
      // drop it from "offered" — same precedence the AI prompt uses.
      const normSet = (raw: string[]): string[] => {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const r of raw) {
          const c = normalizeAlbumCode(r);
          if (c && !seen.has(c)) { seen.add(c); out.push(c); }
        }
        return out;
      };
      const wanted = normSet(wantedAcc);
      const wantedSet = new Set(wanted);
      const offered = normSet(offeredAcc).filter((c) => !wantedSet.has(c));
      return reply.status(200).send({ offered, wanted });
    },
  );
}
