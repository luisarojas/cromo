'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[route-error]', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 py-16 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--cromo-danger-text)]">
        500 · something went wrong
      </p>
      <h1 className="mt-3 text-3xl font-display font-bold text-[var(--cromo-fg)]">
        This page crashed
      </h1>
      <p className="mt-3 max-w-md text-sm text-[var(--cromo-fg-muted)]">
        It&apos;s not you — it&apos;s a bug on our side. Try again, and if the same thing
        happens, the details below help us track it down.
      </p>
      {error.digest && (
        <p className="mt-3 font-mono text-xs text-[var(--cromo-fg-muted)]">
          ref: {error.digest}
        </p>
      )}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-[var(--cromo-accent)] px-5 py-2.5 text-sm font-medium text-[var(--cromo-accent-fg)] transition hover:opacity-90"
        >
          Try again
        </button>
        <a
          href="/"
          className="rounded-full border border-[var(--cromo-border)] px-5 py-2.5 text-sm font-medium text-[var(--cromo-fg)] transition hover:bg-[var(--cromo-surface-2)]"
        >
          Back to album
        </a>
      </div>
    </div>
  );
}
