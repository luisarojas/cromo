import Link from 'next/link';

const GUIDES = [
  {
    href: '/guide/wc-2026',
    label: '2026 FIFA World Cup',
    title: 'Panini Sticker Collection',
    description:
      'Regional editions, album formats, sticker variants and parallels, the full 980-slot breakdown, and where to buy.',
    meta: '980 stickers · 48 teams · 6 sections',
    tags: ['Regional Editions', 'Variants & Parallels', 'Where to Buy'],
    accent: 'from-[var(--cromo-accent-strong)] to-[var(--cromo-accent)]',
  },
];

export default function GuidesIndexPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--cromo-fg)]">Collector Guides</h1>
        <p className="mt-1 text-sm text-[var(--cromo-fg-muted)]">
          In-depth references for each Panini sticker collection supported by Cromo.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {GUIDES.map((guide) => (
          <Link
            key={guide.href}
            href={guide.href}
            className="group rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] overflow-hidden hover:border-[var(--cromo-border-strong)] hover:border-[var(--cromo-border-strong)] transition-all"
          >
            <div className={`bg-gradient-to-br ${guide.accent} px-5 py-4`}>
              <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white mb-2">
                {guide.label}
              </span>
              <p className="text-white font-bold text-base leading-snug">{guide.title}</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-[var(--cromo-fg-muted)] leading-relaxed">{guide.description}</p>
              <p className="text-xs text-[var(--cromo-fg-subtle)]">{guide.meta}</p>
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
              <p className="text-xs font-medium text-[var(--cromo-accent)] group-hover:text-[var(--cromo-accent)] transition-colors">
                Read guide →
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
