'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { createLiveTradeSession } from '@/lib/api';
import { Card, PageHeader, Alert } from '@/components/ui';

export default function LiveTradeLandingPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const hydrated = useAuthStore((s) => s.hydrated);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!token) return;
    setCreating(true);
    setError(null);
    try {
      const session = await createLiveTradeSession(token);
      router.push(`/trade/live/${session.inviteToken}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
      setCreating(false);
    }
  }

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-[var(--cromo-fg-subtle)] text-sm">
        Loading…
      </div>
    );
  }

  if (!token) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <PageHeader title="Live trade session" subtitle="Sign in to start a live session." />
        <Link href="/login?next=/trade/live" className="inline-flex items-center rounded-btn bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] px-4 py-2 text-sm font-semibold hover:bg-[var(--cromo-accent-strong)] transition-colors">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      <PageHeader
        eyebrow="Trade"
        title="Live trade session"
        subtitle="Trade in real time with another collector. Share the invite link and you both stage stickers and confirm together."
      />

      {error && <Alert tone="danger">{error}</Alert>}

      <Card>
        <ol className="space-y-3 text-sm text-[var(--cromo-fg-muted)] mb-5">
          <li>1. Start a session — you become the host.</li>
          <li>2. Share the invite link with another Cromo collector.</li>
          <li>3. You both stage what you want to swap and confirm in the same room.</li>
        </ol>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="inline-flex items-center rounded-btn bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] px-4 py-2 text-sm font-semibold hover:bg-[var(--cromo-accent-strong)] disabled:opacity-60 transition-colors"
        >
          {creating ? 'Creating session…' : 'Start a live session'}
        </button>
      </Card>

      <p className="text-xs text-[var(--cromo-fg-subtle)]">
        Sessions expire after 30 minutes of inactivity.
      </p>
    </div>
  );
}
