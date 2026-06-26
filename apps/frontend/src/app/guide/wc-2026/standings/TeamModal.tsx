'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { fetchWcTeam, type WcTeamDetail } from '@/lib/api';
import TeamDetailPanel from './TeamDetailPanel';

// Modal shown when a team is clicked in the Group view. Fetches the team
// profile by code and renders the shared panel. Closes on backdrop click or
// Escape; locks body scroll while open.
//
// Rendered through a portal to document.body so the fixed backdrop covers the
// FULL viewport — including the global NavBar — instead of being clipped to a
// positioned/transformed ancestor in the page tree (which would leave a strip
// at the top undarkened). Sits in the app's top layer (z-[60]), above all chrome.
export default function TeamModal({ code, onClose }: { code: string; onClose: () => void }) {
  const t = useTranslations('wc2026Standings');
  const [detail, setDetail] = useState<WcTeamDetail | null>(null);
  const [error, setError] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let live = true;
    fetchWcTeam(code)
      .then((d) => live && setDetail(d))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [code]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('teamProfile')}
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative my-4 w-full max-w-4xl rounded-2xl border border-[var(--cromo-border)] bg-[var(--cromo-bg)] p-4 shadow-xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t('close')}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--cromo-surface-2)] text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]"
        >
          ✕
        </button>

        {error ? (
          <p className="p-6 text-center text-sm text-[var(--cromo-fg-muted)]">{t('loadError')}</p>
        ) : !detail ? (
          <div className="h-72 animate-pulse rounded-xl bg-[var(--cromo-surface)]" />
        ) : (
          <TeamDetailPanel detail={detail} />
        )}
      </div>
    </div>,
    document.body,
  );
}
