'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { joinLiveTradeSession } from '@/lib/api';
import { setGuestToken } from '@/lib/liveTradeStorage';

// Two entry shapes funnel into the same join action:
//   • /join                 → manual code entry.
//   • /join?session=<uuid>  → host's "you should be on this session" deep link;
//                             we treat the uuid as the code (the backend's
//                             resolveSessionId accepts UUIDs too).
//
// On success the guest token is stored under the session id and we forward to
// the room. The room reads the token from localStorage on mount.

function JoinPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const sessionParam = params.get('session');
  const codeParam = params.get('code');
  const initialCode = (codeParam ?? sessionParam ?? '').trim();

  const [code, setCode] = useState(initialCode);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If the URL already carries a code, auto-attempt the join — the typical
  // path from a QR scan is "open URL, hit page, hit join" with no typing.
  useEffect(() => {
    if (initialCode) void handleJoin(initialCode, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleJoin(codeArg: string, labelArg: string) {
    const trimmed = codeArg.trim();
    if (!trimmed) {
      setError('Enter the 6-digit code your trade partner shared.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { guestToken, session } = await joinLiveTradeSession(trimmed, labelArg.trim() || null);
      setGuestToken(session.id, guestToken);
      router.replace(`/trade/live/${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join that session.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-[var(--cromo-fg)] mb-1">Join a live trade</h1>
      <p className="text-sm text-[var(--cromo-fg-muted)] mb-6">
        Enter the 6-digit code your trade partner gave you. No account needed.
      </p>
      <form
        onSubmit={(e) => { e.preventDefault(); void handleJoin(code, label); }}
        className="space-y-4"
      >
        <label className="block">
          <span className="block text-xs font-medium text-[var(--cromo-fg-muted)] mb-1">
            Join code
          </span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
            placeholder="000000"
            className="w-full rounded-md border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-3 py-3 text-center text-2xl font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)]"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-[var(--cromo-fg-muted)] mb-1">
            Your name (optional)
          </span>
          <input
            type="text"
            maxLength={80}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Sofia"
            className="w-full rounded-md border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)]"
          />
        </label>
        {error && (
          <p className="text-sm text-[var(--cromo-danger-text)]">{error}</p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] hover:bg-[var(--cromo-accent-strong)] rounded-md px-4 py-3 text-sm font-semibold disabled:opacity-50"
        >
          {busy ? 'Joining…' : 'Join trade'}
        </button>
      </form>
    </div>
  );
}

// The Next.js client router suspends `useSearchParams` until hydration; wrap
// in a Suspense boundary so the bundle compiles in app-router mode.
export default function JoinPage() {
  return (
    <Suspense>
      <JoinPageInner />
    </Suspense>
  );
}
