'use client';

import { useEffect, useState } from 'react';
import { fetchUserRatings, type TrustScore, type TrustTier, type TradeRating } from '@/lib/api';

const TIER_CONFIG: Record<TrustTier, { label: string; className: string; icon: string }> = {
  new_trader:     { label: 'New Trader',          className: 'text-gray-500',   icon: '' },
  good_trader:    { label: 'Good Trader',          className: 'text-blue-600',   icon: '' },
  trusted_trader: { label: 'Trusted Trader',       className: 'text-green-600',  icon: '' },
  caution:        { label: 'Trade with Caution',   className: 'text-amber-600',  icon: '' },
};

interface Props {
  userId: string;
  size?: 'small' | 'large';
}

export default function TrustBadge({ userId, size = 'small' }: Props) {
  const [trustScore, setTrustScore] = useState<TrustScore | null>(null);
  const [recentRatings, setRecentRatings] = useState<TradeRating[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchUserRatings(userId, undefined, { limit: size === 'large' ? 5 : 1 })
      .then((data) => {
        if (cancelled) return;
        setTrustScore(data.trustScore);
        if (size === 'large') setRecentRatings(data.items);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [userId, size]);

  if (loading) {
    return <span className="inline-block h-4 w-20 rounded bg-gray-100 animate-pulse" />;
  }

  if (!trustScore) return null;

  const tier = trustScore.tier;
  const config = TIER_CONFIG[tier];

  if (size === 'small') {
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-medium ${config.className}`}>
        {config.icon && <span aria-hidden>{config.icon}</span>}
        <span>{config.label}</span>
        {trustScore.totalRatings > 0 && (
          <span className="text-gray-400 font-normal">({trustScore.totalRatings})</span>
        )}
      </span>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-2 font-semibold ${config.className}`}>
          {config.icon && <span className="text-lg" aria-hidden>{config.icon}</span>}
          <span>{config.label}</span>
        </div>
        {trustScore.totalRatings > 0 && (
          <span className="text-xs text-gray-400">
            {trustScore.positiveCount}/{trustScore.totalRatings} positive ({trustScore.positivePercent}%)
          </span>
        )}
      </div>

      {trustScore.totalRatings === 0 && (
        <p className="text-xs text-gray-400">No trade ratings yet.</p>
      )}

      {recentRatings.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Recent Feedback</h4>
          {recentRatings.map((r) => (
            <div key={r.id} className="flex items-start gap-2 text-sm">
              <span
                className={`mt-0.5 shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  r.isPositive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}
                aria-label={r.isPositive ? 'Positive' : 'Negative'}
              >
                {r.isPositive ? '+' : '-'}
              </span>
              <div className="min-w-0">
                <span className="text-gray-500 text-xs">@{r.raterUsername}</span>
                {r.comment && (
                  <p className="text-gray-700 text-sm mt-0.5 truncate">{r.comment}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
