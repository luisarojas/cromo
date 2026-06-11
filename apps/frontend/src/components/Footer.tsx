import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { CromoLogo } from '@/components/CromoLogo';
import LocaleSwitcher from '@/components/LocaleSwitcher';

export default async function Footer() {
  const t = await getTranslations('footer');
  const tNav = await getTranslations('nav');
  const year = new Date().getFullYear();
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0-local';

  const productLinks = [
    { href: '/dashboard', label: t('links.dashboard') },
    { href: '/album', label: t('links.collection') },
    { href: '/trade', label: t('links.trade') },
    { href: '/scan', label: t('links.scan') },
  ];
  const resourceLinks = [
    { href: '/guide', label: t('links.guides') },
    { href: '/guide/wc-2026', label: t('links.wc2026') },
  ];
  const accountLinks = [
    { href: '/settings', label: t('links.settings') },
    { href: '/login', label: t('links.signIn') },
    { href: '/register', label: t('links.createAccount') },
  ];

  return (
    // Bottom padding reserves space below the visible content equal to the
    // MobileTabBar's height (via the shared --cromo-tabbar-h token in
    // globals.css — 0 on desktop). The footer's surface bg continues into
    // that reserved area, which matches the tab bar's translucent surface
    // on top, so the seam is invisible.
    <footer
      style={{ paddingBottom: 'var(--cromo-tabbar-h)' }}
      className="border-t border-[var(--cromo-border)] bg-[var(--cromo-surface)] mt-16"
    >
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="space-y-3">
            <Link href="/" className="inline-block hover:opacity-80 transition-opacity" aria-label={tNav('home')}>
              <CromoLogo size={24} variant="chrome" />
            </Link>
            <p className="text-xs leading-relaxed text-[var(--cromo-fg-muted)] max-w-xs">
              {t('tagline')}
            </p>
          </div>

          <FooterColumn title={t('columns.product')} links={productLinks} />
          <FooterColumn title={t('columns.resources')} links={resourceLinks} />
          <FooterColumn title={t('columns.account')} links={accountLinks} />
        </div>

        {/* Hairline */}
        <div className="mt-10 pt-6 border-t border-[var(--cromo-border)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-xs text-[var(--cromo-fg-subtle)]">
            {t('copyrightPrefix')} {year} {t('copyrightSuffix')}{' '}
            <span className="italic">{t('italicCromo')}</span>{t('copyrightTail')}
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <LocaleSwitcher />
            <p className="text-[11px] text-[var(--cromo-fg-subtle)] font-mono">
              {t('notAffiliated')} · <span title={t('versionTitle')}>{version}</span>
            </p>
          </div>
        </div>

        {/* Legal links — discoverable so reviewers (AWS SES, App stores, CASL)
            can find them, and so users have one click to the policies. */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--cromo-fg-subtle)]">
          <Link href="/privacy" className="hover:text-[var(--cromo-fg)] transition-colors">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-[var(--cromo-fg)] transition-colors">
            Terms
          </Link>
          <a
            href="mailto:support@cromotrade.ca"
            className="hover:text-[var(--cromo-fg)] transition-colors"
          >
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}

interface FooterColumnProps {
  title: string;
  links: ReadonlyArray<{ href: string; label: string }>;
}

function FooterColumn({ title, links }: FooterColumnProps) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--cromo-fg-subtle)] mb-3">
        {title}
      </h3>
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-sm text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)] transition-colors"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
