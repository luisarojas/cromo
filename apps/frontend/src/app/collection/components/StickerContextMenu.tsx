'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// Minimal context menu rendered at click coordinates. We clamp the menu to the
// viewport so it doesn't overflow off the right or bottom edge — a desktop
// user who right-clicks near a window edge expects the menu to flip, not get
// cut off. Items take a `disabled` flag so the same menu shape works for both
// owned and unowned cards.

export interface ContextItem {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  destructive?: boolean;
  // Returns true if the menu should remain open after run (rare — most
  // commands close the menu).
  run: () => void | boolean;
}

interface Props {
  x: number;
  y: number;
  items: ContextItem[];
  onClose: () => void;
}

const MENU_W = 220;

export default function StickerContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Pointer-agnostic outside dismissal: mousedown covers desktop, touchstart
    // covers mobile (where this menu is opened by a long-press). Without the
    // touchstart listener a tap outside the menu on a phone may not close it
    // until a synthetic mouse event fires — or not at all.
    function onDown(e: MouseEvent | TouchEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Clamp so the menu doesn't overflow.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const estHeight = items.length * 32 + 12;
  const left = Math.min(x, vw - MENU_W - 8);
  const top = Math.min(y, vh - estHeight - 8);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="fixed z-[60] rounded-lg border border-[var(--cromo-border)] bg-[var(--cromo-surface)] shadow-cromo-lg py-1.5"
      style={{ left, top, width: MENU_W }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          role="menuitem"
          disabled={item.disabled}
          onClick={() => {
            const keepOpen = item.run();
            if (!keepOpen) onClose();
          }}
          className={`flex items-center justify-between gap-3 w-full px-3 py-1.5 text-left text-sm transition-colors ${
            item.disabled
              ? 'text-[var(--cromo-fg-subtle)] cursor-not-allowed'
              : item.destructive
                ? 'text-[var(--cromo-danger-text)] hover:bg-[var(--cromo-danger-soft)]'
                : 'text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)]'
          }`}
        >
          <span className="truncate">{item.label}</span>
          {item.shortcut && (
            <kbd className="shrink-0 text-[10px] font-mono text-[var(--cromo-fg-subtle)]">{item.shortcut}</kbd>
          )}
        </button>
      ))}
    </div>,
    document.body,
  );
}
