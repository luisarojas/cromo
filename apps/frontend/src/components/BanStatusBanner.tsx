'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { fetchBanStatus, type BanStatusResult } from '@/lib/api';

export default function BanStatusBanner() {
  const token = useAuthStore((s) => s.token);
  const [status, setStatus] = useState<BanStatusResult | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus(null);
      return;
    }

    let cancelled = false;
    fetchBanStatus(token)
      .then((result) => { if (!cancelled) setStatus(result); })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [token]);

  if (!status || !status.banned) return null;

  const isSoft = status.type === 'soft';

  return (
    <div
      className={`w-full px-4 py-2.5 text-sm font-medium text-center ${
        isSoft
          ? 'bg-[var(--cromo-warning-soft)] text-yellow-800 border-b border-[var(--cromo-warning)]/30'
          : 'bg-[var(--cromo-danger-soft)] text-red-800 border-b border-[var(--cromo-danger)]/30'
      }`}
    >
      {status.message}
      {status.expiresAt && (
        <span className="ml-2 font-normal opacity-80">
          Expires {new Date(status.expiresAt).toLocaleString()}
        </span>
      )}
    </div>
  );
}
