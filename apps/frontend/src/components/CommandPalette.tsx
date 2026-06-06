'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useAlbumsStore } from '@/store/albums';
import { usePreferencesStore } from '@/store/preferences';
import { useHotkeys } from '@/lib/hotkeys';
import { albumDisplayName, patchUserPreferences } from '@/lib/api';

// Cmd+K (or Ctrl+K) command palette. Aggregates three sources of commands:
//   1. Static navigation actions (Dashboard, Album list, Scan, Trade, Settings)
//   2. Per-user dynamic actions (jump to each owned album, sign out)
//   3. Toggles surfaced from preferences (mute scan voice, toggle trade matching)
//
// Filtering is a cheap case-insensitive substring match across the label plus
// the optional `keywords` field — fuzzy enough for short labels, no dep cost.
// We deliberately keep the palette flat (no nested menus) — collectors won't
// remember a tree of categories; they'll remember the words.

interface Command {
  id: string;
  label: string;
  // Optional hint surfaced on the right ("Album", "Settings").
  badge?: string;
  // Extra terms folded into the search match. Use for synonyms.
  keywords?: string;
  run: () => void;
}

export default function CommandPalette() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const albums = useAlbumsStore((s) => s.albums);
  const tradeEnabled = usePreferencesStore((s) => s.tradeMatchingEnabled);
  const setTradeEnabled = usePreferencesStore((s) => s.setTradeMatchingEnabled);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useHotkeys('mod+k | ctrl+k', () => setOpen((v) => !v), { allowInEditable: true });
  useHotkeys('escape', () => setOpen(false), { allowInEditable: true, enabled: open });

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setHighlightIdx(0);
    // Defer focus until the dialog is mounted; React commits before browser paint.
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const base: Command[] = [
      { id: 'nav:dashboard', label: 'Go to dashboard',  badge: 'Nav', keywords: 'home overview', run: () => router.push('/dashboard') },
      { id: 'nav:album',     label: 'Go to album list', badge: 'Nav', keywords: 'collection', run: () => router.push('/album') },
      { id: 'nav:scan',      label: 'Open scanner',     badge: 'Nav', keywords: 'identify camera', run: () => router.push('/scan') },
      { id: 'nav:trade',     label: 'Go to trade',      badge: 'Nav', keywords: 'swap match', run: () => router.push('/trade') },
      { id: 'nav:guide',     label: 'Open guides',      badge: 'Nav', keywords: 'docs help', run: () => router.push('/guide') },
      { id: 'nav:changelog', label: 'View changelog',   badge: 'Nav', keywords: 'release notes', run: () => router.push('/changelog') },
      { id: 'nav:settings',  label: 'Open settings',    badge: 'Nav', keywords: 'preferences account', run: () => router.push('/settings') },
    ];
    if (user) {
      base.push(
        { id: 'nav:profile', label: 'View your public profile', badge: 'Nav', keywords: 'share me', run: () => router.push(`/profile/${user.username}`) },
      );
    }
    // Per-album jumps. Up to 10 by `Max albums` policy so this stays short.
    for (const a of albums) {
      base.push({
        id: `album:${a.id}`,
        label: albumDisplayName(a),
        badge: a.isDefault ? 'Album · default' : 'Album',
        keywords: `${a.editionName} ${a.formatName}`,
        run: () => router.push(`/album/${a.id}`),
      });
    }
    base.push({
      id: 'pref:trade',
      label: tradeEnabled ? 'Disable trade matching' : 'Enable trade matching',
      badge: 'Toggle',
      keywords: 'preference swap',
      run: () => {
        const next = !tradeEnabled;
        // Optimistically update the store so the UI reflects the change
        // immediately; persist to the backend in the background. Silently
        // ignore failure — the next preferences fetch will reconcile.
        setTradeEnabled(next);
        if (token) {
          void patchUserPreferences({ tradeMatchingEnabled: next }, token).catch(() => {
            setTradeEnabled(!next);
          });
        }
      },
    });
    return base;
  }, [router, user, token, albums, tradeEnabled, setTradeEnabled]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) =>
      c.label.toLowerCase().includes(q) ||
      c.keywords?.toLowerCase().includes(q) ||
      c.badge?.toLowerCase().includes(q),
    );
  }, [commands, query]);

  // Keep the highlight in range as filtered results shrink/expand.
  useEffect(() => {
    if (highlightIdx >= filtered.length) setHighlightIdx(Math.max(0, filtered.length - 1));
  }, [filtered.length, highlightIdx]);

  function run(idx: number) {
    const cmd = filtered[idx];
    if (!cmd) return;
    setOpen(false);
    cmd.run();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(highlightIdx);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Command palette"
      className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[10vh] bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div className="bg-[var(--cromo-surface)] rounded-2xl shadow-cromo-lg w-full max-w-xl overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-[var(--cromo-border)]">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setHighlightIdx(0); }}
            onKeyDown={onKeyDown}
            placeholder="Type a command, album, or page…"
            className="w-full bg-transparent border-none focus:outline-none text-sm text-[var(--cromo-fg)] placeholder:text-[var(--cromo-fg-subtle)]"
          />
        </div>
        <ul className="max-h-[60vh] overflow-y-auto py-1" role="listbox">
          {filtered.length === 0 && (
            <li className="px-4 py-3 text-sm text-[var(--cromo-fg-subtle)]">No matches.</li>
          )}
          {filtered.map((cmd, i) => (
            <li
              key={cmd.id}
              role="option"
              aria-selected={i === highlightIdx}
              onMouseEnter={() => setHighlightIdx(i)}
              onClick={() => run(i)}
              className={`flex items-center justify-between gap-3 px-4 py-2 cursor-pointer text-sm ${
                i === highlightIdx
                  ? 'bg-[var(--cromo-accent-soft)] text-[var(--cromo-fg)]'
                  : 'text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]'
              }`}
            >
              <span className="min-w-0 truncate">{cmd.label}</span>
              {cmd.badge && (
                <span className="shrink-0 text-[10px] uppercase tracking-widest text-[var(--cromo-fg-subtle)]">
                  {cmd.badge}
                </span>
              )}
            </li>
          ))}
        </ul>
        <div className="border-t border-[var(--cromo-border)] px-4 py-2 text-[11px] text-[var(--cromo-fg-subtle)] flex justify-between">
          <span>↑↓ to navigate · ↵ to run</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
}
