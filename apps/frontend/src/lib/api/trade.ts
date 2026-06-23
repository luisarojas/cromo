import { apiFetch, toQueryString, BASE_URL } from '../apiClient';
import type {
  CreateLiveTradeResponse,
  ExternalListItem,
  JoinLiveTradeResponse,
  LiveTradeHistorySummary,
  LiveTradeSession,
  MatchAgainstMeResult,
  MatchPairResult,
  TradeDetail,
  TradeHistoryItem,
  TradeMatch,
  TradeMessage,
} from './types';

export interface TradeMatchesPage {
  items: TradeMatch[];
  nextCursor: string | null;
  total: number;
}

export async function fetchTradeMatches(
  albumId: string,
  token: string,
  opts?: { cursor?: string; limit?: number; showAll?: boolean },
): Promise<TradeMatchesPage> {
  const qs = toQueryString({ albumId, ...(opts ?? {}) });
  return apiFetch<TradeMatchesPage>(`/api/v1/trade/matches${qs}`, {}, token);
}

// ─── External-list matching (third-party / anonymous flows) ────────────────

export async function matchAgainstMe(
  body: { albumId: string; theirOffered: ExternalListItem[]; theirWanted: ExternalListItem[] },
  token: string,
): Promise<MatchAgainstMeResult> {
  return apiFetch<MatchAgainstMeResult>(
    '/api/v1/trade/match-against-me',
    { method: 'POST', body: JSON.stringify(body) },
    token,
  );
}

export async function matchPair(body: {
  albumTypeKey?: string;
  a: { offered: ExternalListItem[]; wanted: ExternalListItem[] };
  b: { offered: ExternalListItem[]; wanted: ExternalListItem[] };
}): Promise<MatchPairResult> {
  return apiFetch<MatchPairResult>(
    '/api/v1/trade/match-pair',
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export interface TradesPage {
  items: TradeHistoryItem[];
  nextCursor: string | null;
}

export function isLiveTradeRow(item: TradeHistoryItem): item is LiveTradeHistorySummary {
  return item.kind === 'live';
}

export async function fetchTrades(
  params: { status?: string; cursor?: string; limit?: number },
  token: string,
): Promise<TradesPage> {
  const qs = toQueryString(params);
  return apiFetch<TradesPage>(`/api/v1/trade/requests${qs}`, {}, token);
}

export async function fetchTrade(id: string, token: string): Promise<TradeDetail> {
  return apiFetch<TradeDetail>(`/api/v1/trade/requests/${id}`, {}, token);
}

export async function createTrade(
  body: {
    recipientId: string;
    requesterAlbumId?: string;
    items: { variantId: string; direction: 'offer' | 'want'; quantity: number }[];
    offerCash?: number;
    wantCash?: number;
  },
  token: string,
): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(
    '/api/v1/trade/requests',
    { method: 'POST', body: JSON.stringify(body) },
    token,
  );
}

export async function acceptTrade(id: string, token: string): Promise<void> {
  return apiFetch<void>(
    `/api/v1/trade/requests/${id}/accept`,
    { method: 'POST' },
    token,
  );
}

export async function declineTrade(id: string, token: string): Promise<void> {
  return apiFetch<void>(
    `/api/v1/trade/requests/${id}/decline`,
    { method: 'POST' },
    token,
  );
}

export async function counterTrade(
  id: string,
  body: {
    items: { variantId: string; direction: 'offer' | 'want'; quantity: number }[];
    offerCash?: number;
    wantCash?: number;
  },
  token: string,
): Promise<void> {
  return apiFetch<void>(
    `/api/v1/trade/requests/${id}/counter`,
    { method: 'POST', body: JSON.stringify(body) },
    token,
  );
}

export async function editTrade(
  id: string,
  body: {
    items: { variantId: string; direction: 'offer' | 'want'; quantity: number }[];
    offerCash?: number;
    wantCash?: number;
  },
  token: string,
): Promise<void> {
  return apiFetch<void>(
    `/api/v1/trade/requests/${id}/edit`,
    { method: 'POST', body: JSON.stringify(body) },
    token,
  );
}

export async function cancelTrade(id: string, token: string): Promise<void> {
  return apiFetch<void>(
    `/api/v1/trade/requests/${id}/cancel`,
    { method: 'POST' },
    token,
  );
}

export async function completeTrade(id: string, token: string): Promise<void> {
  return apiFetch<void>(
    `/api/v1/trade/requests/${id}/complete`,
    { method: 'POST' },
    token,
  );
}

export async function fetchTradeMessages(
  id: string,
  params: { cursor?: string; limit?: number },
  token: string,
): Promise<{ items: TradeMessage[]; nextCursor: string | null }> {
  const qs = toQueryString(params as Record<string, string | number | undefined>);
  return apiFetch<{ items: TradeMessage[]; nextCursor: string | null }>(
    `/api/v1/trade/requests/${id}/messages${qs}`,
    {},
    token,
  );
}

export async function sendTradeMessage(
  id: string,
  body: string,
  token: string,
  idempotencyKey?: string,
): Promise<TradeMessage> {
  const headers: Record<string, string> = {};
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }
  return apiFetch<TradeMessage>(
    `/api/v1/trade/requests/${id}/messages`,
    { method: 'POST', body: JSON.stringify({ body }), headers },
    token,
  );
}

export async function fetchTradeStreamTicket(
  id: string,
  token: string,
): Promise<{ ticket: string; expiresIn: number }> {
  return apiFetch<{ ticket: string; expiresIn: number }>(
    `/api/v1/trade/requests/${id}/stream-ticket`,
    { method: 'POST' },
    token,
  );
}

// ── Trade invites (QR redirect into propose-trade flow) ─────────────────────

export interface TradeInvite {
  id: string;
  token: string;
  expiresAt: string;
  url: string;
}

export async function createTradeInvite(token: string): Promise<TradeInvite> {
  const { invite } = await apiFetch<{ invite: TradeInvite }>(
    '/api/v1/trade/invites',
    { method: 'POST' },
    token,
  );
  return invite;
}

export interface RedeemedTradeInvite {
  hostUserId: string;
  hostUsername: string;
}

export async function redeemTradeInvite(
  inviteToken: string,
  token: string,
): Promise<RedeemedTradeInvite> {
  return apiFetch<RedeemedTradeInvite>(
    `/api/v1/trade/invites/${encodeURIComponent(inviteToken)}/redeem`,
    { method: 'POST' },
    token,
  );
}

// ── Live trade sessions (in-person host + anonymous guest) ───────────────────

/** Host creates a session bound to one of their albums. */
export async function createLiveTradeSession(
  albumId: string,
  token: string,
): Promise<LiveTradeSession> {
  const { session } = await apiFetch<CreateLiveTradeResponse>(
    '/api/v1/live-trade',
    { method: 'POST', body: JSON.stringify({ albumId }) },
    token,
  );
  return session;
}

/** Guest joins via 6-digit code (or session id). No auth — issues a guest token. */
export async function joinLiveTradeSession(
  code: string,
  label?: string | null,
): Promise<JoinLiveTradeResponse> {
  return apiFetch<JoinLiveTradeResponse>(
    '/api/v1/live-trade/join',
    { method: 'POST', body: JSON.stringify({ code, label: label ?? null }) },
  );
}

interface LiveTradeAuth {
  /** Host's Bearer access token. Provide if the caller is the host. */
  token?: string;
  /** Guest's opaque session token. Provide if the caller is the guest. */
  guestToken?: string;
}

function liveTradeAuthHeaders(auth: LiveTradeAuth): HeadersInit | undefined {
  if (auth.token) return undefined; // apiFetch will set Authorization
  if (auth.guestToken) return { 'X-Live-Trade-Token': auth.guestToken };
  return undefined;
}

export async function fetchLiveTradeSession(
  sessionId: string,
  auth: LiveTradeAuth,
): Promise<LiveTradeSession> {
  const { session } = await apiFetch<{ session: LiveTradeSession }>(
    `/api/v1/live-trade/${encodeURIComponent(sessionId)}`,
    { headers: liveTradeAuthHeaders(auth) },
    auth.token,
  );
  return session;
}

export async function setLiveTradeList(
  sessionId: string,
  list: { offered: ExternalListItem[]; wanted: ExternalListItem[] },
  auth: LiveTradeAuth,
): Promise<LiveTradeSession> {
  const { session } = await apiFetch<{ session: LiveTradeSession }>(
    `/api/v1/live-trade/${encodeURIComponent(sessionId)}/list`,
    { method: 'POST', body: JSON.stringify(list), headers: liveTradeAuthHeaders(auth) },
    auth.token,
  );
  return session;
}

export async function setLiveTradeStaged(
  sessionId: string,
  items: Array<{ stickerVariantId: string; quantity: number }>,
  auth: LiveTradeAuth,
): Promise<LiveTradeSession> {
  const { session } = await apiFetch<{ session: LiveTradeSession }>(
    `/api/v1/live-trade/${encodeURIComponent(sessionId)}/stage`,
    { method: 'POST', body: JSON.stringify({ items }), headers: liveTradeAuthHeaders(auth) },
    auth.token,
  );
  return session;
}

export async function setLiveTradeLock(
  sessionId: string,
  locked: boolean,
  auth: LiveTradeAuth,
): Promise<LiveTradeSession> {
  const { session } = await apiFetch<{ session: LiveTradeSession }>(
    `/api/v1/live-trade/${encodeURIComponent(sessionId)}/lock`,
    { method: 'POST', body: JSON.stringify({ locked }), headers: liveTradeAuthHeaders(auth) },
    auth.token,
  );
  return session;
}

export async function completeLiveTradeSession(
  sessionId: string,
  token: string,
): Promise<LiveTradeSession> {
  const { session } = await apiFetch<{ session: LiveTradeSession }>(
    `/api/v1/live-trade/${encodeURIComponent(sessionId)}/complete`,
    { method: 'POST' },
    token,
  );
  return session;
}

export async function undoLiveTradeSession(
  sessionId: string,
  token: string,
): Promise<LiveTradeSession> {
  const { session } = await apiFetch<{ session: LiveTradeSession }>(
    `/api/v1/live-trade/${encodeURIComponent(sessionId)}/undo`,
    { method: 'POST' },
    token,
  );
  return session;
}

/** Mint a single-use ticket the EventSource will exchange for a stream. */
export async function mintLiveTradeStreamTicket(
  sessionId: string,
  auth: LiveTradeAuth,
): Promise<{ ticket: string; expiresIn: number }> {
  return apiFetch<{ ticket: string; expiresIn: number }>(
    `/api/v1/live-trade/${encodeURIComponent(sessionId)}/stream-ticket`,
    { method: 'POST', headers: liveTradeAuthHeaders(auth) },
    auth.token,
  );
}

/** Absolute URL for the SSE stream — EventSource needs a fully-qualified URL. */
export function liveTradeStreamUrl(sessionId: string, ticket: string): string {
  return `${BASE_URL}/api/v1/live-trade/${encodeURIComponent(sessionId)}/stream?ticket=${encodeURIComponent(ticket)}`;
}
