'use client';

import { useTranslations } from 'next-intl';
import type { CollectionStats } from '@/lib/api';

interface Props {
  stats: CollectionStats | null;
  loading: boolean;
  onViewDetailedStats?: () => void;
  isViewingDetailedStats?: boolean;
}

export default function StatsBar({ stats, loading, onViewDetailedStats, isViewingDetailedStats }: Props) {
  const t = useTranslations('statsBar');
  const pct = stats?.percentage ?? 0;

  return (
    <div className="flex flex-col gap-3 bg-[var(--cromo-surface-2)] border border-[var(--cromo-border)] rounded-xl p-4">
      {onViewDetailedStats && (
        <button
          type="button"
          onClick={onViewDetailedStats}
          className="self-end inline-flex items-center gap-1.5 rounded-full bg-[var(--cromo-accent-soft)] px-3.5 py-1.5 text-sm font-semibold text-[var(--cromo-accent)] transition hover:opacity-90"
        >
          {isViewingDetailedStats ? (
            <>
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 5l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t('backToAlbum')}
            </>
          ) : (
            <>
              {t('viewDetailedStats')}
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M8 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </>
          )}
        </button>
      )}

      <div>
        <div className="flex items-center justify-between text-xs text-[var(--cromo-fg-muted)] mb-1">
          <span>{t('collectionProgress')}</span>
          <span>{loading ? '…' : `${pct.toFixed(1)}%`}</span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-[var(--cromo-surface)] overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--cromo-success)] transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
