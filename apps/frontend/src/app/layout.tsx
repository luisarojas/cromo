import type { Metadata } from 'next';
import { Inter, Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import './globals.css';
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

export const metadata: Metadata = {
  title: 'Cromo',
  description:
    'Track every variant, swap duplicates, complete your album. Cromo is the collector-grade home for stickers, cards, and everything you chase.',
  applicationName: 'Cromo',
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
