'use client';

import { useEffect, useState, useCallback, Fragment, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  fetchAllStickers,
  patchAdminSticker,
  fetchAdminUsers,
  patchAdminUserRole,
  banAdminUser,
  unbanAdminUser,
  deleteAdminUser,
  fetchAdminReports,
  fetchAdminReport,
  fetchAdminReportAttachmentBlob,
  patchAdminReport,
  createAdminBan,
  liftAdminBan,
  fetchAdminUserBans,
  fetchAdminFeatureFlags,
  type Sticker,
  type AdminUser,
  type AdminReport,
  type AdminReportDetail,
  type AdminReportAttachment,
  type AdminBan,
} from '@/lib/api';
import { foldAccents } from '@/lib/normalize';
import { useAuthStore } from '@/store/auth';

// ---------------------------------------------------------------------------
// Stickers section
// ---------------------------------------------------------------------------

interface EditForm {
  playerName: string;
  position: string;
  notes: string;
}

function EditRow({
  sticker,
  onSave,
  onCancel,
}: {
  sticker: Sticker;
  onSave: (id: string, form: EditForm) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<EditForm>({
    playerName: sticker.playerName ?? '',
    position: sticker.position ?? '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(sticker.id, form);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="bg-[var(--cromo-accent-soft)]">
      <td colSpan={6} className="px-4 py-3">
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--cromo-fg-muted)]">Player name</label>
            <input
              value={form.playerName}
              onChange={(e) => setForm((f) => ({ ...f, playerName: e.target.value }))}
              className="rounded border border-[var(--cromo-border-strong)] px-2 py-1 text-sm w-40 focus:outline-none focus:ring-1 focus:ring-[var(--cromo-accent)]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--cromo-fg-muted)]">Position</label>
            <input
              value={form.position}
              onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
              className="rounded border border-[var(--cromo-border-strong)] px-2 py-1 text-sm w-24 focus:outline-none focus:ring-1 focus:ring-[var(--cromo-accent)]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--cromo-fg-muted)]">Notes</label>
            <input
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="rounded border border-[var(--cromo-border-strong)] px-2 py-1 text-sm w-48 focus:outline-none focus:ring-1 focus:ring-[var(--cromo-accent)]"
            />
          </div>
          {error && <span className="text-xs text-[var(--cromo-danger-text)] self-end">{error}</span>}
          <div className="flex gap-2 self-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] text-xs px-3 py-1.5 font-medium hover:bg-[var(--cromo-accent-strong)] disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded border border-[var(--cromo-border-strong)] text-xs px-3 py-1.5 text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </td>
    </tr>
  );
}

function StickersSection({ token }: { token: string }) {
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const items = await fetchAllStickers(token);
        if (!cancelled) setStickers(items);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load stickers');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [token]);

  const handleSave = useCallback(
    async (id: string, form: EditForm) => {
      const body: Parameters<typeof patchAdminSticker>[1] = {};
      if (form.playerName) body.playerName = form.playerName;
      if (form.position) body.position = form.position;
      if (form.notes) body.notes = form.notes;
      const updated = await patchAdminSticker(id, body, token);
      setStickers((prev) => prev.map((s) => (s.id === id ? { ...s, ...updated } : s)));
      setEditingId(null);
    },
    [token],
  );

  const filtered = stickers.filter((s) => {
    if (!search) return true;
    const q = foldAccents(search);
    return (
      foldAccents(s.albumCode).includes(q) ||
      foldAccents(s.playerName ?? '').includes(q) ||
      foldAccents(s.teamName ?? '').includes(q)
    );
  });

  return (
    <div>
      <div className="mb-4">
        <div className="relative w-full max-w-md">
          <input
            type="text"
            placeholder="Search by album code, player, team…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-[var(--cromo-border-strong)] px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 rounded-full text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)]"
            >
              <svg className="w-3 h-3" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            </button>
          )}
        </div>
        {search && !loading && (
          <p className="mt-2 text-xs text-[var(--cromo-fg-muted)]">
            Showing {filtered.length} of {stickers.length}
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-[var(--cromo-danger-soft)] border border-[var(--cromo-danger)]/30 p-3 text-sm text-[var(--cromo-danger-text)] mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40 text-[var(--cromo-fg-subtle)] text-sm">
          Loading stickers…
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)]">
          <table className="min-w-full text-sm">
            <thead className="bg-transparent border-b border-[var(--cromo-border)]">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-[var(--cromo-fg-muted)] text-xs uppercase tracking-wide">Code</th>
                <th className="px-4 py-3 text-left font-semibold text-[var(--cromo-fg-muted)] text-xs uppercase tracking-wide">Player</th>
                <th className="px-4 py-3 text-left font-semibold text-[var(--cromo-fg-muted)] text-xs uppercase tracking-wide">Team</th>
                <th className="px-4 py-3 text-left font-semibold text-[var(--cromo-fg-muted)] text-xs uppercase tracking-wide">Type</th>
                <th className="px-4 py-3 text-left font-semibold text-[var(--cromo-fg-muted)] text-xs uppercase tracking-wide">Position</th>
                <th className="px-4 py-3 text-left font-semibold text-[var(--cromo-fg-muted)] text-xs uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--cromo-border)]">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[var(--cromo-fg-subtle)]">No stickers found.</td>
                </tr>
              )}
              {filtered.map((sticker) => (
                <Fragment key={sticker.id}>
                  <tr
                    className={`hover:bg-[var(--cromo-surface-2)] transition-colors ${editingId === sticker.id ? 'bg-[var(--cromo-accent-soft)]' : ''}`}
                  >
                    <td className="px-4 py-2 font-mono font-semibold text-[var(--cromo-fg)]">{sticker.albumCode}</td>
                    <td className="px-4 py-2 text-[var(--cromo-fg)]">
                      {sticker.playerName ?? <span className="text-[var(--cromo-fg-subtle)]">—</span>}
                    </td>
                    <td className="px-4 py-2 text-[var(--cromo-fg-muted)]">
                      {sticker.teamName ?? <span className="text-[var(--cromo-fg-subtle)]">—</span>}
                    </td>
                    <td className="px-4 py-2">
                      <span className="rounded bg-[var(--cromo-surface-2)] text-[var(--cromo-fg-muted)] px-1.5 py-0.5 text-xs">{sticker.stickerType}</span>
                    </td>
                    <td className="px-4 py-2 text-[var(--cromo-fg-muted)] text-xs">{sticker.position ?? '—'}</td>
                    <td className="px-4 py-2">
                      {editingId === sticker.id ? (
                        <button onClick={() => setEditingId(null)} className="text-xs text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-fg-muted)]">
                          Cancel
                        </button>
                      ) : (
                        <button
                          onClick={() => setEditingId(sticker.id)}
                          className="text-xs text-[var(--cromo-accent)] hover:text-[var(--cromo-accent)] font-medium"
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                  {editingId === sticker.id && (
                    <EditRow
                      sticker={sticker}
                      onSave={handleSave}
                      onCancel={() => setEditingId(null)}
                    />
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Users section
// ---------------------------------------------------------------------------

type SortCol = 'username' | 'email' | 'role' | 'status' | 'joined';
type SortDir = 'asc' | 'desc';

function SortableHeader({
  col,
  label,
  sortCol,
  onClick,
}: {
  col: SortCol;
  label: string;
  sortCol: SortCol;
  sortDir?: SortDir;
  onClick: (col: SortCol) => void;
}) {
  const active = sortCol === col;
  return (
    <th
      className={`px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide cursor-pointer select-none transition-colors ${active ? 'text-[var(--cromo-accent)]' : 'text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]'}`}
      onClick={() => onClick(col)}
    >
      {label}
    </th>
  );
}

function StatusBadge({ user }: { user: AdminUser }) {
  if (user.deletedAt) {
    return (
      <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-[var(--cromo-surface-2)] text-[var(--cromo-fg-muted)]">Deleted</span>
    );
  }
  if (user.isBanned) {
    return (
      <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-[var(--cromo-danger-soft)] text-[var(--cromo-danger-text)]">Banned</span>
    );
  }
  return (
    <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-[var(--cromo-success-soft)] text-[var(--cromo-success-text)]">Active</span>
  );
}

function RoleBadge({ role }: { role: string }) {
  if (role === 'admin') {
    return (
      <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-[var(--cromo-tier-very-rare-soft)] text-[var(--cromo-tier-very-rare)]">admin</span>
    );
  }
  return (
    <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-[var(--cromo-surface-2)] text-[var(--cromo-fg-muted)]">user</span>
  );
}

function BanForm({
  onConfirm,
  onCancel,
}: {
  onConfirm: (reason: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 5) {
      setError('Reason must be at least 5 characters.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to ban user');
      setSaving(false);
    }
  };

  return (
    <tr className="bg-[var(--cromo-danger-soft)]">
      <td colSpan={6} className="px-4 py-3">
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--cromo-fg-muted)]">Ban reason</label>
            <input
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for ban…"
              className="rounded border border-[var(--cromo-border-strong)] px-2 py-1 text-sm w-72 focus:outline-none focus:ring-1 focus:ring-red-400"
            />
          </div>
          {error && <span className="text-xs text-[var(--cromo-danger-text)] self-end">{error}</span>}
          <div className="flex gap-2 self-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-[var(--cromo-danger)] text-[var(--cromo-danger-fg)] text-xs px-3 py-1.5 font-medium hover:opacity-90 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Banning…' : 'Confirm ban'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded border border-[var(--cromo-border-strong)] text-xs px-3 py-1.5 text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </td>
    </tr>
  );
}

function UsersSection({ token, currentUserId }: { token: string; currentUserId: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [banningId, setBanningId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<SortCol>('username');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAdminUsers({ search: search || undefined, page, limit }, token);
      setUsers(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [token, search, page]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const handleSortClick = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const statusOrder = (u: AdminUser) => (u.deletedAt ? 2 : u.isBanned ? 1 : 0);

  const sorted = [...users].sort((a, b) => {
    let cmp = 0;
    switch (sortCol) {
      case 'username': cmp = a.username.localeCompare(b.username); break;
      case 'email': cmp = a.email.localeCompare(b.email); break;
      case 'role': cmp = a.role.localeCompare(b.role); break;
      case 'status': cmp = statusOrder(a) - statusOrder(b); break;
      case 'joined': cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const handleRoleChange = async (user: AdminUser, newRole: 'admin' | 'user') => {
    if (newRole === user.role) return;
    const label = newRole === 'admin' ? 'promote to admin' : 'demote to user';
    if (!window.confirm(`${label} "${user.username}"?`)) return;
    setActionError(null);
    try {
      const updated = await patchAdminUserRole(user.id, newRole, token);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, role: updated.role } : u)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to change role');
    }
  };

  const handleBanConfirm = async (userId: string, reason: string) => {
    await banAdminUser(userId, reason, token);
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, isBanned: true } : u)));
    setBanningId(null);
  };

  const handleUnban = async (user: AdminUser) => {
    if (!window.confirm(`Unban "${user.username}"?`)) return;
    setActionError(null);
    try {
      await unbanAdminUser(user.id, token);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, isBanned: false } : u)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to unban user');
    }
  };

  const handleDelete = async (user: AdminUser) => {
    if (!window.confirm(`Permanently delete account "${user.username}"? This cannot be undone.`)) return;
    setActionError(null);
    try {
      await deleteAdminUser(user.id, token);
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, deletedAt: new Date().toISOString() } : u)),
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete user');
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-[var(--cromo-fg-subtle)]">{total} total</span>
      </div>

      <form onSubmit={handleSearch} className="mb-4 flex gap-2">
        <div className="relative w-64">
          <input
            type="text"
            placeholder="Search by username or email…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full rounded-md border border-[var(--cromo-border-strong)] px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)]"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 rounded-full text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)]"
            >
              <svg className="w-3 h-3" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            </button>
          )}
        </div>
        <button
          type="submit"
          className="rounded-md bg-[var(--cromo-fg)] text-[var(--cromo-bg)] text-sm px-4 py-2 hover:bg-[var(--cromo-surface-2)] transition-colors"
        >
          Search
        </button>
        {search && (
          <button
            type="button"
            onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }}
            className="rounded-md border border-[var(--cromo-border-strong)] text-sm px-3 py-2 text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)] transition-colors"
          >
            Clear
          </button>
        )}
      </form>

      {error && (
        <div className="rounded-lg bg-[var(--cromo-danger-soft)] border border-[var(--cromo-danger)]/30 p-3 text-sm text-[var(--cromo-danger-text)] mb-4">{error}</div>
      )}
      {actionError && (
        <div className="rounded-lg bg-[var(--cromo-danger-soft)] border border-[var(--cromo-danger)]/30 p-3 text-sm text-[var(--cromo-danger-text)] mb-4">{actionError}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40 text-[var(--cromo-fg-subtle)] text-sm">Loading users…</div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)]">
            <table className="min-w-full text-sm">
              <thead className="bg-transparent border-b border-[var(--cromo-border)]">
                <tr>
                  <SortableHeader col="username" label="Username" sortCol={sortCol} sortDir={sortDir} onClick={handleSortClick} />
                  <SortableHeader col="email" label="Email" sortCol={sortCol} sortDir={sortDir} onClick={handleSortClick} />
                  <SortableHeader col="role" label="Role" sortCol={sortCol} sortDir={sortDir} onClick={handleSortClick} />
                  <SortableHeader col="status" label="Status" sortCol={sortCol} sortDir={sortDir} onClick={handleSortClick} />
                  <SortableHeader col="joined" label="Joined" sortCol={sortCol} sortDir={sortDir} onClick={handleSortClick} />
                  <th className="px-4 py-3 text-left font-semibold text-[var(--cromo-fg-muted)] text-xs uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--cromo-border)]">
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[var(--cromo-fg-subtle)]">No users found.</td>
                  </tr>
                )}
                {sorted.map((user) => (
                  <Fragment key={user.id}>
                    <tr
                      className={`hover:bg-[var(--cromo-surface-2)] transition-colors ${user.deletedAt ? 'opacity-50' : ''}`}
                    >
                      <td className="px-4 py-2 font-medium text-[var(--cromo-fg)]">
                        {user.username}
                        {user.id === currentUserId && (
                          <span className="ml-1.5 text-xs text-[var(--cromo-fg-subtle)]">(you)</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-[var(--cromo-fg-muted)]">{user.email}</td>
                      <td className="px-4 py-2">
                        {user.id === currentUserId || user.deletedAt ? (
                          <RoleBadge role={user.role} />
                        ) : (
                          <select
                            value={user.role}
                            onChange={(e) => handleRoleChange(user, e.target.value as 'admin' | 'user')}
                            className="text-xs rounded border border-[var(--cromo-border)] bg-transparent px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[var(--cromo-accent)] cursor-pointer"
                          >
                            <option value="user">user</option>
                            <option value="admin">admin</option>
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-2"><StatusBadge user={user} /></td>
                      <td className="px-4 py-2 text-[var(--cromo-fg-subtle)] text-xs">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2">
                        {user.id === currentUserId || user.deletedAt ? (
                          <span className="text-xs text-[var(--cromo-fg-subtle)]">—</span>
                        ) : (
                          <div className="flex gap-1.5 flex-wrap">
                            {user.isBanned ? (
                              <button
                                onClick={() => handleUnban(user)}
                                className="text-xs px-2.5 py-1 rounded-full font-medium border border-green-300 text-[var(--cromo-success-text)] hover:bg-[var(--cromo-success-soft)] transition-colors"
                              >
                                Unban
                              </button>
                            ) : (
                              <button
                                onClick={() => setBanningId(banningId === user.id ? null : user.id)}
                                className="text-xs px-2.5 py-1 rounded-full font-medium border border-[var(--cromo-warning)]/40 text-[var(--cromo-warning-text)] hover:bg-[var(--cromo-warning-soft)] transition-colors"
                              >
                                Ban
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(user)}
                              className="text-xs px-2.5 py-1 rounded-full font-medium border border-[var(--cromo-danger)]/40 text-[var(--cromo-danger-text)] hover:bg-[var(--cromo-danger-soft)] transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {banningId === user.id && (
                      <BanForm
                        onConfirm={(reason) => handleBanConfirm(user.id, reason)}
                        onCancel={() => setBanningId(null)}
                      />
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-[var(--cromo-fg-muted)]">
              <span>Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded border border-[var(--cromo-border-strong)] px-3 py-1 hover:bg-[var(--cromo-surface-2)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded border border-[var(--cromo-border-strong)] px-3 py-1 hover:bg-[var(--cromo-surface-2)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trust & Safety section
// ---------------------------------------------------------------------------

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

function TrustSafetySection({ token }: { token: string }) {
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Tab = 'stickers' | 'users' | 'trust-safety';

function AdminPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);

  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<Tab>(
    tabParam === 'users' ? 'users' : tabParam === 'trust-safety' ? 'trust-safety' : 'stickers'
  );
  const [trustSafetyEnabled, setTrustSafetyEnabled] = useState<boolean | null>(null);

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    router.replace(`/admin?tab=${tab}`, { scroll: false });
  };

  useEffect(() => {
    if (!token) return;
    fetchAdminFeatureFlags(token)
      .then(({ flags }) => setTrustSafetyEnabled(flags.FEATURE_TRUST_SAFETY === true))
      .catch(() => setTrustSafetyEnabled(false));
  }, [token]);

  useEffect(() => {
    if (trustSafetyEnabled === false && activeTab === 'trust-safety') {
      switchTab('stickers');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trustSafetyEnabled]);

  useEffect(() => {
    if (!hydrated) return;
    if (!token || !user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [hydrated, token, user, router]);

  if (!hydrated || (!token && hydrated)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-[var(--cromo-fg-subtle)] text-sm">
        Loading…
      </div>
    );
  }

  if (!token || !user) return null;

  return (
    <div className="min-h-screen bg-transparent">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-[var(--cromo-fg)] mb-6">Admin</h1>

        <div className="flex gap-1 mb-6 border-b border-[var(--cromo-border)]">
          <button
            onClick={() => switchTab('stickers')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === 'stickers'
                ? 'border-[var(--cromo-accent)] text-[var(--cromo-accent)]'
                : 'border-transparent text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]'
            }`}
          >
            Stickers
          </button>
          <button
            onClick={() => switchTab('users')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === 'users'
                ? 'border-[var(--cromo-accent)] text-[var(--cromo-accent)]'
                : 'border-transparent text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]'
            }`}
          >
            Users
          </button>
          {trustSafetyEnabled && (
            <button
              onClick={() => switchTab('trust-safety')}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === 'trust-safety'
                  ? 'border-[var(--cromo-accent)] text-[var(--cromo-accent)]'
                  : 'border-transparent text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]'
              }`}
            >
              Trust & Safety
            </button>
          )}
        </div>

        {activeTab === 'stickers' && <StickersSection token={token} />}
        {activeTab === 'users' && <UsersSection token={token} currentUserId={user.id} />}
        {activeTab === 'trust-safety' && trustSafetyEnabled && <TrustSafetySection token={token} />}
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense>
      <AdminPageInner />
    </Suspense>
  );
}
