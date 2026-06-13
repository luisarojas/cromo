'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AlbumEditionOption, AlbumFormatOption, AlbumSettings, Sticker, UserAlbum } from '@/lib/api';

const DEFAULT_SETTINGS: AlbumSettings = {
  includeExtras: true,
  includeCocaCola: true,
  defaultBaseVariant: 'base_borderless',
};

// Preferred initial format on the create path when the caller doesn't supply
// one explicitly. Softcover is the standard retail album for the WC 2026 type
// and matches what most people are starting with.
const PREFERRED_FORMAT_KEY = 'softcover_standard';

function pickInitialFormat(
  formats: AlbumFormatOption[],
  edition: string,
): string {
  const available = formats.filter((f) => f.editions.includes(edition));
  return (
    available.find((f) => f.key === PREFERRED_FORMAT_KEY)?.key
    ?? available[0]?.key
    ?? ''
  );
}

// Edition-aware initial value for defaultBaseVariant: North-American packs ship
// white-bordered base; everywhere else ships borderless. Used only when the user
// hasn't already chosen explicitly (album create path, or legacy albums without
// the field in their settings JSONB).
function defaultBaseForEdition(edition: string): AlbumSettings['defaultBaseVariant'] {
  return edition === 'north_america' ? 'base_border' : 'base_borderless';
}

interface Props {
  mode: 'create' | 'edit';
  album?: UserAlbum;
  editions: AlbumEditionOption[];
  formats: AlbumFormatOption[];
  defaultEdition?: string;
  defaultFormat?: string;
  allStickers?: Sticker[];
  onConfirm: (data: {
    alias: string | null;
    notes: string | null;
    edition: string;
    format: string;
    settings: AlbumSettings;
    isTradeInventoryPublic: boolean;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

export default function AlbumFormModal({
  mode,
  album,
  editions,
  formats,
  defaultEdition,
  defaultFormat,
  allStickers,
  onConfirm,
  onDelete,
  onClose,
}: Props) {
  const firstEditionKey = editions[0]?.key ?? '';
  const [alias, setAlias] = useState(album?.alias ?? '');
  const [notes, setNotes] = useState(album?.notes ?? '');
  const [edition, setEdition] = useState<string>(
    album?.edition ?? defaultEdition ?? firstEditionKey
  );
  // Formats available for the selected edition. Editions and formats are
  // many-to-many (e.g. "Metallised Softcover" only exists for Switzerland),
  // so the dropdown narrows whenever the edition changes.
  const availableFormats = useMemo(
    () => formats.filter((f) => f.editions.includes(edition)),
    [formats, edition]
  );
  const [format, setFormat] = useState<string>(() => {
    const startingEdition = album?.edition ?? defaultEdition ?? firstEditionKey;
    const initial = album?.format ?? defaultFormat ?? '';
    if (initial && formats.some((f) => f.key === initial && f.editions.includes(startingEdition))) {
      return initial;
    }
    return pickInitialFormat(formats, startingEdition);
  });

  // When the edition changes, if the current format is no longer valid for the
  // new edition, fall back to the preferred default (or first available).
  useEffect(() => {
    if (availableFormats.length === 0) {
      setFormat('');
      return;
    }
    if (!availableFormats.some((f) => f.key === format)) {
      setFormat(pickInitialFormat(formats, edition));
    }
  }, [availableFormats, format, formats, edition]);

  const [settings, setSettings] = useState<AlbumSettings>(() => {
    if (album?.settings) {
      // Legacy rows could lack defaultBaseVariant; fill from edition so the
      // dropdown has a sensible pre-selected value.
      return {
        ...album.settings,
        defaultBaseVariant: album.settings.defaultBaseVariant ?? defaultBaseForEdition(album.edition),
      };
    }
    return { ...DEFAULT_SETTINGS, defaultBaseVariant: defaultBaseForEdition(edition) };
  });

  // On create, follow the edition's default if the user hasn't deviated yet.
  // We can't tell "user deviated" perfectly, so only adjust on the create path
  // and only when the current value still matches the previous edition's default.
  useEffect(() => {
    if (mode !== 'create') return;
    setSettings((prev) => {
      const expected = defaultBaseForEdition(edition);
      if (prev.defaultBaseVariant === expected) return prev;
      // Skip auto-adjust once the user has chosen the *other* value — they meant it.
      const otherEditionDefault = defaultBaseForEdition(edition === 'north_america' ? 'international' : 'north_america');
      if (prev.defaultBaseVariant !== otherEditionDefault) return prev;
      return { ...prev, defaultBaseVariant: expected };
    });
  }, [edition, mode]);
  const [isTradeInventoryPublic, setIsTradeInventoryPublic] = useState<boolean>(
    album?.isTradeInventoryPublic ?? false
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const stickerCounts = useMemo(() => {
    if (!allStickers?.length) return null;
    let coca_cola = 0, extras = 0;
    for (const s of allStickers) {
      if (s.stickerType === 'coca_cola_special') coca_cola++;
      else if (s.stickerType === 'extra') extras++;
    }
    return { includeExtras: extras, includeCocaCola: coca_cola };
  }, [allStickers]);

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
      await onConfirm({
        alias: alias.trim() || null,
        notes: notes.trim() || null,
        edition,
        format,
        settings,
        isTradeInventoryPublic,
      });
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
        className="w-full max-w-sm rounded-2xl bg-[var(--cromo-surface)] shadow-cromo-lg p-6 flex flex-col gap-4"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--cromo-fg)]">{title}</h2>
          <button
            onClick={onClose}
            className="text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-fg)] text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[var(--cromo-fg-muted)]" htmlFor="album-alias">
              Alias <span className="font-normal text-[var(--cromo-fg-subtle)]">(optional)</span>
            </label>
            <input
              id="album-alias"
              ref={inputRef}
              type="text"
              maxLength={100}
              placeholder="e.g. My second album, Gift for Max…"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              className="rounded-lg border border-[var(--cromo-border)] px-3 py-2 text-sm text-[var(--cromo-fg)] placeholder-[var(--cromo-fg-subtle)] focus:border-[var(--cromo-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent-soft)]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[var(--cromo-fg-muted)]" htmlFor="album-edition">
              Edition
            </label>
            <select
              id="album-edition"
              value={edition}
              onChange={(e) => setEdition(e.target.value)}
              className="rounded-lg border border-[var(--cromo-border)] px-3 py-2 text-sm text-[var(--cromo-fg)] focus:border-[var(--cromo-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent-soft)]"
            >
              {editions.map((e) => (
                <option key={e.key} value={e.key}>{e.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[var(--cromo-fg-muted)]" htmlFor="album-format">
              Format
            </label>
            <select
              id="album-format"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              disabled={availableFormats.length === 0}
              className="rounded-lg border border-[var(--cromo-border)] px-3 py-2 text-sm text-[var(--cromo-fg)] focus:border-[var(--cromo-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent-soft)] disabled:bg-[var(--cromo-surface-2)] disabled:text-[var(--cromo-fg-subtle)]"
            >
              {availableFormats.length === 0 ? (
                <option value="">No formats available for this edition</option>
              ) : (
                availableFormats.map((f) => (
                  <option key={f.key} value={f.key}>{f.name}</option>
                ))
              )}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[var(--cromo-fg-muted)]" htmlFor="album-notes">
              Notes <span className="font-normal text-[var(--cromo-fg-subtle)]">(optional)</span>
            </label>
            <input
              id="album-notes"
              type="text"
              maxLength={500}
              placeholder="e.g. Limited Hardcover serial 1234/5000"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-lg border border-[var(--cromo-border)] px-3 py-2 text-sm text-[var(--cromo-fg)] placeholder-[var(--cromo-fg-subtle)] focus:border-[var(--cromo-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent-soft)]"
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-[var(--cromo-fg-muted)]">Sticker visibility</span>
            {(
              [
                { key: 'includeExtras',   label: 'Extra stickers' },
                { key: 'includeCocaCola', label: 'Coca-Cola stickers' },
              ] as { key: 'includeExtras' | 'includeCocaCola'; label: string }[]
            ).map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings[key]}
                  onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.checked }))}
                  className="w-4 h-4 rounded border-[var(--cromo-border-strong)] text-[var(--cromo-accent)] focus:ring-[var(--cromo-accent)]"
                />
                <span className="text-sm text-[var(--cromo-fg)]">
                  {label}
                  {stickerCounts != null && (
                    <span className="ml-1 text-[var(--cromo-fg-subtle)]">({stickerCounts[key]})</span>
                  )}
                </span>
              </label>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[var(--cromo-fg-muted)]" htmlFor="album-default-base">
              Default Base variant
            </label>
            <select
              id="album-default-base"
              value={settings.defaultBaseVariant}
              onChange={(e) => setSettings((s) => ({ ...s, defaultBaseVariant: e.target.value as AlbumSettings['defaultBaseVariant'] }))}
              className="rounded-lg border border-[var(--cromo-border)] px-3 py-2 text-sm text-[var(--cromo-fg)] focus:border-[var(--cromo-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent-soft)]"
            >
              <option value="base_borderless">Base (Borderless) — International packs</option>
              <option value="base_border">Base (White Border) — North American packs</option>
            </select>
            <p className="text-[11px] text-[var(--cromo-fg-subtle)]">
              Pre-selected when the scanner can&apos;t tell which Base layout a sticker has. You can still pick the other variant per scan.
            </p>
          </div>

          <div className="flex flex-col gap-2 border-t border-[var(--cromo-border)] pt-4">
            <span className="text-xs font-medium text-[var(--cromo-fg-muted)]">Public trading inventory</span>
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isTradeInventoryPublic}
                onChange={(e) => setIsTradeInventoryPublic(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-[var(--cromo-border-strong)] text-[var(--cromo-accent)] focus:ring-[var(--cromo-accent)]"
              />
              <span className="text-sm text-[var(--cromo-fg)]">
                Show this album&apos;s offered &amp; wanted stickers on my public profile
                <span className="block text-xs text-[var(--cromo-fg-subtle)] mt-0.5">
                  Per-sticker force hide / force show rules still apply.
                </span>
              </span>
            </label>
          </div>

          {error && (
            <p className="text-xs text-[var(--cromo-danger-text)] rounded-lg bg-[var(--cromo-danger-soft)] px-3 py-2">{error}</p>
          )}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-4 py-2 text-sm font-medium text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !format}
              className="px-4 py-2 text-sm font-medium bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] rounded-lg hover:bg-[var(--cromo-accent-strong)] disabled:opacity-50 transition-colors"
            >
              {busy ? busyLabel : submitLabel}
            </button>
          </div>
        </form>

        {mode === 'edit' && onDelete && !album?.isDefault && (
          <div className="border-t border-[var(--cromo-border)] pt-4">
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
                className="w-full text-sm text-[var(--cromo-danger-text)] hover:text-[var(--cromo-danger-text)] font-medium disabled:opacity-50 text-left"
              >
                Delete this album…
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-[var(--cromo-fg-muted)]">
                  This will permanently delete the album and all its stickers.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    disabled={busy}
                    className="flex-1 px-3 py-2 text-sm font-medium text-[var(--cromo-fg-muted)] border border-[var(--cromo-border)] rounded-lg hover:bg-[var(--cromo-surface-2)] disabled:opacity-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={busy}
                    className="flex-1 px-3 py-2 text-sm font-medium bg-[var(--cromo-danger)] text-[var(--cromo-danger-fg)] rounded-lg hover:opacity-90 disabled:opacity-50 transition-colors"
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
