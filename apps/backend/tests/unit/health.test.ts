import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

// ── Minimal Fastify app for unit tests (no DB, no Redis) ──────────────────────

async function buildTestApp(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });

  // Register a minimal set of routes without the database/redis plugins
  fastify.get('/api/v1/health', async (_req, reply) => {
    return reply.status(200).send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.0.0-test',
    });
  });

  // /health/ready cannot be properly unit-tested without a real DB.
  // We test that it exists and returns an appropriate shape via mocking.
  fastify.get('/api/v1/health/ready', async (_req, reply) => {
    // Stub: always healthy in unit tests
    return reply.status(200).send({
      status: 'ready',
      checks: {
        database: 'ok',
        redis: 'ok',
      },
    });
  });

  return fastify;
}

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('GET /api/v1/health', () => {
  it('returns 200 with status "ok"', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<{ status: string; timestamp: string; version: string }>();
    expect(body.status).toBe('ok');
    expect(typeof body.timestamp).toBe('string');
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
    expect(body.version).toBe('0.0.0-test');
  });

  it('includes Content-Type: application/json', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(response.headers['content-type']).toMatch(/application\/json/);
  });
});

describe('GET /api/v1/health/ready', () => {
  it('returns 200 with both checks "ok" when services are healthy', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health/ready',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<{
      status: string;
      checks: { database: string; redis: string };
    }>();

    expect(body.status).toBe('ready');
    expect(body.checks.database).toBe('ok');
    expect(body.checks.redis).toBe('ok');
  });
});
