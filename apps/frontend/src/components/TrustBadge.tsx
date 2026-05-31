'use client';

import { useEffect, useState } from 'react';
import { fetchUserRatings, type TrustScore, type TrustTier } from '@/lib/api';

const TIER_CONFIG: Record<TrustTier, { label: string; className: string; icon: string }> = {
  new_trader:     { label: 'New Trader',          className: 'text-[var(--cromo-fg-muted)]',   icon: '' },
  good_trader:    { label: 'Good Trader',          className: 'text-[var(--cromo-accent)]',   icon: '' },
  trusted_trader: { label: 'Trusted Trader',       className: 'text-[var(--cromo-success-text)]',  icon: '' },
  caution:        { label: 'Trade with Caution',   className: 'text-[var(--cromo-warning-text)]',  icon: '' },
};

interface Props {
  userId: string;
}

export default function TrustBadge({ userId }: Props) {
  const [trustScore, setTrustScore] = useState<TrustScore | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchUserRatings(userId, undefined, { limit: 1 })
      .then((data) => {
        if (cancelled) return;
        setTrustScore(data.trustScore);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [userId]);

  if (loading) {
    return <span className="inline-block h-4 w-20 rounded bg-[var(--cromo-surface-2)] animate-pulse" />;
  }

  if (!trustScore || trustScore.totalRatings < 3) return null;

  const tier = trustScore.tier;
  const config = TIER_CONFIG[tier];

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${config.className}`}>
      {config.icon && <span aria-hidden>{config.icon}</span>}
      <span>{config.label}</span>
      <span className="text-[var(--cromo-fg-subtle)] font-normal">({trustScore.totalRatings})</span>
    </span>
  );
}
