import type { Metadata } from 'next';

// Public profiles can be linked freely, but we keep them out of the index
// for now — usernames are a low-signal way to enter the site and the
// profile renders heavily client-side, so crawlers wouldn't see useful
// content anyway. Revisit once profiles render meaningful SSR'd content.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
