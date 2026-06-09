import type { MetadataRoute } from 'next';
import { SITE_URL, PUBLIC_ROUTES } from '@/lib/seo';
import { LOCALES } from '@/i18n/config';

// Static sitemap. Locale alternates point to the same URL on each row,
// since locale resolution is cookie-based (no /en or /es path prefix).
// That signals "same content, different language" to crawlers without
// forking the route tree. If we later switch to path-based routing, emit
// a row per (route, locale) pair instead.

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return PUBLIC_ROUTES.map((route) => {
    const url = route === '/' ? `${SITE_URL}/` : `${SITE_URL}${route}`;
    return {
      url,
      lastModified: now,
      changeFrequency:
        route === '/changelog' ? 'weekly' : (route === '/' ? 'weekly' : 'monthly'),
      priority:
        route === '/' ? 1.0
          : route.startsWith('/guide') || route === '/trade/match' ? 0.8
          : 0.5,
      alternates: {
        languages: Object.fromEntries(LOCALES.map((loc) => [loc, url])),
      },
    };
  });
}
