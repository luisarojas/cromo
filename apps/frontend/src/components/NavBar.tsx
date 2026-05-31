'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { usePreferencesStore } from '@/store/preferences';
import { logoutApi } from '@/lib/api';
import { CromoLogo } from '@/components/CromoLogo';
import ThemeToggle from '@/components/ThemeToggle';

export default function NavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const resetPreferences = usePreferencesStore((s) => s.reset);
  const tradeMatchingEnabled = usePreferencesStore((s) => s.tradeMatchingEnabled);

  const [menuOpen, setMenuOpen] = useState(false);

  // Close the drawer whenever the route changes so navigating from inside
  // the menu doesn't leave it open over the new page.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Lock background scroll while the drawer is open on mobile.
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  async function handleLogout() {
    await logoutApi();
    clearAuth();
    resetPreferences();
    router.push('/login');
  }

  const isDev = process.env.NODE_ENV === 'development';

  return (
    <nav className="bg-[var(--cromo-surface)] border-b border-[var(--cromo-border)] text-[var(--cromo-fg)] relative z-40">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-4 md:gap-6">
        <Link
          href="/"
          className="flex items-center hover:opacity-80 transition-opacity shrink-0"
          aria-label="Cromo home"
        >
          <CromoLogo size={26} variant="chrome" />
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-4 text-sm font-medium">
          {user && (
            <>
              <NavLink href="/dashboard">Dashboard</NavLink>
              <NavLink href="/album">Collection</NavLink>
              {tradeMatchingEnabled && <NavLink href="/trade">Trade</NavLink>}
              <NavLink href="/scan">Scan</NavLink>
            </>
          )}
          <NavLink href="/guide">Guides</NavLink>
          {user?.role === 'admin' && <NavLink href="/admin">Admin</NavLink>}
        </div>

        {/* Desktop right cluster */}
        <div className="ml-auto hidden md:flex items-center gap-3 text-sm">
          {isDev && (
            <button
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              className="rounded-chip px-2 py-1 text-xs font-mono bg-[var(--cromo-warning-soft)] text-[var(--cromo-warning-text)] border border-[var(--cromo-warning)]/30 transition-colors"
              title="Clear localStorage and reload"
            >
              clear cache
            </button>
          )}
          <ThemeToggle compact />
          {user ? (
            <>
              <Link
                href={`/profile/${user.username}`}
                className="flex items-center gap-2 rounded-full bg-[var(--cromo-surface-2)] hover:bg-[var(--cromo-surface)] px-3 py-1 text-sm font-medium text-[var(--cromo-fg)] transition-colors border border-transparent hover:border-[var(--cromo-border)] max-w-[10rem]"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--cromo-accent)] text-[10px] font-bold text-[var(--cromo-accent-fg)]">
                  {(user.displayName ?? user.username).charAt(0).toUpperCase()}
                </span>
                <span className="truncate">{user.displayName ?? `@${user.username}`}</span>
              </Link>
              <NavLink href="/settings">Settings</NavLink>
              <button
                onClick={handleLogout}
                className="text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)] transition-colors"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <NavLink href="/login">Log in</NavLink>
              <Link
                href="/register"
                className="rounded-btn bg-[var(--cromo-accent)] hover:bg-[var(--cromo-accent-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--cromo-accent-fg)] transition-colors ml-1"
              >
                Register
              </Link>
            </>
          )}
        </div>

        {/* Mobile right cluster */}
        <div className="ml-auto flex md:hidden items-center gap-2">
          <ThemeToggle compact />
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav-drawer"
            className="flex h-10 w-10 items-center justify-center rounded-btn text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)] transition-colors"
          >
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <>
          {/* Scrim */}
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="md:hidden fixed inset-0 top-14 bg-black/40 backdrop-blur-sm z-30"
          />
          <div
            id="mobile-nav-drawer"
            className="md:hidden absolute left-0 right-0 top-full z-40 bg-[var(--cromo-surface)] border-b border-[var(--cromo-border)] shadow-cromo-lg"
          >
            <div className="px-4 py-4 flex flex-col gap-1">
              {user && (
                <>
                  <DrawerLink href="/dashboard">Dashboard</DrawerLink>
                  <DrawerLink href="/album">Collection</DrawerLink>
                  {tradeMatchingEnabled && <DrawerLink href="/trade">Trade</DrawerLink>}
                  <DrawerLink href="/scan">Scan</DrawerLink>
                </>
              )}
              <DrawerLink href="/guide">Guides</DrawerLink>
              {user?.role === 'admin' && <DrawerLink href="/admin">Admin</DrawerLink>}

              <div className="my-2 h-px bg-[var(--cromo-border)]" />

              {user ? (
                <>
                  <Link
                    href={`/profile/${user.username}`}
                    className="flex items-center gap-3 rounded-btn px-3 py-3 text-sm font-medium text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)] transition-colors"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--cromo-accent)] text-xs font-bold text-[var(--cromo-accent-fg)]">
                      {(user.displayName ?? user.username).charAt(0).toUpperCase()}
                    </span>
                    <span className="truncate">{user.displayName ?? `@${user.username}`}</span>
                  </Link>
                  <DrawerLink href="/settings">Settings</DrawerLink>
                  <button
                    onClick={handleLogout}
                    className="text-left rounded-btn px-3 py-3 text-sm font-medium text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)] transition-colors"
                  >
                    Log out
                  </button>
                </>
              ) : (
                <>
                  <DrawerLink href="/login">Log in</DrawerLink>
                  <Link
                    href="/register"
                    className="rounded-btn bg-[var(--cromo-accent)] hover:bg-[var(--cromo-accent-strong)] px-3 py-3 text-sm font-semibold text-[var(--cromo-accent-fg)] text-center transition-colors"
                  >
                    Register
                  </Link>
                </>
              )}

              {isDev && (
                <>
                  <div className="my-2 h-px bg-[var(--cromo-border)]" />
                  <button
                    onClick={() => {
                      localStorage.clear();
                      window.location.reload();
                    }}
                    className="rounded-btn px-3 py-2 text-xs font-mono bg-[var(--cromo-warning-soft)] text-[var(--cromo-warning-text)] border border-[var(--cromo-warning)]/30 self-start"
                    title="Clear localStorage and reload"
                  >
                    clear cache
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </nav>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)] transition-colors"
    >
      {children}
    </Link>
  );
}

function DrawerLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-btn px-3 py-3 text-sm font-medium text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)] transition-colors"
    >
      {children}
    </Link>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
