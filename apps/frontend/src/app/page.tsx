'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth';
import { CromoMark } from '@/components/CromoLogo';

export default function Home() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);

  useEffect(() => {
    if (hydrated && user) {
      router.replace('/dashboard');
    }
  }, [hydrated, user, router]);

  if (!hydrated || user) return null;

  return (
    <main className="cromo-force-dark min-h-screen relative overflow-hidden">
      {/* Ambient chrome glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 h-[480px] opacity-30 blur-3xl cromo-chrome-fill"
        style={{ maskImage: 'radial-gradient(ellipse at top, black 0%, transparent 70%)' }}
      />

      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center text-center px-4 pt-24 pb-20">
        <div className="mb-8">
          <CromoMark size={72} variant="chrome" />
        </div>

        <h1
          className="font-display font-bold tracking-tight text-5xl sm:text-6xl mb-5 cromo-chrome-text"
          style={{ letterSpacing: '-0.04em' }}
        >
          Every variant. Every trade.
        </h1>

        <p
          className="text-lg max-w-xl mb-10 leading-relaxed"
          style={{ color: 'var(--cromo-fg-muted)' }}
        >
          Cromo is the collector-grade home for stickers, cards, and everything you chase. Track parallels down to the 1-of-1, match with traders who need exactly what you have, and complete the album.
        </p>

        <div className="flex gap-3">
          <Link
            href="/register"
            className="cromo-chrome-fill rounded-btn px-6 py-3 text-sm font-semibold text-[#0E1117] hover:brightness-110 transition-all"
          >
            Start collecting
          </Link>
          <Link
            href="/login"
            className="rounded-btn px-6 py-3 text-sm font-semibold transition-colors"
            style={{
              background: 'transparent',
              color: 'var(--cromo-fg)',
              border: '1px solid var(--cromo-border-strong)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--cromo-surface-2)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            Sign in
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="relative max-w-5xl mx-auto px-4 pb-24">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FeatureCard
            iconPath="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            tone="success"
            title="Track every variant"
            body="Border parallels, Crumple foils, Extras, Coca-Cola subset, Swiss United Edition — Cromo knows every variant Panini ships, and tracks what you own across all of them."
          />
          <FeatureCard
            iconPath="M8 5a1 1 0 100 2h5.586l-1.293 1.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L13.586 5H8zM12 15a1 1 0 100-2H6.414l1.293-1.293a1 1 0 10-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L6.414 15H12z"
            tone="accent"
            title="Match with traders"
            body="Cromo automatically surfaces collectors whose dupes line up with your wantlist. Swap your repeats for the ones you're chasing — no DMs, no spreadsheets."
          />
          <FeatureCard
            iconPath="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
            tone="chrome"
            title="Chase the 1-of-1"
            body="From 1-in-2 blue parallels to the masterpiece Black 1-of-1, Cromo respects the chase. Rarity tiers are honoured visually — common slate, ultra-rare emerald, masterpiece chrome."
          />
        </div>
      </section>
    </main>
  );
}

interface FeatureCardProps {
  iconPath: string;
  tone: 'success' | 'accent' | 'chrome';
  title: string;
  body: string;
}

function FeatureCard({ iconPath, tone, title, body }: FeatureCardProps) {
  const iconStyle =
    tone === 'chrome'
      ? { background: 'var(--cromo-warning-soft)', color: 'var(--cromo-warning)' }
      : tone === 'success'
        ? { background: 'rgba(52, 211, 153, 0.12)', color: 'var(--cromo-success)' }
        : { background: 'var(--cromo-accent-soft)', color: 'var(--cromo-accent)' };

  return (
    <div
      className="rounded-card p-6 transition-colors"
      style={{
        background: 'var(--cromo-surface)',
        border: '1px solid var(--cromo-border)',
      }}
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-btn mb-4"
        style={iconStyle}
      >
        <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d={iconPath} clipRule="evenodd" />
        </svg>
      </div>
      <h3 className="font-display font-semibold mb-1.5" style={{ color: 'var(--cromo-fg)' }}>
        {title}
      </h3>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--cromo-fg-muted)' }}>
        {body}
      </p>
    </div>
  );
}
