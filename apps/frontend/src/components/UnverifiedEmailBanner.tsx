'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { resendVerificationApi } from '@/lib/api';

export default function UnverifiedEmailBanner() {
  const user = useAuthStore((s) => s.user);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  if (!user || user.emailVerifiedAt || dismissed) return null;

  async function handleResend() {
    if (!user) return;
    setLoading(true);
    try {
      await resendVerificationApi(user.email);
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full px-4 py-2.5 text-sm text-center bg-[var(--cromo-warning-soft)] text-yellow-800 border-b border-[var(--cromo-warning)]/30 flex items-center justify-center gap-3">
      {sent ? (
        <span>Verification email sent — check your inbox.</span>
      ) : (
        <>
          <span>Please verify your email address.</span>
          <button
            onClick={handleResend}
            disabled={loading}
            className="underline font-medium hover:no-underline disabled:opacity-60"
          >
            {loading ? 'Sending…' : 'Resend verification email'}
          </button>
        </>
      )}
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="ml-2 opacity-60 hover:opacity-100 leading-none"
      >
        ×
      </button>
    </div>
  );
}
