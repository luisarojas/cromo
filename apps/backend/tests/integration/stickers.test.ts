import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * Integration tests for sticker endpoints.
 *
 * These tests require a real PostgreSQL database and Redis instance.
 * They are skipped when DATABASE_URL does not point to a real server.
 */

const HAS_REAL_DB =
  typeof process.env['DATABASE_URL'] === 'string' &&
  process.env['DATABASE_URL'].includes('@') &&
  !process.env['DATABASE_URL'].includes('placeholder');

const HAS_REAL_REDIS =
  typeof process.env['REDIS_URL'] === 'string' &&
  process.env['REDIS_URL'].startsWith('redis://');

const shouldRun = HAS_REAL_DB && HAS_REAL_REDIS;

// ─── Integration tests (require real DB + Redis) ──────────────────────────────

describe.skipIf(!shouldRun)('GET /api/v1/stickers (integration)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app.js');
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns 200 with { items, nextCursor, total }', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/stickers',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<{ items: unknown[]; nextCursor: number | null; total: number }>();
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.total).toBe('number');
    expect('nextCursor' in body).toBe(true);
  });

  it('returns sticker objects with number, album_code, sticker_type', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/stickers',
    });

    const body = response.json<{
      items: { number: number; album_code: string; sticker_type: string }[];
    }>();

    expect(body.items.length).toBeGreaterThan(0);
    const first = body.items[0];
    expect(typeof first.number).toBe('number');
    expect(typeof first.album_code).toBe('string');
    expect(typeof first.sticker_type).toBe('string');
  });

  it('respects the limit query parameter', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/stickers?limit=5',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<{ items: unknown[] }>();
    expect(body.items.length).toBeLessThanOrEqual(5);
  });

  it('filters by team (fifa_code)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/stickers?team=MEX',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<{ items: { fifa_code: string | null }[] }>();
    expect(body.items.length).toBeGreaterThan(0);
    for (const item of body.items) {
      expect(item.fifa_code).toBe('MEX');
    }
  });

  it('filters by group', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/stickers?group=A',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<{ items: { group_name: string | null }[] }>();
    expect(body.items.length).toBeGreaterThan(0);
    for (const item of body.items) {
      expect(item.group_name).toBe('A');
    }
  });
});

describe.skipIf(!shouldRun)('GET /api/v1/stickers/:albumCode (integration)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app.js');
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns 200 with sticker data for a valid album code', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/stickers/MEX1',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<{ album_code: string; number: number }>();
    expect(body.album_code).toBe('MEX1');
    expect(typeof body.number).toBe('number');
  });

  it('returns 404 for a non-existent album code', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/stickers/DOESNOTEXIST404',
    });

    expect(response.statusCode).toBe(404);

    const body = response.json<{ statusCode: number; error: string }>();
    expect(body.statusCode).toBe(404);
    expect(body.error).toBe('Not Found');
  });
});

describe.skipIf(!shouldRun)('GET /api/v1/stickers/:albumCode/variants (integration)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app.js');
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns an array of variant objects with variant_type', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/stickers/MEX1/variants',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<{ items: { variant_type: string; id: string }[] }>();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
    expect(typeof body.items[0].variant_type).toBe('string');
    expect(typeof body.items[0].id).toBe('string');
  });

  it('returns 404 for variants of a non-existent album code', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/stickers/DOESNOTEXIST404/variants',
    });

    expect(response.statusCode).toBe(404);
  });
});
