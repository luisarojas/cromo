import type { Metadata } from 'next';
import { Inter, Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import './globals.css';
import { SITE_URL, SITE_NAME, NOINDEX } from '@/lib/seo';
import { LOCALES } from '@/i18n/config';
import AuthProvider from '@/components/AuthProvider';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import ErrorBoundary from '@/components/ErrorBoundary';
import { ToastProvider } from '@/components/ToastProvider';
import BanStatusBanner from '@/components/BanStatusBanner';
import UnverifiedEmailBanner from '@/components/UnverifiedEmailBanner';
import { ThemeProvider, themeBootstrapScript } from '@/components/ThemeProvider';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';
import MobileTabBar from '@/components/MobileTabBar';
import PWAInstallPrompt from '@/components/PWAInstallPrompt';
import OfflineIndicator from '@/components/OfflineIndicator';
import HotkeyCheatsheet from '@/components/HotkeyCheatsheet';
import CommandPalette from '@/components/CommandPalette';
import GlobalHotkeys from '@/components/GlobalHotkeys';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '700'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '600'],
  display: 'swap',
});

const DESCRIPTION =
  'Track every variant, swap duplicates, complete your album. Cromo is the collector-grade home for stickers, cards, and everything you chase.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s · ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    'Panini',
    'FIFA World Cup 2026',
    'sticker album',
    'sticker tracker',
    'sticker trade',
    'cromo',
    'figuritas',
    'colección',
    'intercambio',
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  alternates: {
    canonical: '/',
    languages: Object.fromEntries(LOCALES.map((loc) => [loc, '/'])),
  },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: DESCRIPTION,
    url: SITE_URL,
    locale: 'en_CA',
    alternateLocale: ['es_ES'],
    // images are provided by app/opengraph-image.tsx (file convention)
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: DESCRIPTION,
    // image provided by app/opengraph-image.tsx
  },
  robots: NOINDEX
    ? { index: false, follow: false }
    : {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          'max-image-preview': 'large',
          'max-snippet': -1,
        },
      },
  category: 'sports',
};

const ORGANIZATION_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/icon.png`,
  sameAs: [] as string[],
};

const WEBSITE_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_NAME,
  url: SITE_URL,
  inLanguage: ['en', 'es'],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      data-theme="dark"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        {/* Set theme attribute before paint to prevent flash */}
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
        {/* Structured data — Organization + WebSite. Crawlers parse this
            independently of the visual page so it stays in <head>. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSON_LD) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_JSON_LD) }}
        />
      </head>
      <body className="min-h-screen font-sans antialiased flex flex-col">
        <ServiceWorkerRegistration />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider>
            <AuthProvider>
              <NavBar />
              <BanStatusBanner />
              <UnverifiedEmailBanner />
              <ToastProvider>
                <ErrorBoundary>
                  {/* Bottom padding reserves space for the MobileTabBar via the
                      shared --cromo-tabbar-h token (h-14 + safe-area on mobile,
                      0 on desktop). Single source of truth — search globals.css. */}
                  <main className="flex-1" style={{ paddingBottom: 'var(--cromo-tabbar-h)' }}>
                    {children}
                  </main>
                </ErrorBoundary>
              </ToastProvider>
              <Footer />
              <MobileTabBar />
              <PWAInstallPrompt />
              <OfflineIndicator />
              <HotkeyCheatsheet />
              <CommandPalette />
              <GlobalHotkeys />
            </AuthProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
