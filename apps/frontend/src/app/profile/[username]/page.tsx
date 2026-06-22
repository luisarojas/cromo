import PublicProfileClient from './PublicProfileClient';

// Bare `/profile/[username]` renders the user's default public album
// (server sorts by `is_default DESC, created_at ASC` in getPublicProfile,
// so the client falls back to `tradingInventory[0]`).
export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  return <PublicProfileClient username={username} />;
}
