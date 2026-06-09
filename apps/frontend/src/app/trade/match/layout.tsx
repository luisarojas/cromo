import type { Metadata } from 'next';

// Server-component layout exists solely to attach metadata to the client
// page below. /trade/match is publicly indexable because anyone can paste
// a partner's dupe list and run a match without an account.
export const metadata: Metadata = {
  title: 'Trade Matcher — paste a list, find your missing stickers',
  description:
    'Paste a collector\'s duplicate list and Cromo highlights every sticker you\'re missing in seconds. No account needed.',
  alternates: { canonical: '/trade/match' },
  keywords: [
    'Panini sticker trade',
    'trade matcher',
    'intercambio figuritas',
    'missing stickers',
    'sticker swap',
  ],
};

export default function TradeMatchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
