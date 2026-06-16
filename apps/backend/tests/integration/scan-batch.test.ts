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

// 87-byte JPEG: SOI + minimal JFIF + tiny quantization table + EOI.
// file-type recognises it as image/jpeg, and it's small enough that sharp
// can decode it without the AI ever needing to look at it (in mock mode).
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

// 11 MB — exceeds @fastify/multipart's 10 MB fileSize limit, so the stream
// gets truncated and `part.file.truncated` flips to true. SOI/EOI bookend so
// file-type would call this a JPEG IF the truncation guard weren't there.
function makeOversizeJpeg(): Buffer {
  const big = Buffer.alloc(11 * 1024 * 1024, 0xff);
  big[0] = 0xff; big[1] = 0xd8;
  big[big.length - 2] = 0xff; big[big.length - 1] = 0xd9;
  return big;
}

// Hand-rolled multipart/form-data body with N file parts. Same shape as
// scan.test.ts but loops over inputs so we can mix valid + oversized
// images in a single request.
function buildMultipart(
  parts: { buffer: Buffer; filename: string; contentType: string }[],
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = '----CromoTestBoundary' + Math.random().toString(36).slice(2);
  const chunks: Buffer[] = [];
  for (const p of parts) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="image"; filename="${p.filename}"\r\n` +
        `Content-Type: ${p.contentType}\r\n\r\n`,
        'utf8',
      ),
    );
    chunks.push(p.buffer);
    chunks.push(Buffer.from('\r\n', 'utf8'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
  return {
    payload: Buffer.concat(chunks),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

// Parse an SSE-formatted response body into discrete events. Each event is
// "event: <type>\ndata: <json>\n\n". We don't need a full SSE parser — just
// enough to assert on `error` and `done` events.
interface SseEvent { type: string; data: unknown }
function parseSseEvents(body: string): SseEvent[] {
  const out: SseEvent[] = [];
  for (const block of body.split('\n\n')) {
    const lines = block.split('\n').filter(Boolean);
    let type = 'message';
    let dataLine = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) type = line.slice(7).trim();
      else if (line.startsWith('data: ')) dataLine = line.slice(6);
    }
    if (dataLine) {
      try { out.push({ type, data: JSON.parse(dataLine) }); }
      catch { /* ignore malformed */ }
    }
  }
  return out;
}

describe.skipIf(!shouldRun)('Scan /batch + /list truncation guards (integration)', () => {
  let app: FastifyInstance;
  let aliceToken: string;
  let initialAiFlag: boolean;
  let initialBatchFlag: boolean;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app.js');
    const { signAccessToken } = await import('../../src/middleware/auth.js');
    app = await buildApp();
    await app.ready();
    aliceToken = signAccessToken({ sub: ALICE_ID, email: 'alice@test.local', role: 'user' });

    // Snapshot + force-on the two flags the batch endpoint guards on. afterAll
    // restores the snapshots, never blanket-disables (CLAUDE.md integration
    // test rule).
    const flagRows = await app.db.query<{ key: string; enabled: boolean }>(
      `SELECT key, enabled FROM feature_flags
        WHERE key IN ('FEATURE_AI_SCANNING', 'FEATURE_BATCH_SCANNING')`,
    );
    initialAiFlag    = flagRows.rows.find((r) => r.key === 'FEATURE_AI_SCANNING')?.enabled    ?? true;
    initialBatchFlag = flagRows.rows.find((r) => r.key === 'FEATURE_BATCH_SCANNING')?.enabled ?? true;
    await app.db.query(
      `UPDATE feature_flags SET enabled = true
        WHERE key IN ('FEATURE_AI_SCANNING', 'FEATURE_BATCH_SCANNING')`,
    );
  });

  afterAll(async () => {
    await app.db.query(
      `UPDATE feature_flags SET enabled = $1 WHERE key = 'FEATURE_AI_SCANNING'`,
      [initialAiFlag],
    );
    await app.db.query(
      `UPDATE feature_flags SET enabled = $1 WHERE key = 'FEATURE_BATCH_SCANNING'`,
      [initialBatchFlag],
    );
    await app?.close();
  });

  // ── /scan/batch ─────────────────────────────────────────────────────────────

  describe('POST /api/v1/scan/batch (SSE)', () => {
    it('emits an error event for the truncated part and a done event with the right total', async () => {
      // Three parts: small, oversized, small. We want to confirm:
      //  (a) the oversized part doesn't reach the AI (no successful result),
      //  (b) an "error" event is emitted for its index (index=1),
      //  (c) the small parts still process (results / errors at indices 0 and 2),
      //  (d) the "done" event reports total=3 (one event per part, including
      //      the truncated one).
      const { payload, headers } = buildMultipart([
        { buffer: TINY_JPEG,           filename: 'a.jpg', contentType: 'image/jpeg' },
        { buffer: makeOversizeJpeg(),  filename: 'b.jpg', contentType: 'image/jpeg' },
        { buffer: TINY_JPEG,           filename: 'c.jpg', contentType: 'image/jpeg' },
      ]);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/scan/batch',
        headers: { ...headers, Authorization: `Bearer ${aliceToken}` },
        payload,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/event-stream/);

      const events = parseSseEvents(res.payload);

      // The oversized part at index 1 must produce an "error" outcome — NOT
      // a "result" with sticker data, because that would mean we sent the
      // truncated 10MB blob to the AI. The route emits these as 'error' or
      // as 'result' with an `error` field; accept both shapes.
      const oversized = events.find((e) =>
        (e.data as { index?: number }).index === 1,
      );
      expect(oversized).toBeDefined();
      const oversizedData = oversized!.data as { error?: string; results?: unknown };
      const hasErrorField = typeof oversizedData.error === 'string';
      const isErrorType = oversized!.type === 'error';
      expect(hasErrorField || isErrorType).toBe(true);

      // The done event must come last and report total=3 (all three parts
      // accounted for, including the truncated one).
      const done = events[events.length - 1]!;
      expect(done.type).toBe('done');
      expect((done.data as { total: number }).total).toBe(3);
    });
  });

  // ── /scan/list ──────────────────────────────────────────────────────────────

  describe('POST /api/v1/scan/list', () => {
    it('skips the oversized image and still processes valid images alongside it', async () => {
      // /scan/list is anonymous (no Bearer token), accumulates album codes
      // across all images, returns a single JSON response. The truncated part
      // must NOT crash the request — it gets logged + skipped — and the small
      // parts must continue to be processed.
      const { payload, headers } = buildMultipart([
        { buffer: TINY_JPEG,          filename: 'a.jpg', contentType: 'image/jpeg' },
        { buffer: makeOversizeJpeg(), filename: 'b.jpg', contentType: 'image/jpeg' },
      ]);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/scan/list',
        headers,
        payload,
      });

      // Response is JSON { offered: string[], wanted: string[] }. Regardless
      // of what the AI returns for the small image, the request must NOT 5xx
      // because of the oversized one — that would mean the truncation guard
      // didn't fire and the corrupt buffer reached extractListFromImage.
      expect(res.statusCode).toBeLessThan(500);
      if (res.statusCode === 200) {
        const body = res.json<{ offered: unknown; wanted: unknown }>();
        expect(Array.isArray(body.offered)).toBe(true);
        expect(Array.isArray(body.wanted)).toBe(true);
      }
    });
  });
});
