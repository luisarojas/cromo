import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { verifyToken, verifyBearerSub } from '../../middleware/auth.js';
import { checkSoftBan } from '../../middleware/ban-check.js';
import { writeSSEEvent, writeSSEHead, writeSSEHeartbeat } from '../../utils/sse.js';
import * as live from '../../services/live-trade.service.js';

// In-person live trade: registered host + anonymous guest share a session;
// the guest joins via 6-digit code / QR / shareable URL with no account, and
// the host commits the result to their album with a 60-second undo window.

const ListItemSchema = z.object({
  albumCode: z.string().min(1).max(16),
  variantToken: z.string().min(1).max(32).nullish(),
  quantity: z.number().int().min(1).max(99).default(1),
});
const ItemListSchema = z.array(ListItemSchema).max(500);

const CreateBody = z.object({ albumId: z.string().uuid() });

const JoinBody = z.object({
  code: z.string().min(1).max(64),
  label: z.string().trim().max(80).nullish(),
});

const SetListBody = z.object({
  offered: ItemListSchema.default([]),
  wanted: ItemListSchema.default([]),
});

const StageBody = z.object({
  items: z.array(z.object({
    stickerVariantId: z.string().uuid(),
    quantity: z.number().int().min(0).max(99),
  })).max(500),
});

const LockBody = z.object({ locked: z.boolean() });

// Per-trade variant weight overrides. Same shape and bounds as the third-party
// match endpoints; the service re-validates inside sanitiseWeights. 0 is a
// legal "worthless" weight, so the value floor is min(0), not positive().
const SetWeightsBody = z.object({
  weights: z
    .record(
      z.string().min(1).max(32).regex(/^[a-z0-9_]+$/),
      z.number().min(0).finite().max(100_000),
    )
    .refine((m) => Object.keys(m).length <= 64, {
      message: 'At most 64 variant weight overrides per trade.',
    }),
});

// Cash a side adds on top of stickers (cents). Guidance only.
const SetCashBody = z.object({
  cents: z.number().int().min(0).max(10_000_000),
});

function asListItems(items: { albumCode: string; variantToken?: string | null; quantity: number }[]) {
  return items.map((i) => ({
    albumCode: i.albumCode,
    variantToken: i.variantToken ?? null,
    quantity: i.quantity,
  }));
}

// ─── Auth shapes ───────────────────────────────────────────────────────────
// Every per-session route accepts EITHER:
//   - A registered host: standard Bearer JWT verified by `verifyToken`, must
//     equal session.hostUserId.
//   - An anonymous guest: opaque token in `X-Live-Trade-Token` header that
//     equals session.guestToken (minted on /join).
// We resolve the role first, then mutate.

type Role = 'host' | 'guest';

interface ResolvedPrincipal { role: Role; userId: string | null }

async function resolvePrincipal(
  fastify: FastifyInstance,
  request: FastifyRequest,
  sessionId: string,
): Promise<ResolvedPrincipal> {
  const session = await live.getPublicSession(fastify.redis, sessionId);
  if (!session) throw Object.assign(new Error('Live-trade session not found.'), { statusCode: 404 });

  // Host: any valid Bearer that owns the session. Verification must honour
  // AUTH_MODE — in cognito mode the token is an RS256 Cognito JWT that isn't
  // signed with JWT_SECRET, so a hardcoded local verify would reject every
  // legitimate host and 401 the whole session.
  const auth = request.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    const sub = await verifyBearerSub(auth.slice(7));
    if (sub && sub === session.host.userId) {
      return { role: 'host', userId: sub };
    }
  }
  // Guest: header token must equal the session's secret. We re-check inside
  // the service (race-free), but failing fast here saves a lock round-trip.
  const guestToken = request.headers['x-live-trade-token'];
  if (typeof guestToken === 'string' && guestToken.length > 0) {
    await live.authoriseGuest(fastify.redis, sessionId, guestToken);
    return { role: 'guest', userId: null };
  }
  throw Object.assign(
    new Error('Authenticate as the host or guest of this session.'),
    { statusCode: 401 },
  );
}

export async function liveTradeRoutes(fastify: FastifyInstance): Promise<void> {
  const prefix = '/api/v1/live-trade';

  /**
   * POST /api/v1/live-trade
   * Host creates a new session bound to one of their albums. Returns the
   * shareable URL + 6-digit code; the actual room is at /trade/live/:id.
   */
  fastify.post(
    prefix,
    {
      preHandler: [verifyToken, checkSoftBan(fastify)],
      config: {
        // Bound a single user to creating ~one session every six seconds —
        // generous for genuine in-person flow, hostile to abuse.
        rateLimit: { max: 10, timeWindow: '1 minute',
          keyGenerator: (req) => (req as FastifyRequest).userId ?? req.ip },
      },
      schema: { tags: ['Trade'], summary: 'Create a live-trade session', security: [{ bearerAuth: [] }] },
    },
    async (request, reply) => {
      const parsed = CreateBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: parsed.error.message });
      }
      const session = await live.createSession(
        fastify.db, fastify.redis, request.userId!, parsed.data.albumId,
      );
      return reply.status(201).send({ session });
    },
  );

  /**
   * POST /api/v1/live-trade/join
   * Guest exchanges a join code (or session id) for an opaque guest token.
   * No auth — that's the point. Rate-limited per IP so a brute-force on the
   * 6-digit code space is impractical (10 tries/min × 10^6 codes ≈ 200 years).
   */
  fastify.post(
    `${prefix}/join`,
    {
      config: {
        rateLimit: { max: 10, timeWindow: '1 minute',
          keyGenerator: (req) => req.ip },
      },
      schema: { tags: ['Trade'], summary: 'Join a live-trade session as guest' },
    },
    async (request, reply) => {
      const parsed = JoinBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: parsed.error.message });
      }
      const sessionId = await live.resolveSessionId(fastify.redis, parsed.data.code.trim());
      if (!sessionId) {
        return reply.status(404).send({
          statusCode: 404, error: 'Not Found',
          message: 'No active live-trade session for that code.',
        });
      }
      const { guestToken, session } = await live.joinSession(
        fastify.redis, sessionId, parsed.data.label ?? null,
      );
      return reply.status(200).send({ guestToken, session });
    },
  );

  /**
   * GET /api/v1/live-trade/:id
   * Snapshot read. Either party can call; the response is the same shape SSE
   * delivers on every mutation.
   */
  fastify.get(
    `${prefix}/:id`,
    {
      schema: {
        tags: ['Trade'], summary: 'Read a live-trade session snapshot',
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try { await resolvePrincipal(fastify, request, id); }
      catch (err) { return forwardError(reply, err); }
      const session = await live.getPublicSession(fastify.redis, id);
      if (!session) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Live-trade session not found.' });
      }
      return reply.status(200).send({ session });
    },
  );

  /**
   * POST /api/v1/live-trade/:id/list
   * Replace the caller's side of the list (offered + wanted). Re-resolves
   * against the catalog; any prior lock on either side is dropped.
   */
  fastify.post(
    `${prefix}/:id/list`,
    {
      schema: {
        tags: ['Trade'], summary: 'Set one side of the list',
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      let principal: ResolvedPrincipal;
      try { principal = await resolvePrincipal(fastify, request, id); }
      catch (err) { return forwardError(reply, err); }
      const parsed = SetListBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: parsed.error.message });
      }
      try {
        const session = await live.setSideList(
          fastify.db, fastify.redis, id, principal.role,
          { offered: asListItems(parsed.data.offered), wanted: asListItems(parsed.data.wanted) },
        );
        return reply.status(200).send({ session });
      } catch (err) {
        return forwardError(reply, err);
      }
    },
  );

  /**
   * POST /api/v1/live-trade/:id/stage
   * Replace the caller's staged pile (subset of their offered list that they
   * are committing to give). The matching shortcut on the frontend just calls
   * this twice — once per role — with the suggestion payload.
   */
  fastify.post(
    `${prefix}/:id/stage`,
    {
      schema: {
        tags: ['Trade'], summary: 'Set one side of the staged pile',
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      let principal: ResolvedPrincipal;
      try { principal = await resolvePrincipal(fastify, request, id); }
      catch (err) { return forwardError(reply, err); }
      const parsed = StageBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: parsed.error.message });
      }
      try {
        const session = await live.setSideStaged(fastify.redis, id, principal.role, parsed.data.items);
        return reply.status(200).send({ session });
      } catch (err) {
        return forwardError(reply, err);
      }
    },
  );

  /**
   * POST /api/v1/live-trade/:id/lock
   * Toggle the caller's lock. Once both sides are locked, the host can call
   * /complete; any list/stage edit drops both locks (see setSideList/stage).
   */
  fastify.post(
    `${prefix}/:id/lock`,
    {
      schema: {
        tags: ['Trade'], summary: 'Set one side\'s lock state',
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      let principal: ResolvedPrincipal;
      try { principal = await resolvePrincipal(fastify, request, id); }
      catch (err) { return forwardError(reply, err); }
      const parsed = LockBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: parsed.error.message });
      }
      try {
        const session = await live.setSideLock(fastify.redis, id, principal.role, parsed.data.locked);
        return reply.status(200).send({ session });
      } catch (err) {
        return forwardError(reply, err);
      }
    },
  );

  /**
   * POST /api/v1/live-trade/:id/weights
   * Host-only. Sets the per-trade variant weight table directly (no handshake —
   * the host owns the album the trade commits to). Both locks drop.
   */
  fastify.post(
    `${prefix}/:id/weights`,
    {
      schema: {
        tags: ['Trade'], summary: 'Set per-trade variant weights (host-only)',
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      let principal: ResolvedPrincipal;
      try { principal = await resolvePrincipal(fastify, request, id); }
      catch (err) { return forwardError(reply, err); }
      const parsed = SetWeightsBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: parsed.error.message });
      }
      try {
        const session = await live.setWeights(
          fastify.redis, id, principal.role, parsed.data.weights,
        );
        return reply.status(200).send({ session });
      } catch (err) {
        return forwardError(reply, err);
      }
    },
  );

  /**
   * POST /api/v1/live-trade/:id/cash
   * Set the caller's cash contribution (cents). Each role sets their own side.
   * Guidance only — feeds the balance, not the completion record. Both locks drop.
   */
  fastify.post(
    `${prefix}/:id/cash`,
    {
      schema: {
        tags: ['Trade'], summary: 'Set one side\'s cash contribution',
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      let principal: ResolvedPrincipal;
      try { principal = await resolvePrincipal(fastify, request, id); }
      catch (err) { return forwardError(reply, err); }
      const parsed = SetCashBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: parsed.error.message });
      }
      try {
        const session = await live.setCash(fastify.redis, id, principal.role, parsed.data.cents);
        return reply.status(200).send({ session });
      } catch (err) {
        return forwardError(reply, err);
      }
    },
  );

  /**
   * POST /api/v1/live-trade/:id/complete
   * Host-only. Validates both locks, applies deltas to the host's album,
   * inserts a live_trade_completions row, opens the 60s undo window.
   */
  fastify.post(
    `${prefix}/:id/complete`,
    {
      preHandler: [verifyToken, checkSoftBan(fastify)],
      schema: {
        tags: ['Trade'], summary: 'Complete a live trade (host-only)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const session = await live.completeSession(fastify.db, fastify.redis, request.userId!, id);
        return reply.status(200).send({ session });
      } catch (err) {
        return forwardError(reply, err);
      }
    },
  );

  /**
   * POST /api/v1/live-trade/:id/undo
   * Host-only. Reverses the completion's deltas if within 60s and not yet
   * undone. The session goes back to 'open' for "wait, one more sticker"
   * flows; the host can re-lock and re-complete.
   *
   * No checkSoftBan — undo only reverses a prior mutation; refusing it would
   * leave a banned user's inventory in a half-applied state with no way out.
   */
  fastify.post(
    `${prefix}/:id/undo`,
    {
      preHandler: [verifyToken],
      schema: {
        tags: ['Trade'], summary: 'Undo a recently-completed live trade (host-only)',
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const session = await live.undoCompletion(fastify.db, fastify.redis, request.userId!, id);
        return reply.status(200).send({ session });
      } catch (err) {
        return forwardError(reply, err);
      }
    },
  );

  // ── SSE ─────────────────────────────────────────────────────────────────
  // Same ticket-then-stream pattern the trade-request SSE uses. EventSource
  // can't send headers, so we mint a single-use ticket carrying both role
  // and session id, then the GET /stream endpoint consumes the ticket atomically.
  const SSE_TICKET_TTL_SECONDS = 30;

  fastify.post(
    `${prefix}/:id/stream-ticket`,
    {
      schema: {
        tags: ['Trade'], summary: 'Mint a single-use SSE ticket for a live-trade session',
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      let principal: ResolvedPrincipal;
      try { principal = await resolvePrincipal(fastify, request, id); }
      catch (err) { return forwardError(reply, err); }
      const ticket = crypto.randomBytes(24).toString('base64url');
      await fastify.redis.set(
        `sse:live-trade:ticket:${ticket}`,
        JSON.stringify({ sessionId: id, role: principal.role }),
        'EX',
        SSE_TICKET_TTL_SECONDS,
      );
      return reply.status(201).send({ ticket, expiresIn: SSE_TICKET_TTL_SECONDS });
    },
  );

  /**
   * GET /api/v1/live-trade/:id/stream
   * SSE stream of session events. One ticket → one stream; reconnects mint
   * a new ticket. Heartbeat every 30s; idle close at 30 min.
   */
  fastify.get(
    `${prefix}/:id/stream`,
    {
      schema: {
        tags: ['Trade'], summary: 'SSE stream of live-trade session events',
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        querystring: { type: 'object', properties: { ticket: { type: 'string' } } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id: sessionId } = request.params as { id: string };
      const ticket = (request.query as { ticket?: string }).ticket;
      if (!ticket || !/^[A-Za-z0-9_-]{1,128}$/.test(ticket)) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Missing or invalid SSE ticket.' });
      }
      const raw = await fastify.redis.getdel(`sse:live-trade:ticket:${ticket}`);
      if (!raw) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'SSE ticket is invalid or expired.' });
      }
      let parsedTicket: { sessionId: string; role: Role };
      try { parsedTicket = JSON.parse(raw); }
      catch { return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Malformed SSE ticket.' }); }
      if (parsedTicket.sessionId !== sessionId) {
        return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Ticket does not match this session.' });
      }

      writeSSEHead(reply);

      // Initial state push so the client doesn't have to GET separately.
      // If the session evaporated between ticket-mint and stream-open (TTL,
      // explicit deletion, Redis flush) send a `gone` event and close —
      // otherwise the client sits on a healthy socket that will never receive
      // another frame and the user wonders why nothing happens.
      const snapshot = await live.getPublicSession(fastify.redis, sessionId);
      if (!snapshot) {
        writeSSEEvent(reply, 'gone', { sessionId }, crypto.randomUUID());
        reply.raw.end();
        return;
      }
      writeSSEEvent(reply, 'state', { session: snapshot }, crypto.randomUUID());

      const SSE_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
      let idleTimer: NodeJS.Timeout | null = null;
      const resetIdleTimer = (): void => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          if (!reply.raw.writableEnded) reply.raw.end();
        }, SSE_IDLE_TIMEOUT_MS);
      };
      resetIdleTimer();
      const heartbeat = setInterval(() => writeSSEHeartbeat(reply), 30000);

      const unsubscribe = fastify.liveTradeBus.subscribe(sessionId, (message: string) => {
        if (reply.raw.writableEnded) return;
        try {
          const parsed = JSON.parse(message) as { type: string; id?: string; [k: string]: unknown };
          writeSSEEvent(reply, parsed.type ?? 'message', parsed, parsed.id ?? crypto.randomUUID());
          resetIdleTimer();
        } catch { /* drop malformed message */ }
      });

      const cleanup = (): void => {
        clearInterval(heartbeat);
        if (idleTimer) clearTimeout(idleTimer);
        unsubscribe();
      };
      request.raw.on('close', cleanup);
      await new Promise<void>((resolve) => {
        request.raw.on('close', resolve);
        request.raw.on('error', resolve);
      });
    },
  );
}

function forwardError(reply: FastifyReply, err: unknown): FastifyReply {
  const e = err as { statusCode?: number; message?: string };
  const status = e.statusCode ?? 500;
  const labelByStatus: Record<number, string> = {
    400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
    404: 'Not Found', 409: 'Conflict', 410: 'Gone', 503: 'Service Unavailable',
  };
  return reply.status(status).send({
    statusCode: status,
    error: labelByStatus[status] ?? 'Internal Server Error',
    message: e.message ?? 'Live-trade request failed.',
  });
}
