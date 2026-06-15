import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

const HAS_REAL_DB =
  typeof process.env['DATABASE_URL'] === 'string' &&
  process.env['DATABASE_URL'].includes('@') &&
  !process.env['DATABASE_URL'].includes('placeholder');
const HAS_REAL_REDIS =
  typeof process.env['REDIS_URL'] === 'string' &&
  process.env['REDIS_URL'].startsWith('redis://');
const shouldRun = HAS_REAL_DB && HAS_REAL_REDIS;

const ALICE_ID = '00000000-0000-0000-0000-000000000002';

// Smallest valid JPEG byte-by-byte: just the SOI + EOI markers + minimal
// metadata. file-type recognises this as image/jpeg, but identifySticker
// itself is gated by FEATURE_AI_SCANNING so the AI is never called in tests
// where the flag is off.
const TINY_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
  0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
  0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
  0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
  0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
  0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xd9,
]);

function buildMultipart(buffer: Buffer, filename: string, contentType: string): {
  payload: Buffer; headers: Record<string, string>;
} {
  // Hand-rolled multipart/form-data — avoids pulling in `form-data` for one
  // test file. The format is RFC 7578 §4 with a fixed boundary.
  const boundary = '----CromoTestBoundary' + Math.random().toString(36).slice(2);
  const head = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="image"; filename="${filename}"\r\n` +
    `Content-Type: ${contentType}\r\n\r\n`,
    'utf8',
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const payload = Buffer.concat([head, buffer, tail]);
  return {
    payload,
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

describe.skipIf(!shouldRun)('Scan routes (integration)', () => {
  let app: FastifyInstance;
  let aliceToken: string;
  let initialFlagState: boolean;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app.js');
    const { signAccessToken } = await import('../../src/middleware/auth.js');
    app = await buildApp();
    await app.ready();
    aliceToken = signAccessToken({ sub: ALICE_ID, email: 'alice@test.local', role: 'user' });
    // Snapshot the flag so afterAll restores whatever the dev environment
    // had configured before this suite ran — never blanket-disable it.
    // Integration tests share the dev DB; leaving the flag off would break
    // the dev frontend's scan page for the next person.
    const { rows } = await app.db.query<{ enabled: boolean }>(
      `SELECT enabled FROM feature_flags WHERE key = 'FEATURE_AI_SCANNING'`,
    );
    initialFlagState = rows[0]?.enabled ?? true;
  });

  afterAll(async () => {
    await app.db.query(
      `UPDATE feature_flags SET enabled = $1 WHERE key = 'FEATURE_AI_SCANNING'`,
      [initialFlagState],
    );
    await app?.close();
  });

  describe('POST /api/v1/scan/identify — auth & feature gating', () => {
    it('returns 401 without a token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/scan/identify',
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 404 when FEATURE_AI_SCANNING is disabled', async () => {
      await app.db.query(`UPDATE feature_flags SET enabled = false WHERE key = 'FEATURE_AI_SCANNING'`);
      const { payload, headers } = buildMultipart(TINY_JPEG, 'a.jpg', 'image/jpeg');
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/scan/identify',
        headers: { ...headers, Authorization: `Bearer ${aliceToken}` },
        payload,
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/scan/identify — body validation (flag on)', () => {
    beforeAll(async () => {
      await app.db.query(`UPDATE feature_flags SET enabled = true WHERE key = 'FEATURE_AI_SCANNING'`);
    });

    it('returns 400 when the request has no multipart file', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/scan/identify',
        headers: { Authorization: `Bearer ${aliceToken}`, 'content-type': 'application/json' },
        payload: JSON.stringify({}),
      });
      // Fastify multipart parser rejects non-multipart bodies before our
      // handler runs; the resulting status is in the 4xx family.
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      expect(res.statusCode).toBeLessThan(500);
    });

    it('returns 415 for a file whose magic bytes are not an allowed image', async () => {
      const garbage = Buffer.from('this is plain text, definitely not an image');
      const { payload, headers } = buildMultipart(garbage, 'fake.png', 'image/png');
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/scan/identify',
        headers: { ...headers, Authorization: `Bearer ${aliceToken}` },
        payload,
      });
      expect(res.statusCode).toBe(415);
      const body = res.json<{ message: string }>();
      expect(body.message).toMatch(/Unsupported file type/i);
    });

    it('returns 413 with a "10 MB" message for oversized uploads, before reaching the AI', async () => {
      // 11 MB > MAX_FILE_SIZE. @fastify/multipart truncates the stream at
      // its `limits.fileSize` cap (10 MB), and the route's truncation guard
      // detects that and throws 413 — so the AI is never called with a
      // garbage 10MB blob. A regression here means we'd start burning
      // Groq calls on every oversized upload.
      const big = Buffer.alloc(11 * 1024 * 1024, 0xff);
      big[0] = 0xff; big[1] = 0xd8;
      big[big.length - 2] = 0xff; big[big.length - 1] = 0xd9;
      const { payload, headers } = buildMultipart(big, 'huge.jpg', 'image/jpeg');
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/scan/identify',
        headers: { ...headers, Authorization: `Bearer ${aliceToken}` },
        payload,
      });
      expect(res.statusCode).toBe(413);
      expect(res.json<{ message: string }>().message).toMatch(/10 MB/i);
    });
  });
});
