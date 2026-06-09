import type { Metadata } from 'next';

// Share links are personal — disallow indexing so collectors' lists don't
// end up in Google. The token is unguessable so this is privacy-by-default,
// not security; treat it as one of several layers (the API still
// authorises by token at fetch time).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
