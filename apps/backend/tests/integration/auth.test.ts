import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * Integration tests for auth endpoints.
 *
 * These tests require a real PostgreSQL database and Redis instance.
 * They are skipped when DATABASE_URL does not point to a real server
 * (i.e., when it's the default placeholder or not set).
 */

const HAS_REAL_DB =
  typeof process.env['DATABASE_URL'] === 'string' &&
  process.env['DATABASE_URL'].includes('@') &&
  !process.env['DATABASE_URL'].includes('placeholder');

const HAS_REAL_REDIS =
  typeof process.env['REDIS_URL'] === 'string' &&
  process.env['REDIS_URL'].startsWith('redis://');

const shouldRun = HAS_REAL_DB && HAS_REAL_REDIS;

// ─── Local-only auth tests (no DB required) ────────────────────────────────────

describe('Auth service — local mode (unit-level)', () => {
  it('signAccessToken + verifyRefreshToken are pure functions (no DB)', async () => {
    // Import lazily to avoid env parsing issues in CI
    const { signAccessToken, signRefreshToken, verifyRefreshToken } = await import(
      '../../src/middleware/auth.js'
    );

    const payload = { sub: 'user-123', email: 'test@example.com', role: 'user' };

    const accessToken = signAccessToken(payload);
    expect(typeof accessToken).toBe('string');
    expect(accessToken.split('.').length).toBe(3); // JWT has 3 parts

    const refreshToken = signRefreshToken(payload);
    const decoded = verifyRefreshToken(refreshToken);

    expect(decoded.sub).toBe('user-123');
    expect(decoded.email).toBe('test@example.com');
    expect(decoded.role).toBe('user');
    expect(decoded.type).toBe('refresh');
  });
});

// ─── Integration tests (require real DB + Redis) ──────────────────────────────

describe.skipIf(!shouldRun)('POST /api/v1/auth/register + /login (integration)', () => {
  let app: FastifyInstance;
  const testEmail = `test_${Date.now()}@example.com`;
  const testUsername = `testuser_${Date.now()}`;
  const testPassword = 'AnyPassword123!';

  beforeAll(async () => {
    // Dynamically import buildApp only when integration tests actually run
    const { buildApp } = await import('../../src/app.js');
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('POST /api/v1/auth/register returns 201 for a new user', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        username: testUsername,
        password: testPassword,
        displayName: 'Test User',
      }),
    });

    expect(response.statusCode).toBe(201);

    const body = response.json<{ message: string; userId: string }>();
    expect(body.message).toContain('Registration successful');
    expect(typeof body.userId).toBe('string');
  });

  it('POST /api/v1/auth/register returns 409 for duplicate email', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        username: `other_${Date.now()}`,
        password: testPassword,
      }),
    });

    expect(response.statusCode).toBe(409);
  });

  it('POST /api/v1/auth/login returns 200 with accessToken', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
      }),
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<{
      accessToken: string;
      user: { id: string; email: string; username: string; role: string };
    }>();

    expect(typeof body.accessToken).toBe('string');
    expect(body.accessToken.split('.').length).toBe(3);
    expect(body.user.email).toBe(testEmail.toLowerCase());
    expect(body.user.role).toBe('user');

    // Refresh token cookie should be set
    const setCookieHeader = response.headers['set-cookie'];
    expect(setCookieHeader).toBeDefined();
    const cookieStr = Array.isArray(setCookieHeader)
      ? setCookieHeader.join('; ')
      : (setCookieHeader ?? '');
    expect(cookieStr).toContain('refreshToken');
    expect(cookieStr).toContain('HttpOnly');
  });

  it('POST /api/v1/auth/login returns 401 for unknown email', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `nonexistent_${Date.now()}@example.com`,
        password: 'whatever',
      }),
    });

    expect(response.statusCode).toBe(401);
  });

  it('GET /api/v1/auth/me returns 401 without Authorization header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
    });

    expect(response.statusCode).toBe(401);
  });

  it('GET /api/v1/auth/me returns 200 with valid access token', async () => {
    // First log in
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
      }),
    });

    const { accessToken } = loginResponse.json<{ accessToken: string }>();

    // Then call /me
    const meResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(meResponse.statusCode).toBe(200);
    const body = meResponse.json<{ id: string; email: string; role: string }>();
    expect(body.email).toBe(testEmail.toLowerCase());
    expect(body.role).toBe('user');
  });

  it('POST /api/v1/auth/logout returns 204 and clears cookie', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
    });

    expect(response.statusCode).toBe(204);
  });
});
