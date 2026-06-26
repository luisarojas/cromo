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

      {/* Live standings CTA */}
      <Link
        href="/guide/wc-2026/standings"
        className="group flex items-center justify-between gap-4 rounded-xl border border-[var(--cromo-accent)]/40 bg-[var(--cromo-accent-soft)] px-5 py-4 transition-colors hover:border-[var(--cromo-accent)]"
      >
        <span>
          <span className="block text-sm font-bold text-[var(--cromo-accent)]">{t('standingsLink')}</span>
          <span className="block text-xs text-[var(--cromo-fg-muted)]">{t('standingsLinkDesc')}</span>
        </span>
        <span aria-hidden className="text-[var(--cromo-accent)] transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </Link>

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
          <h2 className="text-lg font-bold text-[var(--cromo-fg)]">{t('editions.heading')}</h2>
        </div>
        <p className="text-sm text-[var(--cromo-fg-muted)] leading-relaxed">
          {t('editions.intro')}
        </p>
        <div className="overflow-x-auto rounded-lg border border-[var(--cromo-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-transparent border-b border-[var(--cromo-border)]">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)] whitespace-nowrap">
                  {t('editions.thRegion')}
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  {t('editions.thName')}
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  {t('editions.thTraits')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--cromo-border)]">
              {([
                ['rowNaRegion', 'rowNaName', 'rowNaTraits'],
                ['rowMxRegion', 'rowMxName', 'rowMxTraits'],
                ['rowIntlRegion', 'rowIntlName', 'rowIntlTraits'],
                ['rowUkRegion', 'rowUkName', 'rowUkTraits'],
                ['rowLatamRegion', 'rowLatamName', 'rowLatamTraits'],
                ['rowChRegion', 'rowChName', 'rowChTraits'],
                ['rowBeRegion', 'rowBeName', 'rowBeTraits'],
                ['rowRsRegion', 'rowRsName', 'rowRsTraits'],
                ['rowOtherRegion', 'rowOtherName', 'rowOtherTraits'],
              ] as const).map(([rKey, nKey, tKey]) => (
                <tr key={rKey} className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-[var(--cromo-fg)] whitespace-nowrap">
                    {t(`editions.${rKey}`)}
                  </td>
                  <td className="px-4 py-3 text-[var(--cromo-fg)]">{t(`editions.${nKey}`)}</td>
                  <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">{t(`editions.${tKey}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[var(--cromo-fg-subtle)] leading-relaxed">
          {t('editions.footnote')}
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
          <h2 className="text-lg font-bold text-[var(--cromo-fg)]">{t('formats.heading')}</h2>
        </div>
        <p className="text-sm text-[var(--cromo-fg-muted)] leading-relaxed">
          {t('formats.intro')}
        </p>
        <div className="overflow-x-auto rounded-lg border border-[var(--cromo-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-transparent border-b border-[var(--cromo-border)]">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  {t('formats.thFormat')}
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  {t('formats.thAvailability')}
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  {t('formats.thPrice')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--cromo-border)]">
              {([
                ['softFormat', 'softAvail', 'softPrice'],
                ['hardFormat', 'hardAvail', 'hardPrice'],
                ['metalFormat', 'metalAvail', 'metalPrice'],
                ['treasureFormat', 'treasureAvail', 'treasurePrice'],
                ['silverFormat', 'silverAvail', 'silverPrice'],
                ['goldFormat', 'goldAvail', 'goldPrice'],
              ] as const).map(([fKey, aKey, pKey]) => (
                <tr key={fKey} className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">{t(`formats.${fKey}`)}</td>
                  <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">{t(`formats.${aKey}`)}</td>
                  <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">{t(`formats.${pKey}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-start gap-2.5 rounded-lg bg-[var(--cromo-warning-soft)] border border-[var(--cromo-warning)]/30 px-4 py-3">
          <span className="text-[var(--cromo-warning-text)] shrink-0 mt-0.5 text-base leading-none">⚠</span>
          <p className="text-xs text-[var(--cromo-warning-text)] leading-relaxed">
            {t('formats.platinumWarning')}
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
          <h2 className="text-lg font-bold text-[var(--cromo-fg)]">{t('variants.heading')}</h2>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-[var(--cromo-fg)]">{t('variants.basicsHeading')}</h3>
          <ul className="text-sm text-[var(--cromo-fg-muted)] space-y-1.5 list-disc list-inside">
            <li>
              <span className="font-medium text-[var(--cromo-fg)]">{t('variants.matteLabel')}</span>{' '}
              {t('variants.matteDesc')}
            </li>
            <li>
              <span className="font-medium text-[var(--cromo-fg)]">{t('variants.foilLabel')}</span>{' '}
              {t('variants.foilDesc')}{' '}
              <code className="text-xs bg-[var(--cromo-surface-2)] px-1.5 py-0.5 rounded font-mono">00</code>
              {t('variants.foilDescTail')}
            </li>
          </ul>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-[var(--cromo-fg)]">
            {t('variants.bordersHeading')}
          </h3>
          <p className="text-xs text-[var(--cromo-fg-muted)]">
            {t('variants.bordersIntro')}
          </p>
          <div className="overflow-x-auto rounded-lg border border-[var(--cromo-border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-transparent border-b border-[var(--cromo-border)]">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                    {t('variants.thParallel')}
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                    {t('variants.thPullRate')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--cromo-border)]">
                {[
                  { color: 'bg-[var(--cromo-accent)]', label: t('variants.blueBorder'), rate: t('variants.blueBorderRate') },
                  { color: 'bg-[var(--cromo-danger)]', label: t('variants.redBorder'), rate: t('variants.redBorderRate') },
                  { color: 'bg-[var(--cromo-tier-very-rare)]', label: t('variants.purpleBorder'), rate: t('variants.purpleBorderRate') },
                  { color: 'bg-[var(--cromo-success)]', label: t('variants.greenBorder'), rate: t('variants.greenBorderRate') },
                  { color: 'bg-gray-900', label: t('variants.blackBorder'), rate: t('variants.blackBorderRate') },
                  { color: 'bg-orange-400', label: t('variants.orangeBorder'), rate: t('variants.orangeBorderRate') },
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
            {t('variants.crumpleHeading')}
          </h3>
          <p className="text-xs text-[var(--cromo-fg-muted)]">
            {t('variants.crumpleIntro')}
          </p>
          <div className="overflow-x-auto rounded-lg border border-[var(--cromo-border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-transparent border-b border-[var(--cromo-border)]">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                    {t('variants.thParallel')}
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                    {t('variants.thPullRate')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--cromo-border)]">
                {[
                  { color: 'bg-yellow-400', label: t('variants.goldCrumple'), rate: t('variants.goldCrumpleRate') },
                  { color: 'bg-[var(--cromo-accent)]', label: t('variants.blueCrumple'), rate: t('variants.blueCrumpleRate') },
                  { color: 'bg-[var(--cromo-danger)]', label: t('variants.redCrumple'), rate: t('variants.redCrumpleRate') },
                  { color: 'bg-[var(--cromo-tier-very-rare)]', label: t('variants.purpleCrumple'), rate: t('variants.purpleCrumpleRate') },
                  { color: 'bg-[var(--cromo-success)]', label: t('variants.greenCrumple'), rate: t('variants.greenCrumpleRate') },
                  { color: 'bg-gray-900', label: t('variants.blackCrumple'), rate: t('variants.blackCrumpleRate') },
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
          <h3 className="text-sm font-semibold text-[var(--cromo-fg)]">{t('variants.regionalHeading')}</h3>
          <ul className="text-sm text-[var(--cromo-fg-muted)] space-y-1.5 list-disc list-inside">
            <li>
              <span className="font-medium text-[var(--cromo-fg)]">{t('variants.swissLabel')}</span>{' '}
              {t('variants.swissDesc')}
            </li>
            <li>
              <span className="font-medium text-[var(--cromo-fg)]">{t('variants.belgiumLabel')}</span>{' '}
              {t('variants.belgiumDesc')}
            </li>
          </ul>
        </div>

        <div className="flex items-start gap-2.5 rounded-lg bg-[var(--cromo-accent-soft)] border border-[var(--cromo-accent)]/30 px-4 py-3">
          <span className="text-[var(--cromo-accent)] shrink-0 mt-0.5 text-base leading-none">ℹ</span>
          <p className="text-xs text-[var(--cromo-accent)] leading-relaxed">
            <span className="font-semibold">{t('variants.extrasTitle')}</span>{' '}
            {t('variants.extrasBody')}
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
            {t('breakdown.heading')}{' '}
            <span className="font-normal text-[var(--cromo-fg-muted)] text-base">{t('breakdown.headingSuffix')}</span>
          </h2>
        </div>
        <p className="text-sm text-[var(--cromo-fg-muted)] leading-relaxed">
          {t('breakdown.intro')}
        </p>
        <div className="overflow-x-auto rounded-lg border border-[var(--cromo-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-transparent border-b border-[var(--cromo-border)]">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  {t('breakdown.thSection')}
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  {t('breakdown.thSlots')}
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  {t('breakdown.thCodes')}
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  {t('breakdown.thNotes')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--cromo-border)]">
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">{t('breakdown.weAreSection')}</td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">1</td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--cromo-fg-muted)]">00</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">{t('breakdown.weAreNotes')}</td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">{t('breakdown.brandingSection')}</td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">5</td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--cromo-fg-muted)]">FWC-1 to FWC-5</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  {t('breakdown.brandingNotes')}
                </td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">{t('breakdown.hostsSection')}</td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">3</td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--cromo-fg-muted)]">FWC-6 to FWC-8</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  {t('breakdown.hostsNotes')}
                </td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">{t('breakdown.champsSection')}</td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">11</td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--cromo-fg-muted)]">FWC-9 to FWC-19</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  {t('breakdown.champsNotes')}
                </td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">{t('breakdown.teamsSection')}</td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">48 × 20 = 960</td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--cromo-fg-muted)]">
                  {t('breakdown.teamsCodes')}
                </td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  {t('breakdown.teamsNotes')}
                </td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">{t('breakdown.ccSection')}</td>
                <td className="px-4 py-3 text-[var(--cromo-fg)]">12</td>
                <td className="px-4 py-3 font-mono text-xs text-[var(--cromo-fg-muted)]">CC1 to CC12</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  {t('breakdown.ccNotes')}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="bg-transparent border-t-2 border-[var(--cromo-border)]">
                <td className="px-4 py-3 font-bold text-[var(--cromo-fg)]">{t('breakdown.totalLabel')}</td>
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
          <h2 className="text-lg font-bold text-[var(--cromo-fg)]">{t('cocaCola.heading')}</h2>
        </div>
        <p className="text-sm text-[var(--cromo-fg-muted)] leading-relaxed">
          {t('cocaCola.intro1')}{' '}
          <code className="text-xs bg-[var(--cromo-surface-2)] px-1.5 py-0.5 rounded font-mono">CC1</code>{' '}
          {t('cocaCola.intro2')}{' '}
          <code className="text-xs bg-[var(--cromo-surface-2)] px-1.5 py-0.5 rounded font-mono">CC13</code>
          {t('cocaCola.intro3')}
        </p>
        <div className="overflow-x-auto rounded-lg border border-[var(--cromo-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-transparent border-b border-[var(--cromo-border)]">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  {t('cocaCola.thSet')}
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  {t('cocaCola.thDistribution')}
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--cromo-fg-muted)]">
                  {t('cocaCola.thPlayers')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--cromo-border)]">
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">NAOU</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">{t('cocaCola.naouCountries')}</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  {t('cocaCola.naouPlayers')}
                </td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">EUR</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">{t('cocaCola.eurCountries')}</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">
                  {t('cocaCola.eurPlayers')}
                </td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">LATAM</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">{t('cocaCola.latamCountries')}</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">{t('cocaCola.latamPlayers')}</td>
              </tr>
              <tr className="hover:bg-[var(--cromo-surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--cromo-fg)]">RoW</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">{t('cocaCola.rowCountries')}</td>
                <td className="px-4 py-3 text-[var(--cromo-fg-muted)]">{t('cocaCola.rowPlayers')}</td>
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
          <h2 className="text-lg font-bold text-[var(--cromo-fg)]">{t('whereToBuy.heading')}</h2>
        </div>

        <div className="space-y-1.5">
          <h3 className="text-sm font-semibold text-[var(--cromo-fg)]">{t('whereToBuy.inStores')}</h3>
          <ul className="text-sm text-[var(--cromo-fg-muted)] space-y-2 mt-2">
            {[
              { name: t('whereToBuy.supermarketsName'), desc: t('whereToBuy.supermarketsDesc') },
              { name: t('whereToBuy.amazonName'), desc: t('whereToBuy.amazonDesc') },
              { name: t('whereToBuy.paniniName'), desc: t('whereToBuy.paniniDesc') },
              { name: t('whereToBuy.hobbyName'), desc: t('whereToBuy.hobbyDesc') },
              { name: t('whereToBuy.swissName'), desc: t('whereToBuy.swissDesc') },
              { name: t('whereToBuy.franceName'), desc: t('whereToBuy.franceDesc') },
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
          <h3 className="text-sm font-semibold text-[var(--cromo-fg)]">{t('whereToBuy.digital')}</h3>
          <ul className="text-sm text-[var(--cromo-fg-muted)] space-y-2 mt-2">
            {[
              { name: t('whereToBuy.icollectName'), desc: t('whereToBuy.icollectDesc') },
              { name: t('whereToBuy.appName'), desc: t('whereToBuy.appDesc') },
              { name: t('whereToBuy.ebayName'), desc: t('whereToBuy.ebayDesc') },
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
            {t('whereToBuy.priceFootnote')}
          </p>
        </div>
      </section>
    </div>
  );
}
