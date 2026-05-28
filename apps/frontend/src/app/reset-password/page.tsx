'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { resetPasswordApi } from '@/lib/api';
import { Button, Card, Field, Input, Alert, Spinner } from '@/components/ui';
import { CromoMark } from '@/components/CromoLogo';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <Shell>
        <Card className="text-center">
          <div className="text-3xl mb-4">❌</div>
          <h1 className="font-display font-bold text-xl text-[var(--cromo-fg)] mb-2">
            Invalid link
          </h1>
          <p className="text-sm text-[var(--cromo-fg-muted)] mb-6">
            This reset link is missing a token.
          </p>
          <Link href="/forgot-password" className="text-sm text-[var(--cromo-accent)] hover:underline">
            Request a new link
          </Link>
        </Card>
      </Shell>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await resetPasswordApi(token!, password);
      setDone(true);
    } catch (err) {
      const e = err as Error & { statusCode?: number };
      if (e.statusCode === 410) {
        setError('This reset link has expired. Please request a new one.');
      } else {
        setError(e.message ?? 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <Shell>
        <Card className="text-center">
          <div className="text-3xl mb-4">✅</div>
          <h1 className="font-display font-bold text-xl text-[var(--cromo-fg)] mb-2">
            Password updated
          </h1>
          <p className="text-sm text-[var(--cromo-fg-muted)] mb-6">
            Your password has been reset. Sign in with your new password.
          </p>
          <Button size="lg" onClick={() => router.push('/login')}>
            Sign in
          </Button>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="New password" htmlFor="password">
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="At least 8 characters"
            />
          </Field>

          <Field label="Confirm new password" htmlFor="confirm">
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
              {error.includes('expired') && (
                <Link
                  href="/forgot-password"
                  className="text-sm text-center text-[var(--cromo-accent)] hover:underline"
                >
                  Request a new reset link
                </Link>
              )}
            </div>
          )}

          <Button type="submit" loading={loading} size="lg" className="mt-2">
            {loading ? 'Updating…' : 'Set new password'}
          </Button>
        </form>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
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
            Set a new password
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
