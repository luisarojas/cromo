import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/seo';

// Share links are personal — disallow indexing so collectors' lists don't
// end up in Google. The token is unguessable so this is privacy-by-default,
// not security; treat it as one of several layers (the API still
// authorises by token at fetch time). The opengraph-image.tsx sibling
// supplies a per-token preview card; that's still rendered for unfurlers
// regardless of the noindex hint.
const TITLE = `Shared sticker list · ${SITE_NAME}`;
const DESCRIPTION = 'A collector shared their list on Cromo. Open the link to see what they have and want.';

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

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
