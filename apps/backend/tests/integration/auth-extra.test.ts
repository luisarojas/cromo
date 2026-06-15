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

// Exercises auth endpoints the original auth.test.ts skipped: refresh
// (with and without the cookie), verify-email (validation), the three
// anti-enumeration endpoints (resend / forgot-password / reset-password).

describe.skipIf(!shouldRun)('Auth extra routes (integration)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app.js');
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => { await app?.close(); });

  // ── /refresh — cookie missing ──────────────────────────────────────────────

  describe('POST /api/v1/auth/refresh', () => {
    it('returns 200 with authenticated=false when no refresh cookie is present', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh' });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ authenticated: boolean }>().authenticated).toBe(false);
    });

    it('returns 200 with authenticated=false on a malformed refresh cookie (and clears it)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        cookies: { refreshToken: 'this-is-not-a-jwt' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<{ authenticated: boolean }>().authenticated).toBe(false);
      // The route is required to clear the bogus cookie on failure.
      expect(res.headers['set-cookie']).toBeDefined();
    });
  });

  // ── /verify-email — input validation ───────────────────────────────────────

  describe('POST /api/v1/auth/verify-email', () => {
    it('returns 400 when the email is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/verify-email',
        payload: { code: '123456' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when the code is too short', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/verify-email',
        payload: { email: 'a@b.c', code: 'x' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns a 4xx error when the email/code don\'t match a real token (local mode)', async () => {
      // The local-mode verifyEmail service does a real DB lookup for the
      // hashed token + non-expired check. With an unknown email + code, we
      // expect a clean 4xx — never a 5xx — so the contract being tested is
      // "the route surfaces user-friendly failure, not an unhandled crash".
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/verify-email',
        payload: { email: 'whatever@test.local', code: '123456' },
      });
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      expect(res.statusCode).toBeLessThan(500);
    });
  });

  // ── Anti-enumeration endpoints always return 204 ──────────────────────────

  describe('Anti-enumeration endpoints', () => {
    // The Fastify-level schema (format: 'email') rejects bad emails with 400
    // *before* the handler's anti-enumeration short-circuit can run. That's
    // the documented behaviour — the schema is the first line of defence and
    // doesn't leak account existence either (every bad email returns 400 the
    // same way). The handler's 204 path matters for valid-format emails that
    // simply don't exist, which is what we verify here.

    it('POST /resend-verification with a well-shaped (but unknown) email returns 204', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/resend-verification',
        payload: { email: 'nobody-here-' + Date.now() + '@test.local' },
      });
      expect(res.statusCode).toBe(204);
    });

    it('POST /forgot-password with a known email returns 204', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/forgot-password',
        payload: { email: 'alice@test.local' },
      });
      expect(res.statusCode).toBe(204);
    });

    it('POST /forgot-password with a well-shaped but unknown email also returns 204 (anti-enumeration)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/forgot-password',
        payload: { email: 'unknown-' + Date.now() + '@test.local' },
      });
      expect(res.statusCode).toBe(204);
    });
  });

  // ── /reset-password — validation ──────────────────────────────────────────

  describe('POST /api/v1/auth/reset-password', () => {
    it('returns 400 for a body missing newPassword', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/reset-password',
        payload: { email: 'a@b.c', code: '123456' },
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
