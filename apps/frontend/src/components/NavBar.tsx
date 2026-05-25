'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { usePreferencesStore } from '@/store/preferences';
import { logoutApi } from '@/lib/api';
import { CromoLogo } from '@/components/CromoLogo';

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
    <nav
      className="border-b"
      style={{
        background: 'var(--cromo-surface)',
        borderColor: 'var(--cromo-border)',
        color: 'var(--cromo-fg)',
      }}
    >
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-6">
        <Link
          href="/"
          className="hover:opacity-80 transition-opacity"
          aria-label="Cromo home"
        >
          <CromoLogo size={26} variant="accent" />
        </Link>

        <div className="flex gap-4 text-sm font-medium">
          <Link
            href="/guide"
            className="transition-colors"
            style={{ color: 'var(--cromo-fg-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--cromo-fg)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--cromo-fg-muted)')}
          >
            Guide
          </Link>
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

        <div className="ml-auto flex items-center gap-3 text-sm">
          {process.env.NODE_ENV === 'development' && (
            <button
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              className="rounded-chip px-2 py-1 text-xs font-mono transition-colors"
              style={{
                background: 'rgba(251, 191, 36, 0.12)',
                color: '#FBBF24',
                border: '1px solid rgba(251, 191, 36, 0.3)',
              }}
              title="Clear localStorage and reload"
            >
              clear cache
            </button>
          )}
          {user ? (
            <>
              <Link
                href={`/profile/${user.username}`}
                className="flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium transition-colors"
                style={{
                  background: 'var(--cromo-surface-2)',
                  color: 'var(--cromo-fg)',
                }}
              >
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                  style={{
                    background: 'var(--cromo-accent)',
                    color: 'var(--cromo-bg)',
                  }}
                >
                  {(user.displayName ?? user.username).charAt(0).toUpperCase()}
                </span>
                {user.displayName ?? `@${user.username}`}
              </Link>
              <NavLink href="/settings">Settings</NavLink>
              <button
                onClick={handleLogout}
                className="transition-colors"
                style={{ color: 'var(--cromo-fg-muted)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--cromo-fg)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--cromo-fg-muted)')}
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <NavLink href="/login">Log in</NavLink>
              <Link
                href="/register"
                className="rounded-btn px-3 py-1.5 text-xs font-semibold transition-colors"
                style={{
                  background: 'var(--cromo-accent)',
                  color: 'var(--cromo-bg)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--cromo-accent-strong)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--cromo-accent)')}
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
      className="transition-colors"
      style={{ color: 'var(--cromo-fg-muted)' }}
      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--cromo-fg)')}
      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--cromo-fg-muted)')}
    >
      {children}
    </Link>
  );
}
