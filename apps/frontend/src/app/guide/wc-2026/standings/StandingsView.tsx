'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { fetchWcOverview, type WcOverview } from '@/lib/api';
import GroupsView from './GroupsView';
import BracketView from './BracketView';
import TeamView from './TeamView';
import TeamModal from './TeamModal';

type Tab = 'bracket' | 'groups' | 'teams';
const TABS: Tab[] = ['bracket', 'groups', 'teams'];

export default function StandingsView() {
  const t = useTranslations('wc2026Standings');
  const router = useRouter();
  const params = useSearchParams();
  const initial = (params.get('view') as Tab) ?? 'groups';
  const [tab, setTab] = useState<Tab>(TABS.includes(initial) ? initial : 'groups');

  const [overview, setOverview] = useState<WcOverview | null>(null);
  const [error, setError] = useState(false);
  const [modalTeam, setModalTeam] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchWcOverview()
      .then((o) => live && setOverview(o))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, []);

  const selectTab = (next: Tab) => {
    setTab(next);
    const qs = new URLSearchParams(Array.from(params.entries()));
    qs.set('view', next);
    router.replace(`?${qs.toString()}`, { scroll: false });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <Link
        href="/guide/wc-2026"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)] transition-colors"
      >
        <span aria-hidden>←</span> {t('backToGuide')}
      </Link>

      <header className="space-y-1.5">
        <span className="inline-flex items-center rounded-full cromo-chrome-fill px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#0E1117]">
          {t('badge')}
        </span>
        <h1 className="font-display text-3xl font-bold tracking-tight cromo-chrome-text">{t('title')}</h1>
        <p className="text-sm text-[var(--cromo-fg-muted)]">{t('subtitle')}</p>
      </header>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label={t('title')}
        className="flex gap-1 rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-1"
      >
        {TABS.map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => selectTab(id)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              tab === id
                ? 'bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)]'
                : 'text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)] hover:text-[var(--cromo-fg)]'
            }`}
          >
            {t(`tabs.${id}`)}
          </button>
        ))}
      </div>

      {overview?.dataSource === 'sample' && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-lg border border-[var(--cromo-warning)]/30 bg-[var(--cromo-warning-soft)] px-4 py-3"
        >
          <span aria-hidden className="mt-0.5 shrink-0 text-base leading-none text-[var(--cromo-warning-text)]">⚠</span>
          <p className="text-xs leading-relaxed text-[var(--cromo-warning-text)]">{t('sampleBanner')}</p>
        </div>
      )}

      {error ? (
        <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-8 text-center text-sm text-[var(--cromo-fg-muted)]">
          {t('loadError')}
        </div>
      ) : !overview ? (
        <LoadingSkeleton label={t('loading')} />
      ) : (
        <>
          {tab === 'bracket' && <BracketView overview={overview} onSelectTeam={setModalTeam} />}
          {tab === 'groups' && <GroupsView overview={overview} onSelectTeam={setModalTeam} />}
          {tab === 'teams' && <TeamView overview={overview} />}
        </>
      )}

      <p className="text-xs text-[var(--cromo-fg-subtle)] leading-relaxed">{t('disclaimer')}</p>

      {modalTeam && <TeamModal code={modalTeam} onClose={() => setModalTeam(null)} />}
    </div>
  );
}

function LoadingSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-3" aria-live="polite" aria-busy>
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-28 animate-pulse rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)]"
        />
      ))}
    </div>
  );
}
