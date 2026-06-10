'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { verifyEmailApi, resendVerificationApi } from '@/lib/api';
import { Alert, Button, Card, Field, Input, Spinner } from '@/components/ui';
import { CromoMark } from '@/components/CromoLogo';

function VerifyEmailContent() {
  const t = useTranslations('auth.verifyEmail');
  const searchParams = useSearchParams();

  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [resendLoading, setResendLoading] = useState(false);
  const [resendDone, setResendDone] = useState(false);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await verifyEmailApi(email, code.trim());
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('verificationFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (!email) {
      setError(t('enterEmailFirst'));
      return;
    }
    setResendLoading(true);
    await resendVerificationApi(email);
    setResendDone(true);
    setResendLoading(false);
  }

  if (success) {
    return (
      <Shell>
        <Card className="text-center">
          <div className="text-3xl mb-4">✅</div>
          <h1 className="font-display font-bold text-xl text-[var(--cromo-fg)] mb-2">
            {t('successTitle')}
          </h1>
          <p className="text-sm text-[var(--cromo-fg-muted)] mb-6">
            {t('successBody')}
          </p>
          <Link href="/login">
            <Button size="lg">{t('signIn')}</Button>
          </Link>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card>
        <div className="text-center mb-4">
          <div className="text-3xl mb-3">✉️</div>
          <h1 className="font-display font-bold text-xl text-[var(--cromo-fg)] mb-2">
            {t('title')}
          </h1>
          <p className="text-sm text-[var(--cromo-fg-muted)]">
            {t('subtitle')}
          </p>
        </div>

        {error && (
          <div className="mb-3">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}

        <form onSubmit={handleVerify} className="flex flex-col gap-3">
          <Field label={t('emailLabel')}>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder={t('emailPlaceholder')}
            />
          </Field>
          <Field label={t('codeLabel')}>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              placeholder="123456"
            />
          </Field>
          <Button type="submit" size="lg" loading={submitting}>
            {submitting ? t('verifying') : t('submit')}
          </Button>
        </form>

        <div className="mt-4 text-center text-sm">
          {resendDone ? (
            <span className="text-[var(--cromo-success-text)]">
              {t('newCodeSent')}
              {process.env.NODE_ENV === 'development' && (
                <>
                  {' '}
                  {t.rich('mailpitTail', {
                    link: (chunks) => (
                      <a href="http://localhost:8025" target="_blank" rel="noreferrer" className="underline">
                        {chunks}
                      </a>
                    ),
                  })}
                </>
              )}
            </span>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={resendLoading}
              className="text-[var(--cromo-accent)] hover:underline disabled:opacity-50"
            >
              {resendLoading ? t('sending') : t('resendCode')}
            </button>
          )}
        </div>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <CromoMark size={40} variant="accent" />
        </div>
        {children}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <Shell>
          <div className="flex justify-center">
            <Spinner size={20} />
          </div>
        </Shell>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
