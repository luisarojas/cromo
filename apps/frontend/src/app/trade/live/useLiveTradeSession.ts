'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchLiveTradeSession,
  liveTradeStreamUrl,
  mintLiveTradeStreamTicket,
  type LiveTradeSession,
} from '@/lib/api';

interface UseLiveTradeSessionArgs {
  sessionId: string;
  /** Host's Bearer access token, or null when the caller is a guest. */
  hostToken?: string | null;
  /** Guest's opaque token, or null when the caller is the host. */
  guestToken?: string | null;
}

interface UseLiveTradeSessionResult {
  session: LiveTradeSession | null;
  error: string | null;
  loading: boolean;
  /** Replace the local session snapshot — used by mutation helpers so the UI
   *  doesn't blink between the API response and the next SSE frame. */
  applySession: (session: LiveTradeSession) => void;
  /** Force a fresh fetch — useful after a stream reconnect. */
  refresh: () => Promise<void>;
}

/**
 * Subscribe to a live-trade session: initial fetch, then EventSource fanout
 * over the SSE channel. Reconnects on transient errors (ticket consumed,
 * server restart) with a small backoff cap.
 */
export function useLiveTradeSession({
  sessionId,
  hostToken,
  guestToken,
}: UseLiveTradeSessionArgs): UseLiveTradeSessionResult {
  const [session, setSession] = useState<LiveTradeSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // We keep the latest token in a ref so the SSE reconnect loop sees the
  // current value without re-running the effect (and dropping the stream)
  // every time the parent's token reference identity changes.
  const authRef = useRef<{ token?: string; guestToken?: string }>({
    token: hostToken ?? undefined,
    guestToken: guestToken ?? undefined,
  });
  useEffect(() => {
    authRef.current = {
      token: hostToken ?? undefined,
      guestToken: guestToken ?? undefined,
    };
  }, [hostToken, guestToken]);

  const auth = (): { token?: string; guestToken?: string } => authRef.current;

  const refresh = useCallback(async () => {
    try {
      const fresh = await fetchLiveTradeSession(sessionId, auth());
      setSession(fresh);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session.');
    }
  }, [sessionId]);

  // Initial fetch.
  useEffect(() => {
    if (!sessionId) return;
    if (!hostToken && !guestToken) {
      // Caller hasn't provided any credentials yet — stay idle.
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchLiveTradeSession(sessionId, auth())
      .then((fresh) => {
        if (cancelled) return;
        setSession(fresh);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load session.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [sessionId, hostToken, guestToken]);

  // SSE subscription with simple reconnect.
  useEffect(() => {
    if (!sessionId) return;
    if (!hostToken && !guestToken) return;
    let cancelled = false;
    let es: EventSource | null = null;
    let reconnectMs = 1000;

    const open = async (): Promise<void> => {
      try {
        const { ticket } = await mintLiveTradeStreamTicket(sessionId, auth());
        if (cancelled) return;
        es = new EventSource(liveTradeStreamUrl(sessionId, ticket));
        es.addEventListener('state', (ev) => {
          try {
            const data = JSON.parse((ev as MessageEvent).data) as { session: LiveTradeSession };
            setSession(data.session);
            reconnectMs = 1000; // healthy connection — reset backoff.
          } catch { /* ignore malformed frame */ }
        });
        // Server signals the session is gone (TTL, deletion). Stop trying to
        // reconnect — there's nothing on the other end.
        es.addEventListener('gone', () => {
          cancelled = true;
          es?.close();
          es = null;
          setSession(null);
          setError('This live-trade session no longer exists.');
        });
        es.addEventListener('error', () => {
          // EventSource auto-reconnects, but on a 401 (e.g. ticket already
          // consumed by a stale reconnect) the browser will keep retrying
          // forever with a 401 ticket. Close and re-mint instead.
          if (cancelled) return;
          es?.close();
          es = null;
          setTimeout(() => { if (!cancelled) open(); }, reconnectMs);
          reconnectMs = Math.min(reconnectMs * 2, 15_000);
        });
      } catch {
        if (cancelled) return;
        setTimeout(() => { if (!cancelled) open(); }, reconnectMs);
        reconnectMs = Math.min(reconnectMs * 2, 15_000);
      }
    };

    open();
    return () => {
      cancelled = true;
      es?.close();
    };
  }, [sessionId, hostToken, guestToken]);

  return { session, error, loading, applySession: setSession, refresh };
}
