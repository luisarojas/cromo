import type { Metadata } from 'next';
import './globals.css';
import AuthProvider from '@/components/AuthProvider';
import NavBar from '@/components/NavBar';
import ErrorBoundary from '@/components/ErrorBoundary';
import { ToastProvider } from '@/components/ToastProvider';
import BanStatusBanner from '@/components/BanStatusBanner';

export const metadata: Metadata = {
  title: 'Stickfolio',
  description: 'Sticker Collection Tracker',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">
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
