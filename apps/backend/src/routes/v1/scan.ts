import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from '../../middleware/auth.js';
import { validateImageBuffer } from '../../services/upload.service.js';
import { identifySticker } from '../../services/scan.service.js';
import { isFeatureFlagEnabled } from '../../services/trust-safety.service.js';

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

export async function scanRoutes(fastify: FastifyInstance): Promise<void> {

  // ── POST /api/v1/scan/identify ────────────────────────────────────────────────

  fastify.post(
    '/api/v1/scan/identify',
    {
      preHandler: [verifyToken],
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
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!await guardFeature(fastify, 'FEATURE_AI_SCANNING', reply)) return;

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

      let result;
      try {
        result = await identifySticker(uploaded.buffer, uploaded.mimeType);
      } catch {
        await deleteScanTemp(tempPath);
        return reply.status(503).send({
          statusCode: 503,
          error: 'Service Unavailable',
          message: 'AI scanning is temporarily unavailable. Please try again later.',
        });
      }

      await deleteScanTemp(tempPath);
      return reply.status(200).send(result);
    },
  );

  // ── POST /api/v1/scan/batch ───────────────────────────────────────────────────

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
        summary: 'Identify multiple stickers from uploaded images',
        security: [{ bearerAuth: [] }],
        consumes: ['multipart/form-data'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!await guardFeature(fastify, 'FEATURE_AI_SCANNING', reply)) return;
      if (!await guardFeature(fastify, 'FEATURE_BATCH_SCANNING', reply)) return;

      const parts = request.files();
      const results: Array<{ index: number; result?: ReturnType<typeof identifySticker> extends Promise<infer R> ? R : never; error?: string }> = [];
      let index = 0;
      const tempPaths: string[] = [];

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
            const scanResult = await identifySticker(buffer, mimeType);
            results.push({ index, result: scanResult });
          } catch (err) {
            const e = err as { message?: string };
            results.push({ index, error: e.message ?? 'Failed to process image.' });
          }

          index++;
        }
      } finally {
        for (const p of tempPaths) {
          await deleteScanTemp(p);
        }
      }

      return reply.status(200).send({ results });
    },
  );
}
