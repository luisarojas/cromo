import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Collector Guides',
  description:
    'Friendly handbooks for sticker collectors — editions, rare variants, where to buy, and how to complete the album.',
  alternates: { canonical: '/guide' },
};

export default async function GuidesIndexPage() {
  const t = await getTranslations('guideIndex');
  const guides = [
    {
      href: '/guide/wc-2026',
      label: t('wc2026.label'),
      title: t('wc2026.title'),
      description: t('wc2026.description'),
      meta: t('wc2026.meta'),
      tags: [t('tags.editions'), t('tags.variants'), t('tags.whereToBuy')],
    },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        subtitle={t('subtitle')}
      />

      <div className="grid sm:grid-cols-2 gap-4">
        {guides.map((guide) => (
          <Link
            key={guide.href}
            href={guide.href}
            className="group relative overflow-hidden rounded-card border border-[var(--cromo-border)] bg-[var(--cromo-surface)] hover:border-[var(--cromo-accent)]/60 transition-colors"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -top-16 -right-12 h-40 w-40 rounded-full opacity-20 blur-3xl cromo-chrome-fill"
            />
            <div className="relative px-5 py-4 space-y-3">
              <span className="inline-flex items-center rounded-full cromo-chrome-fill px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#0E1117]">
                {guide.label}
              </span>
              <p className="font-display text-base font-bold leading-snug tracking-tight cromo-chrome-text">
                {guide.title}
              </p>
              <p className="text-sm text-[var(--cromo-fg-muted)] leading-relaxed">{guide.description}</p>
              <p className="text-xs text-[var(--cromo-fg-subtle)] font-mono">{guide.meta}</p>
              <div className="flex flex-wrap gap-1.5">
                {guide.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-full bg-[var(--cromo-surface-2)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--cromo-fg-muted)]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <p className="!mt-6 text-xs font-semibold text-[var(--cromo-accent)] group-hover:translate-x-0.5 transition-transform">
                {t('readGuide')}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
