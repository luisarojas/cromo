'use client';

import { useEffect, useState, useCallback, Fragment, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  fetchStickers,
  patchAdminSticker,
  fetchAdminUsers,
  patchAdminUserRole,
  banAdminUser,
  unbanAdminUser,
  deleteAdminUser,
  type Sticker,
  type AdminUser,
} from '@/lib/api';
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
    playerName: sticker.player_name ?? '',
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
    <tr className="bg-blue-50">
      <td colSpan={6} className="px-4 py-3">
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Player name</label>
            <input
              value={form.playerName}
              onChange={(e) => setForm((f) => ({ ...f, playerName: e.target.value }))}
              className="rounded border border-gray-300 px-2 py-1 text-sm w-40 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Position</label>
            <input
              value={form.position}
              onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
              className="rounded border border-gray-300 px-2 py-1 text-sm w-24 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Notes</label>
            <input
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="rounded border border-gray-300 px-2 py-1 text-sm w-48 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          {error && <span className="text-xs text-red-600 self-end">{error}</span>}
          <div className="flex gap-2 self-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-blue-600 text-white text-xs px-3 py-1.5 font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded border border-gray-300 text-xs px-3 py-1.5 text-gray-600 hover:bg-gray-100 transition-colors"
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
        const result = await fetchStickers({ limit: 200 }, token);
        if (!cancelled) setStickers(result.items);
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
    const q = search.toLowerCase();
    return (
      s.album_code.toLowerCase().includes(q) ||
      (s.player_name?.toLowerCase().includes(q) ?? false) ||
      (s.team_name?.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <div>
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by album code, player, team…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
          Loading stickers…
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Code</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Player</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Team</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Type</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Position</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">No stickers found.</td>
                </tr>
              )}
              {filtered.map((sticker) => (
                <Fragment key={sticker.id}>
                  <tr
                    className={`hover:bg-gray-50 transition-colors ${editingId === sticker.id ? 'bg-blue-50' : ''}`}
                  >
                    <td className="px-4 py-2 font-mono font-semibold text-gray-800">{sticker.album_code}</td>
                    <td className="px-4 py-2 text-gray-700">
                      {sticker.player_name ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {sticker.team_name ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2">
                      <span className="rounded bg-gray-100 text-gray-600 px-1.5 py-0.5 text-xs">{sticker.sticker_type}</span>
                    </td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{sticker.position ?? '—'}</td>
                    <td className="px-4 py-2">
                      {editingId === sticker.id ? (
                        <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:text-gray-600">
                          Cancel
                        </button>
                      ) : (
                        <button
                          onClick={() => setEditingId(sticker.id)}
                          className="text-xs text-blue-500 hover:text-blue-700 font-medium"
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
  sortDir,
  onClick,
}: {
  col: SortCol;
  label: string;
  sortCol: SortCol;
  sortDir: SortDir;
  onClick: (col: SortCol) => void;
}) {
  const active = sortCol === col;
  return (
    <th
      className={`px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide cursor-pointer select-none transition-colors ${active ? 'text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}
      onClick={() => onClick(col)}
    >
      {label}
    </th>
  );
}

function StatusBadge({ user }: { user: AdminUser }) {
  if (user.deleted_at) {
    return (
      <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-500">Deleted</span>
    );
  }
  if (user.is_banned) {
    return (
      <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-600">Banned</span>
    );
  }
  return (
    <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-green-100 text-green-600">Active</span>
  );
}

function RoleBadge({ role }: { role: string }) {
  if (role === 'admin') {
    return (
      <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-purple-100 text-purple-700">admin</span>
    );
  }
  return (
    <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600">user</span>
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
    <tr className="bg-red-50">
      <td colSpan={6} className="px-4 py-3">
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Ban reason</label>
            <input
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for ban…"
              className="rounded border border-gray-300 px-2 py-1 text-sm w-72 focus:outline-none focus:ring-1 focus:ring-red-400"
            />
          </div>
          {error && <span className="text-xs text-red-600 self-end">{error}</span>}
          <div className="flex gap-2 self-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-red-600 text-white text-xs px-3 py-1.5 font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Banning…' : 'Confirm ban'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded border border-gray-300 text-xs px-3 py-1.5 text-gray-600 hover:bg-gray-100 transition-colors"
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

  const statusOrder = (u: AdminUser) => (u.deleted_at ? 2 : u.is_banned ? 1 : 0);

  const sorted = [...users].sort((a, b) => {
    let cmp = 0;
    switch (sortCol) {
      case 'username': cmp = a.username.localeCompare(b.username); break;
      case 'email': cmp = a.email.localeCompare(b.email); break;
      case 'role': cmp = a.role.localeCompare(b.role); break;
      case 'status': cmp = statusOrder(a) - statusOrder(b); break;
      case 'joined': cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); break;
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
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, is_banned: true } : u)));
    setBanningId(null);
  };

  const handleUnban = async (user: AdminUser) => {
    if (!window.confirm(`Unban "${user.username}"?`)) return;
    setActionError(null);
    try {
      await unbanAdminUser(user.id, token);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, is_banned: false } : u)));
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
        prev.map((u) => (u.id === user.id ? { ...u, deleted_at: new Date().toISOString() } : u)),
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete user');
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-gray-400">{total} total</span>
      </div>

      <form onSubmit={handleSearch} className="mb-4 flex gap-2">
        <input
          type="text"
          placeholder="Search by username or email…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-64"
        />
        <button
          type="submit"
          className="rounded-md bg-gray-700 text-white text-sm px-4 py-2 hover:bg-gray-800 transition-colors"
        >
          Search
        </button>
        {search && (
          <button
            type="button"
            onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }}
            className="rounded-md border border-gray-300 text-sm px-3 py-2 text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Clear
          </button>
        )}
      </form>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 mb-4">{error}</div>
      )}
      {actionError && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 mb-4">{actionError}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Loading users…</div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <SortableHeader col="username" label="Username" sortCol={sortCol} sortDir={sortDir} onClick={handleSortClick} />
                  <SortableHeader col="email" label="Email" sortCol={sortCol} sortDir={sortDir} onClick={handleSortClick} />
                  <SortableHeader col="role" label="Role" sortCol={sortCol} sortDir={sortDir} onClick={handleSortClick} />
                  <SortableHeader col="status" label="Status" sortCol={sortCol} sortDir={sortDir} onClick={handleSortClick} />
                  <SortableHeader col="joined" label="Joined" sortCol={sortCol} sortDir={sortDir} onClick={handleSortClick} />
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">No users found.</td>
                  </tr>
                )}
                {sorted.map((user) => (
                  <Fragment key={user.id}>
                    <tr
                      className={`hover:bg-gray-50 transition-colors ${user.deleted_at ? 'opacity-50' : ''}`}
                    >
                      <td className="px-4 py-2 font-medium text-gray-800">
                        {user.username}
                        {user.id === currentUserId && (
                          <span className="ml-1.5 text-xs text-gray-400">(you)</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-500">{user.email}</td>
                      <td className="px-4 py-2">
                        {user.id === currentUserId || user.deleted_at ? (
                          <RoleBadge role={user.role} />
                        ) : (
                          <select
                            value={user.role}
                            onChange={(e) => handleRoleChange(user, e.target.value as 'admin' | 'user')}
                            className="text-xs rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer"
                          >
                            <option value="user">user</option>
                            <option value="admin">admin</option>
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-2"><StatusBadge user={user} /></td>
                      <td className="px-4 py-2 text-gray-400 text-xs">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2">
                        {user.id === currentUserId || user.deleted_at ? (
                          <span className="text-xs text-gray-300">—</span>
                        ) : (
                          <div className="flex gap-1.5 flex-wrap">
                            {user.is_banned ? (
                              <button
                                onClick={() => handleUnban(user)}
                                className="text-xs px-2.5 py-1 rounded-full font-medium border border-green-300 text-green-600 hover:bg-green-50 transition-colors"
                              >
                                Unban
                              </button>
                            ) : (
                              <button
                                onClick={() => setBanningId(banningId === user.id ? null : user.id)}
                                className="text-xs px-2.5 py-1 rounded-full font-medium border border-amber-300 text-amber-600 hover:bg-amber-50 transition-colors"
                              >
                                Ban
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(user)}
                              className="text-xs px-2.5 py-1 rounded-full font-medium border border-red-300 text-red-600 hover:bg-red-50 transition-colors"
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
            <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
              <span>Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded border border-gray-300 px-3 py-1 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded border border-gray-300 px-3 py-1 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
// Page
// ---------------------------------------------------------------------------

type Tab = 'stickers' | 'users';

function AdminPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);

  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<Tab>(tabParam === 'users' ? 'users' : 'stickers');

  const switchTab = (tab: Tab) => {
    setActiveTab(tab);
    router.replace(`/admin?tab=${tab}`, { scroll: false });
  };

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
      <div className="flex items-center justify-center min-h-[60vh] text-gray-400 text-sm">
        Loading…
      </div>
    );
  }

  if (!token || !user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Admin</h1>

        <div className="flex gap-1 mb-6 border-b border-gray-200">
          <button
            onClick={() => switchTab('stickers')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === 'stickers'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Stickers
          </button>
          <button
            onClick={() => switchTab('users')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === 'users'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Users
          </button>
        </div>

        {activeTab === 'stickers' && <StickersSection token={token} />}
        {activeTab === 'users' && <UsersSection token={token} currentUserId={user.id} />}
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
