import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/seo';

// Live-trade join landing — used by QR scans and shared 6-digit codes. The
// page itself is a form (or auto-submitting redirect when `code` is in the
// URL); the metadata here is purely for link previews. The opengraph-image
// sibling supplies the graphic.
const TITLE = `Join a live trade · ${SITE_NAME}`;
const DESCRIPTION = 'Open the link or enter the 6-digit code to join a real-time sticker trade — no account needed.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: { index: false, follow: false },
  openGraph: {
    type: 'website',
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return children;
}
