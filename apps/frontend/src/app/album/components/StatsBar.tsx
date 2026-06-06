'use client';

import type { CollectionStats } from '@/lib/api';

interface Props {
  stats: CollectionStats | null;
  loading: boolean;
  onViewDetailedStats?: () => void;
  isViewingDetailedStats?: boolean;
}

function StatTile({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg bg-[var(--cromo-surface)] border border-[var(--cromo-border)] px-4 py-3 w-full sm:w-auto sm:min-w-[80px]">
      <span className={`text-2xl font-bold ${color}`}>{value}</span>
      <span className="text-xs text-[var(--cromo-fg-muted)] mt-0.5">{label}</span>
    </div>
  );
}

export default function StatsBar({ stats, loading, onViewDetailedStats, isViewingDetailedStats }: Props) {
  const pct = stats?.percentage ?? 0;

  return (
    <div className="flex flex-col gap-3 bg-[var(--cromo-surface-2)] border border-[var(--cromo-border)] rounded-xl p-4">
      {onViewDetailedStats && (
        // Anchored in normal flow rather than absolute-positioned so the
        // mobile grid-cols-2 stat tiles never sit underneath the button.
        // Right-aligned with self-end keeps the desktop appearance unchanged.
        <button
          type="button"
          onClick={onViewDetailedStats}
          className="self-end inline-flex items-center gap-1 text-xs text-[var(--cromo-accent)] hover:underline"
        >
          {isViewingDetailedStats ? (
            <>
              <svg className="w-3 h-3" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 5l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Back to album
            </>
          ) : (
            <>
              View detailed stats
              <svg className="w-3 h-3" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M8 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </>
          )}
        </button>
      )}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-stretch gap-3 sm:justify-start">
        {loading ? (
          [...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-16 w-full sm:w-20 rounded-lg bg-[var(--cromo-surface-2)] animate-pulse"
            />
          ))
        ) : (
          <>
            <StatTile
              label="Total"
              value={stats?.total ?? 0}
              color="text-[var(--cromo-fg)]"
            />
            <StatTile
              label="Owned"
              value={stats?.owned ?? 0}
              color="text-[var(--cromo-success-text)]"
            />
            <StatTile
              label="Missing"
              value={stats?.missing ?? 0}
              color="text-[var(--cromo-danger-text)]"
            />
            <StatTile
              label="Duplicates"
              value={stats?.duplicates ?? 0}
              color="text-[var(--cromo-warning-text)]"
            />
          </>
        )}
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between text-xs text-[var(--cromo-fg-muted)] mb-1">
          <span>Collection progress</span>
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
