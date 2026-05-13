'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EDITION_LABELS } from '@/lib/albumPages';
import type { AlbumEdition } from '@/lib/albumPages';

const EDITIONS: AlbumEdition[] = ['north_america', 'international', 'swiss_gold', 'south_america'];

interface Props {
  onConfirm: (alias: string | null, edition: AlbumEdition) => Promise<void>;
  onClose: () => void;
}

export default function AddAlbumModal({ onConfirm, onClose }: Props) {
  const [alias, setAlias] = useState('');
  const [edition, setEdition] = useState<AlbumEdition>('north_america');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onConfirm(alias.trim() || null, edition);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create album');
    } finally {
      setBusy(false);
    }
  }

  const node = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 flex flex-col gap-4"
        role="dialog"
        aria-modal="true"
        aria-label="Add new album"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">Add New Album</h2>
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
              onChange={(e) => setEdition(e.target.value as AlbumEdition)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              {EDITIONS.map((e) => (
                <option key={e} value={e}>{EDITION_LABELS[e]}</option>
              ))}
            </select>
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
              {busy ? 'Creating…' : 'Create Album'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(node, document.body);
}
