'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { resetPasswordApi } from '@/lib/api';
import { Button, Card, Field, Input, Alert, Spinner } from '@/components/ui';
import { CromoMark } from '@/components/CromoLogo';

function ResetPasswordContent() {
  const t = useTranslations('auth.resetPassword');
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [done, setDone] = useState(false);

  function validatePassword(value: string) {
    if (value.length > 0 && value.length < 8) {
      setPasswordError(t('passwordTooShort'));
    } else {
      setPasswordError(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setPasswordError(t('passwordTooShort'));
      return;
    }
    if (password !== confirm) {
      setError(t('passwordsDoNotMatch'));
      return;
    }
    setLoading(true);
    setError(null);
    setExpired(false);
    try {
      await resetPasswordApi(email, code.trim(), password);
      setDone(true);
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      if (e.statusCode === 410) {
        setExpired(true);
        setError(t('codeExpired'));
      } else {
        setError(e.message ?? t('genericError'));
      }
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <Shell title={t('title')}>
        <Card className="text-center">
          <div className="text-3xl mb-4">✅</div>
          <h1 className="font-display font-bold text-xl text-[var(--cromo-fg)] mb-2">
            {t('successTitle')}
          </h1>
          <p className="text-sm text-[var(--cromo-fg-muted)] mb-6">
            {t('successBody')}
          </p>
          <Button size="lg" onClick={() => router.push('/login')}>
            {t('signIn')}
          </Button>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell title={t('title')}>
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

          <Field label={t('codeLabel')} htmlFor="code">
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              placeholder="123456"
            />
          </Field>

          <Field label={t('newPasswordLabel')} htmlFor="password" error={passwordError ?? undefined}>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setPasswordError(null); }}
              onBlur={(e) => validatePassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder={t('newPasswordPlaceholder')}
            />
          </Field>

          <Field label={t('confirmPasswordLabel')} htmlFor="confirm">
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="••••••••"
            />
          </Field>

          {error && (
            <div className="flex flex-col gap-2">
              <Alert tone="danger">{error}</Alert>
              {expired && (
                <Link
                  href="/forgot-password"
                  className="text-sm text-center text-[var(--cromo-accent)] hover:underline"
                >
                  {t('requestNewCode')}
                </Link>
              )}
            </div>
          )}

          <Button type="submit" loading={loading} size="lg" className="mt-2">
            {loading ? t('updating') : t('submit')}
          </Button>
        </form>
      </Card>
    </Shell>
  );
}

function Shell({ children, title }: { children: React.ReactNode; title: string }) {
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
            {title}
          </h1>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Spinner size={24} />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
