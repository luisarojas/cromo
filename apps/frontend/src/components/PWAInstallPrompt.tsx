'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';

// `beforeinstallprompt` fires once per session on Android Chrome / Edge when
// the install heuristics are satisfied. We capture the event, stash it, and
// surface a dismissable banner the user can use to add Cromo to their home
// screen — the scan flow benefits dramatically from running in standalone
// mode (fullscreen camera, fewer URL bar interactions, faster cold-starts).

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'cromo:pwaInstallDismissedAt';
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000; // two weeks — long enough to not nag, short enough to re-offer after a real use period.

function wasRecentlyDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = parseInt(raw, 10);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

export default function PWAInstallPrompt() {
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as { standalone?: boolean }).standalone === true;
    if (standalone) {
      setInstalled(true);
      return;
    }
    if (wasRecentlyDismissed()) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    setDeferred(null);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice; // outcome is best-effort — appinstalled fires reliably for accept.
    setDeferred(null);
  }

  if (!hydrated || !user || installed || !deferred) return null;

  return (
    // Pinned above the MobileTabBar via the shared --cromo-tabbar-h token,
    // with a small extra gap (0.75rem) so the install banner doesn't look
    // glued to the nav. Token is 0 on desktop so the prompt would float to
    // bottom there if the md:hidden gate ever lifted.
    <div
      className="md:hidden fixed left-3 right-3 z-40 rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] shadow-cromo-lg p-3 flex items-center gap-3"
      style={{ bottom: 'calc(var(--cromo-tabbar-h) + 0.75rem)' }}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--cromo-accent-soft)] text-[var(--cromo-accent)]">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 4v12m0 0l-4-4m4 4l4-4" />
          <path d="M4 20h16" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--cromo-fg)] leading-tight">Install Cromo</p>
        <p className="text-xs text-[var(--cromo-fg-muted)] leading-tight mt-0.5">Faster scans and a fullscreen camera.</p>
      </div>
      <button
        onClick={install}
        className="shrink-0 rounded-btn bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--cromo-accent-strong)] transition-colors"
      >
        Install
      </button>
      <button
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        className="shrink-0 text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-fg-muted)] p-1"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
