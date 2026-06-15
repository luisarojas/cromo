import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// Integration coverage for routes/v1/health.ts. The previous
// tests/unit/health.test.ts only built a fake Fastify with two stub handlers,
// so the real readiness probe — which actually queries Postgres and Redis —
// was never executed. That's the gap we close here.

const HAS_REAL_DB =
  typeof process.env['DATABASE_URL'] === 'string' &&
  process.env['DATABASE_URL'].includes('@') &&
  !process.env['DATABASE_URL'].includes('placeholder');

const HAS_REAL_REDIS =
  typeof process.env['REDIS_URL'] === 'string' &&
  process.env['REDIS_URL'].startsWith('redis://');

const shouldRun = HAS_REAL_DB && HAS_REAL_REDIS;

describe.skipIf(!shouldRun)('Health routes (integration)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app.js');
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('GET /api/v1/health', () => {
    it('returns 200 with status ok and the current APP_VERSION', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ status: string; timestamp: string; version: string }>();
      expect(body.status).toBe('ok');
      expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
      expect(typeof body.version).toBe('string');
      expect(body.version.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/health/ready', () => {
    it('returns 200 with both checks ok when DB + Redis are reachable', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/health/ready' });
      expect(res.statusCode).toBe(200);
      const body = res.json<{ status: string; checks: { database: string; redis: string } }>();
      expect(body.status).toBe('ready');
      expect(body.checks).toEqual({ database: 'ok', redis: 'ok' });
    });

    it('returns 503 when the database query throws', async () => {
      // Temporarily replace fastify.db.query with one that rejects, then
      // restore it. This actually exercises the error branch in the route,
      // unlike a mocked-app unit test.
      const real = app.db.query.bind(app.db);
      const failing = vi.fn().mockRejectedValue(new Error('pg out of connections'));
      (app.db as unknown as { query: unknown }).query = failing;
      try {
        const res = await app.inject({ method: 'GET', url: '/api/v1/health/ready' });
        expect(res.statusCode).toBe(503);
        const body = res.json<{ status: string; checks: { database: string; redis: string } }>();
        expect(body.status).toBe('not_ready');
        expect(body.checks.database).toContain('pg out of connections');
        expect(body.checks.redis).toBe('ok');
      } finally {
        (app.db as unknown as { query: typeof real }).query = real;
      }
    });

    it('returns 503 when Redis returns an unexpected response', async () => {
      const realPing = app.redis.ping.bind(app.redis);
      (app.redis as unknown as { ping: () => Promise<string> }).ping = async () => 'NOT_PONG';
      try {
        const res = await app.inject({ method: 'GET', url: '/api/v1/health/ready' });
        expect(res.statusCode).toBe(503);
        const body = res.json<{ checks: { redis: string } }>();
        expect(body.checks.redis).toBe('unexpected response');
      } finally {
        (app.redis as unknown as { ping: typeof realPing }).ping = realPing;
      }
    });

    it('returns 503 when Redis ping throws', async () => {
      const realPing = app.redis.ping.bind(app.redis);
      (app.redis as unknown as { ping: () => Promise<string> }).ping = async () => {
        throw new Error('redis down');
      };
      try {
        const res = await app.inject({ method: 'GET', url: '/api/v1/health/ready' });
        expect(res.statusCode).toBe(503);
        const body = res.json<{ checks: { redis: string } }>();
        expect(body.checks.redis).toContain('redis down');
      } finally {
        (app.redis as unknown as { ping: typeof realPing }).ping = realPing;
      }
    });
  });
});
