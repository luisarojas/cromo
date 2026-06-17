// Tiny localStorage wrapper for the guest's per-session token. The guest has
// no account, so a browser reload would otherwise lose the session. Keyed by
// session id so two side-by-side sessions don't collide (rare but cheap to
// guard against).

const PREFIX = 'cromo.live-trade.guest.';

export function getGuestToken(sessionId: string): string | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem(`${PREFIX}${sessionId}`); }
  catch { return null; }
}

export function setGuestToken(sessionId: string, token: string): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(`${PREFIX}${sessionId}`, token); }
  catch { /* private mode / quota — fail open */ }
}

export function clearGuestToken(sessionId: string): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(`${PREFIX}${sessionId}`); }
  catch { /* ignore */ }
}
