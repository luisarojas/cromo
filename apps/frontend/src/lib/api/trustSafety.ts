import { apiFetch, toQueryString, BASE_URL } from '../apiClient';

export type TrustTier = 'new_trader' | 'good_trader' | 'trusted_trader' | 'caution';

export interface TrustScore {
  tier: TrustTier;
  totalRatings: number;
  positiveCount: number;
  negativeCount: number;
  positivePercent: number;
}

export interface BanStatus {
  banned: false;
}

export interface BanStatusActive {
  banned: true;
  type: 'soft' | 'hard';
  expiresAt: string | null;
  message: string;
}

export type BanStatusResult = BanStatus | BanStatusActive;

export interface TradeRating {
  id: string;
  tradeId: string;
  raterId: string;
  raterUsername: string;
  raterDisplayName?: string | null;
  ratedUserId: string;
  isPositive: boolean;
  comment: string | null;
  createdAt: string;
}

export interface UserRatingsPage {
  trustScore: TrustScore;
  items: TradeRating[];
  nextCursor: string | null;
}

export interface AdminReport {
  id: string;
  reporterId: string;
  reporterUsername: string;
  reportedUserId: string;
  reportedUsername: string;
  category: string;
  description: string;
  status: string;
  tradeId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminReportsPage {
  items: AdminReport[];
  nextCursor: string | null;
}

export interface AdminReportPriorReport {
  id: string;
  category: string;
  status: string;
  reporterUsername: string;
  createdAt: string;
}

export interface AdminReportMessageRef {
  id: string;
  messageId: string;
  body: string;
  isSystem: boolean;
  sentAt: string;
  senderId: string | null;
  senderUsername: string | null;
}

export interface AdminReportAttachment {
  id: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  uploadedAt: string;
  url: string;
}

export interface AdminReportBanHistoryEntry {
  id: string;
  banType: string;
  reason: string;
  expiresAt: string | null;
  liftedAt: string | null;
  createdAt: string;
}

export interface AdminReportLinkedTrade {
  id: string;
  status: string;
  requesterUsername: string;
  recipientUsername: string;
  createdAt: string;
}

export interface AdminReportDetail extends AdminReport {
  resolutionNote: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  reporterDisplayName: string | null;
  reportedDisplayName: string | null;
  reportedUserTrustScore: TrustScore;
  reportedUserBanHistory: AdminReportBanHistoryEntry[];
  priorReports: AdminReportPriorReport[];
  linkedTrade: AdminReportLinkedTrade | null;
  messageRefs: AdminReportMessageRef[];
  attachments: AdminReportAttachment[];
}

export interface AdminBan {
  id: string;
  banType: string;
  reason: string;
  expiresAt: string | null;
  liftedAt: string | null;
  createdAt: string;
}

export interface AdminTrustSummary {
  userId: string;
  username: string;
  trustScore: TrustScore;
  banHistory: AdminBan[];
  openReportsCount: number;
  recentRatings: TradeRating[];
}

export async function fetchBanStatus(token: string): Promise<BanStatusResult> {
  return apiFetch<BanStatusResult>('/api/v1/users/me/ban-status', {}, token);
}

export async function submitRating(
  tradeId: string,
  body: { isPositive: boolean; comment?: string },
  token: string,
): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(
    `/api/v1/trade/requests/${tradeId}/ratings`,
    { method: 'POST', body: JSON.stringify(body) },
    token,
  );
}

export async function fetchTradeRatings(
  tradeId: string,
  token: string,
): Promise<{ items: TradeRating[] }> {
  return apiFetch<{ items: TradeRating[] }>(
    `/api/v1/trade/requests/${tradeId}/ratings`,
    {},
    token,
  );
}

export async function fetchUserRatings(
  userId: string,
  token?: string,
  params?: { cursor?: string; limit?: number },
): Promise<UserRatingsPage> {
  const qs = toQueryString(params ?? {});
  return apiFetch<UserRatingsPage>(`/api/v1/users/${userId}/ratings${qs}`, {}, token);
}

export async function submitReport(
  userId: string,
  body: {
    category: string;
    description: string;
    tradeId?: string;
    messageIds?: string[];
    attachments?: File[];
  },
  token: string,
): Promise<{ id: string }> {
  const form = new FormData();
  form.append('category', body.category);
  form.append('description', body.description);
  if (body.tradeId) form.append('tradeId', body.tradeId);
  if (body.messageIds && body.messageIds.length > 0) {
    form.append('messageIds', JSON.stringify(body.messageIds));
  }
  for (const f of body.attachments ?? []) form.append('attachments', f);

  // Bypass apiFetch because FormData must NOT carry an explicit Content-Type
  // (the browser injects the multipart boundary). Direct fetch keeps the
  // boundary intact.
  const res = await fetch(`${BASE_URL}/api/v1/users/${userId}/reports`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function fetchAdminReports(
  params: { status?: string; category?: string; cursor?: string; limit?: number },
  token: string,
): Promise<AdminReportsPage> {
  const qs = toQueryString(params as Record<string, string | number | undefined>);
  return apiFetch<AdminReportsPage>(`/api/v1/admin/reports${qs}`, {}, token);
}

export async function fetchAdminReport(
  reportId: string,
  token: string,
): Promise<AdminReportDetail> {
  return apiFetch<AdminReportDetail>(`/api/v1/admin/reports/${reportId}`, {}, token);
}

export async function fetchAdminReportAttachmentBlob(
  url: string,
  token: string,
): Promise<Blob> {
  const res = await fetch(`${BASE_URL}${url}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Attachment fetch failed: ${res.status}`);
  return res.blob();
}

export async function patchAdminReport(
  reportId: string,
  body: { status: string; resolutionNote?: string },
  token: string,
): Promise<{ id: string; status: string }> {
  return apiFetch(
    `/api/v1/admin/reports/${reportId}`,
    { method: 'PATCH', body: JSON.stringify(body) },
    token,
  );
}

export async function createAdminBan(
  userId: string,
  body: { banType: 'soft' | 'hard'; reason: string; reportId?: string; expiresAt?: string },
  token: string,
): Promise<{ id: string; userId: string }> {
  return apiFetch(
    `/api/v1/admin/users/${userId}/bans`,
    { method: 'POST', body: JSON.stringify(body) },
    token,
  );
}

export async function fetchAdminUserBans(
  userId: string,
  token: string,
): Promise<{ items: AdminBan[] }> {
  return apiFetch(`/api/v1/admin/users/${userId}/bans`, {}, token);
}

export async function liftAdminBan(
  userId: string,
  banId: string,
  body: { liftReason: string },
  token: string,
): Promise<{ id: string; liftedAt: string }> {
  return apiFetch(
    `/api/v1/admin/users/${userId}/bans/${banId}/lift`,
    { method: 'POST', body: JSON.stringify(body) },
    token,
  );
}

export async function fetchAdminTrustSummary(
  userId: string,
  token: string,
): Promise<AdminTrustSummary> {
  return apiFetch(`/api/v1/admin/users/${userId}/trust-summary`, {}, token);
}
