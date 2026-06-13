import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyUnsubToken } from '../../services/email-unsubscribe.service.js';

// One-click unsubscribe endpoint (RFC 8058). Mail clients that honour
// `List-Unsubscribe-Post: List-Unsubscribe=One-Click` POST to this URL
// when the user clicks the "Unsubscribe" link in their inbox UI. GET is
// also accepted so a user clicking the URL in their browser also works.
//
// The token in the query string is a signed JWT minted by
// services/email-unsubscribe.service.ts at the time we sent the email.
// It identifies the user and which channel they want to opt out of, so
// no authentication is required at this endpoint (the token IS the auth).
//
// Action: flip the matching column on user_settings to FALSE. We do NOT
// write to email_suppressions — that table is for hard-bounce / complaint
// suppression of an entire address, and would also block security-critical
// mail like password resets. Channel-level opt-out lives in user_settings
// by design.

async function handle(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { t } = request.query as { t?: string };
  if (!t || typeof t !== 'string') {
    return reply.status(400).type('text/plain').send('Missing token.');
  }

  let userId: string;
  let scope: 'trade-messages' | 'all';
  try {
    const payload = verifyUnsubToken(t);
    userId = payload.sub;
    scope = payload.scope;
  } catch {
    // Don't leak which part of the token failed — invalid is invalid.
    return reply.status(400).type('text/plain').send('Invalid or expired unsubscribe link.');
  }

  // Build the SET clause based on scope. 'all' flips every email-preference
  // column except the ones required for account security (verification,
  // password reset — those bypass user_settings entirely).
  const setClause =
    scope === 'trade-messages'
      ? 'email_trade_messages = FALSE, email_trade_requests = FALSE'
      : 'email_trade_messages = FALSE, email_trade_requests = FALSE, email_marketing = FALSE';

  // Upsert against user_settings — the row may not exist yet for users who
  // never visited /settings. ON CONFLICT applies the same SET clause.
  await fastify.db.query(
    `INSERT INTO user_settings (user_id, email_trade_messages, email_trade_requests, email_marketing)
     VALUES ($1, FALSE, FALSE, ${scope === 'all' ? 'FALSE' : 'FALSE'})
     ON CONFLICT (user_id) DO UPDATE SET ${setClause}`,
    [userId],
  );

  reply
    .status(200)
    .type('text/html; charset=utf-8')
    .send(
      `<!doctype html>
<html><head><meta charset="utf-8"><title>Unsubscribed — Cromo</title>
<style>body{font-family:-apple-system,'Segoe UI',sans-serif;max-width:36rem;margin:6rem auto;padding:0 1rem;color:#222;line-height:1.5}</style>
</head><body>
<h1>You're unsubscribed.</h1>
<p>We won't send you ${scope === 'all' ? 'any more optional emails' : 'further trade notifications'}. Security-critical mail (account verification, password reset) will still go out if you request it.</p>
<p>You can re-enable notifications at any time from <a href="${process.env['FRONTEND_URL'] ?? ''}/settings">your Cromo settings page</a>.</p>
</body></html>`,
    );
}

export async function unsubscribeRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/api/v1/unsubscribe',
    {
      // No auth: the token IS the auth. Bypass rate limiting — mail clients
      // POST here once per user click, and a flood would only cost a JWT
      // verify + one UPDATE, which is cheap.
      config: { rateLimit: false },
      schema: {
        tags: ['Email'],
        summary: 'One-click unsubscribe (RFC 8058)',
        description: 'Mail-client one-click handler. Token in `t` query param.',
      },
    },
    (req, reply) => handle(fastify, req, reply),
  );

  fastify.get(
    '/api/v1/unsubscribe',
    {
      config: { rateLimit: false },
      schema: {
        tags: ['Email'],
        summary: 'Browser-clicked unsubscribe (RFC 2369 fallback)',
      },
    },
    (req, reply) => handle(fastify, req, reply),
  );
}
