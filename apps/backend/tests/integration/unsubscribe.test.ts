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

// Charlie from the seed has a user_settings row already; we use him to verify
// the ON CONFLICT branch. Evan is seeded as a user without a user_settings
// row, so we use him to verify the INSERT branch on his first unsubscribe.
const CHARLIE_ID = '00000000-0000-0000-0000-000000000004';
const EVAN_ID    = '00000000-0000-0000-0000-000000000006';

describe.skipIf(!shouldRun)('Unsubscribe routes (integration)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { buildApp } = await import('../../src/app.js');
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => { await app?.close(); });

  it('GET /api/v1/unsubscribe without ?t returns 400', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/unsubscribe' });
    expect(res.statusCode).toBe(400);
    expect(res.payload).toMatch(/Missing token/);
  });

  it('GET /api/v1/unsubscribe with an unverifiable token returns 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/unsubscribe?t=not-a-jwt',
    });
    expect(res.statusCode).toBe(400);
    expect(res.payload).toMatch(/Invalid or expired/);
  });

  it('POST with a valid "trade-messages" token flips both trade columns to FALSE', async () => {
    const { mintUnsubToken } = await import('../../src/services/email-unsubscribe.service.js');

    // Reset Charlie's settings to TRUE first so we can prove the route flipped them.
    await app.db.query(
      `INSERT INTO user_settings (user_id, email_trade_messages, email_trade_requests, email_marketing)
       VALUES ($1, TRUE, TRUE, TRUE)
       ON CONFLICT (user_id) DO UPDATE SET
         email_trade_messages = TRUE,
         email_trade_requests = TRUE,
         email_marketing = TRUE`,
      [CHARLIE_ID],
    );

    const token = mintUnsubToken(CHARLIE_ID, 'trade-messages');
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/unsubscribe?t=${token}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.payload).toMatch(/unsubscribed/i);
    expect(res.payload).toMatch(/further trade notifications/);

    // Verify the actual DB columns flipped — this is what proves behaviour,
    // not just the 200 status.
    const { rows } = await app.db.query<{
      email_trade_messages: boolean;
      email_trade_requests: boolean;
      email_marketing: boolean;
    }>(
      `SELECT email_trade_messages, email_trade_requests, email_marketing
         FROM user_settings WHERE user_id = $1`,
      [CHARLIE_ID],
    );
    expect(rows[0]).toMatchObject({
      email_trade_messages: false,
      email_trade_requests: false,
      // 'trade-messages' scope must NOT flip marketing — that's a separate channel.
      email_marketing: true,
    });
  });

  it('POST with a valid "all" token flips every non-security email column to FALSE', async () => {
    const { mintUnsubToken } = await import('../../src/services/email-unsubscribe.service.js');

    await app.db.query(
      `INSERT INTO user_settings (user_id, email_trade_messages, email_trade_requests, email_marketing)
       VALUES ($1, TRUE, TRUE, TRUE)
       ON CONFLICT (user_id) DO UPDATE SET
         email_trade_messages = TRUE,
         email_trade_requests = TRUE,
         email_marketing = TRUE`,
      [CHARLIE_ID],
    );

    const token = mintUnsubToken(CHARLIE_ID, 'all');
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/unsubscribe?t=${token}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatch(/any more optional emails/);

    const { rows } = await app.db.query<{
      email_trade_messages: boolean;
      email_trade_requests: boolean;
      email_marketing: boolean;
    }>(
      `SELECT email_trade_messages, email_trade_requests, email_marketing
         FROM user_settings WHERE user_id = $1`,
      [CHARLIE_ID],
    );
    expect(rows[0]).toEqual({
      email_trade_messages: false,
      email_trade_requests: false,
      email_marketing: false,
    });
  });

  it('upserts (INSERT branch) when the user has no user_settings row yet', async () => {
    const { mintUnsubToken } = await import('../../src/services/email-unsubscribe.service.js');

    // Wipe Evan's row to force the INSERT side of the ON CONFLICT. Use a
    // try/finally to avoid leaking state to other tests.
    await app.db.query(`DELETE FROM user_settings WHERE user_id = $1`, [EVAN_ID]);
    try {
      const token = mintUnsubToken(EVAN_ID, 'trade-messages');
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/unsubscribe?t=${token}`,
      });
      expect(res.statusCode).toBe(200);

      const { rows } = await app.db.query<{
        email_trade_messages: boolean;
        email_trade_requests: boolean;
      }>(
        `SELECT email_trade_messages, email_trade_requests
           FROM user_settings WHERE user_id = $1`,
        [EVAN_ID],
      );
      expect(rows.length).toBe(1);
      expect(rows[0]).toEqual({
        email_trade_messages: false,
        email_trade_requests: false,
      });
    } finally {
      // Restore a default row so other tests see Evan with default settings.
      await app.db.query(
        `INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
        [EVAN_ID],
      );
    }
  });
});
