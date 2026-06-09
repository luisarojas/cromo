'use client';

import { useLocale, useTranslations } from 'next-intl';
import { LOCALES, type Locale } from '@/i18n/config';

// Sets the NEXT_LOCALE cookie and reloads so the server re-resolves messages.
// One-year expiry matches next-intl's recommended default.
function setLocale(locale: Locale) {
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `NEXT_LOCALE=${locale}; Path=/; Max-Age=${oneYear}; SameSite=Lax`;
  window.location.reload();
}

export default function LocaleSwitcher({ className }: { className?: string }) {
  const t = useTranslations('locale');
  const current = useLocale() as Locale;

  return (
    <label className={`flex items-center gap-1.5 text-xs text-[var(--cromo-fg-muted)] ${className ?? ''}`}>
      <span className="sr-only">{t('switcherLabel')}</span>
      <select
        value={current}
        onChange={(e) => setLocale(e.target.value as Locale)}
        aria-label={t('switcherLabel')}
        className="bg-transparent border border-[var(--cromo-border)] rounded-btn px-2 py-1 text-xs font-medium text-[var(--cromo-fg)] hover:border-[var(--cromo-border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)]/40 transition-colors cursor-pointer"
      >
        {LOCALES.map((loc) => (
          <option key={loc} value={loc}>
            {loc === 'en' ? t('english') : t('spanish')}
          </option>
        ))}
      </select>
    </label>
  );
}
