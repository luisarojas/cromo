'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { forgotPasswordApi } from '@/lib/api';
import { Button, Card, Field, Input, Alert } from '@/components/ui';
import { CromoMark } from '@/components/CromoLogo';

export default function ForgotPasswordPage() {
  const t = useTranslations('auth.forgotPassword');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await forgotPasswordApi(email);
      setDone(true);
    } catch {
      setError(t('genericError'));
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
            {t('subtitle')}
          </p>
        </div>

        <Card>
          {done ? (
            <div className="text-center py-2 flex flex-col gap-4">
              <p className="text-sm text-[var(--cromo-fg)]">
                {t('sentBody')}
              </p>
              <Link href={`/reset-password?email=${encodeURIComponent(email)}`}>
                <Button size="lg" className="w-full">{t('enterCode')}</Button>
              </Link>
              <p className="text-sm text-[var(--cromo-fg-muted)]">
                {t.rich('didntGet', {
                  retry: (chunks) => (
                    <button
                      onClick={() => { setDone(false); setEmail(''); }}
                      className="text-[var(--cromo-accent)] hover:underline"
                    >
                      {chunks}
                    </button>
                  ),
                })}
              </p>
            </div>
          ) : (
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

              {error && <Alert tone="danger">{error}</Alert>}

              <Button type="submit" loading={loading} size="lg" className="mt-2">
                {loading ? t('sending') : t('submit')}
              </Button>
            </form>
          )}
        </Card>

        <p className="mt-6 text-center text-sm text-[var(--cromo-fg-muted)]">
          <Link href="/login" className="text-[var(--cromo-accent)] hover:underline">
            {t('backToSignIn')}
          </Link>
        </p>
      </div>
    </div>
  );
}
