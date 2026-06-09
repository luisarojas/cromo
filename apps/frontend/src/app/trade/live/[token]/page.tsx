'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import {
  fetchLiveTradeSession,
  fetchLiveTradeActions,
  joinLiveTradeSession,
  sendLiveTradeAction,
  type LiveTradeSession,
  type LiveTradeAction,
} from '@/lib/api';
import { Alert, Card } from '@/components/ui';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

// Normalise free-text sticker code lists ("BRA5, ARG10\nFWC1") into a
// stable set we can broadcast. We keep this very loose for v1 — the room
// is a negotiation surface, so codes that fail strict validation here
// would just confuse two collectors who are otherwise on the same page.
function parseCodes(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,;\n]+/)
        .map((s) => s.trim().toUpperCase())
        .filter((s) => /^[A-Z0-9-]{2,12}$/.test(s)),
    ),
  );
}

interface StagedSnapshot {
  hostCodes: string[];
  guestCodes: string[];
}

// Replay every action to derive the current staged snapshot. The action
// log is the source of truth — the session row only tracks who confirmed
// — so any divergence between two clients resolves on the next read.
function reduceStaged(session: LiveTradeSession, actions: LiveTradeAction[]): StagedSnapshot {
  let hostCodes: string[] = [];
  let guestCodes: string[] = [];
  for (const a of actions) {
    if (a.actionType !== 'stage_offer' && a.actionType !== 'unstage_offer') continue;
    const codes = Array.isArray(a.payload?.codes)
      ? (a.payload!.codes as unknown[]).filter((c): c is string => typeof c === 'string')
      : [];
    if (a.userId === session.hostUserId) {
      hostCodes = a.actionType === 'stage_offer' ? codes : [];
    } else if (a.userId === session.guestUserId) {
      guestCodes = a.actionType === 'stage_offer' ? codes : [];
    }
  }
  return { hostCodes, guestCodes };
}

interface ChatLine {
  id: string;
  who: string | null;
  text: string;
  at: string;
  system: boolean;
}

function reduceChat(actions: LiveTradeAction[]): ChatLine[] {
  return actions
    .filter((a) => a.actionType === 'message')
    .map((a) => ({
      id: a.id,
      who: a.username,
      text: typeof a.payload?.text === 'string' ? (a.payload.text as string) : '',
      at: a.createdAt,
      system: a.payload?.kind === 'system',
    }));
}

export default function LiveTradeRoomPage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const inviteToken = params?.token ?? '';
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);

  const [session, setSession] = useState<LiveTradeSession | null>(null);
  const [actions, setActions] = useState<LiveTradeAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [draftMessage, setDraftMessage] = useState('');
  const [draftCodes, setDraftCodes] = useState('');
  const [busy, setBusy] = useState(false);

  const lastSeenIdRef = useRef<string | null>(null);

  // Load + try to join. Joining is a no-op for the host and idempotent
  // for the guest, so calling it unconditionally simplifies the flow.
  useEffect(() => {
    if (!hydrated || !authToken || !inviteToken) return;
    let cancelled = false;
    (async () => {
      try {
        let s = await fetchLiveTradeSession(inviteToken, authToken);
        if (!cancelled && user && s.hostUserId !== user.id && !s.guestUserId) {
          s = await joinLiveTradeSession(inviteToken, authToken);
        }
        if (cancelled) return;
        setSession(s);
        const history = await fetchLiveTradeActions(inviteToken, authToken);
        if (cancelled) return;
        setActions(history);
        if (history.length > 0) {
          lastSeenIdRef.current = history[history.length - 1]!.id;
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load session');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [hydrated, authToken, inviteToken, user]);

  // Open the SSE stream and merge incoming events into local state.
  // EventSource doesn't support custom headers — auth uses the existing
  // session cookie (the same path that powers /api/v1/trade/:id/stream).
  useEffect(() => {
    if (!session) return;
    const url = `${API_BASE}/api/v1/trade/live/${encodeURIComponent(inviteToken)}/stream`;
    const es = new EventSource(url, { withCredentials: true });
    es.addEventListener('action', (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as LiveTradeAction;
        setActions((prev) => {
          if (prev.some((a) => a.id === data.id)) return prev;
          lastSeenIdRef.current = data.id;
          return [...prev, data];
        });
        // A confirm/close also mutates the session row — re-fetch lazily
        // so the status pill updates without a manual reload.
        if (data.actionType === 'confirm' || data.actionType === 'unconfirm' || data.actionType === 'close') {
          if (authToken) {
            void fetchLiveTradeSession(inviteToken, authToken).then((s) => setSession(s)).catch(() => {});
          }
        }
      } catch {
        // ignore malformed event
      }
    });
    es.onerror = () => {
      // EventSource auto-reconnects with the last-event-id header set by the
      // browser. Nothing to do here beyond letting the connection settle.
    };
    return () => es.close();
  }, [session, inviteToken, authToken]);

  const staged = useMemo(
    () => (session ? reduceStaged(session, actions) : { hostCodes: [], guestCodes: [] }),
    [session, actions],
  );
  const chat = useMemo(() => reduceChat(actions), [actions]);

  const isHost = !!session && session.hostUserId === user?.id;
  const isGuest = !!session && session.guestUserId === user?.id;

  const handleSendMessage = useCallback(async () => {
    if (!authToken || !draftMessage.trim()) return;
    setBusy(true);
    try {
      await sendLiveTradeAction(inviteToken, 'message', { text: draftMessage.trim() }, authToken);
      setDraftMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setBusy(false);
    }
  }, [authToken, draftMessage, inviteToken]);

  const handleStage = useCallback(async () => {
    if (!authToken) return;
    const codes = parseCodes(draftCodes);
    if (codes.length === 0) {
      setError('Add at least one sticker code (e.g. BRA5)');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await sendLiveTradeAction(inviteToken, 'stage_offer', { codes }, authToken);
      setDraftCodes('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stage');
    } finally {
      setBusy(false);
    }
  }, [authToken, draftCodes, inviteToken]);

  const handleUnstage = useCallback(async () => {
    if (!authToken) return;
    setBusy(true);
    try {
      await sendLiveTradeAction(inviteToken, 'unstage_offer', {}, authToken);
    } finally {
      setBusy(false);
    }
  }, [authToken, inviteToken]);

  const myConfirmed = isHost ? !!session?.hostConfirmedAt : !!session?.guestConfirmedAt;

  const handleConfirm = useCallback(async () => {
    if (!authToken) return;
    setBusy(true);
    try {
      await sendLiveTradeAction(
        inviteToken,
        myConfirmed ? 'unconfirm' : 'confirm',
        {},
        authToken,
      );
    } finally {
      setBusy(false);
    }
  }, [authToken, inviteToken, myConfirmed]);

  const handleClose = useCallback(async () => {
    if (!authToken) return;
    if (!confirm('Close this session? Both collectors will lose access.')) return;
    setBusy(true);
    try {
      await sendLiveTradeAction(inviteToken, 'close', {}, authToken);
      router.push('/trade');
    } finally {
      setBusy(false);
    }
  }, [authToken, inviteToken, router]);

  const inviteUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/trade/live/${inviteToken}`;
  }, [inviteToken]);

  const handleCopyInvite = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard refused — fall through, the URL is visible in the input
    }
  }, [inviteUrl]);

  if (!hydrated || loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-[var(--cromo-fg-subtle)] text-sm">
        Loading…
      </div>
    );
  }
  if (!authToken) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <p className="text-sm text-[var(--cromo-fg-muted)] mb-3">Sign in to join this live trade session.</p>
        <Link
          href={`/login?next=${encodeURIComponent(`/trade/live/${inviteToken}`)}`}
          className="inline-flex items-center rounded-btn bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] px-4 py-2 text-sm font-semibold"
        >
          Sign in
        </Link>
      </div>
    );
  }
  if (!session) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <Alert tone="danger">{error ?? 'Session not found.'}</Alert>
      </div>
    );
  }

  const sessionEnded = session.status === 'closed' || session.status === 'expired';

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-5">
      {/* Header — participants + status */}
      <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <ParticipantChip label="Host" p={session.host} confirmed={!!session.hostConfirmedAt} />
            <span className="text-[var(--cromo-fg-subtle)] text-lg">⇄</span>
            {session.guest ? (
              <ParticipantChip label="Guest" p={session.guest} confirmed={!!session.guestConfirmedAt} />
            ) : (
              <span className="text-sm text-[var(--cromo-fg-subtle)] italic">Waiting for guest…</span>
            )}
          </div>
          <StatusPill status={session.status} />
        </div>

        {/* Invite URL — host only */}
        {isHost && !sessionEnded && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={inviteUrl}
              className="flex-1 min-w-[200px] rounded-md border border-[var(--cromo-border)] bg-[var(--cromo-surface-2)] px-3 py-1.5 text-xs font-mono text-[var(--cromo-fg-muted)]"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              onClick={handleCopyInvite}
              className="rounded-btn border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface-2)] px-3 py-1.5 text-xs font-medium text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]"
            >
              {copied ? 'Copied!' : 'Copy invite'}
            </button>
          </div>
        )}
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      {sessionEnded && (
        <Alert tone="info">
          This session is {session.status}. Open a new one from <Link className="underline" href="/trade/live">Live trade</Link>.
        </Alert>
      )}

      {/* Staged offers — side by side */}
      <div className="grid gap-4 sm:grid-cols-2">
        <OfferPane
          title={isHost ? 'Your offer' : `${labelFor(session.host)}'s offer`}
          codes={staged.hostCodes}
          isOwn={isHost}
        />
        <OfferPane
          title={isGuest ? 'Your offer' : session.guest ? `${labelFor(session.guest)}'s offer` : 'Guest offer'}
          codes={staged.guestCodes}
          isOwn={isGuest}
        />
      </div>

      {/* Compose staged offer */}
      {(isHost || isGuest) && !sessionEnded && (
        <Card>
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--cromo-fg-muted)] mb-2">
            Stage your offer
          </label>
          <textarea
            value={draftCodes}
            onChange={(e) => setDraftCodes(e.target.value)}
            placeholder="BRA5, ARG10, FWC1…"
            rows={2}
            className="w-full rounded-md border border-[var(--cromo-border)] bg-[var(--cromo-surface-2)] px-3 py-2 text-sm font-mono text-[var(--cromo-fg)] placeholder:text-[var(--cromo-fg-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)]/40"
          />
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={handleStage}
              disabled={busy || !draftCodes.trim()}
              className="rounded-btn bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--cromo-accent-strong)] disabled:opacity-60"
            >
              Stage
            </button>
            <button
              onClick={handleUnstage}
              disabled={busy}
              className="rounded-btn border border-[var(--cromo-border)] bg-[var(--cromo-surface-2)] px-3 py-1.5 text-xs font-medium text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)] disabled:opacity-60"
            >
              Clear my offer
            </button>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={handleConfirm}
                disabled={busy}
                className={`rounded-btn px-3 py-1.5 text-xs font-semibold transition-colors ${
                  myConfirmed
                    ? 'bg-[var(--cromo-success-soft)] text-[var(--cromo-success-text)] border border-[var(--cromo-success)]/30'
                    : 'bg-[var(--cromo-surface-2)] border border-[var(--cromo-border-strong)] text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]'
                }`}
              >
                {myConfirmed ? '✓ Confirmed (click to unconfirm)' : 'Confirm'}
              </button>
              <button
                onClick={handleClose}
                disabled={busy}
                className="rounded-btn px-3 py-1.5 text-xs font-medium text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-danger-text)] disabled:opacity-60"
              >
                Close session
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Chat */}
      <Card>
        <div className="text-xs font-semibold uppercase tracking-wider text-[var(--cromo-fg-muted)] mb-2">
          Conversation
        </div>
        <div className="max-h-72 overflow-y-auto space-y-2 pb-2">
          {chat.length === 0 && (
            <p className="text-xs text-[var(--cromo-fg-subtle)] italic">No messages yet. Say hi.</p>
          )}
          {chat.map((line) => (
            <div key={line.id} className="text-sm">
              {line.system ? (
                <p className="text-xs italic text-[var(--cromo-fg-subtle)]">{line.text}</p>
              ) : (
                <p className="text-[var(--cromo-fg)]">
                  <span className="font-semibold text-[var(--cromo-fg-muted)]">{line.who ?? '?'}</span>
                  <span className="text-[var(--cromo-fg-subtle)]"> · </span>
                  {line.text}
                </p>
              )}
            </div>
          ))}
        </div>
        {!sessionEnded && (
          <div className="mt-3 flex items-center gap-2">
            <input
              value={draftMessage}
              onChange={(e) => setDraftMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSendMessage(); }
              }}
              placeholder="Type a message…"
              className="flex-1 rounded-md border border-[var(--cromo-border)] bg-[var(--cromo-surface-2)] px-3 py-2 text-sm text-[var(--cromo-fg)] placeholder:text-[var(--cromo-fg-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)]/40"
            />
            <button
              onClick={handleSendMessage}
              disabled={busy || !draftMessage.trim()}
              className="rounded-btn bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] px-3 py-2 text-sm font-semibold disabled:opacity-60"
            >
              Send
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}

function labelFor(p: { displayName: string | null; username: string }): string {
  return p.displayName ?? `@${p.username}`;
}

function ParticipantChip({
  label,
  p,
  confirmed,
}: {
  label: string;
  p: { displayName: string | null; username: string; avatarUrl: string | null };
  confirmed: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--cromo-accent)] text-sm font-bold text-[var(--cromo-accent-fg)]">
        {labelFor(p).charAt(label === 'Host' ? 0 : 0).toUpperCase()}
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] uppercase tracking-wider text-[var(--cromo-fg-subtle)]">{label}</span>
        <span className="text-sm font-semibold text-[var(--cromo-fg)] flex items-center gap-1">
          {labelFor(p)}
          {confirmed && <span className="text-[var(--cromo-success-text)]" title="Confirmed">✓</span>}
        </span>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: LiveTradeSession['status'] }) {
  const tone: Record<LiveTradeSession['status'], string> = {
    open:      'bg-[var(--cromo-accent-soft)] text-[var(--cromo-accent)] border-[var(--cromo-accent)]/30',
    joined:    'bg-[var(--cromo-accent-soft)] text-[var(--cromo-accent)] border-[var(--cromo-accent)]/30',
    confirmed: 'bg-[var(--cromo-success-soft)] text-[var(--cromo-success-text)] border-[var(--cromo-success)]/30',
    closed:    'bg-[var(--cromo-surface-2)] text-[var(--cromo-fg-muted)] border-[var(--cromo-border-strong)]',
    expired:   'bg-[var(--cromo-surface-2)] text-[var(--cromo-fg-subtle)] border-[var(--cromo-border-strong)]',
  };
  return (
    <span className={`text-[11px] font-semibold uppercase tracking-wider rounded-full border px-2.5 py-1 ${tone[status]}`}>
      {status}
    </span>
  );
}

function OfferPane({
  title,
  codes,
  isOwn,
}: {
  title: string;
  codes: string[];
  isOwn: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${isOwn ? 'border-[var(--cromo-accent)]/30 bg-[var(--cromo-accent)]/5' : 'border-[var(--cromo-border)] bg-[var(--cromo-surface)]'}`}>
      <div className="text-xs font-semibold uppercase tracking-wider text-[var(--cromo-fg-muted)] mb-3">
        {title}
      </div>
      {codes.length === 0 ? (
        <p className="text-xs italic text-[var(--cromo-fg-subtle)]">Nothing staged yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {codes.map((c) => (
            <li key={c} className="rounded-md border border-[var(--cromo-border)] bg-[var(--cromo-surface-2)] px-2 py-0.5 text-xs font-mono text-[var(--cromo-fg)]">
              {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
