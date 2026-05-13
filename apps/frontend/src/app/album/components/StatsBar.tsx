'use client';

import type { CollectionStats } from '@/lib/api';

interface Props {
  stats: CollectionStats | null;
  loading: boolean;
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
    <div className="flex flex-col items-center rounded-lg bg-white border border-gray-200 px-4 py-3 shadow-sm min-w-[80px]">
      <span className={`text-2xl font-bold ${color}`}>{value}</span>
      <span className="text-xs text-gray-500 mt-0.5">{label}</span>
    </div>
  );
}

export default function StatsBar({ stats, loading }: Props) {
  const pct = stats?.percentage ?? 0;

  return (
    <div className="flex flex-col gap-3 bg-gray-50 border border-gray-200 rounded-xl p-4">
      <div className="flex flex-wrap gap-3 justify-center sm:justify-start">
        {loading ? (
          <div className="flex gap-3">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="h-16 w-20 rounded-lg bg-gray-200 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <>
            <StatTile
              label="Total"
              value={stats?.total ?? 0}
              color="text-gray-800"
            />
            <StatTile
              label="Owned"
              value={stats?.owned ?? 0}
              color="text-green-600"
            />
            <StatTile
              label="Missing"
              value={stats?.missing ?? 0}
              color="text-red-500"
            />
            <StatTile
              label="Duplicates"
              value={stats?.duplicates ?? 0}
              color="text-amber-500"
            />
          </>
        )}
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span>Collection progress</span>
          <span>{loading ? '…' : `${pct.toFixed(1)}%`}</span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-gray-200 overflow-hidden">
          <div
            className="h-full rounded-full bg-green-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
