'use client';

import { useCallback, useEffect, useState, Fragment } from 'react';
import {
  fetchAdminUsers,
  patchAdminUserRole,
  banAdminUser,
  unbanAdminUser,
  deleteAdminUser,
  type AdminUser,
} from '@/lib/api';

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

export default function UsersSection({ token, currentUserId }: { token: string; currentUserId: string }) {
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
