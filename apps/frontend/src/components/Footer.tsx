import Link from 'next/link';
import { CromoLogo } from '@/components/CromoLogo';

const PRODUCT_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/album', label: 'Collection' },
  { href: '/trade', label: 'Trade' },
  { href: '/scan', label: 'Scan' },
];

const RESOURCE_LINKS = [
  { href: '/guide', label: 'Collector Guides' },
  { href: '/guide/wc-2026', label: 'World Cup 2026' },
];

const ACCOUNT_LINKS = [
  { href: '/settings', label: 'Settings' },
  { href: '/login', label: 'Sign in' },
  { href: '/register', label: 'Create account' },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[var(--cromo-border)] bg-[var(--cromo-surface)] mt-16">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="space-y-3">
            <CromoLogo size={24} variant="chrome" />
            <p className="text-xs leading-relaxed text-[var(--cromo-fg-muted)] max-w-xs">
              Collection tracker and trade matchmaker for stickers, cards, and everything you chase.
            </p>
          </div>

          <FooterColumn title="Product" links={PRODUCT_LINKS} />
          <FooterColumn title="Resources" links={RESOURCE_LINKS} />
          <FooterColumn title="Account" links={ACCOUNT_LINKS} />
        </div>

        {/* Hairline */}
        <div className="mt-10 pt-6 border-t border-[var(--cromo-border)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-xs text-[var(--cromo-fg-subtle)]">
            © {year} Cromo · <span className="italic">cromo</span>, Spanish for trading sticker.
          </p>
          <p className="text-[11px] text-[var(--cromo-fg-subtle)] font-mono">
            Not affiliated with Panini S.p.A. or FIFA. Built by collectors.
          </p>
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
