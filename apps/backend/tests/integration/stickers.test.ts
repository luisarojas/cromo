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

  it('returns sticker objects with number, albumCode, stickerType', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/stickers',
    });

    const body = response.json<{
      items: { number: number; albumCode: string; stickerType: string }[];
    }>();

    expect(body.items.length).toBeGreaterThan(0);
    const first = body.items[0];
    expect(typeof first.number).toBe('number');
    expect(typeof first.albumCode).toBe('string');
    expect(typeof first.stickerType).toBe('string');
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

  it('filters by team (fifaCode)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/stickers?team=MEX',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<{ items: { fifaCode: string | null }[] }>();
    expect(body.items.length).toBeGreaterThan(0);
    for (const item of body.items) {
      expect(item.fifaCode).toBe('MEX');
    }
  });

  it('filters by group', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/stickers?group=A',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<{ items: { groupName: string | null }[] }>();
    expect(body.items.length).toBeGreaterThan(0);
    for (const item of body.items) {
      expect(item.groupName).toBe('A');
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

    const body = response.json<{ albumCode: string; number: number }>();
    expect(body.albumCode).toBe('MEX1');
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

  it('returns an array of variant objects with variantType', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/stickers/MEX1/variants',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<{ items: { variantType: string; id: string }[] }>();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
    expect(typeof body.items[0].variantType).toBe('string');
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
