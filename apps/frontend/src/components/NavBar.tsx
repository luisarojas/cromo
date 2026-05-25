'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { usePreferencesStore } from '@/store/preferences';
import { logoutApi } from '@/lib/api';
import { CromoLogo } from '@/components/CromoLogo';
import ThemeToggle from '@/components/ThemeToggle';

export default function NavBar() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const resetPreferences = usePreferencesStore((s) => s.reset);

  async function handleLogout() {
    await logoutApi();
    clearAuth();
    resetPreferences();
    router.push('/login');
  }

  return (
    <nav className="bg-[var(--cromo-surface)] border-b border-[var(--cromo-border)] text-[var(--cromo-fg)]">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-6">
        <Link
          href="/"
          className="hover:opacity-80 transition-opacity"
          aria-label="Cromo home"
        >
          <CromoLogo size={26} variant="chrome" markClassName="cromo-shimmer" />
        </Link>

        <div className="flex gap-4 text-sm font-medium">
          <NavLink href="/guide">Guide</NavLink>
          {user && (
            <>
              <NavLink href="/dashboard">Dashboard</NavLink>
              <NavLink href="/album">Collection</NavLink>
              <NavLink href="/trade">Trade</NavLink>
              <NavLink href="/scan">Scan</NavLink>
              {user.role === 'admin' && <NavLink href="/admin">Admin</NavLink>}
            </>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2 text-sm">
          {process.env.NODE_ENV === 'development' && (
            <button
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              className="rounded-chip px-2 py-1 text-xs font-mono bg-[var(--cromo-warning-soft)] text-[var(--cromo-warning)] border border-[var(--cromo-warning)]/30 transition-colors"
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
                className="flex items-center gap-2 rounded-full bg-[var(--cromo-surface-2)] hover:bg-[var(--cromo-surface)] px-3 py-1 text-sm font-medium text-[var(--cromo-fg)] transition-colors border border-transparent hover:border-[var(--cromo-border)]"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--cromo-accent)] text-[10px] font-bold text-[var(--cromo-accent-fg)]">
                  {(user.displayName ?? user.username).charAt(0).toUpperCase()}
                </span>
                {user.displayName ?? `@${user.username}`}
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
                className="rounded-btn bg-[var(--cromo-accent)] hover:bg-[var(--cromo-accent-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--cromo-accent-fg)] transition-colors"
              >
                Register
              </Link>
            </>
          )}
        </div>
      </div>
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
