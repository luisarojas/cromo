'use client';

import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useHotkeys } from '@/lib/hotkeys';

// Wires the small set of always-on navigation chords (g d, g a, g s, g t).
// Lives at the layout level so they work on every page. The palette and
// cheatsheet own their own hotkeys; this is just the "go" shortcuts.

export default function GlobalHotkeys() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  // Only fire auth-gated chords when the user is actually signed in. Without
  // this guard the chord still "works" — it routes to /dashboard which then
  // bounces to /login — but the cheatsheet advertises them as universal, and
  // the bounce surprises unauthenticated users typing chords by accident.
  const authed = !!user;

  useHotkeys('g d', () => router.push('/dashboard'), { enabled: authed });
  useHotkeys('g a', () => router.push('/album'),     { enabled: authed });
  useHotkeys('g s', () => router.push('/scan'),      { enabled: authed });
  useHotkeys('g t', () => router.push('/trade'),     { enabled: authed });
  useHotkeys('g p', () => user && router.push(`/profile/${user.username}`), { enabled: authed });
  useHotkeys('g ,', () => router.push('/settings'),  { enabled: authed });

  return null;
}
