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
    <div className="flex items-center gap-3">
      <span className="hidden sm:inline text-xs font-medium text-[var(--cromo-fg-muted)] shrink-0">
        {t('collectionProgress')}
      </span>
      <div className="flex-1 min-w-0 h-1.5 rounded-full bg-[var(--cromo-surface)] overflow-hidden">
        <div
          className="h-full rounded-full bg-[var(--cromo-success)] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-[var(--cromo-fg)] tabular-nums shrink-0">
        {loading ? '…' : `${pct.toFixed(1)}%`}
      </span>
      {onViewDetailedStats && (
        <button
          type="button"
          onClick={onViewDetailedStats}
          className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[var(--cromo-accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--cromo-accent)] transition hover:opacity-90"
        >
          {isViewingDetailedStats ? (
            <>
              <svg className="w-3 h-3" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 5l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="hidden sm:inline">{t('backToAlbum')}</span>
              <span className="sm:hidden">{t('backToAlbumShort')}</span>
            </>
          ) : (
            <>
              <span className="hidden sm:inline">{t('viewDetailedStats')}</span>
              <span className="sm:hidden">{t('viewDetailedStatsShort')}</span>
              <svg className="w-3 h-3" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M8 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </>
          )}
        </button>
      )}
    </div>
  );
}
