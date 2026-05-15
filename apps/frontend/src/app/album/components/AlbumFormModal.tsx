'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AlbumEditionOption, AlbumSettings, Sticker, UserAlbum } from '@/lib/api';

const DEFAULT_SETTINGS: AlbumSettings = {
  includeAllStickers: true,
  includeCocaCola: true,
  includeNonAlbumMuseum: true,
};

interface Props {
  mode: 'create' | 'edit';
  album?: UserAlbum;
  editions: AlbumEditionOption[];
  defaultEdition?: string;
  allStickers?: Sticker[];
  onConfirm: (data: { alias: string | null; edition: string; settings: AlbumSettings }) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

export default function AlbumFormModal({
  mode,
  album,
  editions,
  defaultEdition,
  allStickers,
  onConfirm,
  onDelete,
  onClose,
}: Props) {
  const firstEditionKey = editions[0]?.key ?? '';
  const [alias, setAlias] = useState(album?.alias ?? '');
  const [edition, setEdition] = useState<string>(
    album?.edition ?? defaultEdition ?? firstEditionKey
  );
  const [settings, setSettings] = useState<AlbumSettings>(
    album?.settings ?? DEFAULT_SETTINGS
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const stickerCounts = useMemo(() => {
    if (!allStickers?.length) return null;
    let coca_cola = 0, non_album_museum = 0, other_no_spot = 0;
    for (const s of allStickers) {
      const hasPage =
        (s.stickerPages?.[edition]?.pageStart != null && s.stickerPages?.[edition]?.pageEnd != null) ||
        s.teamPages?.[edition] != null;
      if (s.stickerType === 'coca_cola_special') { coca_cola++; continue; }
      if (s.stickerType === 'museum' && !hasPage) { non_album_museum++; continue; }
      if (!hasPage) other_no_spot++;
    }
    return { includeAllStickers: other_no_spot, includeCocaCola: coca_cola, includeNonAlbumMuseum: non_album_museum };
  }, [allStickers, edition]);

  useEffect(() => {
    inputRef.current?.focus();
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onConfirm({ alias: alias.trim() || null, edition, settings });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save album');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete album');
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  }

  const title = mode === 'create' ? 'Add New Album' : 'Edit Album';
  const submitLabel = mode === 'create' ? 'Create Album' : 'Save Changes';
  const busyLabel = mode === 'create' ? 'Creating…' : 'Saving…';

  const node = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 flex flex-col gap-4"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p className="text-sm text-gray-500">
          FIFA World Cup 2026™ Official Sticker Collection
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600" htmlFor="album-alias">
              Alias <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              id="album-alias"
              ref={inputRef}
              type="text"
              maxLength={100}
              placeholder="e.g. My second album, Gift for Max…"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600" htmlFor="album-edition">
              Edition
            </label>
            <select
              id="album-edition"
              value={edition}
              onChange={(e) => setEdition(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              {editions.map((e) => (
                <option key={e.key} value={e.key}>{e.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-gray-600">Sticker visibility</span>
            {(
              [
                { key: 'includeAllStickers', label: 'Stickers without a spot in my edition' },
                { key: 'includeCocaCola', label: 'Coca-Cola stickers' },
                { key: 'includeNonAlbumMuseum', label: 'Museum stickers not placed in any album' },
              ] as { key: keyof AlbumSettings; label: string }[]
            ).map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings[key]}
                  onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-400"
                />
                <span className="text-sm text-gray-700">
                  {label}
                  {stickerCounts != null && (
                    <span className="ml-1 text-gray-400">({stickerCounts[key]})</span>
                  )}
                </span>
              </label>
            ))}
          </div>

          {error && (
            <p className="text-xs text-red-600 rounded-lg bg-red-50 px-3 py-2">{error}</p>
          )}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {busy ? busyLabel : submitLabel}
            </button>
          </div>
        </form>

        {mode === 'edit' && onDelete && !album?.isDefault && (
          <div className="border-t border-gray-100 pt-4">
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
                className="w-full text-sm text-red-500 hover:text-red-700 font-medium disabled:opacity-50 text-left"
              >
                Delete this album…
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-gray-600">
                  This will permanently delete the album and all its stickers.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    disabled={busy}
                    className="flex-1 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={busy}
                    className="flex-1 px-3 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    {busy ? 'Deleting…' : 'Delete Album'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(node, document.body);
}
