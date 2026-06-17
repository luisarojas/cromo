'use client';

import type { ReactElement } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { usePreferencesStore } from '@/store/preferences';
import { haptic } from '@/lib/haptics';

// Bottom tab bar for phone-primary use. Renders only when the user is
// authenticated and only at mobile widths — desktop keeps the top NavBar
// links and never sees this. The center Scan slot is intentionally raised
// so it's the thumb-reach default.

interface TabDef {
  href: string;
  label: string;
  match: (path: string) => boolean;
  icon: (active: boolean) => ReactElement;
  emphasis?: boolean;
}

const matchPath = (prefix: string) => (path: string) =>
  path === prefix || path.startsWith(prefix + '/');

export default function MobileTabBar() {
  const pathname = usePathname() || '/';
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const tradeMatchingEnabled = usePreferencesStore((s) => s.tradeMatchingEnabled);

  // Don't render until we know whether the user is signed in — avoids a flash
  // of the unauth state, then a flash of the auth state, on every cold load.
  if (!hydrated) return null;
  if (!user) return null;

  const tabs: TabDef[] = [
    {
      href: '/dashboard',
      label: 'Home',
      match: matchPath('/dashboard'),
      icon: (active) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-5 w-5">
          <path d="M3 11.5L12 4l9 7.5" />
          <path d="M5 10v10h14V10" />
        </svg>
      ),
    },
    {
      href: '/collection',
      label: 'Album',
      match: matchPath('/collection'),
      icon: (active) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-5 w-5">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M4 9h16M9 4v16" />
        </svg>
      ),
    },
    {
      href: '/scan',
      label: 'Scan',
      match: matchPath('/scan'),
      emphasis: true,
      icon: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-6 w-6">
          <path d="M4 7V5a1 1 0 011-1h2M17 4h2a1 1 0 011 1v2M20 17v2a1 1 0 01-1 1h-2M7 20H5a1 1 0 01-1-1v-2" />
          <circle cx="12" cy="12" r="3.5" />
        </svg>
      ),
    },
    ...(tradeMatchingEnabled
      ? [{
          href: '/trade',
          label: 'Trade',
          match: matchPath('/trade'),
          icon: (active: boolean) => (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-5 w-5">
              <path d="M7 7h13l-3-3M17 17H4l3 3" />
            </svg>
          ),
        }]
      : []),
    {
      href: `/profile/${user.username}`,
      label: 'Profile',
      match: (path: string) => path.startsWith('/profile') || path.startsWith('/settings'),
      icon: (active) => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-5 w-5">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c1.6-4.2 5-6 8-6s6.4 1.8 8 6" />
        </svg>
      ),
    },
  ];

  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-[var(--cromo-border)] bg-[var(--cromo-surface)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--cromo-surface)]/80"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <ul className="grid grid-cols-5 h-14">
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          return (
            <li key={tab.href} className="flex items-stretch">
              <Link
                href={tab.href}
                onClick={() => haptic('tap')}
                aria-current={active ? 'page' : undefined}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                  active ? 'text-[var(--cromo-accent)]' : 'text-[var(--cromo-fg-muted)]'
                }`}
              >
                {tab.emphasis ? (
                  <span
                    className={`-mt-5 flex h-12 w-12 items-center justify-center rounded-full border-4 border-[var(--cromo-bg)] shadow-cromo-lg transition-colors ${
                      active
                        ? 'bg-[var(--cromo-accent-strong)] text-[var(--cromo-accent-fg)]'
                        : 'bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)]'
                    }`}
                  >
                    {tab.icon(active)}
                  </span>
                ) : (
                  tab.icon(active)
                )}
                <span className={tab.emphasis ? 'mt-0.5' : ''}>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
