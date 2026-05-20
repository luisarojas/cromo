'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { usePreferencesStore } from '@/store/preferences';
import { logoutApi } from '@/lib/api';

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
    <nav className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-6">
        <Link
          href="/"
          className="font-bold text-blue-600 text-lg tracking-tight hover:text-blue-700 transition-colors"
        >
          Stickfolio
        </Link>

        <div className="flex gap-4 text-sm font-medium">
          <Link
            href="/guide"
            className="text-gray-600 hover:text-gray-900 transition-colors"
          >
            Guide
          </Link>
          {user && (
            <>
              <Link
                href="/dashboard"
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                Dashboard
              </Link>
              <Link
                href="/album"
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                Collection
              </Link>
              <Link
                href="/trade"
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                Trade
              </Link>
              <Link
                href="/scan"
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                Scan
              </Link>
              {user.role === 'admin' && (
                <Link
                  href="/admin"
                  className="text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Admin
                </Link>
              )}
            </>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3 text-sm">
          {process.env.NODE_ENV === 'development' && (
            <button
              onClick={() => { localStorage.clear(); window.location.reload(); }}
              className="rounded px-2 py-1 text-xs font-mono bg-amber-100 text-amber-700 border border-amber-300 hover:bg-amber-200 transition-colors"
              title="Clear localStorage and reload"
            >
              clear cache
            </button>
          )}
          {user ? (
            <>
              <Link
                href={`/profile/${user.username}`}
                className="flex items-center gap-2 rounded-full bg-gray-100 hover:bg-gray-200 px-3 py-1 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                  {(user.displayName ?? user.username).charAt(0).toUpperCase()}
                </span>
                {user.displayName ?? `@${user.username}`}
              </Link>
              <Link
                href="/settings"
                className="text-gray-500 hover:text-gray-800 transition-colors"
              >
                Settings
              </Link>
              <button
                onClick={handleLogout}
                className="text-gray-500 hover:text-gray-800 transition-colors"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                Log in
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-blue-600 px-3 py-1.5 text-white text-xs font-medium hover:bg-blue-700 transition-colors"
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
