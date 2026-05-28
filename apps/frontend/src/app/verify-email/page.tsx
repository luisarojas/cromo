'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { verifyEmailApi, resendVerificationApi } from '@/lib/api';
import { Button, Card, Input, Spinner } from '@/components/ui';
import { CromoMark } from '@/components/CromoLogo';

type Status = 'verifying' | 'success' | 'expired' | 'error';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<Status>('verifying');
  const [resendEmail, setResendEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendDone, setResendDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus('expired');
      return;
    }

    verifyEmailApi(token)
      .then(() => setStatus('success'))
      .catch((err: Error & { statusCode?: number }) => {
        if (err.statusCode === 410) setStatus('expired');
        else setStatus('error');
      });
  }, [token]);

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    setResendLoading(true);
    await resendVerificationApi(resendEmail);
    setResendDone(true);
    setResendLoading(false);
  }

  if (status === 'verifying') {
    return (
      <Shell>
        <Card className="flex flex-col items-center gap-3 text-center">
          <Spinner size={24} />
          <p className="text-sm text-[var(--cromo-fg-muted)]">Verifying your email…</p>
        </Card>
      </Shell>
    );
  }

  if (status === 'success') {
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

  if (status === 'expired') {
    return (
      <Shell>
        <Card>
          <div className="text-center mb-4">
            <div className="text-3xl mb-3">✉️</div>
            <h1 className="font-display font-bold text-xl text-[var(--cromo-fg)] mb-2">
              {token ? 'Link expired' : 'Resend verification email'}
            </h1>
            <p className="text-sm text-[var(--cromo-fg-muted)]">
              {token
                ? 'This verification link has expired. Enter your email to get a new one.'
                : 'Enter your email address and we\'ll send you a new verification link.'}
            </p>
          </div>

          {resendDone ? (
            <p className="text-sm text-[var(--cromo-success-text)] text-center">
              New verification link sent — check your inbox
              {process.env.NODE_ENV === 'development' && (
                <>
                  {' '}(or{' '}
                  <a
                    href="http://localhost:8025"
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    Mailpit
                  </a>
                  )
                </>
              )}.
            </p>
          ) : (
            <form onSubmit={handleResend} className="flex flex-col gap-3">
              <Input
                type="email"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                required
                placeholder="your@email.com"
              />
              <Button type="submit" loading={resendLoading}>
                {resendLoading ? 'Sending…' : 'Resend verification email'}
              </Button>
            </form>
          )}
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card className="text-center">
        <div className="text-3xl mb-4">❌</div>
        <h1 className="font-display font-bold text-xl text-[var(--cromo-fg)] mb-2">
          Verification failed
        </h1>
        <p className="text-sm text-[var(--cromo-fg-muted)] mb-6">
          This verification link is invalid.
        </p>
        <Link href="/login" className="text-sm text-[var(--cromo-accent)] hover:underline">
          Back to sign in
        </Link>
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
