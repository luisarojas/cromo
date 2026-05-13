'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { loginApi, fetchUserPreferences } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { usePreferencesStore } from '@/store/preferences';

const TEST_USERS = [
  { email: 'alice@test.local', label: 'Alice', description: 'Partial collection (1–200)' },
  { email: 'bob@test.local', label: 'Bob', description: 'Partial collection (150–400)' },
  { email: 'charlie@test.local', label: 'Charlie', description: 'Empty collection' },
  { email: 'diana@test.local', label: 'Diana', description: 'Empty collection' },
  { email: 'admin@test.local', label: 'Admin', description: 'Admin access' },
];

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const setFromServer = usePreferencesStore((s) => s.setFromServer);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await doLogin(email, password);
  }

  async function doLogin(loginEmail: string, loginPassword: string) {
    setLoading(true);
    setError(null);
    try {
      const { accessToken, user } = await loginApi(loginEmail, loginPassword);
      setAuth(accessToken, user);
      try {
        const prefs = await fetchUserPreferences(accessToken);
        setFromServer(prefs);
      } catch {
        setFromServer({ duplicatesCountAllVariants: false, albumEdition: 'north_america' });
      }
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Sign in to Stickfolio</h1>
          <p className="mt-1 text-sm text-gray-500">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-blue-600 hover:underline">
              Register
            </Link>
          </p>
        </div>

        {/* Login form */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="you@example.com"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        {/* Test user quick-login */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Local dev — quick login
          </p>
          <div className="flex flex-col gap-2">
            {TEST_USERS.map((u) => (
              <button
                key={u.email}
                onClick={() => doLogin(u.email, 'any')}
                disabled={loading}
                className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50 transition-colors text-left"
              >
                <span className="font-medium text-gray-800">{u.label}</span>
                <span className="text-gray-400 text-xs">{u.description}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
