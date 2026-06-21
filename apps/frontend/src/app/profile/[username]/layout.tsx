import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/seo';

// Public profiles can be linked freely, but we keep them out of the index
// for now — usernames are a low-signal way to enter the site and the
// profile renders heavily client-side, so crawlers wouldn't see useful
// content anyway. Revisit once profiles render meaningful SSR'd content.
// The opengraph-image.tsx sibling supplies a personalised share card.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const title = `@${username} on ${SITE_NAME}`;
  const description = `See ${username}'s sticker album progress, duplicates, and wanted list on ${SITE_NAME}.`;
  return {
    title,
    description,
    robots: { index: false, follow: true },
    openGraph: {
      type: 'profile',
      title,
      description,
      url: `/profile/${username}`,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
