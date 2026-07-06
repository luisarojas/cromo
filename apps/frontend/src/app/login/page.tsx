'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { loginApi, fetchUserPreferences } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { usePreferencesStore } from '@/store/preferences';
import { Button, Card, Field, Input, Alert } from '@/components/ui';
import { CromoMark } from '@/components/CromoLogo';

// Only honour same-origin relative paths to prevent open-redirect via ?next=.
function safeNext(raw: string | null): string {
  if (!raw) return '/dashboard';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/dashboard';
  return raw;
}

const TEST_USERS = [
  { email: 'alice@test.local', label: 'Alice', description: 'Partial collection (1–200)' },
  { email: 'bob@test.local', label: 'Bob', description: 'Partial collection (150–400)' },
  { email: 'charlie@test.local', label: 'Charlie', description: 'Partial collection (1–100)' },
  { email: 'diana@test.local', label: 'Diana', description: 'Partial collection (250–400)' },
  { email: 'admin@test.local', label: 'Admin', description: 'Admin access' },
];

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const setFromServer = usePreferencesStore((s) => s.setFromServer);
  const t = useTranslations('auth.login');

  const next = safeNext(searchParams.get('next'));
  const sessionExpired = searchParams.get('reason') === 'session-expired';

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
        setFromServer({ cities: [], profileVisibility: 'public', tradeMatchingEnabled: true, searchRadiusKm: 50, emailTradeRequests: true, emailTradeMessages: true, emailMarketing: false });
      }
      router.push(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loginFailed'));
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
          <CromoMark size={48} variant="chrome" className="mb-4" />
          <h1 className="font-display font-bold text-2xl text-[var(--cromo-fg)] tracking-tight">
            {t('title')}
          </h1>
          <p className="mt-1.5 text-sm text-[var(--cromo-fg-muted)]">
            {t('promptNew')}{' '}
            <Link href="/register" className="text-[var(--cromo-accent)] hover:underline">
              {t('createAccount')}
            </Link>
          </p>
        </div>

        {sessionExpired && !error && (
          <div className="mb-4">
            <Alert tone="info">{t('sessionExpired')}</Alert>
          </div>
        )}

        <Card>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field label={t('emailLabel')} htmlFor="email">
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder={t('emailPlaceholder')}
              />
            </Field>

            <Field
              label={t('passwordLabel')}
              htmlFor="password"
              labelRight={
                <Link
                  href="/forgot-password"
                  className="text-xs text-[var(--cromo-accent)] hover:underline"
                >
                  {t('forgotPassword')}
                </Link>
              }
            >
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder={t('passwordPlaceholder')}
              />
            </Field>

            {error && <Alert tone="danger">{error}</Alert>}

            <Button type="submit" loading={loading} size="lg" className="mt-2">
              {loading ? t('submitting') : t('submit')}
            </Button>
          </form>
        </Card>

        {process.env.NEXT_PUBLIC_ENV === 'development' && (
          <Card className="mt-4">
            <p className="text-[11px] font-semibold text-[var(--cromo-fg-subtle)] uppercase tracking-wider mb-3">
              {t('devTitle')}
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
        )}
      </div>
    </div>
  );
}
