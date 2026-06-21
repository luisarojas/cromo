import type { MetadataRoute } from 'next';
import { SITE_URL, NOINDEX } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  if (NOINDEX) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/guide', '/trade/match', '/changelog', '/login', '/register'],
        disallow: [
          '/admin',
          '/dashboard',
          '/collection',
          '/album/',
          '/scan',
          '/settings',
          '/profile/',
          '/share/',
          '/trade/',
          '/verify-email',
          '/forgot-password',
          '/reset-password',
          '/api/',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
