import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/seo';

// Invite URLs are single-use tokens shared one-to-one. They mustn't be
// indexed (the token is the credential), but the og:title/description still
// matters for the unfurled preview the recipient sees in their messaging
// app. The opengraph-image.tsx sibling supplies the graphic.
const TITLE = `Let's trade on ${SITE_NAME}`;
const DESCRIPTION = 'A Cromo collector invited you to trade stickers. Open this link to start.';

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

export default function TradeInviteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
