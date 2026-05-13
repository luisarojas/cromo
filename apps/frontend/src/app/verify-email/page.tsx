'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { verifyEmailApi, resendVerificationApi } from '@/lib/api';

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
      setStatus('error');
      return;
    }

    verifyEmailApi(token)
      .then(() => setStatus('success'))
      .catch((err: Error & { statusCode?: number }) => {
        if (err.statusCode === 410) {
          setStatus('expired');
        } else {
          setStatus('error');
        }
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Verifying your email…</p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
          <div className="text-4xl mb-4">✅</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Email verified!</h1>
          <p className="text-sm text-gray-600 mb-6">
            Your account is active. You can now sign in.
          </p>
          <Link
            href="/login"
            className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
          <div className="text-4xl mb-4">⏰</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Link expired</h1>
          <p className="text-sm text-gray-600 mb-6">
            This verification link has expired. Enter your email below to get a new one.
          </p>

          {resendDone ? (
            <p className="text-sm text-green-600">
              New verification link sent — check your inbox (or{' '}
              <a
                href="http://localhost:8025"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Mailpit
              </a>
              ).
            </p>
          ) : (
            <form onSubmit={handleResend} className="flex flex-col gap-3">
              <input
                type="email"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                required
                placeholder="your@email.com"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button
                type="submit"
                disabled={resendLoading}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {resendLoading ? 'Sending…' : 'Resend verification email'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
        <div className="text-4xl mb-4">❌</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Verification failed</h1>
        <p className="text-sm text-gray-600 mb-6">
          {token ? 'This verification link is invalid.' : 'No verification token provided.'}
        </p>
        <Link href="/login" className="text-sm text-blue-600 hover:underline">
          Back to login
        </Link>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <p className="text-gray-500 text-sm">Loading…</p>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
