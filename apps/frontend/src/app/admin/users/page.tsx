'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  fetchAdminUsers,
  patchAdminUserRole,
  banAdminUser,
  unbanAdminUser,
  deleteAdminUser,
  type AdminUser,
} from '@/lib/api';
import { useAuthStore } from '@/store/auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatusBadge({ user }: { user: AdminUser }) {
  if (user.deleted_at) {
    return (
      <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-500">
        Deleted
      </span>
    );
  }
  if (user.is_banned) {
    return (
      <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-600">
        Banned
      </span>
    );
  }
  return (
    <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-green-100 text-green-600">
      Active
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  if (role === 'admin') {
    return (
      <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-purple-100 text-purple-700">
        admin
      </span>
    );
  }
  return (
    <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600">
      user
    </span>
  );
}

// ---------------------------------------------------------------------------
// Ban dialog — simple inline form
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function AdminUsersPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const currentUser = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);

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

  const load = useCallback(async () => {
    if (!token) return;
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

  useEffect(() => {
    if (!hydrated) return;
    if (!token || !currentUser) {
      router.replace('/login');
      return;
    }
    if (currentUser.role !== 'admin') {
      router.replace('/dashboard');
      return;
    }
    load();
  }, [hydrated, token, currentUser, router, load]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const handleRoleToggle = async (user: AdminUser) => {
    if (!token) return;
    const newRole = user.role === 'admin' ? 'user' : 'admin';
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
    if (!token) return;
    await banAdminUser(userId, reason, token);
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, is_banned: true } : u)));
    setBanningId(null);
  };

  const handleUnban = async (user: AdminUser) => {
    if (!token) return;
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
    if (!token) return;
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

  if (!hydrated || (!token && hydrated)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-gray-400 text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Admin — Users</h1>
          <span className="text-sm text-gray-400">{total} total</span>
        </div>

        {/* Search */}
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
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 mb-4">
            {error}
          </div>
        )}

        {actionError && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 mb-4">
            {actionError}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
            Loading users…
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">
                      Username
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">
                      Email
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">
                      Role
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">
                      Joined
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                        No users found.
                      </td>
                    </tr>
                  )}
                  {users.map((user) => (
                    <>
                      <tr
                        key={user.id}
                        className={`hover:bg-gray-50 transition-colors ${
                          user.deleted_at ? 'opacity-50' : ''
                        }`}
                      >
                        <td className="px-4 py-2 font-medium text-gray-800">
                          {user.username}
                          {user.id === currentUser?.id && (
                            <span className="ml-1.5 text-xs text-gray-400">(you)</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-gray-500">{user.email}</td>
                        <td className="px-4 py-2">
                          <RoleBadge role={user.role} />
                        </td>
                        <td className="px-4 py-2">
                          <StatusBadge user={user} />
                        </td>
                        <td className="px-4 py-2 text-gray-400 text-xs">
                          {new Date(user.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-2">
                          {user.id === currentUser?.id || user.deleted_at ? (
                            <span className="text-xs text-gray-300">—</span>
                          ) : (
                            <div className="flex gap-2 flex-wrap">
                              <button
                                onClick={() => handleRoleToggle(user)}
                                className="text-xs text-blue-500 hover:text-blue-700 font-medium"
                              >
                                {user.role === 'admin' ? 'Demote' : 'Promote'}
                              </button>
                              {user.is_banned ? (
                                <button
                                  onClick={() => handleUnban(user)}
                                  className="text-xs text-green-600 hover:text-green-800 font-medium"
                                >
                                  Unban
                                </button>
                              ) : (
                                <button
                                  onClick={() => setBanningId(banningId === user.id ? null : user.id)}
                                  className="text-xs text-amber-600 hover:text-amber-800 font-medium"
                                >
                                  Ban
                                </button>
                              )}
                              <button
                                onClick={() => handleDelete(user)}
                                className="text-xs text-red-500 hover:text-red-700 font-medium"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {banningId === user.id && (
                        <BanForm
                          key={`ban-${user.id}`}
                          onConfirm={(reason) => handleBanConfirm(user.id, reason)}
                          onCancel={() => setBanningId(null)}
                        />
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
                <span>
                  Page {page} of {totalPages}
                </span>
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
    </div>
  );
}
