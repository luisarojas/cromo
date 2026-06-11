'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { redeemTradeInvite } from '@/lib/api';
import { Alert } from '@/components/ui';

// Landing page for QR scans / shared invite URLs. The page exists solely to
// consume the single-use token and forward the scanner to the same propose-
// trade entry the profile's "Start a trade" button uses, so nothing about
// the downstream flow differs from the async path.

export default function TradeInviteRedeemPage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const inviteToken = params?.token ?? '';
  const authToken = useAuthStore((s) => s.token);
  const hydrated = useAuthStore((s) => s.hydrated);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated || !inviteToken) return;
    if (!authToken) {
      router.replace(`/login?next=${encodeURIComponent(`/trade/invite/${inviteToken}`)}`);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { hostUsername } = await redeemTradeInvite(inviteToken, authToken);
        if (cancelled) return;
        router.replace(`/trade?tab=find&recipient=${encodeURIComponent(hostUsername)}`);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to redeem invite.');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [hydrated, authToken, inviteToken, router]);

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-[var(--cromo-fg-subtle)] text-sm">
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-4">
        <Alert tone="danger">{error}</Alert>
        <Link
          href="/trade"
          className="inline-flex items-center rounded-btn bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] px-4 py-2 text-sm font-semibold"
        >
          Back to Trade
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[40vh] text-[var(--cromo-fg-subtle)] text-sm">
      Redeeming invite…
    </div>
  );
}
