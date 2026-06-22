import type { Metadata } from 'next';
import { SITE_NAME, INTERNAL_API_URL } from '@/lib/seo';

// Per-album share metadata. We fetch the profile server-side (passing the
// slug as ?album= so unlisted albums resolve) and pick out the matching
// row to name the specific album in title + description. Crawler unfurlers
// auto-fetch the sibling opengraph-image. If the album is gone or private
// we fall back to a generic profile description (the page itself renders
// a stale-link banner client-side).
async function loadAlbum(username: string, slug: string) {
  try {
    const res = await fetch(
      `${INTERNAL_API_URL}/api/v1/profiles/${encodeURIComponent(username)}?album=${encodeURIComponent(slug)}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      tradingInventory: Array<{
        slug: string;
        alias: string | null;
        albumTypeName: string;
        editionName: string;
        formatName: string;
      }>;
    };
    return json.tradingInventory.find((a) => a.slug === slug) ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string; slug: string }>;
}): Promise<Metadata> {
  const { username, slug } = await params;
  const album = await loadAlbum(username, slug);
  const albumName = album?.alias ?? album?.albumTypeName ?? 'album';
  const title = `@${username} — ${albumName} on ${SITE_NAME}`;
  const description = album
    ? `${albumName} (${album.editionName} · ${album.formatName}) — see @${username}'s offered duplicates and wanted list on ${SITE_NAME}.`
    : `See @${username}'s sticker album progress, duplicates, and wanted list on ${SITE_NAME}.`;
  return {
    title,
    description,
    robots: { index: false, follow: true },
    openGraph: {
      type: 'profile',
      title,
      description,
      url: `/profile/${username}/${slug}`,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default function ProfileAlbumLayout({ children }: { children: React.ReactNode }) {
  return children;
}
