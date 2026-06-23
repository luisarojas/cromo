'use client';

import { useCallback, useEffect, useState, Fragment } from 'react';
import {
  fetchAdminReports,
  fetchAdminReport,
  fetchAdminReportAttachmentBlob,
  patchAdminReport,
  createAdminBan,
  liftAdminBan,
  fetchAdminUsers,
  fetchAdminUserBans,
  type AdminReport,
  type AdminReportDetail,
  type AdminReportAttachment,
  type AdminUser,
  type AdminBan,
} from '@/lib/api';

const REPORT_CATEGORY_LABELS: Record<string, string> = {
  harassment: 'Harassment',
  cancelled_after_accept: 'Cancelled after accept',
  no_show: 'No-show',
  fake_stickers: 'Fake stickers',
  damaged_stickers: 'Damaged stickers',
  spam: 'Spam',
  underage: 'Underage',
  other: 'Other',
};

const REPORT_STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  under_review: 'Under Review',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-[var(--cromo-danger-soft)] text-[var(--cromo-danger-text)]',
  under_review: 'bg-[var(--cromo-warning-soft)] text-[var(--cromo-warning-text)]',
  resolved: 'bg-[var(--cromo-success-soft)] text-[var(--cromo-success-text)]',
  dismissed: 'bg-[var(--cromo-surface-2)] text-[var(--cromo-fg-muted)]',
};

function BanModal({
  userId,
  username,
  reportId,
  token,
  onClose,
  onBanned,
}: {
  userId: string;
  username: string;
  reportId?: string;
  token: string;
  onClose: () => void;
  onBanned: () => void;
}) {
  const [banType, setBanType] = useState<'soft' | 'hard'>('soft');
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 5) {
      setError('Reason must be at least 5 characters.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      let expiresAt: string | undefined;
      if (duration) {
        const hours = parseInt(duration, 10);
        expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();
      }
      await createAdminBan(userId, { banType, reason: reason.trim(), reportId, expiresAt }, token);
      onBanned();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to ban user');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] shadow-cromo-lg">
        <div className="flex items-center justify-between border-b border-[var(--cromo-border)] px-5 py-4">
          <h2 className="text-base font-semibold text-[var(--cromo-fg)]">Ban @{username}</h2>
          <button onClick={onClose} className="text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-fg-muted)]">
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="banType" value="soft" checked={banType === 'soft'} onChange={() => setBanType('soft')} />
              Soft ban (trading restrictions)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="banType" value="hard" checked={banType === 'hard'} onChange={() => setBanType('hard')} />
              Hard ban (suspended)
            </label>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--cromo-fg-muted)]">Duration</label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full rounded-md border border-[var(--cromo-border-strong)] px-3 py-2 text-sm focus:outline-none"
            >
              <option value="">Permanent</option>
              <option value="24">24 hours</option>
              <option value="48">48 hours</option>
              <option value="168">7 days</option>
              <option value="720">30 days</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--cromo-fg-muted)]">Reason</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 1000))}
              rows={3}
              className="w-full rounded-md border border-[var(--cromo-border-strong)] px-3 py-2 text-sm focus:outline-none resize-none"
              placeholder="Reason for ban…"
            />
          </div>
          {error && <div className="text-sm text-[var(--cromo-danger-text)]">{error}</div>}
          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className="flex-1 rounded-md bg-[var(--cromo-danger)] text-[var(--cromo-danger-fg)] py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50">
              {submitting ? 'Banning…' : 'Confirm ban'}
            </button>
            <button type="button" onClick={onClose} className="rounded-md border border-[var(--cromo-border-strong)] px-4 py-2 text-sm text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)]">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AttachmentThumb({ attachment, token }: { attachment: AdminReportAttachment; token: string }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let urlToRevoke: string | null = null;
    fetchAdminReportAttachmentBlob(attachment.url, token)
      .then((blob) => {
        if (cancelled) return;
        urlToRevoke = URL.createObjectURL(blob);
        setObjectUrl(urlToRevoke);
      })
      .catch(() => { if (!cancelled) setError(true); });
    return () => {
      cancelled = true;
      if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
    };
  }, [attachment.url, token]);

  if (error) {
    return <div className="flex h-24 w-24 items-center justify-center rounded-md border border-[var(--cromo-border-strong)] text-xs text-[var(--cromo-fg-subtle)]">Unavailable</div>;
  }
  if (!objectUrl) {
    return <div className="h-24 w-24 animate-pulse rounded-md bg-[var(--cromo-surface-2)]" />;
  }
  return (
    <a href={objectUrl} target="_blank" rel="noreferrer" className="block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={objectUrl}
        alt="Report attachment"
        className="h-24 w-24 rounded-md border border-[var(--cromo-border)] object-cover hover:opacity-90"
      />
    </a>
  );
}

function ReportDetailPanel({ reportId, token }: { reportId: string; token: string }) {
  const [detail, setDetail] = useState<AdminReportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    fetchAdminReport(reportId, token)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load report details');
      });
    return () => { cancelled = true; };
  }, [reportId, token]);

  if (error) {
    return <div className="rounded-md bg-[var(--cromo-danger-soft)] border border-[var(--cromo-danger)]/30 p-3 text-xs text-[var(--cromo-danger-text)]">{error}</div>;
  }
  if (!detail) {
    return <div className="text-xs text-[var(--cromo-fg-subtle)]">Loading details…</div>;
  }

  const trust = detail.reportedUserTrustScore;

  return (
    <div className="space-y-4">
      {/* Trust score + linked trade */}
      <div className="grid gap-2 md:grid-cols-2">
        <div className="rounded-md border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">Reported user trust</div>
          <div className="mt-1 text-sm text-[var(--cromo-fg)]">
            <span className="font-medium">{trust.tier.replace('_', ' ')}</span>
            <span className="ml-2 text-[var(--cromo-fg-muted)]">
              {trust.totalRatings} rating{trust.totalRatings === 1 ? '' : 's'}
              {trust.totalRatings > 0 ? ` · ${trust.positivePercent}% positive` : ''}
            </span>
          </div>
        </div>
        {detail.linkedTrade && (
          <div className="rounded-md border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">Linked trade</div>
            <div className="mt-1 text-sm text-[var(--cromo-fg)]">
              @{detail.linkedTrade.requesterUsername} ↔ @{detail.linkedTrade.recipientUsername}
              <span className="ml-2 rounded-full bg-[var(--cromo-surface-2)] px-2 py-0.5 text-xs text-[var(--cromo-fg-muted)]">
                {detail.linkedTrade.status}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Description */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">Reporter description</div>
        <p className="mt-1 text-sm text-[var(--cromo-fg)] whitespace-pre-wrap">{detail.description}</p>
      </div>

      {/* Cited messages */}
      {detail.messageRefs.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
            Cited messages ({detail.messageRefs.length})
          </div>
          <div className="mt-1 space-y-1.5 rounded-md border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-3">
            {detail.messageRefs.map((m) => (
              <div key={m.id} className="text-xs">
                <div className="text-[var(--cromo-fg-muted)]">
                  <span className="font-medium text-[var(--cromo-fg)]">
                    {m.isSystem ? 'System' : (m.senderUsername ? `@${m.senderUsername}` : 'Unknown')}
                  </span>
                  <span className="ml-2 text-[var(--cromo-fg-subtle)]">
                    {new Date(m.sentAt).toLocaleString()}
                  </span>
                </div>
                <div className="mt-0.5 whitespace-pre-wrap text-[var(--cromo-fg)]">{m.body}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Attachments */}
      {detail.attachments.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
            Attachments ({detail.attachments.length})
          </div>
          <div className="mt-1 flex flex-wrap gap-2">
            {detail.attachments.map((a) => (
              <AttachmentThumb key={a.id} attachment={a} token={token} />
            ))}
          </div>
        </div>
      )}

      {/* Prior reports */}
      {detail.priorReports.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
            Prior reports against this user ({detail.priorReports.length})
          </div>
          <div className="mt-1 overflow-hidden rounded-md border border-[var(--cromo-border)]">
            <table className="min-w-full text-xs">
              <thead className="bg-[var(--cromo-surface-2)] text-[var(--cromo-fg-muted)]">
                <tr>
                  <th className="px-2 py-1 text-left font-medium">Category</th>
                  <th className="px-2 py-1 text-left font-medium">Reporter</th>
                  <th className="px-2 py-1 text-left font-medium">Status</th>
                  <th className="px-2 py-1 text-left font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--cromo-border)] bg-[var(--cromo-surface)]">
                {detail.priorReports.map((p) => (
                  <tr key={p.id}>
                    <td className="px-2 py-1 text-[var(--cromo-fg)]">{REPORT_CATEGORY_LABELS[p.category] ?? p.category}</td>
                    <td className="px-2 py-1 text-[var(--cromo-fg)]">@{p.reporterUsername}</td>
                    <td className="px-2 py-1 text-[var(--cromo-fg-muted)]">{REPORT_STATUS_LABELS[p.status] ?? p.status}</td>
                    <td className="px-2 py-1 text-[var(--cromo-fg-subtle)]">{new Date(p.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Ban history */}
      {detail.reportedUserBanHistory.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
            Ban history ({detail.reportedUserBanHistory.length})
          </div>
          <ul className="mt-1 space-y-1 text-xs">
            {detail.reportedUserBanHistory.map((b) => {
              const active = b.liftedAt === null && (b.expiresAt === null || new Date(b.expiresAt) > new Date());
              return (
                <li key={b.id} className="rounded-md border border-[var(--cromo-border)] bg-[var(--cromo-surface)] px-2 py-1.5">
                  <span className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${b.banType === 'hard' ? 'bg-[var(--cromo-danger-soft)] text-[var(--cromo-danger-text)]' : 'bg-[var(--cromo-warning-soft)] text-yellow-800'}`}>
                    {b.banType}
                  </span>
                  <span className="text-[var(--cromo-fg)]">{b.reason}</span>
                  <span className="ml-2 text-[var(--cromo-fg-subtle)]">
                    {new Date(b.createdAt).toLocaleDateString()}
                    {active ? ' · active' : (b.liftedAt ? ' · lifted' : ' · expired')}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function ReportsQueue({ token }: { token: string }) {
  const [statusFilter, setStatusFilter] = useState('open');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [banTarget, setBanTarget] = useState<{ userId: string; username: string; reportId: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAdminReports(
        { status: statusFilter || undefined, category: categoryFilter || undefined, limit: 100 },
        token,
      );
      setReports(result.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter, categoryFilter]);

  useEffect(() => { load(); }, [load]);

  const handleStatus = async (reportId: string, status: string, resolutionNote?: string) => {
    setActionError(null);
    try {
      await patchAdminReport(reportId, { status, resolutionNote }, token);
      setReports((prev) => prev.map((r) => r.id === reportId ? { ...r, status } : r));
      setExpandedId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1 rounded-md border border-[var(--cromo-border)] overflow-hidden text-sm">
          {['open', 'under_review', 'resolved', 'dismissed'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 transition-colors ${statusFilter === s ? 'bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)]' : 'text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)]'}`}
            >
              {REPORT_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-md border border-[var(--cromo-border-strong)] px-3 py-1.5 text-sm focus:outline-none"
        >
          <option value="">All categories</option>
          {Object.entries(REPORT_CATEGORY_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {actionError && (
        <div className="rounded-lg bg-[var(--cromo-danger-soft)] border border-[var(--cromo-danger)]/30 p-3 text-sm text-[var(--cromo-danger-text)]">{actionError}</div>
      )}

      {error && (
        <div className="rounded-lg bg-[var(--cromo-danger-soft)] border border-[var(--cromo-danger)]/30 p-3 text-sm text-[var(--cromo-danger-text)]">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32 text-[var(--cromo-fg-subtle)] text-sm">Loading reports…</div>
      ) : reports.length === 0 ? (
        <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-8 text-center text-sm text-[var(--cromo-fg-subtle)]">
          No reports found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)]">
          <table className="min-w-full text-sm">
            <thead className="bg-transparent border-b border-[var(--cromo-border)]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--cromo-fg-muted)] uppercase tracking-wide">Category</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--cromo-fg-muted)] uppercase tracking-wide">Reporter</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--cromo-fg-muted)] uppercase tracking-wide">Reported</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--cromo-fg-muted)] uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--cromo-fg-muted)] uppercase tracking-wide">Date</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--cromo-border)]">
              {reports.map((report) => (
                <Fragment key={report.id}>
                  <tr
                    className="hover:bg-[var(--cromo-surface-2)] cursor-pointer transition-colors"
                    onClick={() => setExpandedId(expandedId === report.id ? null : report.id)}
                  >
                    <td className="px-4 py-2">
                      <span className="rounded-full bg-[var(--cromo-surface-2)] text-[var(--cromo-fg)] px-2 py-0.5 text-xs font-medium">
                        {REPORT_CATEGORY_LABELS[report.category] ?? report.category}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-[var(--cromo-fg)]">@{report.reporterUsername}</td>
                    <td className="px-4 py-2 font-medium text-[var(--cromo-fg)]">@{report.reportedUsername}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[report.status] ?? 'bg-[var(--cromo-surface-2)] text-[var(--cromo-fg-muted)]'}`}>
                        {REPORT_STATUS_LABELS[report.status] ?? report.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-[var(--cromo-fg-subtle)] text-xs">
                      {new Date(report.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className="text-xs text-[var(--cromo-fg-subtle)]">{expandedId === report.id ? '▲' : '▼'}</span>
                    </td>
                  </tr>
                  {expandedId === report.id && (
                    <tr className="bg-transparent">
                      <td colSpan={6} className="px-4 py-4">
                        <div className="space-y-4">
                          <ReportDetailPanel reportId={report.id} token={token} />
                          <div className="flex flex-wrap gap-2">
                            {report.status !== 'under_review' && (
                              <button
                                onClick={() => handleStatus(report.id, 'under_review')}
                                className="rounded-md bg-[var(--cromo-warning-soft)] text-yellow-800 border border-[var(--cromo-warning)]/40 px-3 py-1.5 text-xs font-medium hover:bg-yellow-200 transition-colors"
                              >
                                Mark Under Review
                              </button>
                            )}
                            {['open', 'under_review'].includes(report.status) && (
                              <>
                                <button
                                  onClick={() => handleStatus(report.id, 'resolved', 'Warned and resolved without ban.')}
                                  className="rounded-md bg-[var(--cromo-success-soft)] text-green-800 border border-green-300 px-3 py-1.5 text-xs font-medium hover:bg-green-200 transition-colors"
                                >
                                  Warn & Resolve
                                </button>
                                <button
                                  onClick={() => setBanTarget({ userId: report.reportedUserId, username: report.reportedUsername, reportId: report.id })}
                                  className="rounded-md bg-[var(--cromo-danger-soft)] text-[var(--cromo-danger-text)] border border-[var(--cromo-danger)]/40 px-3 py-1.5 text-xs font-medium hover:bg-red-200 transition-colors"
                                >
                                  Soft Ban
                                </button>
                                <button
                                  onClick={() => setBanTarget({ userId: report.reportedUserId, username: report.reportedUsername, reportId: report.id })}
                                  className="rounded-md bg-[var(--cromo-danger)] text-[var(--cromo-danger-fg)] px-3 py-1.5 text-xs font-medium hover:opacity-90 transition-colors"
                                >
                                  Hard Ban
                                </button>
                                <button
                                  onClick={() => handleStatus(report.id, 'dismissed')}
                                  className="rounded-md border border-[var(--cromo-border-strong)] text-[var(--cromo-fg-muted)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--cromo-surface-2)] transition-colors"
                                >
                                  Dismiss
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {banTarget && (
        <BanModal
          userId={banTarget.userId}
          username={banTarget.username}
          reportId={banTarget.reportId}
          token={token}
          onClose={() => setBanTarget(null)}
          onBanned={() => {
            setBanTarget(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function BannedUsersSection({ token }: { token: string }) {
  const [bannedUsers, setBannedUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banDetails, setBanDetails] = useState<Record<string, AdminBan[]>>({});
  const [liftingId, setLiftingId] = useState<string | null>(null);
  const [liftReason, setLiftReason] = useState('');
  const [liftError, setLiftError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAdminUsers({ limit: 100 }, token)
      .then((result) => {
        if (cancelled) return;
        setBannedUsers(result.items.filter((u) => u.isBanned));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load users');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  const loadBanDetails = async (userId: string) => {
    if (banDetails[userId]) return;
    try {
      const { items } = await fetchAdminUserBans(userId, token);
      setBanDetails((prev) => ({ ...prev, [userId]: items }));
    } catch { /* silently skip */ }
  };

  const handleLift = async (userId: string, banId: string) => {
    if (!liftReason.trim()) {
      setLiftError('Lift reason is required.');
      return;
    }
    setLiftError(null);
    try {
      await liftAdminBan(userId, banId, { liftReason: liftReason.trim() }, token);
      setBannedUsers((prev) => prev.filter((u) => u.id !== userId));
      setLiftingId(null);
      setLiftReason('');
    } catch (err) {
      setLiftError(err instanceof Error ? err.message : 'Failed to lift ban');
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-[var(--cromo-danger-soft)] border border-[var(--cromo-danger)]/30 p-3 text-sm text-[var(--cromo-danger-text)]">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32 text-[var(--cromo-fg-subtle)] text-sm">Loading…</div>
      ) : bannedUsers.length === 0 ? (
        <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-8 text-center text-sm text-[var(--cromo-fg-subtle)]">
          No banned users.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)]">
          <table className="min-w-full text-sm">
            <thead className="bg-transparent border-b border-[var(--cromo-border)]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--cromo-fg-muted)] uppercase tracking-wide">User</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--cromo-fg-muted)] uppercase tracking-wide">Ban details</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--cromo-fg-muted)] uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--cromo-border)]">
              {bannedUsers.map((user) => {
                const activeBan = banDetails[user.id]?.find(
                  (b) => !b.liftedAt && (!b.expiresAt || new Date(b.expiresAt) > new Date())
                );
                return (
                  <Fragment key={user.id}>
                    <tr className="hover:bg-[var(--cromo-surface-2)]">
                      <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">
                        @{user.username}
                        <div className="text-xs text-[var(--cromo-fg-subtle)]">{user.email}</div>
                      </td>
                      <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                        {activeBan ? (
                          <div className="text-xs space-y-0.5">
                            <span className={`rounded px-1.5 py-0.5 font-medium ${activeBan.banType === 'hard' ? 'bg-[var(--cromo-danger-soft)] text-[var(--cromo-danger-text)]' : 'bg-[var(--cromo-warning-soft)] text-[var(--cromo-warning-text)]'}`}>
                              {activeBan.banType}
                            </span>
                            <p className="text-[var(--cromo-fg-muted)] mt-1 truncate max-w-xs">{activeBan.reason}</p>
                            {activeBan.expiresAt && (
                              <p className="text-[var(--cromo-fg-subtle)]">Expires {new Date(activeBan.expiresAt).toLocaleString()}</p>
                            )}
                          </div>
                        ) : (
                          <button
                            onClick={() => void loadBanDetails(user.id)}
                            className="text-xs text-[var(--cromo-accent)] hover:underline"
                          >
                            Load details
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {liftingId === user.id ? (
                          <div className="space-y-2 max-w-xs">
                            <input
                              type="text"
                              value={liftReason}
                              onChange={(e) => setLiftReason(e.target.value)}
                              placeholder="Lift reason…"
                              className="w-full rounded border border-[var(--cromo-border-strong)] px-2 py-1 text-xs focus:outline-none"
                            />
                            {liftError && <p className="text-xs text-[var(--cromo-danger-text)]">{liftError}</p>}
                            <div className="flex gap-1">
                              <button
                                onClick={() => {
                                  const banId = activeBan?.id ?? banDetails[user.id]?.[0]?.id;
                                  if (banId) void handleLift(user.id, banId);
                                }}
                                className="rounded bg-[var(--cromo-success)] text-[var(--cromo-success-fg)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--cromo-success)]"
                              >
                                Lift
                              </button>
                              <button
                                onClick={() => { setLiftingId(null); setLiftReason(''); setLiftError(null); }}
                                className="rounded border border-[var(--cromo-border-strong)] px-2.5 py-1 text-xs text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)]"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              void loadBanDetails(user.id);
                              setLiftingId(user.id);
                            }}
                            className="text-xs px-2.5 py-1 rounded-full font-medium border border-green-300 text-[var(--cromo-success-text)] hover:bg-[var(--cromo-success-soft)] transition-colors"
                          >
                            Lift ban
                          </button>
                        )}
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function TrustSafetySection({ token }: { token: string }) {
  const [subTab, setSubTab] = useState<'reports' | 'banned'>('reports');

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-[var(--cromo-border)] mb-4">
        <button
          onClick={() => setSubTab('reports')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            subTab === 'reports' ? 'border-[var(--cromo-accent)] text-[var(--cromo-accent)]' : 'border-transparent text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]'
          }`}
        >
          Reports Queue
        </button>
        <button
          onClick={() => setSubTab('banned')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            subTab === 'banned' ? 'border-[var(--cromo-accent)] text-[var(--cromo-accent)]' : 'border-transparent text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]'
          }`}
        >
          Banned Users
        </button>
      </div>
      {subTab === 'reports' && <ReportsQueue token={token} />}
      {subTab === 'banned' && <BannedUsersSection token={token} />}
    </div>
  );
}
