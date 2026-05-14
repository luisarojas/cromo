'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  fetchStickers,
  patchAdminSticker,
  type Sticker,
} from '@/lib/api';
import { useAuthStore } from '@/store/auth';

// ---------------------------------------------------------------------------
// Inline edit form
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
        <form
          onSubmit={handleSubmit}
          className="flex flex-wrap gap-3 items-end"
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Player name</label>
            <input
              value={form.playerName}
              onChange={(e) =>
                setForm((f) => ({ ...f, playerName: e.target.value }))
              }
              className="rounded border border-gray-300 px-2 py-1 text-sm w-40 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Position</label>
            <input
              value={form.position}
              onChange={(e) =>
                setForm((f) => ({ ...f, position: e.target.value }))
              }
              className="rounded border border-gray-300 px-2 py-1 text-sm w-24 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Notes</label>
            <input
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
              className="rounded border border-gray-300 px-2 py-1 text-sm w-48 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          {error && (
            <span className="text-xs text-red-600 self-end">{error}</span>
          )}
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

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function AdminStickersPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);

  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Load stickers
  useEffect(() => {
    if (!hydrated) return;
    if (!token || !user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'admin') {
      router.replace('/dashboard');
      return;
    }

    let cancelled = false;

    async function load() {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const result = await fetchStickers({ limit: 200 }, token);
        if (!cancelled) setStickers(result.items);
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : 'Failed to load stickers',
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [hydrated, token, user, router]);

  const handleSave = useCallback(
    async (id: string, form: EditForm) => {
      const body: Parameters<typeof patchAdminSticker>[1] = {};
      if (form.playerName) body.playerName = form.playerName;
      if (form.position) body.position = form.position;
      if (form.notes) body.notes = form.notes;

      const updated = await patchAdminSticker(id, body, token ?? undefined);

      setStickers((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...updated } : s)),
      );
      setEditingId(null);
    },
    [token],
  );

  // Filter stickers by search
  const filtered = stickers.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.album_code.toLowerCase().includes(q) ||
      (s.player_name?.toLowerCase().includes(q) ?? false) ||
      (s.team_name?.toLowerCase().includes(q) ?? false)
    );
  });

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
          <h1 className="text-2xl font-bold text-gray-800">
            Admin — Sticker Corrections
          </h1>
        </div>

        {/* Search */}
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
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">
                    Code
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">
                    Player
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">
                    Team
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">
                    Position
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 text-xs uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-gray-400"
                    >
                      No stickers found.
                    </td>
                  </tr>
                )}
                {filtered.map((sticker) => (
                  <>
                    <tr
                      key={sticker.id}
                      className={`hover:bg-gray-50 transition-colors ${
                        editingId === sticker.id ? 'bg-blue-50' : ''
                      }`}
                    >
                      <td className="px-4 py-2 font-mono font-semibold text-gray-800">
                        {sticker.album_code}
                      </td>
                      <td className="px-4 py-2 text-gray-700">
                        {sticker.player_name ?? (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-600">
                        {sticker.team_name ?? (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <span className="rounded bg-gray-100 text-gray-600 px-1.5 py-0.5 text-xs">
                          {sticker.sticker_type}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-500 text-xs">
                        {sticker.position ?? '—'}
                      </td>
                      <td className="px-4 py-2">
                        {editingId === sticker.id ? (
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
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
                        key={`edit-${sticker.id}`}
                        sticker={sticker}
                        onSave={handleSave}
                        onCancel={() => setEditingId(null)}
                      />
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
