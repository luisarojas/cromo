// Shared SEO helpers. The site URL is the canonical origin we publish to
// crawlers — keep it in sync with the prod ALB hostname (cromotrade.ca).
// Override with NEXT_PUBLIC_SITE_URL in non-prod environments if you want
// preview deploys to publish their own canonical (we usually don't —
// previews should set NEXT_PUBLIC_NOINDEX=true instead so they 404 in
// search results).

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://cromotrade.ca').replace(/\/$/, '');
export const SITE_NAME = 'Cromo';
export const NOINDEX = process.env.NEXT_PUBLIC_NOINDEX === 'true';

// Server-side base for API calls (OG image routes, future RSC fetches).
// NEXT_PUBLIC_API_URL is what the browser hits — in dev that's
// `http://localhost:3001` and inside the frontend container localhost doesn't
// resolve to the api service. INTERNAL_API_URL lets compose point us at
// `http://api:3001`; in prod everything's behind the same ALB so the public
// URL works for both.
export const INTERNAL_API_URL = (
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3001'
).replace(/\/$/, '');

// Public routes that are safe for crawlers and worth indexing. Private
// surfaces (/admin, /dashboard, /album, /trade except /trade/match, /scan,
// /settings, /verify-email, /reset-password, /forgot-password) are blocked
// in robots.ts; we do not list them here.
export const PUBLIC_ROUTES = [
  '/',
  '/guide',
  '/guide/wc-2026',
  '/trade/match',
  '/changelog',
  '/login',
  '/register',
] as const;

// Routes that should never be indexed even if a crawler stumbles onto them
// — sharing tokens are personal-link-only and we don't want them archived.
export const NEVER_INDEX_PREFIXES = [
  '/share/',
  '/profile/', // public profiles render an HTML meta robots noindex; we
  // could relax this once username-only profiles stabilise.
  '/verify-email',
  '/reset-password',
  '/forgot-password',
];

export function absoluteUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
