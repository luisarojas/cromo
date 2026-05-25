import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { DEFAULT_LOCALE, isLocale } from './config';

// Server-side locale resolution. Priority:
//   1. NEXT_LOCALE cookie (set by the LocaleSwitcher on the client)
//   2. Accept-Language header
//   3. DEFAULT_LOCALE
//
// We avoid path-based routing (/en/album, /es/album) to keep URLs short and
// share-link-friendly. Phase B can switch to path-based if SEO requires it.
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;
  if (cookieLocale && isLocale(cookieLocale)) {
    return loadLocale(cookieLocale);
  }
  const accept = headerStore.get('accept-language') ?? '';
  const headerLocale = accept.split(',')[0]?.split('-')[0]?.trim().toLowerCase() ?? '';
  if (headerLocale && isLocale(headerLocale)) {
    return loadLocale(headerLocale);
  }
  return loadLocale(DEFAULT_LOCALE);
});

async function loadLocale(locale: string) {
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
}
