import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export const metadata: Metadata = {
  title: 'Panini FIFA World Cup 2026 — collector\'s guide',
  description:
    '980 stickers, 48 teams, every variant explained — borders, Crumple parallels, Coca-Cola alternates, Extras. The collector\'s handbook for the Panini FIFA World Cup 2026 album.',
  alternates: { canonical: '/guide/wc-2026' },
  keywords: [
    'Panini',
    'FIFA World Cup 2026',
    'sticker album',
    'sticker checklist',
    'parallels',
    'Crumple',
    'Coca-Cola',
    'Extra stickers',
    'figuritas Mundial 2026',
  ],
};

export default async function WC2026GuidePage() {
  const t = await getTranslations('wc2026Guide');
  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">

      {/* Back */}
      <Link
        href="/guide"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)] transition-colors"
      >
        <span aria-hidden>←</span> {t('allGuides')}
      </Link>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] px-8 py-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full opacity-25 blur-3xl cromo-chrome-fill"
        />
        <span className="relative inline-flex items-center rounded-full cromo-chrome-fill px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#0E1117] mb-4">
          {t('badge')}
        </span>
        <h1 className="relative font-display text-3xl font-bold leading-tight tracking-tight cromo-chrome-text">
          {t('heroTitle')}
        </h1>
        <p className="relative mt-1 text-lg font-medium text-[var(--cromo-fg-muted)]">
          {t('heroSubtitle')}
        </p>
        <p className="relative mt-4 max-w-xl text-sm leading-relaxed text-[var(--cromo-fg-muted)]">
          {t('heroBody')}
        </p>
      </div>

      {/* TOC */}
      <nav className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--cromo-fg-subtle)] mb-3">
          {t('tocHeading')}
        </p>
        <ol className="grid sm:grid-cols-2 gap-0.5">
          {(
            [
              ['#editions', t('toc.editions')],
              ['#formats', t('toc.formats')],
              ['#variants', t('toc.variants')],
              ['#breakdown', t('toc.breakdown')],
              ['#coca-cola', t('toc.cocaCola')],
              ['#where-to-buy', t('toc.whereToBuy')],
            ] as const
          ).map(([href, label], i) => (
            <li key={href}>
              <a
                href={href}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)] hover:text-[var(--cromo-accent)] transition-colors group"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--cromo-accent-soft)] text-[10px] font-bold text-[var(--cromo-accent)] group-hover:bg-[var(--cromo-accent-soft)] transition-colors">
                  {i + 1}
                </span>
                {label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* 1. Regional Editions */}
      <section
        id="editions"
        className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-6 space-y-4"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--cromo-accent)] text-xs font-bold text-[var(--cromo-accent-fg)]">
            1
          </span>
          <h2 className="text-lg font-bold text-[var(--cromo-fg)]">Which edition should you buy?</h2>
        </div>
        <p className="text-sm text-[var(--cromo-fg-muted)] leading-relaxed">
          Panini makes the same 980-sticker album for the whole world, but they dress it up a bit
          differently depending on where you live — a different cover, your local language, and
          sometimes a few exclusive stickers you can&apos;t get anywhere else. If you&apos;re
          chasing a specific rare border, it really does matter which version of the packs you
          buy.
        </p>
        <div className="overflow-x-auto rounded-lg border border-[var(--cromo-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-transparent border-b border-[var(--cromo-border)]">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)] whitespace-nowrap">
                  Region
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  Edition Name
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  Key Traits
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--cromo-border)]">
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)] whitespace-nowrap">
                  USA / Canada
                </td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">North America (NA)</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  White-bordered stickers; six border parallels (Blue, Red, Purple, Green, Black,
                  Orange)
                </td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)] whitespace-nowrap">Mexico</td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">Mexico Edition</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  Spanish-language; dedicated Mexican cover variant
                </td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)] whitespace-nowrap">
                  International
                </td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">Global (Standard)</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  No white border on stickers; 20 bonus elite-player stickers in
                  Purple / Bronze / Silver / Gold (no album slot — collectibles only)
                </td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)] whitespace-nowrap">UK</td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">UK Edition</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">UK-specific Coca-Cola sticker lineup</td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)] whitespace-nowrap">
                  Latin America
                </td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">LATAM Edition</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  LATAM-specific Coca-Cola sticker lineup
                </td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)] whitespace-nowrap">
                  Switzerland
                </td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">United Edition (United 2026)</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  Thicker paper; metallised softcover; exclusive Green parallel stickers; numbered
                  Treasure Box hardcover (1–5000)
                </td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)] whitespace-nowrap">Belgium</td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">Belgium Edition</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  Silver parallel (players only) exclusive to Special Blister packs
                </td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)] whitespace-nowrap">Serbia</td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">Serbia Edition</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">Unique Coca-Cola sticker subset</td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">
                  Brazil, France, Germany, Spain, Italy, Colombia, and more
                </td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">Country-specific covers</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  Same base content; regional cover art; France also has Silver and Gold premium
                  hardcover editions
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[var(--cromo-fg-subtle)] leading-relaxed">
          The team pages aren&apos;t in the same order in every album — your home country usually
          gets a spot near the front. North American albums lead with Canada, Mexico, and the USA;
          LATAM editions put Brazil and Argentina up first.
        </p>
      </section>

      {/* 2. Album Formats */}
      <section
        id="formats"
        className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-6 space-y-4"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--cromo-accent)] text-xs font-bold text-[var(--cromo-accent-fg)]">
            2
          </span>
          <h2 className="text-lg font-bold text-[var(--cromo-fg)]">Softcover, hardcover &amp; beyond</h2>
        </div>
        <p className="text-sm text-[var(--cromo-fg-muted)] leading-relaxed">
          The album comes in a few different flavours depending on where you shop. The stickers
          inside are always the same 980 — what changes is the cover (paperback, hardcover, fancy
          metallic) and how easy it is to actually find.
        </p>
        <div className="overflow-x-auto rounded-lg border border-[var(--cromo-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-transparent border-b border-[var(--cromo-border)]">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  Format
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  Availability
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  Approx. Price
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--cromo-border)]">
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">Softcover</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  Global — supermarkets, newsstands, most retailers
                </td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">~CAD$6.99</td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">Hardcover</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  Global — Amazon Collectors Bundle and select retailers
                </td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">~CAD$19.99</td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">Metallised Softcover</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">Switzerland only — United Edition</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">CHF 4.90</td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">
                  Limited Hardcover (Treasure Box)
                </td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  Switzerland only — numbered 1/5000 to 5000/5000
                </td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">CHF premium</td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">Silver Hardcover</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">France only — premium tier</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">€ premium</td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">Gold Hardcover</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">France only — premium tier</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">€ premium</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex items-start gap-2.5 rounded-lg bg-[var(--cromo-warning-soft)] border border-[var(--cromo-warning)]/30 px-4 py-3">
          <span className="text-[var(--cromo-warning-text)] shrink-0 mt-0.5 text-base leading-none">⚠</span>
          <p className="text-xs text-[var(--cromo-warning-text)] leading-relaxed">
            Heads up: there&apos;s no such thing as a &ldquo;Platinum&rdquo; edition. If you see
            one listed online, it&apos;s a fake — don&apos;t pay extra for it.
          </p>
        </div>
      </section>

      {/* 3. Sticker Variants */}
      <section
        id="variants"
        className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-6 space-y-6"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--cromo-accent)] text-xs font-bold text-[var(--cromo-accent-fg)]">
            3
          </span>
          <h2 className="text-lg font-bold text-[var(--cromo-fg)]">The fancy sticker variants</h2>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-[var(--cromo-fg)]">The basics: matte vs. foil</h3>
          <ul className="text-sm text-[var(--cromo-fg-muted)] space-y-1.5 list-disc list-inside">
            <li>
              <span className="font-medium text-[var(--cromo-fg)]">Matte</span> — your everyday
              stickers. Most of what you&apos;ll pull will be these.
            </li>
            <li>
              <span className="font-medium text-[var(--cromo-fg)]">Foil (shiny)</span> — the
              eye-catching ones. There are 49 in total: the &ldquo;We Are Panini&rdquo; sticker{' '}
              <code className="text-xs bg-[var(--cromo-surface-2)] px-1.5 py-0.5 rounded font-mono">00</code>,
              the eight World Cup branding stickers (FWC-1 to FWC-8), and the team emblem for each
              of the 48 nations.
            </li>
          </ul>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-[var(--cromo-fg)]">
            Coloured borders (North America only)
          </h3>
          <p className="text-xs text-[var(--cromo-fg-muted)]">
            If you buy packs in the US or Canada, you&apos;ll occasionally get stickers with
            coloured borders instead of plain white. The rarer the colour, the bigger the brag. Foil
            stickers always come with the regular border — they don&apos;t get the colour treatment.
          </p>
          <div className="overflow-x-auto rounded-lg border border-[var(--cromo-border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-transparent border-b border-[var(--cromo-border)]">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                    Parallel
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                    Pull Rate
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--cromo-border)]">
                {[
                  { color: 'bg-[var(--cromo-accent)]', label: 'Blue Border', rate: '1 in 2 packs' },
                  { color: 'bg-[var(--cromo-danger)]', label: 'Red Border', rate: '1 in 25 packs' },
                  { color: 'bg-[var(--cromo-tier-very-rare)]', label: 'Purple Border', rate: '1 in 200 packs' },
                  { color: 'bg-[var(--cromo-success)]', label: 'Green Border', rate: '1 in 1,400 packs' },
                  { color: 'bg-gray-900', label: 'Black Border', rate: '1 of 1 — unique' },
                  { color: 'bg-orange-400', label: 'Orange Border', rate: 'Amazon 50-pack box exclusive' },
                ].map(({ color, label, rate }) => (
                  <tr key={label} className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                    <td className="px-4 py-3 text-[var(--cromo-fg)]">
                      <span className="flex items-center gap-2.5">
                        <span className={`inline-block h-3 w-3 rounded-full shrink-0 ${color}`} />
                        {label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">{rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-[var(--cromo-fg)]">
            &ldquo;Crumple&rdquo; stickers (Panini iCollect)
          </h3>
          <p className="text-xs text-[var(--cromo-fg-muted)]">
            These are the wrinkled metallic ones — a totally separate line you can only get through
            Panini America&apos;s iCollect online store. You won&apos;t find them in any physical
            pack from a shop.
          </p>
          <div className="overflow-x-auto rounded-lg border border-[var(--cromo-border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-transparent border-b border-[var(--cromo-border)]">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                    Parallel
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                    Pull Rate
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--cromo-border)]">
                {[
                  { color: 'bg-yellow-400', label: 'Gold Flood Crumple', rate: '6 per iCollect pack' },
                  { color: 'bg-[var(--cromo-accent)]', label: 'Blue Crumple', rate: '1 in 2' },
                  { color: 'bg-[var(--cromo-danger)]', label: 'Red Crumple', rate: '1 in 26' },
                  { color: 'bg-[var(--cromo-tier-very-rare)]', label: 'Purple Crumple', rate: '1 in 285' },
                  { color: 'bg-[var(--cromo-success)]', label: 'Green Crumple', rate: '1 in 1,529' },
                  { color: 'bg-gray-900', label: 'Black Crumple', rate: '1 of 1 — unique' },
                ].map(({ color, label, rate }) => (
                  <tr key={label} className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                    <td className="px-4 py-3 text-[var(--cromo-fg)]">
                      <span className="flex items-center gap-2.5">
                        <span className={`inline-block h-3 w-3 rounded-full shrink-0 ${color}`} />
                        {label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">{rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-[var(--cromo-fg)]">A few more regional surprises</h3>
          <ul className="text-sm text-[var(--cromo-fg-muted)] space-y-1.5 list-disc list-inside">
            <li>
              <span className="font-medium text-[var(--cromo-fg)]">Green border</span> — only in
              Switzerland&apos;s &ldquo;Panini United 2026&rdquo; packs
            </li>
            <li>
              <span className="font-medium text-[var(--cromo-fg)]">Silver border (players only)</span> —
              Belgium-exclusive, hidden inside the Special Blister packs
            </li>
          </ul>
        </div>

        <div className="flex items-start gap-2.5 rounded-lg bg-[var(--cromo-accent-soft)] border border-[var(--cromo-accent)]/30 px-4 py-3">
          <span className="text-[var(--cromo-accent)] shrink-0 mt-0.5 text-base leading-none">ℹ</span>
          <p className="text-xs text-[var(--cromo-accent)] leading-relaxed">
            <span className="font-semibold">About those bonus &ldquo;Extra&rdquo; stickers:</span>{' '}
            International packs sometimes throw in a bonus sticker of one of 20 superstars in
            Purple, Bronze, Silver, or Gold — about once every 100 packs. They&apos;re fun to pull,
            but they don&apos;t go in the album. Think of them as a side collection.
          </p>
        </div>
      </section>

      {/* 4. What's in the Album */}
      <section
        id="breakdown"
        className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-6 space-y-4"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--cromo-accent)] text-xs font-bold text-[var(--cromo-accent-fg)]">
            4
          </span>
          <h2 className="text-lg font-bold text-[var(--cromo-fg)]">
            What&apos;s actually in the album{' '}
            <span className="font-normal text-[var(--cromo-fg-muted)] text-base">(all 980 of them)</span>
          </h2>
        </div>
        <p className="text-sm text-[var(--cromo-fg-muted)] leading-relaxed">
          Every album has the same 980 spots to fill, laid out across 112 pages. Here&apos;s how
          they break down:
        </p>
        <div className="overflow-x-auto rounded-lg border border-[var(--cromo-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-transparent border-b border-[var(--cromo-border)]">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  Section
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  Slots
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  Codes
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--cromo-border)]">
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">We Are Panini</td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">1</td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--cromo-fg-muted)]">00</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">Foil</td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">World Cup Branding</td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">5</td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--cromo-fg-muted)]">FWC-1 to FWC-5</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  Emblem ×2, Mascot, Slogan, Ball — all Foil
                </td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">Host Countries</td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">3</td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--cromo-fg-muted)]">FWC-6 to FWC-8</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  Canada, Mexico, USA emblems — all Foil
                </td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">Past Champions</td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">11</td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--cromo-fg-muted)]">FWC-9 to FWC-19</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  Team photos of past World Cup winners (back of album). Some champions
                  (e.g. Italy &apos;38, Brazil &apos;58, England &apos;66) are printed directly
                  in the album and are not collectible sticker slots.
                </td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">48 Teams</td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">48 × 20 = 960</td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--cromo-fg-muted)]">
                  e.g. ARG-1 to ARG-20
                </td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  Per team: 1 Foil emblem + 18 player stickers + 1 team photo
                </td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">Coca-Cola Special</td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">12</td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--cromo-fg-muted)]">CC1 to CC12</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  Double-page spread in the middle of the album. Not in standard packs — see
                  section 5.
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="bg-transparent border-t-2 border-[var(--cromo-border)]">
                <td className="px-4 py-3 font-bold text-[var(--cromo-fg)]">Total</td>
                <td className="px-4 py-3 font-bold text-[var(--cromo-fg)]">980</td>
                <td className="px-4 py-3" colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* 5. Coca-Cola */}
      <section
        id="coca-cola"
        className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-6 space-y-4"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--cromo-accent)] text-xs font-bold text-[var(--cromo-accent-fg)]">
            5
          </span>
          <h2 className="text-lg font-bold text-[var(--cromo-fg)]">The Coca-Cola section</h2>
        </div>
        <p className="text-sm text-[var(--cromo-fg-muted)] leading-relaxed">
          In the middle of every album there&apos;s a special two-page spread for stickers{' '}
          <code className="text-xs bg-[var(--cromo-surface-2)] px-1.5 py-0.5 rounded font-mono">CC1</code> to{' '}
          <code className="text-xs bg-[var(--cromo-surface-2)] px-1.5 py-0.5 rounded font-mono">CC13</code> —
          a Panini × Coca-Cola crossover featuring some of the tournament&apos;s biggest names. The
          slots are the same everywhere, but who fills them depends on which corner of the world
          your packs come from. Some slots even change player by region — CC9 alone has Davies in
          North America, Saliba in Europe, and Ayew in the Rest of World.
        </p>
        <div className="overflow-x-auto rounded-lg border border-[var(--cromo-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-transparent border-b border-[var(--cromo-border)]">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  Regional Set
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  Distributed In
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  Notable Players
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--cromo-border)]">
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">NAOU</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">USA, Canada</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  Antonee Robinson (USA), Alphonso Davies (Canada)
                </td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">EUR</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">UK, Germany, France, Spain, Serbia</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  William Saliba (France), Eduardo Camavinga (some variants)
                </td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">LATAM</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">Latin America</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">LATAM-specific player selection</td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">RoW</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">Rest of World</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">Jordan Ayew (Ghana)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 6. Where to Buy */}
      <section
        id="where-to-buy"
        className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-6 space-y-5"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--cromo-accent)] text-xs font-bold text-[var(--cromo-accent-fg)]">
            6
          </span>
          <h2 className="text-lg font-bold text-[var(--cromo-fg)]">Where to grab some packs</h2>
        </div>

        <div className="space-y-1.5">
          <h3 className="text-sm font-semibold text-[var(--cromo-fg)]">In stores and online</h3>
          <ul className="text-sm text-[var(--cromo-fg-muted)] space-y-2 mt-2">
            {[
              {
                name: 'Supermarkets & newsstands',
                desc: 'The easiest place to start. Walmart, Target, Tesco, Carrefour — you’ll find the regular softcover album and loose packs (about 5 stickers a pack) right next to the checkout.',
              },
              {
                name: 'Amazon',
                desc: 'The Collectors Bundle comes with a hardcover album. In the US and Canada you can also grab the Amazon-exclusive box of packs — that’s where the orange-border stickers live.',
              },
              {
                name: 'Panini’s own stores',
                desc: 'paniniamerica.net, panini.co.uk, panini.de, and so on. Good for starter packs, blister packs, bigger bundles, and country-specific goodies.',
              },
              {
                name: 'Sports card & hobby shops',
                desc: 'If you want to go big, these shops carry full boxes and premium bundles. They’re also where you’ll find live box-break events and the harder-to-pull stuff.',
              },
              {
                name: 'Switzerland — Panini United 2026',
                desc: 'Sold through Swiss Panini sellers and panini.ch. The numbered Treasure Box hardcover (only 5,000 made) is exclusive to here.',
              },
              {
                name: 'France — Silver & Gold Hardcovers',
                desc: 'Check Fnac, Leclerc, or the Panini France online store.',
              },
            ].map(({ name, desc }) => (
              <li key={name} className="flex gap-2">
                <span className="mt-1 text-[var(--cromo-fg-subtle)] shrink-0">›</span>
                <span>
                  <span className="font-medium text-[var(--cromo-fg)]">{name}</span> — {desc}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-1.5">
          <h3 className="text-sm font-semibold text-[var(--cromo-fg)]">Going digital</h3>
          <ul className="text-sm text-[var(--cromo-fg-muted)] space-y-2 mt-2">
            {[
              {
                name: 'Panini America iCollect',
                desc: 'Digital-only packs at icollect.paniniamerica.net. This is the only place to get those Crumple stickers — nothing ships to your door.',
              },
              {
                name: 'FIFA Panini Collection app',
                desc: 'The official companion app. Handy for keeping tabs on what you’ve collected and seeing the album layout for your region.',
              },
              {
                name: 'eBay, Mercado Libre, Vinted',
                desc: 'Where most collectors buy and sell singles, sealed packs, and rare borders. Prices are all over the map — shop around before you commit.',
              },
            ].map(({ name, desc }) => (
              <li key={name} className="flex gap-2">
                <span className="mt-1 text-[var(--cromo-fg-subtle)] shrink-0">›</span>
                <span>
                  <span className="font-medium text-[var(--cromo-fg)]">{name}</span> — {desc}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-start gap-2.5 rounded-lg bg-transparent border border-[var(--cromo-border)] px-4 py-3">
          <span className="text-[var(--cromo-fg-subtle)] shrink-0 mt-0.5 text-base leading-none">ℹ</span>
          <p className="text-xs text-[var(--cromo-fg-muted)] leading-relaxed">
            Prices and stock listed above are rough as of May 2026 — they bounce around a lot
            between countries and shops. And remember: page numbers shift between regional editions,
            so if you&apos;re looking for a specific spot, the table of contents in your own album
            (or the FIFA Panini Collection app) is your best friend.
          </p>
        </div>
      </section>
    </div>
  );
}
