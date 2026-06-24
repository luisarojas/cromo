import crypto from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { Redis } from 'ioredis';
import type {
  ExternalListItem,
  LiveTradeHistorySummary,
  LiveTradeSession,
  LiveTradeStickerRef,
  ScarcityTotals,
} from '@cromo/shared';
import { variantScarcity, TRADE_BALANCE_HIGH, TRADE_BALANCE_LOW } from '@cromo/shared';
import { camelizeKeys } from '../utils/casing.js';
import { env } from '../env.js';
import { statusError } from '../utils/errors.js';
import { recordAudit } from '../utils/audit.js';
import { invalidateUserCaches } from './cache.js';
import {
  type ResolvedItem,
  dedupeItems,
  invalidateMatchesFor,
  labelFor,
  lookupCatalogVariants,
  resolveItems,
} from './trade-matching.service.js';
import { notifyAffectedTrades, notifyRestoredAvailability } from './trade-availability.service.js';

// ─── Session model ─────────────────────────────────────────────────────────
// A live-trade session is short-lived shared state: one host + one anonymous
// guest editing two parallel lists side-by-side, then committing a subset of
// stickers each gives. The Redis blob below is the single source of truth
// during the session; only the final completion lands in Postgres (so trade
// history + 60-second undo work).
//
// Concurrency: every mutation goes through `withSession(...)` which holds a
// per-session Redis lock for the read-modify-write. That's enough at the
// expected 2-actor concurrency — neither side is going to issue thousands of
// concurrent writes, and the lock TTL guarantees we never strand state.

const SESSION_PREFIX = 'live-trade:session:';
const CODE_PREFIX = 'live-trade:code:';
const LOCK_PREFIX = 'live-trade:lock:';

const SESSION_TTL_SECONDS = 6 * 60 * 60; // 6h — covers an evening's trading session.
const CODE_TTL_SECONDS = 30 * 60;        // 30 min — collector hands the code once and joins.
const LOCK_TTL_MS = 5_000;               // mutations are sub-second; this is a safety net.
const LOCK_RETRY_MS = 30;
const LOCK_RETRY_MAX = 40;               // ~1.2s before we give up.
const UNDO_WINDOW_SECONDS = 60;

// Six-digit codes are easy to read aloud and easy to type on phones. Padding
// with leading zeros keeps the surface area exactly 1M codes (10^6). At any
// given moment we have far fewer active sessions than that, so collisions are
// astronomically rare; we still retry on collision below.
const JOIN_CODE_DIGITS = 6;

// Wire format for what the service stores in Redis. The `LiveTradeSession`
// public type is derived from this on every read by `toPublicSession()`.
interface StoredSession {
  id: string;
  joinCode: string;
  hostUserId: string;
  hostUsername: string | null;
  hostDisplayName: string | null;
  hostAlbumId: string;
  hostAlbumTypeKey: string;
  defaultBaseVariant: string;
  /** Random opaque token issued to the guest on join. Empty until joined. */
  guestToken: string;
  guestJoined: boolean;
  guestLabel: string | null;
  hostList: { offered: LiveTradeStickerRef[]; wanted: LiveTradeStickerRef[]; unknownCodes: string[] };
  guestList: { offered: LiveTradeStickerRef[]; wanted: LiveTradeStickerRef[]; unknownCodes: string[] };
  hostStaged: LiveTradeStickerRef[];
  guestStaged: LiveTradeStickerRef[];
  hostLocked: boolean;
  guestLocked: boolean;
  status: 'open' | 'completed';
  completionId: string | null;
  completedAt: string | null;
  undoneAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Locking ───────────────────────────────────────────────────────────────

async function acquireLock(redis: Redis, sessionId: string): Promise<string> {
  const token = crypto.randomBytes(12).toString('base64url');
  for (let i = 0; i < LOCK_RETRY_MAX; i++) {
    const ok = await redis.set(`${LOCK_PREFIX}${sessionId}`, token, 'PX', LOCK_TTL_MS, 'NX');
    if (ok === 'OK') return token;
    await new Promise((r) => setTimeout(r, LOCK_RETRY_MS));
  }
  throw statusError('Live-trade session is busy, try again.', 503);
}

const RELEASE_SCRIPT = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
  else
    return 0
  end
`;

async function releaseLock(redis: Redis, sessionId: string, token: string): Promise<void> {
  await redis.eval(RELEASE_SCRIPT, 1, `${LOCK_PREFIX}${sessionId}`, token);
}

// ─── Persistence helpers ───────────────────────────────────────────────────

async function readSession(redis: Redis, sessionId: string): Promise<StoredSession | null> {
  const raw = await redis.get(`${SESSION_PREFIX}${sessionId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

async function writeSession(redis: Redis, session: StoredSession): Promise<void> {
  session.updatedAt = new Date().toISOString();
  await redis.set(
    `${SESSION_PREFIX}${session.id}`,
    JSON.stringify(session),
    'EX',
    SESSION_TTL_SECONDS,
  );
  // Keep the code → session-id reverse index alive in lock-step with the
  // session. Without this, an active session whose code TTL expired would
  // refuse joins even though the session itself is still healthy.
  await redis.set(`${CODE_PREFIX}${session.joinCode}`, session.id, 'EX', CODE_TTL_SECONDS);
}

async function withSession<T>(
  redis: Redis,
  sessionId: string,
  fn: (session: StoredSession) => Promise<T>,
): Promise<T> {
  const token = await acquireLock(redis, sessionId);
  try {
    const session = await readSession(redis, sessionId);
    if (!session) throw statusError('Live-trade session not found.', 404);
    return await fn(session);
  } finally {
    await releaseLock(redis, sessionId, token);
  }
}

// ─── Catalog resolution ────────────────────────────────────────────────────

/**
 * Resolve a freeform ExternalListItem[] into LiveTradeStickerRef[] (carrying
 * sticker_variant_id + display metadata) using the host album's variant
 * preferences. Returns both the resolved list and any unresolved tokens so the
 * UI can flag them.
 */
async function resolveList(
  db: Pool,
  items: ExternalListItem[],
  albumTypeKey: string,
  defaultBaseVariant: string,
): Promise<{ resolved: LiveTradeStickerRef[]; unknown: string[] }> {
  if (items.length === 0) return { resolved: [], unknown: [] };
  const normalised = dedupeItems(items);
  const codes = [...new Set(normalised.map((n) => n.albumCode))];
  const catalog = await lookupCatalogVariants(db, codes, albumTypeKey);
  const { resolved, unknown } = resolveItems(normalised, catalog, defaultBaseVariant);
  return { resolved: resolved.map(refOfResolved), unknown };
}

function refOfResolved(r: ResolvedItem): LiveTradeStickerRef {
  const stickerType =
    r.entry.stickerType === 'extra' ? 'extra'
    : r.entry.stickerType === 'coca_cola_special' ? 'coca_cola_special'
    : null;
  return {
    stickerVariantId: r.stickerVariantId,
    albumCode: r.entry.albumCode,
    playerName: r.entry.playerName,
    stickerType,
    number: r.entry.number,
    variantToken: r.variantType,
    variantLabel: labelFor(r.variantType),
    scarcity: variantScarcity(r.variantType),
    quantity: r.quantity,
  };
}

// ─── Auto-suggestion ────────────────────────────────────────────────────────
// Same intersection match as `matchPair` but computed over the already-resolved
// lists in the session, so it doesn't pay a second catalog lookup.

function computeSuggestion(session: StoredSession): LiveTradeSession['suggestion'] {
  const hostOffered = new Map(session.hostList.offered.map((r) => [r.stickerVariantId, r] as const));
  const hostWanted  = new Map(session.hostList.wanted.map((r) => [r.stickerVariantId, r] as const));
  const guestOffered = new Map(session.guestList.offered.map((r) => [r.stickerVariantId, r] as const));
  const guestWanted  = new Map(session.guestList.wanted.map((r) => [r.stickerVariantId, r] as const));

  const hostGives: LiveTradeStickerRef[] = [];
  for (const [id, hostRef] of hostOffered) {
    const guestRef = guestWanted.get(id);
    if (!guestRef) continue;
    const qty = Math.min(hostRef.quantity, guestRef.quantity);
    if (qty > 0) hostGives.push({ ...hostRef, quantity: qty });
  }
  const hostReceives: LiveTradeStickerRef[] = [];
  for (const [id, guestRef] of guestOffered) {
    const hostRef = hostWanted.get(id);
    if (!hostRef) continue;
    const qty = Math.min(hostRef.quantity, guestRef.quantity);
    if (qty > 0) hostReceives.push({ ...guestRef, quantity: qty });
  }

  if (hostGives.length === 0 && hostReceives.length === 0) return null;
  return { hostGives, hostReceives, balance: computeBalance(hostGives, hostReceives) };
}

function computeBalance(give: LiveTradeStickerRef[], get: LiveTradeStickerRef[]): ScarcityTotals {
  const giveSum = give.reduce((s, r) => s + r.scarcity * r.quantity, 0);
  const getSum  = get.reduce((s, r) => s + r.scarcity * r.quantity, 0);
  const ratio = giveSum === 0 ? null : getSum / giveSum;
  const lopsided = ratio !== null && (ratio < TRADE_BALANCE_LOW || ratio > TRADE_BALANCE_HIGH);
  return { give: giveSum, get: getSum, ratio, lopsided };
}

// ─── Event broadcasting ────────────────────────────────────────────────────

/**
 * Publish a session event. Always camelizes — SSE handlers write raw to the
 * socket, bypassing Fastify's serializer.
 */
async function publish(
  redis: Redis,
  sessionId: string,
  type: string,
  data: Record<string, unknown>,
): Promise<void> {
  const payload = JSON.stringify(camelizeKeys({ type, id: crypto.randomUUID(), ...data }));
  await redis.publish(`live-trade:channel:${sessionId}`, payload);
}

// ─── Public projection ─────────────────────────────────────────────────────

export function toPublicSession(stored: StoredSession): LiveTradeSession {
  const joinUrl = `${env.FRONTEND_URL.replace(/\/$/, '')}/join/${stored.joinCode}`;
  const completion = stored.completionId && stored.completedAt
    ? {
        id: stored.completionId,
        completedAt: stored.completedAt,
        undoneAt: stored.undoneAt,
        undoExpiresAt: new Date(
          new Date(stored.completedAt).getTime() + UNDO_WINDOW_SECONDS * 1000,
        ).toISOString(),
      }
    : null;
  const expiresAt = new Date(
    new Date(stored.updatedAt).getTime() + SESSION_TTL_SECONDS * 1000,
  ).toISOString();
  return {
    id: stored.id,
    joinCode: stored.joinCode,
    joinUrl,
    status: stored.status,
    host: {
      userId: stored.hostUserId,
      username: stored.hostUsername,
      displayName: stored.hostDisplayName,
      albumId: stored.hostAlbumId,
      albumTypeKey: stored.hostAlbumTypeKey,
    },
    guest: {
      joined: stored.guestJoined,
      label: stored.guestLabel,
    },
    hostList: stored.hostList,
    guestList: stored.guestList,
    hostStaged: stored.hostStaged,
    guestStaged: stored.guestStaged,
    hostLocked: stored.hostLocked,
    guestLocked: stored.guestLocked,
    suggestion: computeSuggestion(stored),
    completion,
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
    expiresAt,
  };
}

// ─── Operations ────────────────────────────────────────────────────────────

/**
 * Create a new live-trade session bound to a host's album. Generates a
 * 6-digit join code (retrying on the astronomically-rare collision) and seeds
 * an empty session blob.
 */
export async function createSession(
  db: Pool,
  redis: Redis,
  hostUserId: string,
  hostAlbumId: string,
): Promise<LiveTradeSession> {
  const { rows: albumRows } = await db.query<{
    album_type_key: string;
    settings: { defaultBaseVariant?: string } | null;
    host_username: string | null;
    host_display_name: string | null;
  }>(
    `SELECT at.key AS album_type_key,
            ua.settings,
            u.username AS host_username,
            u.display_name AS host_display_name
       FROM user_albums ua
       JOIN album_types at ON at.id = ua.album_type_id
       JOIN users u ON u.id = ua.user_id
      WHERE ua.id = $1 AND ua.user_id = $2`,
    [hostAlbumId, hostUserId],
  );
  if (albumRows.length === 0) {
    throw statusError('Album not found.', 404);
  }
  const album = albumRows[0]!;

  const id = crypto.randomUUID();
  const joinCode = await mintJoinCode(redis, id);
  const now = new Date().toISOString();

  const stored: StoredSession = {
    id,
    joinCode,
    hostUserId,
    hostUsername: album.host_username,
    hostDisplayName: album.host_display_name,
    hostAlbumId,
    hostAlbumTypeKey: album.album_type_key,
    defaultBaseVariant: album.settings?.defaultBaseVariant ?? 'base_borderless',
    guestToken: '',
    guestJoined: false,
    guestLabel: null,
    hostList: { offered: [], wanted: [], unknownCodes: [] },
    guestList: { offered: [], wanted: [], unknownCodes: [] },
    hostStaged: [],
    guestStaged: [],
    hostLocked: false,
    guestLocked: false,
    status: 'open',
    completionId: null,
    completedAt: null,
    undoneAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await writeSession(redis, stored);
  return toPublicSession(stored);
}

async function mintJoinCode(redis: Redis, sessionId: string): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = String(crypto.randomInt(0, 10 ** JOIN_CODE_DIGITS))
      .padStart(JOIN_CODE_DIGITS, '0');
    const set = await redis.set(`${CODE_PREFIX}${candidate}`, sessionId, 'EX', CODE_TTL_SECONDS, 'NX');
    if (set === 'OK') return candidate;
  }
  // 8 misses at 10^6 codes is well past the point where retrying is pointless.
  throw statusError('Could not mint a join code, please try again.', 503);
}

/** Look up a session by join code OR session id. Returns null if neither match. */
export async function resolveSessionId(redis: Redis, codeOrId: string): Promise<string | null> {
  // UUID-shaped tokens resolve directly; everything else goes through the code index.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(codeOrId)) {
    return codeOrId;
  }
  const id = await redis.get(`${CODE_PREFIX}${codeOrId}`);
  return id ?? null;
}

export async function getPublicSession(
  redis: Redis,
  sessionId: string,
): Promise<LiveTradeSession | null> {
  const stored = await readSession(redis, sessionId);
  return stored ? toPublicSession(stored) : null;
}

/**
 * Guest's first call. Mints a guest token (if absent) and marks the session
 * as joined. Idempotent: re-joining returns the same token so a guest who
 * reloads their browser tab can recover.
 */
export async function joinSession(
  redis: Redis,
  sessionId: string,
  guestLabel: string | null,
): Promise<{ guestToken: string; session: LiveTradeSession }> {
  return await withSession(redis, sessionId, async (session) => {
    if (session.status === 'completed') {
      throw statusError('This trade has already been completed.', 409);
    }
    if (!session.guestToken) {
      session.guestToken = crypto.randomBytes(24).toString('base64url');
      session.guestJoined = true;
    }
    if (guestLabel !== null) {
      session.guestLabel = guestLabel.trim().slice(0, 80) || null;
    }
    await writeSession(redis, session);
    await publish(redis, sessionId, 'state', { session: toPublicSession(session) });
    return { guestToken: session.guestToken, session: toPublicSession(session) };
  });
}

/** Verify guest token without mutating. Throws 401 on mismatch. */
export async function authoriseGuest(
  redis: Redis,
  sessionId: string,
  guestToken: string,
): Promise<void> {
  const session = await readSession(redis, sessionId);
  if (!session) throw statusError('Live-trade session not found.', 404);
  if (!session.guestToken || session.guestToken !== guestToken) {
    throw statusError('Guest session token is invalid.', 401);
  }
}

export type Role = 'host' | 'guest';

/**
 * Replace one side's offered/wanted list. Re-resolves against the catalog so
 * sticker_variant_ids stay authoritative. Unlocks both sides — locks are only
 * meaningful against the most recent list.
 */
export async function setSideList(
  db: Pool,
  redis: Redis,
  sessionId: string,
  role: Role,
  input: { offered: ExternalListItem[]; wanted: ExternalListItem[] },
): Promise<LiveTradeSession> {
  return await withSession(redis, sessionId, async (session) => {
    if (session.status === 'completed') {
      throw statusError('Cannot edit a completed live trade.', 409);
    }
    const { resolved: offered, unknown: uo } = await resolveList(
      db, input.offered, session.hostAlbumTypeKey, session.defaultBaseVariant,
    );
    const { resolved: wanted, unknown: uw } = await resolveList(
      db, input.wanted, session.hostAlbumTypeKey, session.defaultBaseVariant,
    );
    const list = { offered, wanted, unknownCodes: [...new Set([...uo, ...uw])] };
    if (role === 'host') session.hostList = list;
    else session.guestList = list;
    // Any list edit invalidates a prior lock — explicit re-lock keeps both
    // sides from sleepwalking into a stale agreement.
    session.hostLocked = false;
    session.guestLocked = false;
    await writeSession(redis, session);
    await publish(redis, sessionId, 'state', { session: toPublicSession(session) });
    return toPublicSession(session);
  });
}

/** Replace one side's staged pile (the subset that side will give on commit). */
export async function setSideStaged(
  redis: Redis,
  sessionId: string,
  role: Role,
  staged: Array<{ stickerVariantId: string; quantity: number }>,
): Promise<LiveTradeSession> {
  return await withSession(redis, sessionId, async (session) => {
    if (session.status === 'completed') {
      throw statusError('Cannot edit a completed live trade.', 409);
    }
    // Stage from the side's already-resolved offered list. Anything not in
    // that list is silently dropped — we never trust a sticker_variant_id
    // the side didn't first list as theirs to give.
    const allowed = role === 'host'
      ? new Map(session.hostList.offered.map((r) => [r.stickerVariantId, r] as const))
      : new Map(session.guestList.offered.map((r) => [r.stickerVariantId, r] as const));
    const accepted: LiveTradeStickerRef[] = [];
    for (const s of staged) {
      const ref = allowed.get(s.stickerVariantId);
      if (!ref) continue;
      const qty = Math.max(0, Math.min(ref.quantity, Math.floor(s.quantity || 0)));
      if (qty === 0) continue;
      accepted.push({ ...ref, quantity: qty });
    }
    if (role === 'host') session.hostStaged = accepted;
    else session.guestStaged = accepted;
    // Editing the pile invalidates locks for the same reason as editing the list.
    session.hostLocked = false;
    session.guestLocked = false;
    await writeSession(redis, session);
    await publish(redis, sessionId, 'state', { session: toPublicSession(session) });
    return toPublicSession(session);
  });
}

/** Set one side's lock state. The two-sided lock gates `complete`. */
export async function setSideLock(
  redis: Redis,
  sessionId: string,
  role: Role,
  locked: boolean,
): Promise<LiveTradeSession> {
  return await withSession(redis, sessionId, async (session) => {
    if (session.status === 'completed') {
      throw statusError('Cannot change lock on a completed live trade.', 409);
    }
    if (role === 'host') session.hostLocked = locked;
    else session.guestLocked = locked;
    await writeSession(redis, session);
    await publish(redis, sessionId, 'state', { session: toPublicSession(session) });
    return toPublicSession(session);
  });
}

// ─── Completion ────────────────────────────────────────────────────────────

/**
 * Commit the trade to the host's inventory and write a completion row that
 * powers history + the 60s undo window. Host-only — the guest has no
 * inventory to mutate.
 *
 * Validation: both sides must be locked, and the host must still have enough
 * of every staged sticker. Insufficient stock fails the call without
 * mutating, so a refresh of the host's collection will let them retry.
 */
export async function completeSession(
  db: Pool,
  redis: Redis,
  hostUserId: string,
  sessionId: string,
): Promise<LiveTradeSession> {
  return await withSession(redis, sessionId, async (session) => {
    if (session.hostUserId !== hostUserId) throw statusError('Not the host of this session.', 403);
    if (session.status === 'completed') {
      throw statusError('This live trade has already been completed.', 409);
    }
    if (!session.hostLocked || !session.guestLocked) {
      throw statusError('Both sides must lock in before completing.', 409);
    }
    if (session.hostStaged.length === 0 && session.guestStaged.length === 0) {
      throw statusError('Nothing to trade — stage at least one sticker.', 409);
    }

    const hostGiveDeltas = aggregateDeltas(session.hostStaged);
    const hostReceiveDeltas = aggregateDeltas(session.guestStaged);

    const client: PoolClient = await (db as Pool & { connect(): Promise<PoolClient> }).connect();
    let completionId: string;
    let completedAt: string;
    try {
      await client.query('BEGIN');

      // Lock the host's existing rows for the variants we'll touch (FOR
      // UPDATE) before validating stock. We touch every variant the trade
      // mentions — both giving and receiving — because the receive path may
      // upsert onto an existing row.
      const allVariantIds = [
        ...new Set([
          ...hostGiveDeltas.map((d) => d.stickerVariantId),
          ...hostReceiveDeltas.map((d) => d.stickerVariantId),
        ]),
      ];
      const { rows: stockRows } = await client.query<{
        sticker_variant_id: string; quantity: number;
      }>(
        `SELECT sticker_variant_id, quantity
           FROM user_stickers
          WHERE album_id = $1
            AND sticker_variant_id = ANY($2::uuid[])
          FOR UPDATE`,
        [session.hostAlbumId, allVariantIds],
      );
      const stock = new Map(stockRows.map((r) => [r.sticker_variant_id, r.quantity]));
      for (const d of hostGiveDeltas) {
        if ((stock.get(d.stickerVariantId) ?? 0) < d.quantity) {
          throw statusError(
            'One or more stickers are no longer available in your collection.',
            409,
          );
        }
      }

      // Decrement what the host gives.
      if (hostGiveDeltas.length > 0) {
        const ids = hostGiveDeltas.map((d) => d.stickerVariantId);
        const qtys = hostGiveDeltas.map((d) => d.quantity);
        await client.query(
          `UPDATE user_stickers us
             SET quantity = us.quantity - t.qty, updated_at = NOW()
            FROM unnest($1::uuid[], $2::int[]) AS t(sticker_variant_id, qty)
           WHERE us.album_id = $3
             AND us.sticker_variant_id = t.sticker_variant_id`,
          [ids, qtys, session.hostAlbumId],
        );
      }

      // Upsert what the host receives.
      if (hostReceiveDeltas.length > 0) {
        const ids = hostReceiveDeltas.map((d) => d.stickerVariantId);
        const qtys = hostReceiveDeltas.map((d) => d.quantity);
        await client.query(
          `INSERT INTO user_stickers (album_id, sticker_variant_id, quantity)
           SELECT $1, t.sticker_variant_id, t.qty
             FROM unnest($2::uuid[], $3::int[]) AS t(sticker_variant_id, qty)
           ON CONFLICT (album_id, sticker_variant_id)
           DO UPDATE SET quantity = user_stickers.quantity + EXCLUDED.quantity,
                         updated_at = NOW()`,
          [session.hostAlbumId, ids, qtys],
        );
      }

      // Sweep any zero rows the give path produced.
      await client.query(
        `DELETE FROM user_stickers WHERE album_id = $1 AND quantity <= 0`,
        [session.hostAlbumId],
      );

      const { rows: insertedRows } = await client.query<{ id: string; completed_at: Date }>(
        `INSERT INTO live_trade_completions
           (host_user_id, host_album_id, guest_label, host_gave, host_received)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
         RETURNING id, completed_at`,
        [
          hostUserId,
          session.hostAlbumId,
          session.guestLabel,
          JSON.stringify(hostGiveDeltas),
          JSON.stringify(hostReceiveDeltas),
        ],
      );
      completionId = insertedRows[0]!.id;
      completedAt = insertedRows[0]!.completed_at.toISOString();

      // Audit inside the transaction so a rollback erases the record alongside
      // the deltas — admin queries should never see a completed row without
      // an audit trail or vice versa.
      await recordAudit(client, hostUserId, 'live_trade_completed', {
        completionId,
        sessionId: session.id,
        hostAlbumId: session.hostAlbumId,
        guestLabel: session.guestLabel,
        hostGave: hostGiveDeltas,
        hostReceived: hostReceiveDeltas,
      });

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }

    session.status = 'completed';
    session.completionId = completionId;
    session.completedAt = completedAt;
    session.undoneAt = null;
    await writeSession(redis, session);
    // Host's collection cache is now stale — bump the version so the next
    // /collection read hits the DB. Failure here is non-fatal: cached entries
    // still expire on their own TTL. The matchmaker cache is a separate
    // keyspace and must be dropped explicitly; async completeTrade does the
    // same after every inventory-changing transfer.
    await Promise.all([
      invalidateUserCaches(redis, hostUserId),
      invalidateMatchesFor(redis, [hostUserId]),
    ]);
    await publish(redis, sessionId, 'state', { session: toPublicSession(session) });

    // Soft-reservation hand-off: a live commit consumes host inventory that
    // may also be promised to async pending/accepted trades. Notify those
    // counterparties the same way async trade completion does (see
    // trade-requests.service.ts completeTrade). excludeTradeId is null here
    // because there's no async trade row to skip.
    await notifyAffectedTrades(db, redis, null, [
      { userId: hostUserId, variantIds: hostGiveDeltas.map((d) => d.stickerVariantId) },
    ]);

    return toPublicSession(session);
  });
}

/**
 * Reverse a completion within the 60s undo window. Idempotent in spirit but
 * not in effect — calling twice on the same row returns 410 the second time,
 * because the row's `undone_at` is already set and there's nothing to undo.
 */
export async function undoCompletion(
  db: Pool,
  redis: Redis,
  hostUserId: string,
  sessionId: string,
): Promise<LiveTradeSession> {
  return await withSession(redis, sessionId, async (session) => {
    if (session.hostUserId !== hostUserId) throw statusError('Not the host of this session.', 403);
    if (session.status !== 'completed' || !session.completionId || !session.completedAt) {
      throw statusError('Nothing to undo on this session.', 409);
    }
    if (session.undoneAt) {
      throw statusError('This completion has already been undone.', 410);
    }
    const elapsedMs = Date.now() - new Date(session.completedAt).getTime();
    if (elapsedMs > UNDO_WINDOW_SECONDS * 1000) {
      throw statusError('The undo window for this trade has passed.', 410);
    }

    const client: PoolClient = await (db as Pool & { connect(): Promise<PoolClient> }).connect();
    let undoneAt: string;
    let restoredVariantIds: string[] = [];
    try {
      await client.query('BEGIN');

      // Re-read the completion under FOR UPDATE so a concurrent undo can't
      // race past the "already undone" check above.
      const { rows: cRows } = await client.query<{
        host_user_id: string;
        host_album_id: string;
        host_gave: { stickerVariantId: string; quantity: number }[];
        host_received: { stickerVariantId: string; quantity: number }[];
        undone_at: Date | null;
      }>(
        `SELECT host_user_id, host_album_id, host_gave, host_received, undone_at
           FROM live_trade_completions
          WHERE id = $1
          FOR UPDATE`,
        [session.completionId],
      );
      const c = cRows[0];
      if (!c) throw statusError('Completion record not found.', 404);
      if (c.host_user_id !== hostUserId) throw statusError('Not the host of this completion.', 403);
      if (c.undone_at) throw statusError('This completion has already been undone.', 410);
      restoredVariantIds = c.host_gave.map((d) => d.stickerVariantId);

      // Restore (host_gave): add back what we previously decremented.
      if (c.host_gave.length > 0) {
        const ids = c.host_gave.map((d) => d.stickerVariantId);
        const qtys = c.host_gave.map((d) => d.quantity);
        await client.query(
          `INSERT INTO user_stickers (album_id, sticker_variant_id, quantity)
           SELECT $1, t.sticker_variant_id, t.qty
             FROM unnest($2::uuid[], $3::int[]) AS t(sticker_variant_id, qty)
           ON CONFLICT (album_id, sticker_variant_id)
           DO UPDATE SET quantity = user_stickers.quantity + EXCLUDED.quantity,
                         updated_at = NOW()`,
          [c.host_album_id, ids, qtys],
        );
      }

      // Reverse (host_received): subtract what we previously added.
      if (c.host_received.length > 0) {
        const ids = c.host_received.map((d) => d.stickerVariantId);
        const qtys = c.host_received.map((d) => d.quantity);
        await client.query(
          `UPDATE user_stickers us
             SET quantity = us.quantity - t.qty, updated_at = NOW()
            FROM unnest($1::uuid[], $2::int[]) AS t(sticker_variant_id, qty)
           WHERE us.album_id = $3
             AND us.sticker_variant_id = t.sticker_variant_id`,
          [ids, qtys, c.host_album_id],
        );
      }

      await client.query(
        `DELETE FROM user_stickers WHERE album_id = $1 AND quantity <= 0`,
        [c.host_album_id],
      );

      const { rows: stamp } = await client.query<{ undone_at: Date }>(
        `UPDATE live_trade_completions SET undone_at = NOW() WHERE id = $1 RETURNING undone_at`,
        [session.completionId],
      );
      undoneAt = stamp[0]!.undone_at.toISOString();

      await recordAudit(client, hostUserId, 'live_trade_undone', {
        completionId: session.completionId,
        sessionId: session.id,
      });

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }

    // The session itself goes back to "open" so the host can keep negotiating
    // if the undo was triggered by a "wait, let me add this one too" moment.
    session.status = 'open';
    session.undoneAt = undoneAt;
    session.hostLocked = false;
    session.guestLocked = false;
    await writeSession(redis, session);
    await Promise.all([
      invalidateUserCaches(redis, hostUserId),
      invalidateMatchesFor(redis, [hostUserId]),
    ]);
    await publish(redis, sessionId, 'state', { session: toPublicSession(session) });

    // Mirror of the completeSession notify: a commit told async trades the
    // stickers were "no longer available". The undo just put them back, so
    // pending trades that share those variants may be acceptable again.
    await notifyRestoredAvailability(db, redis, null, [
      { userId: hostUserId, variantIds: restoredVariantIds },
    ]);

    return toPublicSession(session);
  });
}

// ─── History listing ───────────────────────────────────────────────────────

interface CompletionRow {
  id: string;
  host_user_id: string;
  host_album_id: string;
  guest_label: string | null;
  host_gave: { stickerVariantId: string; quantity: number }[];
  host_received: { stickerVariantId: string; quantity: number }[];
  completed_at: Date;
  undone_at: Date | null;
}

export interface ListLiveTradeHistoryOpts {
  /** Same encoding as `listTrades`: `<iso>|<uuid>`. */
  cursor?: string;
  /** Hard cap, default 50. */
  limit?: number;
  /**
   * Optional collapsed status filter. The history list shows two outcomes —
   * 'completed' and 'cancelled' (undone). 'cancelled' aligns with the request
   * status of the same name so the unified filter UI is consistent.
   */
  status?: 'completed' | 'cancelled';
}

/**
 * List a host's completed live trades, newest first by updatedAt
 * (= undoneAt ?? completedAt). Each row is enriched with sticker metadata so
 * the UI can render it without a second roundtrip.
 *
 * Pagination is cursor-based on (updatedAt, id) — the same convention
 * `listTrades` uses, so the merge layer can interleave both feeds without
 * special-casing either source.
 */
export async function listLiveTradeHistory(
  db: Pool,
  hostUserId: string,
  opts: ListLiveTradeHistoryOpts = {},
): Promise<{ items: LiveTradeHistorySummary[]; nextCursor: string | null }> {
  const pageSize = Math.min(Math.max(opts.limit ?? 50, 1), 200);

  let cursorTs: string | null = null;
  let cursorId: string | null = null;
  if (opts.cursor) {
    const idx = opts.cursor.lastIndexOf('|');
    if (idx > 0) {
      cursorTs = opts.cursor.slice(0, idx);
      cursorId = opts.cursor.slice(idx + 1);
    }
  }

  // updatedAt computed in SQL so the cursor compare and the returned value
  // agree without a second pass in JS.
  const statusFilter = opts.status ?? null;
  const { rows } = await db.query<CompletionRow & { updated_at: Date }>(
    `SELECT
       id, host_user_id, host_album_id, guest_label,
       host_gave, host_received, completed_at, undone_at,
       COALESCE(undone_at, completed_at) AS updated_at
     FROM live_trade_completions
     WHERE host_user_id = $1
       AND ($2::text IS NULL OR (
            ($2 = 'completed' AND undone_at IS NULL)
         OR ($2 = 'cancelled' AND undone_at IS NOT NULL)
       ))
       AND (
         $3::timestamptz IS NULL
         OR COALESCE(undone_at, completed_at) < $3::timestamptz
         OR (COALESCE(undone_at, completed_at) = $3::timestamptz AND id < $4::uuid)
       )
     ORDER BY COALESCE(undone_at, completed_at) DESC, id DESC
     LIMIT $5`,
    [hostUserId, statusFilter, cursorTs, cursorId, pageSize + 1],
  );

  const hasMore = rows.length > pageSize;
  const trimmed = hasMore ? rows.slice(0, pageSize) : rows;

  // One catalog lookup for every variant referenced across the page — saves
  // (N rows × M variants) round trips. We have stickerVariantIds, not
  // album_codes, so the join keys off sticker_variants.id directly.
  const variantIds = [
    ...new Set(
      trimmed.flatMap((r) => [
        ...r.host_gave.map((d) => d.stickerVariantId),
        ...r.host_received.map((d) => d.stickerVariantId),
      ]),
    ),
  ];
  const refs = await lookupRefsByVariantId(db, variantIds);

  const items: LiveTradeHistorySummary[] = trimmed.map((r) => ({
    kind: 'live',
    id: r.id,
    hostUserId: r.host_user_id,
    hostAlbumId: r.host_album_id,
    guestLabel: r.guest_label,
    status: r.undone_at ? 'cancelled' : 'completed',
    hostGave: enrichDeltas(r.host_gave, refs),
    hostReceived: enrichDeltas(r.host_received, refs),
    completedAt: r.completed_at.toISOString(),
    undoneAt: r.undone_at ? r.undone_at.toISOString() : null,
    updatedAt: r.updated_at.toISOString(),
  }));

  const last = trimmed[trimmed.length - 1];
  const nextCursor = hasMore && last
    ? `${last.updated_at.toISOString()}|${last.id}`
    : null;

  return { items, nextCursor };
}

/**
 * Pulls everything the UI needs to render a sticker chip from a
 * sticker_variant_id batch. Returns a map keyed by stickerVariantId.
 */
async function lookupRefsByVariantId(
  db: Pool,
  variantIds: string[],
): Promise<Map<string, Omit<LiveTradeStickerRef, 'quantity'>>> {
  if (variantIds.length === 0) return new Map();
  const { rows } = await db.query<{
    sticker_variant_id: string;
    album_code: string;
    player_name: string | null;
    sticker_type: string;
    number: number;
    variant_type: string;
  }>(
    `SELECT sv.id AS sticker_variant_id,
            s.album_code,
            s.player_name,
            s.sticker_type,
            s.number,
            sv.variant_type
       FROM sticker_variants sv
       JOIN stickers s ON s.id = sv.sticker_id
      WHERE sv.id = ANY($1::uuid[])`,
    [variantIds],
  );
  const out = new Map<string, Omit<LiveTradeStickerRef, 'quantity'>>();
  for (const r of rows) {
    const stickerType =
      r.sticker_type === 'extra' ? 'extra'
      : r.sticker_type === 'coca_cola_special' ? 'coca_cola_special'
      : null;
    out.set(r.sticker_variant_id, {
      stickerVariantId: r.sticker_variant_id,
      albumCode: r.album_code,
      playerName: r.player_name,
      stickerType,
      number: r.number,
      variantToken: r.variant_type,
      variantLabel: labelFor(r.variant_type),
      scarcity: variantScarcity(r.variant_type),
    });
  }
  return out;
}

function enrichDeltas(
  deltas: { stickerVariantId: string; quantity: number }[],
  refs: Map<string, Omit<LiveTradeStickerRef, 'quantity'>>,
): LiveTradeStickerRef[] {
  const out: LiveTradeStickerRef[] = [];
  for (const d of deltas) {
    const r = refs.get(d.stickerVariantId);
    if (!r) {
      // Variant was removed from the catalog after the trade was recorded.
      // We still want the row visible — fall back to a minimal ref.
      out.push({
        stickerVariantId: d.stickerVariantId,
        albumCode: '?',
        playerName: null,
        stickerType: null,
        number: null,
        variantToken: null,
        variantLabel: null,
        scarcity: 0,
        quantity: d.quantity,
      });
      continue;
    }
    out.push({ ...r, quantity: d.quantity });
  }
  return out;
}

// ─── Third-party trade completion ──────────────────────────────────────────
// Reuses live_trade_completions because the storage shape is identical:
// one logged-in user records what they gave + received from an external
// person (the "guest_label" in the live model becomes the partner's name).
// No Redis session, no two-sided staging — the user has already executed
// the trade off-platform and is logging the result.

export interface ThirdPartyTradeDelta {
  stickerVariantId: string;
  quantity: number;
}

export interface RecordThirdPartyTradeInput {
  userId: string;
  albumId: string;
  partnerName: string | null;
  gave: ThirdPartyTradeDelta[];
  received: ThirdPartyTradeDelta[];
}

export interface RecordThirdPartyTradeResult {
  completionId: string;
  completedAt: string;
}

export async function recordThirdPartyCompletion(
  db: Pool,
  redis: Redis,
  input: RecordThirdPartyTradeInput,
): Promise<RecordThirdPartyTradeResult> {
  const { userId, albumId, partnerName } = input;
  const give = mergeDeltasByVariant(input.gave);
  const recv = mergeDeltasByVariant(input.received);

  if (give.length === 0 && recv.length === 0) {
    throw statusError('Trade must include at least one sticker on either side.', 400);
  }
  if (give.some((d) => d.quantity <= 0) || recv.some((d) => d.quantity <= 0)) {
    throw statusError('Sticker quantities must be positive.', 400);
  }

  const client: PoolClient = await (db as Pool & { connect(): Promise<PoolClient> }).connect();
  let completionId: string;
  let completedAt: string;
  try {
    await client.query('BEGIN');

    // The album must belong to the caller. Lock the row so a concurrent
    // delete can't pull it out from under us between this check and the
    // user_stickers writes.
    const { rows: albumRows } = await client.query<{ album_type_id: string }>(
      `SELECT album_type_id FROM user_albums
        WHERE id = $1 AND user_id = $2
        FOR UPDATE`,
      [albumId, userId],
    );
    if (albumRows.length === 0) throw statusError('Album not found.', 404);
    const albumTypeId = albumRows[0]!.album_type_id;

    // Every variant referenced must belong to that album type — otherwise a
    // client could move stickers between unrelated albums via this endpoint.
    const allVariantIds = [
      ...new Set([
        ...give.map((d) => d.stickerVariantId),
        ...recv.map((d) => d.stickerVariantId),
      ]),
    ];
    const { rows: variantRows } = await client.query<{ id: string; album_type_id: string }>(
      `SELECT sv.id, s.album_type_id
         FROM sticker_variants sv
         JOIN stickers s ON s.id = sv.sticker_id
        WHERE sv.id = ANY($1::uuid[])`,
      [allVariantIds],
    );
    if (variantRows.length !== allVariantIds.length) {
      throw statusError('Unknown sticker variant in trade.', 400);
    }
    if (variantRows.some((r) => r.album_type_id !== albumTypeId)) {
      throw statusError('One or more stickers do not belong to this album.', 400);
    }

    // Stock check + decrement mirrors completeSession exactly.
    const { rows: stockRows } = await client.query<{
      sticker_variant_id: string; quantity: number;
    }>(
      `SELECT sticker_variant_id, quantity
         FROM user_stickers
        WHERE album_id = $1
          AND sticker_variant_id = ANY($2::uuid[])
        FOR UPDATE`,
      [albumId, allVariantIds],
    );
    const stock = new Map(stockRows.map((r) => [r.sticker_variant_id, r.quantity]));
    for (const d of give) {
      if ((stock.get(d.stickerVariantId) ?? 0) < d.quantity) {
        throw statusError(
          'One or more stickers are no longer available in your collection.',
          409,
        );
      }
    }

    if (give.length > 0) {
      await client.query(
        `UPDATE user_stickers us
           SET quantity = us.quantity - t.qty, updated_at = NOW()
          FROM unnest($1::uuid[], $2::int[]) AS t(sticker_variant_id, qty)
         WHERE us.album_id = $3
           AND us.sticker_variant_id = t.sticker_variant_id`,
        [give.map((d) => d.stickerVariantId), give.map((d) => d.quantity), albumId],
      );
    }

    if (recv.length > 0) {
      await client.query(
        `INSERT INTO user_stickers (album_id, sticker_variant_id, quantity)
         SELECT $1, t.sticker_variant_id, t.qty
           FROM unnest($2::uuid[], $3::int[]) AS t(sticker_variant_id, qty)
         ON CONFLICT (album_id, sticker_variant_id)
         DO UPDATE SET quantity = user_stickers.quantity + EXCLUDED.quantity,
                       updated_at = NOW()`,
        [albumId, recv.map((d) => d.stickerVariantId), recv.map((d) => d.quantity)],
      );
    }

    await client.query(
      `DELETE FROM user_stickers WHERE album_id = $1 AND quantity <= 0`,
      [albumId],
    );

    const { rows: insertedRows } = await client.query<{ id: string; completed_at: Date }>(
      `INSERT INTO live_trade_completions
         (host_user_id, host_album_id, guest_label, host_gave, host_received)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
       RETURNING id, completed_at`,
      [
        userId,
        albumId,
        partnerName,
        JSON.stringify(give),
        JSON.stringify(recv),
      ],
    );
    completionId = insertedRows[0]!.id;
    completedAt = insertedRows[0]!.completed_at.toISOString();

    await recordAudit(client, userId, 'third_party_trade_completed', {
      completionId,
      hostAlbumId: albumId,
      partnerName,
      hostGave: give,
      hostReceived: recv,
    });

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }

  await Promise.all([
    invalidateUserCaches(redis, userId),
    invalidateMatchesFor(redis, [userId]),
  ]);

  // Soft-reservation hand-off: like the live and async completion paths,
  // notify any other pending/accepted trades whose inventory we just drained.
  await notifyAffectedTrades(db, redis, null, [
    { userId, variantIds: give.map((d) => d.stickerVariantId) },
  ]);

  return { completionId, completedAt };
}

// ─── Pure helpers ──────────────────────────────────────────────────────────

function aggregateDeltas(
  refs: LiveTradeStickerRef[],
): Array<{ stickerVariantId: string; quantity: number }> {
  return mergeDeltasByVariant(refs);
}

function mergeDeltasByVariant<T extends { stickerVariantId: string; quantity: number }>(
  rows: T[],
): Array<{ stickerVariantId: string; quantity: number }> {
  const merged = new Map<string, number>();
  for (const r of rows) {
    merged.set(r.stickerVariantId, (merged.get(r.stickerVariantId) ?? 0) + r.quantity);
  }
  return [...merged.entries()].map(([stickerVariantId, quantity]) => ({ stickerVariantId, quantity }));
}
