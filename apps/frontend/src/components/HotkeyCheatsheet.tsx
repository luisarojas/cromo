'use client';

import { useMemo, useState } from 'react';
import { useHotkeys, formatHotkey } from '@/lib/hotkeys';
import { useAuthStore } from '@/store/auth';

// Global keyboard shortcut overlay. Triggered by ?. The contents are hand-
// curated rather than dynamically registered — every shortcut in the app
// should also have a row here, so the cheatsheet is the source of discovery.
// If you add a new hotkey, append a row to baseGroups below.

interface CheatRow {
  keys: string; // hotkeys.ts spec, e.g. 'mod+k', '? ', 'g d'
  description: string;
  // When set, only render this row if the auth state matches. Default: always.
  requireAuth?: boolean;
}
interface CheatGroup {
  title: string;
  rows: CheatRow[];
}

const ALL_GROUPS: CheatGroup[] = [
  {
    title: 'Anywhere',
    rows: [
      { keys: 'mod+k', description: 'Open command palette' },
      { keys: '?', description: 'Show this cheatsheet' },
      { keys: 'g d', description: 'Go to dashboard',  requireAuth: true },
      { keys: 'g a', description: 'Go to album list', requireAuth: true },
      { keys: 'g s', description: 'Go to scanner',    requireAuth: true },
      { keys: 'g t', description: 'Go to trade',      requireAuth: true },
      { keys: 'g p', description: 'Go to your profile', requireAuth: true },
      { keys: 'g ,', description: 'Go to settings',   requireAuth: true },
      { keys: 'escape', description: 'Close current overlay / popover' },
    ],
  },
  {
    title: 'Album page',
    rows: [
      { keys: '/', description: 'Focus the filter search' },
      { keys: 'j', description: 'Move keyboard focus to next sticker' },
      { keys: 'k', description: 'Move keyboard focus to previous sticker' },
      { keys: 'arrowright', description: 'Next sticker (same as j) — or next when detail panel is open' },
      { keys: 'arrowleft', description: 'Previous sticker (same as k) — or previous when detail panel is open' },
      { keys: 'enter', description: 'Open focused sticker' },
      { keys: '+', description: 'Add one of default base to focused sticker' },
      { keys: '-', description: 'Remove one of focused sticker (any variant)' },
      { keys: 'f', description: 'Toggle favourite on focused sticker' },
      { keys: 'w', description: 'Toggle wishlist on focused sticker base' },
      { keys: 'shift+s', description: 'Toggle multi-select mode' },
      { keys: 'space', description: 'In selection mode: toggle focused sticker' },
    ],
  },
];

export default function HotkeyCheatsheet() {
  const [open, setOpen] = useState(false);
  const authed = useAuthStore((s) => !!s.user);
  // Filter out auth-gated rows for signed-out visitors so the cheatsheet
  // reflects what they can actually do, not a phantom set of shortcuts.
  const GROUPS = useMemo<CheatGroup[]>(() => (
    ALL_GROUPS
      .map((g) => ({ ...g, rows: g.rows.filter((r) => !r.requireAuth || authed) }))
      .filter((g) => g.rows.length > 0)
  ), [authed]);
  useHotkeys('?', () => setOpen((v) => !v));
  useHotkeys('escape', () => setOpen(false), { allowInEditable: true, enabled: open });

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <div className="bg-[var(--cromo-surface)] rounded-2xl shadow-cromo-lg w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-[var(--cromo-surface)] border-b border-[var(--cromo-border)] flex items-center justify-between px-5 py-3">
          <h2 className="text-sm font-semibold text-[var(--cromo-fg)]">Keyboard shortcuts</h2>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-fg-muted)] text-xl leading-none px-1"
          >
            ×
          </button>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--cromo-fg-subtle)] mb-3">
                {group.title}
              </h3>
              <ul className="space-y-2">
                {group.rows.map((row) => (
                  <li key={row.keys} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-[var(--cromo-fg-muted)] min-w-0 truncate">{row.description}</span>
                    <kbd className="shrink-0 rounded border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface-2)] px-2 py-0.5 text-[11px] font-mono text-[var(--cromo-fg)]">
                      {formatHotkey(row.keys)}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-[var(--cromo-border)] px-5 py-3 text-xs text-[var(--cromo-fg-subtle)]">
          Shortcuts pause while you&apos;re typing in an input.
        </div>
      </div>
    </div>
  );
}
