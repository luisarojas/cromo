import type { Metadata } from 'next';
import { Inter, Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import AuthProvider from '@/components/AuthProvider';
import NavBar from '@/components/NavBar';
import ErrorBoundary from '@/components/ErrorBoundary';
import { ToastProvider } from '@/components/ToastProvider';
import BanStatusBanner from '@/components/BanStatusBanner';

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
  title: 'Cromo — collection tracker & trade matchmaker',
  description:
    'Track every variant, swap duplicates, complete your album. Cromo is the collector-grade home for stickers, cards, and everything you chase.',
  applicationName: 'Cromo',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-gray-50 text-gray-900 font-sans antialiased">
        <AuthProvider>
          <NavBar />
          <BanStatusBanner />
          <ToastProvider>
            <ErrorBoundary>
              <main>{children}</main>
            </ErrorBoundary>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
