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
    accent: 'from-blue-600 to-blue-700',
  },
];

export default function GuidesIndexPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Collector Guides</h1>
        <p className="mt-1 text-sm text-gray-500">
          In-depth references for each Panini sticker collection supported by Stickfolio.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {GUIDES.map((guide) => (
          <Link
            key={guide.href}
            href={guide.href}
            className="group rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden hover:shadow-md hover:border-gray-300 transition-all"
          >
            <div className={`bg-gradient-to-br ${guide.accent} px-5 py-4`}>
              <span className="inline-flex items-center rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white mb-2">
                {guide.label}
              </span>
              <p className="text-white font-bold text-base leading-snug">{guide.title}</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-gray-600 leading-relaxed">{guide.description}</p>
              <p className="text-xs text-gray-400">{guide.meta}</p>
              <div className="flex flex-wrap gap-1.5">
                {guide.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-500"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <p className="text-xs font-medium text-blue-600 group-hover:text-blue-700 transition-colors">
                Read guide →
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
