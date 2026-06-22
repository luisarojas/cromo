import PublicProfileClient from '../PublicProfileClient';

// Deep-linkable per-album URL keyed by a stable user-scoped slug. Slug
// acts as a capability token: an unlisted album joins the rendered
// inventory only when reached via this path. Private albums never load.
// Stale/private/wrong slugs surface a banner + fallback to the default
// public album client-side.
export default async function ProfileAlbumPage({
  params,
}: {
  params: Promise<{ username: string; slug: string }>;
}) {
  const { username, slug } = await params;
  return <PublicProfileClient username={username} initialAlbumSlug={slug} />;
}
