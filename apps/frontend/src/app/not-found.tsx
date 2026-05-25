import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 py-16 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--cromo-fg-muted)]">
        404
      </p>
      <h1 className="mt-3 text-3xl font-display font-bold text-[var(--cromo-fg)]">
        We couldn&apos;t find that page
      </h1>
      <p className="mt-3 max-w-md text-sm text-[var(--cromo-fg-muted)]">
        The link may be stale, the album moved, or the sticker was never numbered in the
        first place.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex items-center gap-2 rounded-full bg-[var(--cromo-accent)] px-5 py-2.5 text-sm font-medium text-[var(--cromo-accent-fg)] transition hover:opacity-90"
      >
        Back to album
      </Link>
    </div>
  );
}
