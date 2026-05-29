'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { verifyEmailApi, resendVerificationApi } from '@/lib/api';
import { Alert, Button, Card, Field, Input, Spinner } from '@/components/ui';
import { CromoMark } from '@/components/CromoLogo';

function VerifyEmailContent() {
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
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (!email) {
      setError('Enter your email address first.');
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
            Email verified
          </h1>
          <p className="text-sm text-[var(--cromo-fg-muted)] mb-6">
            Your account is active. Sign in to start collecting.
          </p>
          <Link href="/login">
            <Button size="lg">Sign in</Button>
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
            Verify your email
          </h1>
          <p className="text-sm text-[var(--cromo-fg-muted)]">
            Enter the 6-digit code we sent to your email address.
          </p>
        </div>

        {error && (
          <div className="mb-3">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}

        <form onSubmit={handleVerify} className="flex flex-col gap-3">
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="your@email.com"
            />
          </Field>
          <Field label="Verification code">
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
            {submitting ? 'Verifying…' : 'Verify email'}
          </Button>
        </form>

        <div className="mt-4 text-center text-sm">
          {resendDone ? (
            <span className="text-[var(--cromo-success-text)]">
              New code sent — check your inbox
              {process.env.NODE_ENV === 'development' && (
                <>
                  {' '}(or{' '}
                  <a href="http://localhost:8025" target="_blank" rel="noreferrer" className="underline">
                    Mailpit
                  </a>
                  )
                </>
              )}.
            </span>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={resendLoading}
              className="text-[var(--cromo-accent)] hover:underline disabled:opacity-50"
            >
              {resendLoading ? 'Sending…' : 'Resend code'}
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
