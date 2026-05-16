'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  fetchPublicProfile,
  fetchPublicWanted,
  type PublicProfile,
  type PublicProfileAlbum,
  type PublicInventoryItem,
} from '@/lib/api';
import { useAuthStore } from '@/store/auth';

type InventoryTab = 'offered' | 'wanted';

interface WantedState {
  items: PublicInventoryItem[];
  nextCursor: number | null;
  total: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
}

function albumLabel(album: PublicProfileAlbum): string {
  return album.alias ?? album.albumTypeName;
}

function groupByTeam(items: PublicInventoryItem[]): Map<string, PublicInventoryItem[]> {
  const grouped = new Map<string, PublicInventoryItem[]>();
  for (const item of items) {
    const key = item.teamName ?? 'Other';
    const bucket = grouped.get(key) ?? [];
    bucket.push(item);
    grouped.set(key, bucket);
  }
  return grouped;
}

function sortTeams(teams: string[]): string[] {
  return [...teams].sort((a, b) => {
    if (a === 'Other') return 1;
    if (b === 'Other') return -1;
    return a.localeCompare(b);
  });
}

export default function PublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const username =
    typeof params.username === 'string' ? params.username : (params.username?.[0] ?? '');

  const viewer = useAuthStore((s) => s.user);

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-album lazy wanted state.
  const [wantedByAlbum, setWantedByAlbum] = useState<Record<string, WantedState>>({});

  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!username) return;
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchPublicProfile(username);
        if (cancelled) return;
        setProfile(data);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('404') || msg.includes('not found')) {
          setNotFound(true);
        } else {
          setError(msg || 'Failed to load profile');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [username]);

  // ── URL ↔ tab state sync ───────────────────────────────────────────────────
  const urlAlbumId = searchParams.get('album');
  const urlTab = searchParams.get('tab');

  const activeAlbumId = useMemo(() => {
    if (!profile) return null;
    if (urlAlbumId && profile.tradingInventory.some((a) => a.albumId === urlAlbumId)) {
      return urlAlbumId;
    }
    return profile.tradingInventory[0]?.albumId ?? null;
  }, [profile, urlAlbumId]);

  const activeTab: InventoryTab = urlTab === 'wanted' ? 'wanted' : 'offered';

  const setUrlState = useCallback(
    (next: { album?: string; tab?: InventoryTab }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.album !== undefined) params.set('album', next.album);
      if (next.tab !== undefined) params.set('tab', next.tab);
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    },
    [router, searchParams],
  );

  const activeAlbum = useMemo(
    () => profile?.tradingInventory.find((a) => a.albumId === activeAlbumId) ?? null,
    [profile, activeAlbumId],
  );

  // ── Lazy wanted loader ─────────────────────────────────────────────────────
  const loadWanted = useCallback(
    async (albumId: string, cursor: number | null) => {
      setWantedByAlbum((prev) => {
        const existing = prev[albumId];
        return {
          ...prev,
          [albumId]: {
            items: existing?.items ?? [],
            nextCursor: existing?.nextCursor ?? null,
            total: existing?.total ?? 0,
            loading: cursor === null,
            loadingMore: cursor !== null,
            error: null,
          },
        };
      });
      try {
        const page = await fetchPublicWanted(username, albumId, {
          cursor: cursor ?? undefined,
          limit: 200,
        });
        setWantedByAlbum((prev) => {
          const existing = prev[albumId];
          const merged = cursor === null ? page.items : [...(existing?.items ?? []), ...page.items];
          return {
            ...prev,
            [albumId]: {
              items: merged,
              nextCursor: page.nextCursor,
              total: page.total,
              loading: false,
              loadingMore: false,
              error: null,
            },
          };
        });
      } catch (err) {
        setWantedByAlbum((prev) => ({
          ...prev,
          [albumId]: {
            items: prev[albumId]?.items ?? [],
            nextCursor: prev[albumId]?.nextCursor ?? null,
            total: prev[albumId]?.total ?? 0,
            loading: false,
            loadingMore: false,
            error: err instanceof Error ? err.message : 'Failed to load wanted list',
          },
        }));
      }
    },
    [username],
  );

  // Trigger lazy load when the user switches to the wanted tab for an album
  // we haven't fetched yet.
  useEffect(() => {
    if (!activeAlbumId || activeTab !== 'wanted') return;
    if (wantedByAlbum[activeAlbumId]) return;
    void loadWanted(activeAlbumId, null);
  }, [activeAlbumId, activeTab, wantedByAlbum, loadWanted]);

  // Reset search when context changes.
  useEffect(() => {
    setSearch('');
  }, [activeAlbumId, activeTab]);

  // ── Derived item list for the active tab ───────────────────────────────────
  const activeItems = useMemo<PublicInventoryItem[]>(() => {
    if (!activeAlbum) return [];
    if (activeTab === 'offered') return activeAlbum.offered;
    return wantedByAlbum[activeAlbum.albumId]?.items ?? [];
  }, [activeAlbum, activeTab, wantedByAlbum]);

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return activeItems;
    return activeItems.filter(
      (item) =>
        item.albumCode.toLowerCase().includes(q) ||
        (item.playerName?.toLowerCase().includes(q) ?? false),
    );
  }, [activeItems, search]);

  const groupedItems = useMemo(() => groupByTeam(filteredItems), [filteredItems]);
  const sortedTeams = useMemo(() => sortTeams([...groupedItems.keys()]), [groupedItems]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="space-y-4">
          <div className="h-16 w-16 rounded-full bg-gray-200 animate-pulse" />
          <div className="h-6 w-40 rounded bg-gray-200 animate-pulse" />
          <div className="h-4 w-32 rounded bg-gray-200 animate-pulse" />
          <div className="h-48 rounded-xl bg-gray-200 animate-pulse" />
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10 text-center">
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-10">
          <div className="text-4xl mb-3">404</div>
          <h1 className="text-xl font-semibold text-gray-800 mb-2">User not found</h1>
          <p className="text-sm text-gray-500">
            The profile for <span className="font-medium">@{username}</span> does not exist.
          </p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error ?? 'Failed to load profile.'}
        </div>
      </div>
    );
  }

  const displayName = profile.displayName ?? `@${profile.username}`;
  const memberSince = new Date(profile.memberSince).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
  });

  const inventory = profile.tradingInventory;
  const hasAlbums = inventory.length > 0;
  const isOwnProfile = viewer?.id === profile.userId;
  const canStartTrade = !!viewer && !isOwnProfile;

  const activeWantedState = activeAlbum ? wantedByAlbum[activeAlbum.albumId] : undefined;
  const wantedLoading = activeTab === 'wanted' && !!activeWantedState?.loading;
  const wantedTotal =
    activeTab === 'wanted'
      ? (activeWantedState?.total ?? activeAlbum?.wantedCount ?? 0)
      : (activeAlbum?.wantedCount ?? 0);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      {/* Profile header */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 mb-5">
        <div className="flex items-center gap-4">
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatarUrl}
              alt={displayName}
              className="h-16 w-16 rounded-full object-cover border border-gray-200"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-blue-600 text-2xl font-bold text-white">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-gray-800 truncate">{displayName}</h1>
            {profile.displayName && (
              <div className="text-sm text-gray-500 truncate">@{profile.username}</div>
            )}
            <div className="text-xs text-gray-400 mt-1">Member since {memberSince}</div>
          </div>
          {canStartTrade && hasAlbums && (
            <Link
              href={`/trade?tab=find&recipient=${encodeURIComponent(profile.userId)}`}
              className="shrink-0 inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Start a trade
            </Link>
          )}
        </div>
      </div>

      {!hasAlbums && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-8 text-center">
          <h2 className="text-base font-semibold text-gray-800 mb-1">
            No public trading inventory
          </h2>
          <p className="text-sm text-gray-500">
            This user hasn&apos;t made any albums available for public trading.
          </p>
        </div>
      )}

      {hasAlbums && activeAlbum && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          {/* Album tabs */}
          {inventory.length > 1 && (
            <div className="border-b border-gray-100 overflow-x-auto">
              <div className="flex gap-1 px-2 py-2 min-w-max">
                {inventory.map((album) => {
                  const isActive = album.albumId === activeAlbumId;
                  return (
                    <button
                      key={album.albumId}
                      onClick={() => setUrlState({ album: album.albumId, tab: activeTab })}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                        isActive
                          ? 'bg-blue-100 text-blue-700'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {albumLabel(album)}
                      <span className="ml-1.5 text-xs text-gray-400">
                        {album.editionName}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Offered / Wanted tabs */}
          <div className="flex border-b border-gray-100">
            {([
              {
                key: 'offered',
                label: 'Offered',
                count: activeAlbum.offered.length,
                accent: 'amber',
              },
              {
                key: 'wanted',
                label: 'Wanted',
                count: activeAlbum.wantedCount,
                accent: 'red',
              },
            ] as { key: InventoryTab; label: string; count: number; accent: 'amber' | 'red' }[]).map(
              ({ key, label, count, accent }) => {
                const isActive = activeTab === key;
                const baseClass = isActive
                  ? accent === 'amber'
                    ? 'border-amber-500 text-amber-700'
                    : 'border-red-500 text-red-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700';
                return (
                  <button
                    key={key}
                    onClick={() => setUrlState({ album: activeAlbum.albumId, tab: key })}
                    className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${baseClass}`}
                  >
                    {label}
                    <span className="ml-2 inline-flex items-center justify-center min-w-[1.5rem] rounded-full bg-gray-100 text-gray-700 text-xs px-1.5 py-0.5 font-normal">
                      {count}
                    </span>
                  </button>
                );
              },
            )}
          </div>

          {/* Search */}
          <div className="px-4 pt-4">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by album code or player name..."
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {search && (
              <p className="text-xs text-gray-400 mt-1">
                Showing {filteredItems.length} of {activeItems.length}{' '}
                {activeTab === 'wanted' ? `(${wantedTotal} total)` : ''}
              </p>
            )}
          </div>

          {/* Items */}
          <div className="px-4 py-4">
            {wantedLoading ? (
              <div className="space-y-2 py-4">
                <div className="h-10 rounded-lg bg-gray-100 animate-pulse" />
                <div className="h-10 rounded-lg bg-gray-100 animate-pulse" />
                <div className="h-10 rounded-lg bg-gray-100 animate-pulse" />
              </div>
            ) : activeTab === 'wanted' && activeWantedState?.error ? (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {activeWantedState.error}
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-gray-500">
                  {search
                    ? 'No stickers match your search.'
                    : activeTab === 'offered'
                      ? 'No stickers offered for trade.'
                      : 'No missing stickers — this album is complete!'}
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {sortedTeams.map((team) => {
                    const teamItems = groupedItems.get(team) ?? [];
                    return (
                      <div
                        key={team}
                        className="rounded-xl border border-gray-200 bg-white shadow-sm"
                      >
                        <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 rounded-t-xl">
                          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                            {team}{' '}
                            <span className="font-normal text-gray-400">
                              ({teamItems.length})
                            </span>
                          </h3>
                        </div>
                        <div className="divide-y divide-gray-50">
                          {teamItems.map((item) => (
                            <div
                              key={item.stickerVariantId}
                              className="flex items-center justify-between px-4 py-2.5 gap-3"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono font-medium text-gray-500 shrink-0">
                                    {item.albumCode}
                                  </span>
                                  {item.playerName && (
                                    <span className="text-sm text-gray-800 truncate">
                                      {item.playerName}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-gray-400 mt-0.5 flex gap-1.5">
                                  <span>{item.variantType}</span>
                                  {item.stickerType !== 'player' && (
                                    <span>&middot; {item.stickerType}</span>
                                  )}
                                </div>
                              </div>
                              {activeTab === 'offered' && item.quantity != null && item.quantity > 1 && (
                                <span className="shrink-0 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-xs font-medium">
                                  &times;{item.quantity}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {activeTab === 'wanted' && activeWantedState?.nextCursor != null && (
                  <div className="mt-4 flex justify-center">
                    <button
                      disabled={activeWantedState.loadingMore}
                      onClick={() =>
                        void loadWanted(activeAlbum.albumId, activeWantedState.nextCursor)
                      }
                      className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {activeWantedState.loadingMore
                        ? 'Loading…'
                        : `Load more (${activeWantedState.total - activeWantedState.items.length} remaining)`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
