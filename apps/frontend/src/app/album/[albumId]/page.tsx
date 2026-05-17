import AlbumDetailClient from './AlbumDetailClient';

// Server component: thin shell that hands the route param to a client child.
// The actual UI is heavily interactive + auth-gated by a token held in client
// state, so the page itself stays small while the work happens in
// AlbumDetailClient. Splitting like this means the server-rendered HTML
// payload no longer carries the 1100-line client component as inline JS.
export default async function AlbumDetailPage({
  params,
}: {
  params: Promise<{ albumId: string }>;
}) {
  const { albumId } = await params;
  return <AlbumDetailClient albumId={albumId} />;
}
