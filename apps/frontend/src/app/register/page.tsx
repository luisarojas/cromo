'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { registerApi } from '@/lib/api';
import { Alert, Button, Card, Field, Input } from '@/components/ui';
import { CromoMark } from '@/components/CromoLogo';

export default function RegisterPage() {
  const t = useTranslations('auth.register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function validatePassword(value: string) {
    if (value.length > 0 && value.length < 8) {
      setPasswordError(t('passwordTooShort'));
    } else {
      setPasswordError(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (password.length < 8) {
      setPasswordError(t('passwordTooShort'));
      setLoading(false);
      return;
    }
    if (password !== confirmPassword) {
      setError(t('passwordsDoNotMatch'));
      setLoading(false);
      return;
    }
    try {
      await registerApi({
        email,
        password,
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('registrationFailed'));
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <AuthShell>
        <Card className="text-center">
          <div className="text-3xl mb-4">📬</div>
          <h1 className="font-display font-bold text-xl text-[var(--cromo-fg)] mb-2">
            {t('checkEmailTitle')}
          </h1>
          <p className="text-sm text-[var(--cromo-fg-muted)] mb-4">
            {t.rich('checkEmailBody', {
              email,
              strong: (chunks) => <strong className="text-[var(--cromo-fg)]">{chunks}</strong>,
            })}
          </p>
          {process.env.NODE_ENV === 'development' && (
            <p className="text-xs text-[var(--cromo-fg-subtle)]">
              {t.rich('mailpitHint', {
                link: (chunks) => (
                  <a
                    href="http://localhost:8025"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--cromo-accent)] hover:underline"
                  >
                    {chunks}
                  </a>
                ),
              })}
            </p>
          )}
          <div className="mt-6 flex flex-col gap-3">
            <Link href={`/verify-email?email=${encodeURIComponent(email)}`}>
              <Button size="lg">{t('enterCode')}</Button>
            </Link>
            <Link
              href="/login"
              className="text-sm text-[var(--cromo-accent)] hover:underline"
            >
              {t('backToSignIn')}
            </Link>
          </div>
        </Card>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="text-center mb-8 flex flex-col items-center">
        <CromoMark size={48} variant="chrome" className="mb-4" />
        <h1 className="font-display font-bold text-2xl text-[var(--cromo-fg)] tracking-tight">
          {t('title')}
        </h1>
        <p className="mt-1.5 text-sm text-[var(--cromo-fg-muted)]">
          {t('alreadyCollecting')}{' '}
          <Link href="/login" className="text-[var(--cromo-accent)] hover:underline">
            {t('signIn')}
          </Link>
        </p>
      </div>

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

          <Field label={t('passwordLabel')} htmlFor="password" error={passwordError ?? undefined}>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setPasswordError(null); }}
              onBlur={(e) => validatePassword(e.target.value)}
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              placeholder={t('passwordPlaceholder')}
            />
          </Field>

          <Field label={t('confirmPasswordLabel')} htmlFor="confirmPassword">
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              placeholder={t('confirmPasswordPlaceholder')}
            />
          </Field>

          {error && <Alert tone="danger">{error}</Alert>}

          <Button type="submit" loading={loading} size="lg" className="mt-2">
            {loading ? t('submitting') : t('submit')}
          </Button>
        </form>
      </Card>
    </AuthShell>
  );
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 h-[320px] opacity-20 blur-3xl cromo-chrome-fill"
        style={{ maskImage: 'radial-gradient(ellipse at top, black 0%, transparent 70%)' }}
      />
      <div className="w-full max-w-md relative">{children}</div>
    </div>
  );
}
