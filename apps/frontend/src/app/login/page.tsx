'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { loginApi, fetchUserPreferences } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { usePreferencesStore } from '@/store/preferences';
import { Button, Card, Field, Input, Alert } from '@/components/ui';
import { CromoMark } from '@/components/CromoLogo';

const TEST_USERS = [
  { email: 'alice@test.local', label: 'Alice', description: 'Partial collection (1–200)' },
  { email: 'bob@test.local', label: 'Bob', description: 'Partial collection (150–400)' },
  { email: 'charlie@test.local', label: 'Charlie', description: 'Partial collection (1–100)' },
  { email: 'diana@test.local', label: 'Diana', description: 'Partial collection (250–400)' },
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
        setFromServer({ duplicatesCountAllVariants: false, cities: [] });
      }
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 h-[320px] opacity-20 blur-3xl cromo-chrome-fill"
        style={{ maskImage: 'radial-gradient(ellipse at top, black 0%, transparent 70%)' }}
      />

      <div className="w-full max-w-md relative">
        <div className="text-center mb-8 flex flex-col items-center">
          <CromoMark size={48} variant="chrome" className="mb-4 cromo-shimmer" />
          <h1 className="font-display font-bold text-2xl text-[var(--cromo-fg)] tracking-tight">
            Welcome back
          </h1>
          <p className="mt-1.5 text-sm text-[var(--cromo-fg-muted)]">
            New to Cromo?{' '}
            <Link href="/register" className="text-[var(--cromo-accent)] hover:underline">
              Create an account
            </Link>
          </p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
              />
            </Field>

            <Field label="Password" htmlFor="password">
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </Field>

            {error && <Alert tone="danger">{error}</Alert>}

            <Button type="submit" loading={loading} size="lg" className="mt-2">
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </Card>

        <Card className="mt-4">
          <p className="text-[11px] font-semibold text-[var(--cromo-fg-subtle)] uppercase tracking-wider mb-3">
            Local dev — quick login
          </p>
          <div className="flex flex-col gap-1.5">
            {TEST_USERS.map((u) => (
              <button
                key={u.email}
                onClick={() => doLogin(u.email, 'any')}
                disabled={loading}
                className="flex items-center justify-between rounded-btn border border-[var(--cromo-border)] bg-[var(--cromo-surface-2)] px-3 py-2 text-sm hover:border-[var(--cromo-border-strong)] disabled:opacity-50 transition-colors text-left"
              >
                <span className="font-medium text-[var(--cromo-fg)]">{u.label}</span>
                <span className="text-[var(--cromo-fg-subtle)] text-xs">{u.description}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
