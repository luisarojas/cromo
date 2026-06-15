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

describe.skipIf(!shouldRun)('Version route (integration)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app.js');
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => { await app?.close(); });

  it('GET /api/v1/version returns version, env, and authMode from env', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/version' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ version: string; env: string; authMode: string }>();
    expect(typeof body.version).toBe('string');
    expect(body.version.length).toBeGreaterThan(0);
    // Tests run with NODE_ENV=development by default in the docker-compose dev
    // stack — confirm we propagate it untouched.
    expect(['development', 'production', 'test'].includes(body.env)).toBe(true);
    // Local mode uses 'local'; cognito mode uses 'cognito'. Either is valid.
    expect(['local', 'cognito'].includes(body.authMode)).toBe(true);
  });
});
