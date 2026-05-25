import Link from 'next/link';
import { PageHeader } from '@/components/ui';

const GUIDES = [
  {
    href: '/guide/wc-2026',
    label: '2026 FIFA World Cup',
    title: 'Panini Sticker Collection',
    description:
      'Regional editions, album formats, sticker variants and parallels, the full 980-slot breakdown, and where to buy.',
    meta: '980 stickers · 48 teams · 6 sections',
    tags: ['Regional Editions', 'Variants & Parallels', 'Where to Buy'],
  },
];

export default function GuidesIndexPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
      <PageHeader
        eyebrow="Guides"
        title="Collector Guides"
        subtitle="In-depth references for each Panini sticker collection supported by Cromo."
      />

      <div className="grid sm:grid-cols-2 gap-4">
        {GUIDES.map((guide) => (
          <Link
            key={guide.href}
            href={guide.href}
            className="group rounded-card border border-[var(--cromo-border)] bg-[var(--cromo-surface)] overflow-hidden hover:border-[var(--cromo-accent)]/60 transition-colors"
          >
            {/* Chrome hero strip — guaranteed contrast for the black title in
                both themes, plus brand-on-brand identity. */}
            <div className="cromo-chrome-fill px-5 py-4 relative">
              <span className="inline-flex items-center rounded-full bg-black/20 backdrop-blur px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#0E1117] mb-2">
                {guide.label}
              </span>
              <p className="font-display text-[#0E1117] font-bold text-base leading-snug tracking-tight">
                {guide.title}
              </p>
            </div>
            <div className="px-5 py-4 space-y-3">
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
              <p className="text-xs font-semibold text-[var(--cromo-accent)] group-hover:translate-x-0.5 transition-transform">
                Read guide →
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
