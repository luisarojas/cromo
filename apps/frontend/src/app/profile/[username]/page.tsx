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
import ShareProfileButton from '@/components/ShareProfileButton';
import { variantLabel, variantSwatch } from '@/app/album/components/variantMeta';

type InventoryTab = 'offered' | 'wanted';
type GroupBy = 'team' | 'type' | 'variant' | 'none';

interface WantedState {
  items: PublicInventoryItem[];
  nextCursor: number | null;
  total: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
}

const STICKER_TYPE_COLORS: Record<string, string> = {
  player: 'bg-blue-100 text-blue-700 border-blue-200',
  badge: 'bg-purple-100 text-purple-700 border-purple-200',
  team_photo: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  intro: 'bg-teal-100 text-teal-700 border-teal-200',
  museum: 'bg-orange-100 text-orange-700 border-orange-200',
  coca_cola_special: 'bg-red-100 text-red-700 border-red-200',
  extra: 'bg-pink-100 text-pink-700 border-pink-200',
};

function stickerTypeColor(type: string): string {
  return STICKER_TYPE_COLORS[type] ?? 'bg-gray-100 text-gray-700 border-gray-200';
}

function prettify(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function albumLabel(album: PublicProfileAlbum): string {
  return album.alias ?? album.albumTypeName;
}

function groupItems(
  items: PublicInventoryItem[],
  groupBy: GroupBy,
): Map<string, PublicInventoryItem[]> {
  const grouped = new Map<string, PublicInventoryItem[]>();
  if (groupBy === 'none') {
    grouped.set('All', items);
    return grouped;
  }
  for (const item of items) {
    let key: string;
    if (groupBy === 'team') key = item.teamName ?? 'Other';
    else if (groupBy === 'type') key = prettify(item.stickerType);
    else key = variantLabel(item.variantType);
    const bucket = grouped.get(key) ?? [];
    bucket.push(item);
    grouped.set(key, bucket);
  }
  return grouped;
}

function sortGroupKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
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
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
  const [selectedVariants, setSelectedVariants] = useState<Set<string>>(new Set());
  const [groupBy, setGroupBy] = useState<GroupBy>('team');
  const [filtersOpen, setFiltersOpen] = useState(false);

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

  // Current filters serialised for the API (wanted tab only).
  const wantedApiFilters = useMemo(
    () => ({
      stickerTypes: selectedTypes.size > 0 ? [...selectedTypes] : undefined,
      teams: selectedTeams.size > 0 ? [...selectedTeams] : undefined,
      variantTypes: selectedVariants.size > 0 ? [...selectedVariants] : undefined,
      search: search.trim() || undefined,
    }),
    [selectedTypes, selectedTeams, selectedVariants, search],
  );

  // ── Lazy wanted loader ─────────────────────────────────────────────────────
  const loadWanted = useCallback(
    async (
      albumId: string,
      cursor: number | null,
      filters: typeof wantedApiFilters,
    ) => {
      setWantedByAlbum((prev) => {
        const existing = prev[albumId];
        return {
          ...prev,
          [albumId]: {
            items: cursor === null ? [] : (existing?.items ?? []),
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
          ...filters,
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

  // When filters change, clear the active album's wanted state so the load
  // effect below triggers a fresh fetch with the new filters.
  useEffect(() => {
    if (!activeAlbumId) return;
    setWantedByAlbum((prev) => {
      if (!prev[activeAlbumId]) return prev;
      const next = { ...prev };
      delete next[activeAlbumId];
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedApiFilters]); // intentionally excludes activeAlbumId to avoid clearing on album switch

  // Trigger lazy load when switching to the wanted tab or after a filter reset.
  useEffect(() => {
    if (!activeAlbumId || activeTab !== 'wanted') return;
    if (wantedByAlbum[activeAlbumId]) return;
    void loadWanted(activeAlbumId, null, wantedApiFilters);
  }, [activeAlbumId, activeTab, wantedByAlbum, loadWanted, wantedApiFilters]);

  // Reset search and filters when context changes.
  useEffect(() => {
    setSearch('');
    setSelectedTypes(new Set());
    setSelectedTeams(new Set());
    setSelectedVariants(new Set());
  }, [activeAlbumId, activeTab]);

  // ── Derived item list for the active tab ───────────────────────────────────
  const activeItems = useMemo<PublicInventoryItem[]>(() => {
    if (!activeAlbum) return [];
    if (activeTab === 'offered') return activeAlbum.offered;
    return wantedByAlbum[activeAlbum.albumId]?.items ?? [];
  }, [activeAlbum, activeTab, wantedByAlbum]);

  // Unique filter options derived from the current item set.
  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    for (const item of activeItems) set.add(item.stickerType);
    return [...set].sort();
  }, [activeItems]);

  const availableTeams = useMemo(() => {
    const set = new Set<string>();
    for (const item of activeItems) set.add(item.teamName ?? 'Other');
    return sortGroupKeys([...set]);
  }, [activeItems]);

  const availableVariants = useMemo(() => {
    const set = new Set<string>();
    for (const item of activeItems) set.add(item.variantType);
    return [...set].sort();
  }, [activeItems]);

  const filteredItems = useMemo(() => {
    // Wanted tab: server already applied all filters; return items as-is.
    if (activeTab === 'wanted') return activeItems;
    const q = search.toLowerCase().trim();
    return activeItems.filter((item) => {
      if (q) {
        const matches =
          item.albumCode.toLowerCase().includes(q) ||
          (item.playerName?.toLowerCase().includes(q) ?? false);
        if (!matches) return false;
      }
      if (selectedTypes.size > 0 && !selectedTypes.has(item.stickerType)) return false;
      if (selectedTeams.size > 0 && !selectedTeams.has(item.teamName ?? 'Other')) return false;
      if (selectedVariants.size > 0 && !selectedVariants.has(item.variantType)) return false;
      return true;
    });
  }, [activeItems, search, selectedTypes, selectedTeams, selectedVariants, activeTab]);

  const groupedItems = useMemo(
    () => groupItems(filteredItems, groupBy),
    [filteredItems, groupBy],
  );
  const sortedGroupKeys = useMemo(
    () => sortGroupKeys([...groupedItems.keys()]),
    [groupedItems],
  );

  const activeFilterCount =
    selectedTypes.size + selectedTeams.size + selectedVariants.size;

  function toggleInSet(setter: typeof setSelectedTypes, value: string) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function clearAllFilters() {
    setSelectedTypes(new Set());
    setSelectedTeams(new Set());
    setSelectedVariants(new Set());
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10">
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
    <div className="max-w-5xl mx-auto px-4 py-10">
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
          <div className="flex items-center gap-2 shrink-0">
            <ShareProfileButton username={profile.username} />
            {canStartTrade && hasAlbums && (
              <Link
                href={`/trade?tab=find&recipient=${encodeURIComponent(profile.userId)}`}
                className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Start a trade
              </Link>
            )}
          </div>
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
                        {album.editionName} · {album.formatName}
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

          {/* Toolbar: search + filter toggle + group-by */}
          <div className="px-4 pt-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by album code or player name..."
                className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setFiltersOpen((v) => !v)}
                aria-expanded={filtersOpen}
                className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  activeFilterCount > 0
                    ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <path d="M3 5a1 1 0 011-1h12a1 1 0 01.8 1.6L12 11.4V16a1 1 0 01-1.45.9l-2-1A1 1 0 018 15v-3.6L3.2 5.6A1 1 0 013 5z" />
                </svg>
                Filters
                {activeFilterCount > 0 && (
                  <span className="rounded-full bg-blue-600 text-white text-[10px] font-bold w-5 h-5 inline-flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              <label className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
                <span className="text-gray-500">Group by</span>
                <select
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                  className="bg-transparent text-gray-800 font-medium focus:outline-none"
                >
                  <option value="team">Team</option>
                  <option value="type">Sticker type</option>
                  <option value="variant">Variant</option>
                  <option value="none">None</option>
                </select>
              </label>
            </div>

            {/* Filter panel */}
            {filtersOpen && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
                {availableTypes.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                      Sticker type
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {availableTypes.map((type) => {
                        const active = selectedTypes.has(type);
                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => toggleInSet(setSelectedTypes, type)}
                            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                              active
                                ? stickerTypeColor(type)
                                : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            {prettify(type)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {availableVariants.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                      Variant
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {availableVariants.map((variant) => {
                        const active = selectedVariants.has(variant);
                        return (
                          <button
                            key={variant}
                            type="button"
                            onClick={() => toggleInSet(setSelectedVariants, variant)}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                              active
                                ? 'bg-blue-100 border-blue-300 text-blue-700'
                                : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            <span
                              className={`inline-block w-2.5 h-2.5 rounded-full border border-gray-300 ${variantSwatch(variant)}`}
                              aria-hidden
                            />
                            {variantLabel(variant)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {availableTeams.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                      Team
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                      {availableTeams.map((team) => {
                        const active = selectedTeams.has(team);
                        return (
                          <button
                            key={team}
                            type="button"
                            onClick={() => toggleInSet(setSelectedTeams, team)}
                            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                              active
                                ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                                : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            {team}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {activeFilterCount > 0 && (
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={clearAllFilters}
                      className="text-xs font-medium text-gray-600 hover:text-gray-900 underline"
                    >
                      Clear all filters
                    </button>
                  </div>
                )}
              </div>
            )}

            {(search || activeFilterCount > 0) && (
              <p className="text-xs text-gray-500">
                {activeTab === 'wanted'
                  ? `Showing ${activeItems.length} of ${wantedTotal}`
                  : `Showing ${filteredItems.length} of ${activeItems.length}`}
              </p>
            )}
          </div>

          {/* Items */}
          <div className="px-4 py-4">
            {wantedLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="h-24 rounded-lg bg-gray-100 animate-pulse" />
                ))}
              </div>
            ) : activeTab === 'wanted' && activeWantedState?.error ? (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {activeWantedState.error}
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-gray-500">
                  {search || activeFilterCount > 0
                    ? 'No stickers match your filters.'
                    : activeTab === 'offered'
                      ? 'No stickers offered for trade.'
                      : 'No missing stickers — this album is complete!'}
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-5">
                  {sortedGroupKeys.map((key) => {
                    const groupItemsList = groupedItems.get(key) ?? [];
                    return (
                      <section key={key}>
                        {groupBy !== 'none' && (
                          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 px-1">
                            {key}{' '}
                            <span className="font-normal text-gray-400">
                              ({groupItemsList.length})
                            </span>
                          </h3>
                        )}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                          {groupItemsList.map((item) => {
                            const qty = item.quantity ?? 0;
                            const showQty = activeTab === 'offered' && qty > 1;
                            return (
                              <div
                                key={item.stickerVariantId}
                                className="relative flex flex-col rounded-lg border border-gray-200 bg-white p-2.5 shadow-sm hover:shadow-md transition-shadow"
                              >
                                {showQty && (
                                  <span
                                    className="absolute top-1.5 right-1.5 rounded-full bg-amber-500 text-white text-[10px] font-bold min-w-[1.25rem] h-5 px-1 flex items-center justify-center"
                                    title={`${qty} copies available`}
                                  >
                                    ×{qty}
                                  </span>
                                )}
                                <div className="text-base font-extrabold text-gray-800 leading-none mb-1 pr-6">
                                  {item.albumCode}
                                </div>
                                <div className="text-xs font-medium text-gray-700 truncate leading-tight mb-2">
                                  {item.playerName ?? item.teamName ?? '—'}
                                </div>
                                <div className="mt-auto flex flex-wrap items-center gap-1">
                                  <span
                                    className={`inline-block rounded-full border px-1.5 py-0.5 text-[9px] font-medium uppercase ${stickerTypeColor(item.stickerType)}`}
                                  >
                                    {prettify(item.stickerType)}
                                  </span>
                                  <span
                                    className="inline-flex items-center gap-1 rounded-full bg-white border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-700"
                                    title={variantLabel(item.variantType)}
                                  >
                                    <span
                                      className={`inline-block w-2 h-2 rounded-full border border-gray-300 ${variantSwatch(item.variantType)}`}
                                      aria-hidden
                                    />
                                    {variantLabel(item.variantType)}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>

                {activeTab === 'wanted' && activeWantedState?.nextCursor != null && (
                  <div className="mt-4 flex justify-center">
                    <button
                      disabled={activeWantedState.loadingMore}
                      onClick={() =>
                        void loadWanted(activeAlbum.albumId, activeWantedState.nextCursor, wantedApiFilters)
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
