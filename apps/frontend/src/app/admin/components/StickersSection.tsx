'use client';

import { useCallback, useEffect, useState, Fragment } from 'react';
import {
  fetchAllStickers,
  patchAdminSticker,
  type Sticker,
  type SeedPushOutcome,
} from '@/lib/api';
import { foldAccents } from '@/lib/normalize';

interface SeedPushNotice {
  stickerId: string;
  albumCode: string;
  outcome: SeedPushOutcome;
}

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

function SeedPushBanner({
  notice,
  onDismiss,
}: {
  notice: SeedPushNotice;
  onDismiss: () => void;
}) {
  const { albumCode, outcome } = notice;
  const body = (() => {
    switch (outcome.mode) {
      case 'github':
        return (
          <>
            PR opened —{' '}
            <a
              href={outcome.pullRequestUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[var(--cromo-accent)] underline hover:no-underline"
            >
              merge to persist
            </a>
            . Until then, a backend restart will reseed this row back.
          </>
        );
      case 'local':
        return (
          <>
            Wrote local file{' '}
            <code className="font-mono text-[11px] bg-[var(--cromo-surface-2)] px-1 py-0.5 rounded">
              {outcome.localPath}
            </code>{' '}
            — commit it to make the edit survive a rebuild.
          </>
        );
      case 'skipped':
        if (outcome.error) {
          return (
            <>
              <span className="font-medium text-[var(--cromo-danger-text)]">
                Seed-file push failed:
              </span>{' '}
              {outcome.error}. Live DB is updated; the seed file is now out of sync.
            </>
          );
        }
        return (
          <>No seed-file change required ({outcome.reason ?? 'DB-only field'}).</>
        );
    }
  })();
  return (
    <li className="rounded-lg border border-[var(--cromo-accent)]/30 bg-[var(--cromo-accent-soft)] p-3 flex items-start justify-between gap-3">
      <div className="text-xs text-[var(--cromo-fg-muted)]">
        <span className="font-mono font-semibold text-[var(--cromo-fg)]">{albumCode}</span>{' '}
        — {body}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded text-[var(--cromo-fg-subtle)] text-xs px-2 py-1 hover:text-[var(--cromo-fg-muted)] transition-colors"
      >
        ✕
      </button>
    </li>
  );
}

export default function StickersSection({ token }: { token: string }) {
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  // Surface the seed-push outcome for recent saves so the operator can
  // (a) merge the PR or (b) commit the locally-edited seed file. Newest
  // first; dismissible.
  const [notices, setNotices] = useState<SeedPushNotice[]>([]);

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
      setNotices((prev) => [
        { stickerId: id, albumCode: updated.albumCode, outcome: updated.seedPush },
        ...prev.filter((n) => n.stickerId !== id),
      ]);
    },
    [token],
  );

  const dismissNotice = useCallback((stickerId: string) => {
    setNotices((prev) => prev.filter((n) => n.stickerId !== stickerId));
  }, []);

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

      {notices.length > 0 && (
        <ul className="flex flex-col gap-2 mb-4">
          {notices.map((n) => (
            <SeedPushBanner key={n.stickerId} notice={n} onDismiss={() => dismissNotice(n.stickerId)} />
          ))}
        </ul>
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
