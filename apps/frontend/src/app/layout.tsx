import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import ErrorBoundary from '@/components/ErrorBoundary';

export const metadata: Metadata = {
  title: 'Stickfolio',
  description: '2026 FIFA World Cup Panini Sticker Tracker',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        {/* Navigation */}
        <nav className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-6">
            <Link
              href="/"
              className="font-bold text-blue-600 text-lg tracking-tight hover:text-blue-700 transition-colors"
            >
              Stickfolio
            </Link>
            <div className="flex gap-4 text-sm font-medium">
              <Link
                href="/"
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                Home
              </Link>
              <Link
                href="/dashboard"
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                Dashboard
              </Link>
              <Link
                href="/album"
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                Album
              </Link>
              <Link
                href="/admin/stickers"
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                Admin
              </Link>
            </div>
          </div>
        </nav>

        {/* Main content wrapped in ErrorBoundary */}
        <ErrorBoundary>
          <main>{children}</main>
        </ErrorBoundary>
      </body>
    </html>
  );
}
