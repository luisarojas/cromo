'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  fetchPublicProfile,
  fetchPublicWanted,
  fetchPublicOffered,
  type PublicProfile,
  type PublicProfileAlbum,
  type PublicInventoryItem,
} from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import ShareProfileButton from '@/components/ShareProfileButton';
import { variantLabel, variantSwatch } from '@/app/album/components/variantMeta';
import FilterBar, { type FilterState } from '@/app/album/components/FilterBar';
import TrustBadge from '@/components/TrustBadge';
import ReportUserModal from '@/components/ReportUserModal';

type InventoryTab = 'offered' | 'wanted';
type GroupBy = 'team' | 'type' | 'variant' | 'none';

interface InventoryState {
  items: PublicInventoryItem[];
  nextCursor: number | null;
  total: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  // Filter universe for the entire (unfiltered) album+direction set, returned
  // by the server so the chips don't shrink as the user narrows the view.
  filterOptions: {
    stickerTypes: string[];
    teams: string[];
    variantTypes: string[];
  };
}

const STICKER_TYPE_COLORS: Record<string, string> = {
  player: 'bg-[var(--cromo-accent-soft)] text-[var(--cromo-accent)] border-[var(--cromo-accent)]/30',
  badge: 'bg-[var(--cromo-tier-very-rare-soft)] text-[var(--cromo-tier-very-rare)] border-purple-200',
  team_photo: 'bg-[var(--cromo-warning-soft)] text-yellow-800 border-[var(--cromo-warning)]/30',
  intro: 'bg-[var(--cromo-accent-soft)] text-[var(--cromo-accent)] border-[var(--cromo-accent)]/30',
  coca_cola_special: 'bg-[var(--cromo-danger-soft)] text-[var(--cromo-danger-text)] border-[var(--cromo-danger)]/30',
  extra: 'bg-pink-100 text-pink-700 border-pink-200',
};

function stickerTypeColor(type: string): string {
  return STICKER_TYPE_COLORS[type] ?? 'bg-[var(--cromo-surface-2)] text-[var(--cromo-fg)] border-[var(--cromo-border)]';
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
  const viewerToken = useAuthStore((s) => s.token);

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);

  // Per-album lazy wanted + offered state. Both tabs follow the same pattern:
  // server-side filter + cursor-paginated.
  const [wantedByAlbum, setWantedByAlbum] = useState<Record<string, InventoryState>>({});
  const [offeredByAlbum, setOfferedByAlbum] = useState<Record<string, InventoryState>>({});

  const [filters, setFilters] = useState<FilterState>({});
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('team');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search?.trim() ?? ''), 300);
    return () => clearTimeout(timer);
  }, [filters.search]);

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

  // Filters serialised for both tabs (server-side filtering on both now).
  const apiFilters = useMemo(
    () => ({
      stickerTypes: filters.type && filters.type.length > 0 ? filters.type : undefined,
      teams: filters.team && filters.team.length > 0 ? filters.team : undefined,
      variantTypes: filters.variant && filters.variant.length > 0 ? filters.variant : undefined,
      search: debouncedSearch || undefined,
    }),
    [filters.type, filters.team, filters.variant, debouncedSearch],
  );

  // ── Generic lazy inventory loader (offered + wanted share this shape) ─────
  const makeLoader = useCallback(
    (
      tab: InventoryTab,
      setState: React.Dispatch<React.SetStateAction<Record<string, InventoryState>>>,
      fetchFn: typeof fetchPublicWanted,
    ) =>
      async (
        albumId: string,
        cursor: number | null,
        filters: typeof apiFilters,
      ): Promise<void> => {
        setState((prev) => {
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
              filterOptions: existing?.filterOptions ?? { stickerTypes: [], teams: [], variantTypes: [] },
            },
          };
        });
        try {
          const page = await fetchFn(username, albumId, {
            cursor: cursor ?? undefined,
            limit: 200,
            ...filters,
          });
          setState((prev) => {
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
                filterOptions: page.filterOptions,
              },
            };
          });
        } catch (err) {
          setState((prev) => ({
            ...prev,
            [albumId]: {
              items: prev[albumId]?.items ?? [],
              nextCursor: prev[albumId]?.nextCursor ?? null,
              total: prev[albumId]?.total ?? 0,
              loading: false,
              loadingMore: false,
              error: err instanceof Error ? err.message : `Failed to load ${tab} list`,
              filterOptions: prev[albumId]?.filterOptions ?? { stickerTypes: [], teams: [], variantTypes: [] },
            },
          }));
        }
      },
    [username],
  );

  const loadWanted = useMemo(
    () => makeLoader('wanted', setWantedByAlbum, fetchPublicWanted),
    [makeLoader],
  );
  const loadOffered = useMemo(
    () => makeLoader('offered', setOfferedByAlbum, fetchPublicOffered),
    [makeLoader],
  );

  // When filters change, drop both maps so the next render re-fetches.
  useEffect(() => {
    if (!activeAlbumId) return;
    setWantedByAlbum((prev) => {
      if (!prev[activeAlbumId]) return prev;
      const next = { ...prev };
      delete next[activeAlbumId];
      return next;
    });
    setOfferedByAlbum((prev) => {
      if (!prev[activeAlbumId]) return prev;
      const next = { ...prev };
      delete next[activeAlbumId];
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFilters]); // intentionally excludes activeAlbumId

  useEffect(() => {
    if (!activeAlbumId) return;
    if (activeTab === 'wanted' && !wantedByAlbum[activeAlbumId]) {
      void loadWanted(activeAlbumId, null, apiFilters);
    }
    if (activeTab === 'offered' && !offeredByAlbum[activeAlbumId]) {
      void loadOffered(activeAlbumId, null, apiFilters);
    }
  }, [activeAlbumId, activeTab, wantedByAlbum, offeredByAlbum, loadWanted, loadOffered, apiFilters]);

  // Reset filters when album or tab changes.
  useEffect(() => {
    setFilters({});
    setDebouncedSearch('');
  }, [activeAlbumId, activeTab]);

  // ── Derived item list for the active tab ───────────────────────────────────
  const activeItems = useMemo<PublicInventoryItem[]>(() => {
    if (!activeAlbum) return [];
    const stateMap = activeTab === 'offered' ? offeredByAlbum : wantedByAlbum;
    return stateMap[activeAlbum.albumId]?.items ?? [];
  }, [activeAlbum, activeTab, wantedByAlbum, offeredByAlbum]);

  // Filter options come from the server's full unfiltered universe for this
  // (album, direction), so the chips stay stable as the user narrows the view.
  const activeFilterOptions = useMemo(() => {
    if (!activeAlbum) return { stickerTypes: [], teams: [], variantTypes: [] };
    const stateMap = activeTab === 'offered' ? offeredByAlbum : wantedByAlbum;
    return (
      stateMap[activeAlbum.albumId]?.filterOptions
      ?? { stickerTypes: [], teams: [], variantTypes: [] }
    );
  }, [activeAlbum, activeTab, wantedByAlbum, offeredByAlbum]);

  const availableTypes = activeFilterOptions.stickerTypes;
  const availableTeams = activeFilterOptions.teams;
  const availableVariants = activeFilterOptions.variantTypes;

  // Server applies all filters for both tabs now — pass-through.
  const filteredItems = activeItems;

  // In the wanted tab, grouping by variant is meaningless (every missing sticker
  // is wanted in any variant), so fall back to team grouping.
  const effectiveGroupBy: GroupBy =
    activeTab === 'wanted' && groupBy === 'variant' ? 'team' : groupBy;

  const groupedItems = useMemo(
    () => groupItems(filteredItems, effectiveGroupBy),
    [filteredItems, effectiveGroupBy],
  );
  const sortedGroupKeys = useMemo(
    () => sortGroupKeys([...groupedItems.keys()]),
    [groupedItems],
  );

  const hasActiveFilter =
    !!(filters.search) ||
    !!(filters.team?.length) ||
    !!(filters.type?.length) ||
    !!(filters.variant?.length);

  function buildListText(): string {
    if (!activeAlbum) return '';

    const albumName = albumLabel(activeAlbum);
    const profileUrl = `${window.location.origin}/profile/${username}`;

    function formatSection(items: PublicInventoryItem[], isOffered: boolean): string {
      function itemCode(item: PublicInventoryItem): string {
        const qty = isOffered && (item.quantity ?? 0) > 1 ? ` ×${item.quantity}` : '';
        return `${item.albumCode}${qty}`;
      }
      if (groupBy === 'none') return items.map(itemCode).join(', ');
      const grouped = groupItems(items, groupBy);
      return sortGroupKeys([...grouped.keys()])
        .map((key) => `${key}: ${(grouped.get(key) ?? []).map(itemCode).join(', ')}`)
        .join('\n');
    }

    const parts: string[] = [];

    const offeredItems = offeredByAlbum[activeAlbum.albumId]?.items ?? [];
    if (offeredItems.length > 0) {
      parts.push(`Offers | ${albumName}\n${formatSection(offeredItems, true)}`);
    }

    const wantedItems = wantedByAlbum[activeAlbum.albumId]?.items ?? [];
    if (wantedItems.length > 0) {
      parts.push(`Needs | ${albumName}\n${formatSection(wantedItems, false)}`);
    }

    parts.push(profileUrl);
    return parts.join('\n\n');
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="space-y-4">
          <div className="h-16 w-16 rounded-full bg-[var(--cromo-surface-2)] animate-pulse" />
          <div className="h-6 w-40 rounded bg-[var(--cromo-surface-2)] animate-pulse" />
          <div className="h-4 w-32 rounded bg-[var(--cromo-surface-2)] animate-pulse" />
          <div className="h-48 rounded-xl bg-[var(--cromo-surface-2)] animate-pulse" />
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10 text-center">
        <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-10">
          <div className="text-4xl mb-3">404</div>
          <h1 className="text-xl font-semibold text-[var(--cromo-fg)] mb-2">User not found</h1>
          <p className="text-sm text-[var(--cromo-fg-muted)]">
            The profile for <span className="font-medium">@{username}</span> does not exist.
          </p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="rounded-lg bg-[var(--cromo-danger-soft)] border border-[var(--cromo-danger)]/30 p-4 text-sm text-[var(--cromo-danger-text)]">
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
  const canInteract = !!viewer && !isOwnProfile;
  // Owner opted out of trading → no trade button (they can still be reported).
  const canStartTrade = canInteract && profile.tradingEnabled;

  const activeState = activeAlbum
    ? (activeTab === 'offered'
        ? offeredByAlbum[activeAlbum.albumId]
        : wantedByAlbum[activeAlbum.albumId])
    : undefined;
  const activeLoading = !!activeState?.loading;
  const activeTotal =
    activeState?.total ??
    (activeAlbum
      ? activeTab === 'offered' ? activeAlbum.offered.length : activeAlbum.wantedCount
      : 0);
  const activeLoader = activeTab === 'offered' ? loadOffered : loadWanted;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      {/* Profile header */}
      <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-6 mb-5">
        <div className="flex items-center gap-4">
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatarUrl}
              alt={displayName}
              className="h-16 w-16 rounded-full object-cover border border-[var(--cromo-border)]"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--cromo-accent)] text-2xl font-bold text-[var(--cromo-accent-fg)]">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-[var(--cromo-fg)] truncate">{displayName}</h1>
            {profile.displayName && (
              <div className="text-sm text-[var(--cromo-fg-muted)] truncate">@{profile.username}</div>
            )}
            <div className="text-xs text-[var(--cromo-fg-subtle)] mt-1">Member since {memberSince}</div>
            <div className="mt-2">
              <TrustBadge userId={profile.userId} />
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {canStartTrade && (
                <Link
                  href={`/trade?tab=find&recipient=${encodeURIComponent(profile.username)}`}
                  className="inline-flex items-center rounded-md bg-[var(--cromo-accent)] px-3 py-2 text-sm font-medium text-[var(--cromo-accent-fg)] hover:bg-[var(--cromo-accent-strong)] transition-colors"
                >
                  Start a trade
                </Link>
              )}
              <ShareProfileButton username={profile.username} getListText={hasAlbums ? buildListText : undefined} />
            </div>
            {canInteract && viewerToken && (
              <button
                onClick={() => setShowReportModal(true)}
                className="text-xs text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-fg-muted)] transition-colors"
              >
                Report user
              </button>
            )}
          </div>
        </div>
      </div>

      {!hasAlbums && (
        <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-8 text-center">
          <h2 className="text-base font-semibold text-[var(--cromo-fg)] mb-1">
            No public trading inventory
          </h2>
          <p className="text-sm text-[var(--cromo-fg-muted)]">
            This user hasn&apos;t made any albums available for public trading.
          </p>
        </div>
      )}

      {hasAlbums && activeAlbum && (
        <div className="rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)]">
          {/* Album tabs */}
          {inventory.length > 1 && (
            <div className="border-b border-[var(--cromo-border)] overflow-x-auto">
              <div className="flex gap-1 px-2 py-2 min-w-max">
                {inventory.map((album) => {
                  const isActive = album.albumId === activeAlbumId;
                  return (
                    <button
                      key={album.albumId}
                      onClick={() => setUrlState({ album: album.albumId, tab: activeTab })}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                        isActive
                          ? 'bg-[var(--cromo-accent-soft)] text-[var(--cromo-accent)]'
                          : 'text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)]'
                      }`}
                    >
                      {albumLabel(album)}
                      <span className="ml-1.5 text-xs text-[var(--cromo-fg-subtle)]">
                        {album.editionName} · {album.formatName}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {activeAlbum.albumTypeGuidePath && (
            <div className="px-4 py-2 border-b border-[var(--cromo-border)] bg-[var(--cromo-accent-soft)]/40">
              <Link href={activeAlbum.albumTypeGuidePath} className="text-xs text-[var(--cromo-accent)] hover:underline hover:underline">
                View Collection Guide →
              </Link>
            </div>
          )}

          {/* Offered / Wanted tabs */}
          <div className="flex border-b border-[var(--cromo-border)]">
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
                    ? 'border-[var(--cromo-warning)] text-[var(--cromo-warning-text)]'
                    : 'border-red-500 text-[var(--cromo-danger-text)]'
                  : 'border-transparent text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]';
                return (
                  <button
                    key={key}
                    onClick={() => setUrlState({ album: activeAlbum.albumId, tab: key })}
                    className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${baseClass}`}
                  >
                    {label}
                    <span className="ml-2 inline-flex items-center justify-center min-w-[1.5rem] rounded-full bg-[var(--cromo-surface-2)] text-[var(--cromo-fg)] text-xs px-1.5 py-0.5 font-normal">
                      {count}
                    </span>
                  </button>
                );
              },
            )}
          </div>

          {/* Toolbar: FilterBar + group-by */}
          <div className="px-4 pt-4 space-y-3">
            <FilterBar
              filters={filters}
              onChange={setFilters}
              groupOptions={[]}
              teamOptions={availableTeams.map((t) => ({ value: t, label: t }))}
              typeOptions={availableTypes.map((t) => ({ value: t, label: prettify(t) }))}
              variantOptions={activeTab === 'wanted' ? [] : availableVariants.map((v) => ({ value: v, label: variantLabel(v) }))}
              showFavourites={false}
              showWanted={false}
            />
            <div className="flex items-center justify-between gap-4">
              <label className="inline-flex items-center gap-2 rounded-md border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-3 py-1.5 text-sm">
                <span className="text-[var(--cromo-fg-muted)]">Group by</span>
                <select
                  value={effectiveGroupBy}
                  onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                  className="bg-transparent text-[var(--cromo-fg)] font-medium focus:outline-none"
                >
                  <option value="team">Team</option>
                  <option value="type">Sticker type</option>
                  {activeTab !== 'wanted' && <option value="variant">Variant</option>}
                  <option value="none">None</option>
                </select>
              </label>
              {hasActiveFilter && (
                <p className="text-xs text-[var(--cromo-fg-muted)]">
                  Showing {activeItems.length} of {activeTotal}
                </p>
              )}
            </div>
          </div>

          {/* Items */}
          <div className="px-4 py-4">
            {activeLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="h-24 rounded-lg bg-[var(--cromo-surface-2)] animate-pulse" />
                ))}
              </div>
            ) : activeState?.error ? (
              <div className="rounded-md bg-[var(--cromo-danger-soft)] border border-[var(--cromo-danger)]/30 p-3 text-sm text-[var(--cromo-danger-text)]">
                {activeState.error}
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-[var(--cromo-fg-muted)]">
                  {hasActiveFilter
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
                        {effectiveGroupBy !== 'none' && (
                          <h3 className="text-xs font-semibold text-[var(--cromo-fg-muted)] uppercase tracking-wide mb-2 px-1">
                            {key}{' '}
                            <span className="font-normal text-[var(--cromo-fg-subtle)]">
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
                                className="relative flex flex-col rounded-lg border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-2.5 hover:border-[var(--cromo-border-strong)] transition-shadow"
                              >
                                {showQty && (
                                  <span
                                    className="absolute top-1.5 right-1.5 rounded-full bg-[var(--cromo-warning)] text-[var(--cromo-warning-fg)] text-[10px] font-bold min-w-[1.25rem] h-5 px-1 flex items-center justify-center"
                                    title={`${qty} copies available`}
                                  >
                                    ×{qty}
                                  </span>
                                )}
                                <div className="text-base font-extrabold text-[var(--cromo-fg)] leading-none mb-1 pr-6">
                                  {item.albumCode}
                                </div>
                                <div className="text-xs font-medium text-[var(--cromo-fg)] truncate leading-tight mb-2">
                                  {item.playerName ?? item.teamName ?? '—'}
                                </div>
                                <div className="mt-auto flex flex-wrap items-center gap-1">
                                  <span
                                    className={`inline-block rounded-full border px-1.5 py-0.5 text-[9px] font-medium uppercase ${stickerTypeColor(item.stickerType)}`}
                                  >
                                    {prettify(item.stickerType)}
                                  </span>
                                  {activeTab === 'wanted' ? (
                                    <span className="inline-flex items-center rounded-full bg-[var(--cromo-surface)] border border-[var(--cromo-border)] px-1.5 py-0.5 text-[10px] text-[var(--cromo-fg-muted)] italic">
                                      Any variant
                                    </span>
                                  ) : (
                                    <span
                                      className="inline-flex items-center gap-1 rounded-full bg-[var(--cromo-surface)] border border-[var(--cromo-border)] px-1.5 py-0.5 text-[10px] text-[var(--cromo-fg)]"
                                      title={variantLabel(item.variantType)}
                                    >
                                      <span
                                        className={`inline-block w-2 h-2 rounded-full border border-[var(--cromo-border-strong)] ${variantSwatch(item.variantType)}`}
                                        aria-hidden
                                      />
                                      {variantLabel(item.variantType)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>

                {activeState?.nextCursor != null && (
                  <div className="mt-4 flex justify-center">
                    <button
                      disabled={activeState.loadingMore}
                      onClick={() =>
                        void activeLoader(activeAlbum.albumId, activeState.nextCursor, apiFilters)
                      }
                      className="rounded-md border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-4 py-2 text-sm font-medium text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)] disabled:opacity-50"
                    >
                      {activeState.loadingMore
                        ? 'Loading…'
                        : `Load more (${activeState.total - activeState.items.length} remaining)`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {showReportModal && viewerToken && (
        <ReportUserModal
          userId={profile.userId}
          username={profile.username}
          token={viewerToken}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </div>
  );
}
