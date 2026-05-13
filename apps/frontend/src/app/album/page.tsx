'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  fetchStickers,
  fetchStats,
  fetchCollection,
  fetchMissing,
  fetchDuplicates,
  fetchUserAlbums,
  createUserAlbum,
  updateUserAlbum,
  deleteUserAlbum,
  albumDisplayName,
  type Sticker,
  type CollectionStats,
  type MissingItem,
  type DuplicateItem,
  type UserAlbum,
} from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { usePreferencesStore } from '@/store/preferences';
import { useAlbumsStore } from '@/store/albums';
import FilterBar, { type FilterState } from './components/FilterBar';
import { variantLabel } from './components/variantMeta';
import { EDITION_LABELS } from '@/lib/albumPages';
import type { AlbumEdition } from '@/lib/albumPages';
import StatsBar from './components/StatsBar';
import StickerGrid, { type OwnedVariantMap } from './components/StickerGrid';
import AlbumSelector from './components/AlbumSelector';
import AddAlbumModal from './components/AddAlbumModal';
import EditAlbumModal from './components/EditAlbumModal';
import type { OwnedVariantEntry } from './components/VariantPopover';

type Tab = 'all' | 'have' | 'missing' | 'duplicates';

const TYPE_LABELS: Record<string, string> = {
  player: 'Player',
  badge: 'Badge',
  team_photo: 'Team Photo',
  intro: 'Intro',
  museum: 'Museum',
  coca_cola: 'Coca-Cola',
};

// album_code -> Map<variantType, entry>
type OwnedMap = Map<string, OwnedVariantMap>;

async function fetchAllStickers(
  params: Omit<Parameters<typeof fetchStickers>[0], 'cursor' | 'limit'>,
  maxItems = 1200,
): Promise<Sticker[]> {
  const all: Sticker[] = [];
  let cursor: number | null | undefined = undefined;

  while (all.length < maxItems) {
    const result = await fetchStickers(
      { ...params, cursor: cursor ?? undefined, limit: 200 },
      undefined,
    );
    all.push(...result.items);
    if (!result.nextCursor || result.items.length === 0) break;
    cursor = result.nextCursor;
  }

  return all;
}

async function loadOwnedMap(
  userId: string,
  albumId: string,
  token: string,
): Promise<OwnedMap> {
  const map: OwnedMap = new Map();
  let cursor: number | null | undefined = undefined;
  for (let i = 0; i < 50; i++) {
    const page = await fetchCollection(
      userId,
      { albumId, limit: 1000, cursor: cursor ?? undefined },
      token,
    );
    for (const item of page.items) {
      let perSticker = map.get(item.album_code);
      if (!perSticker) {
        perSticker = new Map<string, OwnedVariantEntry>();
        map.set(item.album_code, perSticker);
      }
      perSticker.set(item.variant_type, {
        variantId: item.sticker_variant_id,
        quantity: item.quantity,
      });
    }
    if (!page.nextCursor || page.items.length === 0) break;
    cursor = page.nextCursor;
  }
  return map;
}

export default function AlbumPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const duplicatesCountAllVariants = usePreferencesStore((s) => s.duplicatesCountAllVariants);
  const albumEdition = usePreferencesStore((s) => s.albumEdition);

  const albums = useAlbumsStore((s) => s.albums);
  const activeAlbumId = useAlbumsStore((s) => s.activeAlbumId);
  const setAlbums = useAlbumsStore((s) => s.setAlbums);
  const setActiveAlbumId = useAlbumsStore((s) => s.setActiveAlbumId);
  const upsertAlbum = useAlbumsStore((s) => s.upsertAlbum);
  const removeAlbum = useAlbumsStore((s) => s.removeAlbum);

  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [stats, setStats] = useState<CollectionStats | null>(null);
  const [ownedMap, setOwnedMap] = useState<OwnedMap>(new Map());
  const [missingItems, setMissingItems] = useState<MissingItem[]>([]);
  const [duplicateItems, setDuplicateItems] = useState<DuplicateItem[]>([]);

  // otherAlbumsOwned: albumId -> OwnedMap (for cross-album indicators)
  const [otherAlbumsOwned, setOtherAlbumsOwned] = useState<Map<string, OwnedMap>>(new Map());

  const [tab, setTab] = useState<Tab>('all');
  const [filters, setFilters] = useState<FilterState>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddAlbumModal, setShowAddAlbumModal] = useState(false);
  const [editingAlbum, setEditingAlbum] = useState<UserAlbum | null>(null);

  // ---------------------------------------------------------------------------
  // Load collection for the active album
  // ---------------------------------------------------------------------------
  const loadCollection = useCallback(async (tok: string, userId: string, albumId: string) => {
    try {
      const [statsData, map] = await Promise.all([
        fetchStats(userId, tok, albumId),
        loadOwnedMap(userId, albumId, tok),
      ]);
      setStats(statsData);
      setOwnedMap(map);
    } catch (err) {
      console.error('Failed to load collection', err);
    }
  }, []);

  // Load lightweight owned maps for other albums (for cross-album indicators)
  const loadOtherAlbums = useCallback(
    async (tok: string, userId: string, currentAlbumId: string, allAlbums: UserAlbum[]) => {
      const others = allAlbums.filter((a) => a.id !== currentAlbumId);
      if (others.length === 0) {
        setOtherAlbumsOwned(new Map());
        return;
      }
      const entries = await Promise.all(
        others.map(async (a) => {
          const map = await loadOwnedMap(userId, a.id, tok);
          return [a.id, map] as const;
        })
      );
      setOtherAlbumsOwned(new Map(entries));
    },
    []
  );

  // ---------------------------------------------------------------------------
  // Initial load
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!hydrated) return;
    if (!token || !user) {
      router.replace('/login');
      return;
    }

    let cancelled = false;

    async function init() {
      if (!token || !user) return;
      setLoading(true);
      setError(null);
      try {
        const [allStickers, userAlbums] = await Promise.all([
          fetchAllStickers({}),
          fetchUserAlbums(user.id, token),
        ]);

        if (cancelled) return;
        setStickers(allStickers);
        setAlbums(userAlbums);

        // activeAlbumId is set by setAlbums; read it after
        const defaultAlbum = userAlbums.find((a) => a.is_default) ?? userAlbums[0];
        const albumId = defaultAlbum?.id;
        if (albumId) {
          await loadCollection(token, user.id, albumId);
          if (!cancelled) {
            await loadOtherAlbums(token, user.id, albumId, userAlbums);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, [hydrated, token, user, router, loadCollection, loadOtherAlbums, setAlbums]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Reload when active album changes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!token || !user || !activeAlbumId || loading) return;
    setMissingItems([]);
    setDuplicateItems([]);
    loadCollection(token, user.id, activeAlbumId);
    loadOtherAlbums(token, user.id, activeAlbumId, albums);
  }, [activeAlbumId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Load missing/duplicates on demand
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!token || !user || !activeAlbumId) return;

    if (tab === 'missing' && missingItems.length === 0) {
      fetchMissing(user.id, { albumId: activeAlbumId, limit: 200 }, token)
        .then((r) => setMissingItems(r.items))
        .catch((err) => console.error('Failed to load missing', err));
    }

    if (tab === 'duplicates' && duplicateItems.length === 0) {
      fetchDuplicates(user.id, { albumId: activeAlbumId, limit: 200 }, token)
        .then((r) => setDuplicateItems(r.items))
        .catch((err) => console.error('Failed to load duplicates', err));
    }
  }, [tab, token, user, activeAlbumId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Cross-album indicator maps (computed client-side)
  // ---------------------------------------------------------------------------
  const crossAlbumNeeded = useMemo<Map<string, string[]>>(() => {
    if (otherAlbumsOwned.size === 0) return new Map();
    const map = new Map<string, string[]>();
    for (const [albumId, otherMap] of otherAlbumsOwned.entries()) {
      const album = albums.find((a) => a.id === albumId);
      const name = album ? albumDisplayName(album) : 'Another album';
      // This other album does NOT own a sticker that the active album owns
      for (const albumCode of ownedMap.keys()) {
        if (!otherMap.has(albumCode)) {
          if (!map.has(albumCode)) map.set(albumCode, []);
          map.get(albumCode)!.push(name);
        }
      }
    }
    return map;
  }, [ownedMap, otherAlbumsOwned, albums]);

  const crossAlbumAvailable = useMemo<Map<string, string[]>>(() => {
    if (otherAlbumsOwned.size === 0) return new Map();
    const map = new Map<string, string[]>();
    for (const [albumId, otherMap] of otherAlbumsOwned.entries()) {
      const album = albums.find((a) => a.id === albumId);
      const name = album ? albumDisplayName(album) : 'Another album';
      for (const [albumCode, perSticker] of otherMap.entries()) {
        let totalQty = 0;
        for (const e of perSticker.values()) totalQty += e.quantity;
        if (totalQty > 1) {
          if (!map.has(albumCode)) map.set(albumCode, []);
          map.get(albumCode)!.push(name);
        }
      }
    }
    return map;
  }, [otherAlbumsOwned, albums]);

  // ---------------------------------------------------------------------------
  // Derived totals
  // ---------------------------------------------------------------------------
  const tabBase = useMemo(() => {
    if (tab === 'all') return stickers;
    if (tab === 'have') return stickers.filter((s) => ownedMap.has(s.album_code));
    if (tab === 'missing') return stickers.filter((s) => !ownedMap.has(s.album_code));
    return stickers.filter((s) => {
      const p = ownedMap.get(s.album_code);
      if (!p) return false;
      if (duplicatesCountAllVariants) {
        let total = 0;
        for (const e of p.values()) total += e.quantity;
        return total > 1;
      }
      for (const e of p.values()) if (e.quantity > 1) return true;
      return false;
    });
  }, [stickers, tab, ownedMap, duplicatesCountAllVariants]);

  const filterOptions = useMemo(() => {
    const filterExcept = (exclude: keyof FilterState): Sticker[] =>
      tabBase.filter((s) => {
        if (exclude !== 'group' && filters.group?.length && !filters.group.includes(s.group_name ?? '')) return false;
        if (exclude !== 'team' && filters.team?.length && !filters.team.includes(s.team_name ?? '') && !filters.team.includes(s.fifa_code ?? '')) return false;
        if (exclude !== 'type' && filters.type?.length && !filters.type.includes(s.sticker_type)) return false;
        if (exclude !== 'variant' && filters.variant?.length) {
          const p = ownedMap.get(s.album_code);
          if (!p || !filters.variant.some((v) => p.has(v))) return false;
        }
        if (exclude !== 'search' && filters.search) {
          const q = filters.search.toLowerCase();
          if (!s.player_name?.toLowerCase().includes(q) && !s.album_code.toLowerCase().includes(q) && !s.team_name?.toLowerCase().includes(q)) return false;
        }
        return true;
      });

    const groupSet = new Set(filterExcept('group').map((s) => s.group_name).filter(Boolean) as string[]);
    const groupOptions = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
      .filter((g) => groupSet.has(g))
      .map((g) => ({ value: g, label: `Group ${g}` }));

    const teamSeen = new Set<string>();
    const teamOptions: { value: string; label: string }[] = [];
    for (const s of filterExcept('team')) {
      if (s.team_name && !teamSeen.has(s.team_name)) {
        teamSeen.add(s.team_name);
        teamOptions.push({ value: s.team_name, label: s.team_name });
      }
    }
    teamOptions.sort((a, b) => a.label.localeCompare(b.label));

    const typeSet = new Set(filterExcept('type').map((s) => s.sticker_type).filter(Boolean));
    const typeOptions = Object.entries(TYPE_LABELS).filter(([v]) => typeSet.has(v)).map(([value, label]) => ({ value, label }));

    const variantSet = new Set<string>();
    for (const s of filterExcept('variant')) {
      const p = ownedMap.get(s.album_code);
      if (p) for (const vt of p.keys()) variantSet.add(vt);
    }
    const variantOptions = [...variantSet].map((v) => ({ value: v, label: variantLabel(v) }));

    return { groupOptions, teamOptions, typeOptions, variantOptions };
  }, [tabBase, filters, ownedMap]);

  const totalOwnedQuantity = useMemo(() => {
    let sum = 0;
    for (const perSticker of ownedMap.values()) {
      for (const entry of perSticker.values()) sum += entry.quantity;
    }
    return sum;
  }, [ownedMap]);

  const totalExtraCopies = useMemo(() => {
    let sum = 0;
    for (const perSticker of ownedMap.values()) {
      if (duplicatesCountAllVariants) {
        let total = 0;
        for (const entry of perSticker.values()) total += entry.quantity;
        if (total > 1) sum += total - 1;
      } else {
        for (const entry of perSticker.values()) {
          if (entry.quantity > 1) sum += entry.quantity - 1;
        }
      }
    }
    return sum;
  }, [ownedMap, duplicatesCountAllVariants]);

  const displayedStickers = useMemo<Sticker[]>(() => {
    let base: Sticker[];

    if (tab === 'all') {
      base = stickers;
    } else if (tab === 'have') {
      base = stickers.filter((s) => ownedMap.has(s.album_code));
    } else if (tab === 'missing') {
      if (missingItems.length > 0) {
        base = missingItems;
      } else {
        base = stickers.filter((s) => !ownedMap.has(s.album_code));
      }
    } else {
      if (duplicateItems.length > 0) {
        const seen = new Set<string>();
        base = [];
        for (const d of duplicateItems) {
          if (seen.has(d.album_code)) continue;
          seen.add(d.album_code);
          const match = stickers.find((s) => s.album_code === d.album_code);
          if (match) base.push(match);
          else base.push(d as unknown as Sticker);
        }
      } else {
        base = stickers.filter((s) => {
          const perSticker = ownedMap.get(s.album_code);
          if (!perSticker) return false;
          if (duplicatesCountAllVariants) {
            let total = 0;
            for (const e of perSticker.values()) total += e.quantity;
            return total > 1;
          }
          for (const e of perSticker.values()) if (e.quantity > 1) return true;
          return false;
        });
      }
    }

    return base.filter((s) => {
      if (filters.group?.length && !filters.group.includes(s.group_name ?? '')) return false;
      if (filters.team?.length && !filters.team.includes(s.team_name ?? '') && !filters.team.includes(s.fifa_code ?? '')) return false;
      if (filters.type?.length && !filters.type.includes(s.sticker_type)) return false;
      if (filters.variant?.length) {
        const perSticker = ownedMap.get(s.album_code);
        if (!perSticker || !filters.variant.some((v) => perSticker.has(v))) return false;
      }
      if (filters.search && !s.player_name?.toLowerCase().includes(filters.search.toLowerCase()) && !s.album_code.toLowerCase().includes(filters.search.toLowerCase()) && !s.team_name?.toLowerCase().includes(filters.search.toLowerCase())) return false;
      return true;
    });
  }, [stickers, tab, filters, ownedMap, missingItems, duplicateItems, duplicatesCountAllVariants]);

  // ---------------------------------------------------------------------------
  // Mutation handlers
  // ---------------------------------------------------------------------------
  const handleCollectionChange = useCallback(async () => {
    if (token && user && activeAlbumId) {
      await loadCollection(token, user.id, activeAlbumId);
      if (albums.length > 1) {
        await loadOtherAlbums(token, user.id, activeAlbumId, albums);
      }
    }
    setMissingItems([]);
    setDuplicateItems([]);
  }, [loadCollection, loadOtherAlbums, token, user, activeAlbumId, albums]);

  const handleOptimisticAdjust = useCallback(
    (albumCode: string, variantType: string, variantId: string, delta: number) => {
      setOwnedMap((prev) => {
        const next = new Map(prev);
        const perSticker = new Map(next.get(albumCode) ?? []);
        const current = perSticker.get(variantType);
        const newQty = (current?.quantity ?? 0) + delta;
        if (newQty <= 0) {
          perSticker.delete(variantType);
        } else {
          perSticker.set(variantType, {
            variantId: current?.variantId ?? variantId,
            quantity: newQty,
          });
        }
        if (perSticker.size === 0) {
          next.delete(albumCode);
        } else {
          next.set(albumCode, perSticker);
        }
        return next;
      });
    },
    [],
  );

  const handleAddAlbum = useCallback(
    async (alias: string | null, edition: AlbumEdition) => {
      if (!token || !user) throw new Error('Not authenticated');
      const newAlbum = await createUserAlbum(user.id, { alias, edition }, token);
      upsertAlbum(newAlbum);
    },
    [token, user, upsertAlbum]
  );

  const handleSelectAlbum = useCallback(
    (id: string) => {
      if (id === activeAlbumId) return;
      setActiveAlbumId(id);
      setTab('all');
      setFilters({});
    },
    [activeAlbumId, setActiveAlbumId]
  );

  const handleEditAlbum = useCallback(
    (albumId: string) => {
      const album = albums.find((a) => a.id === albumId);
      if (album) setEditingAlbum(album);
    },
    [albums]
  );

  const handleSaveAlbum = useCallback(
    async (patch: { alias: string | null; edition: AlbumEdition }) => {
      if (!token || !user || !editingAlbum) throw new Error('Not authenticated');
      const updated = await updateUserAlbum(user.id, editingAlbum.id, patch, token);
      upsertAlbum(updated);
    },
    [token, user, editingAlbum, upsertAlbum]
  );

  const handleDeleteAlbum = useCallback(
    async () => {
      if (!token || !user || !editingAlbum) throw new Error('Not authenticated');
      await deleteUserAlbum(user.id, editingAlbum.id, token);
      removeAlbum(editingAlbum.id);
    },
    [token, user, editingAlbum, removeAlbum]
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const TABS: { id: Tab; label: string }[] = [
    { id: 'all', label: 'All Stickers' },
    { id: 'have', label: 'Have' },
    { id: 'missing', label: 'Missing' },
    { id: 'duplicates', label: 'Duplicates' },
  ];

  const activeAlbum = albums.find((a) => a.id === activeAlbumId);

  if (!hydrated || (!token && hydrated)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-gray-400 text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              Album{' '}
              <span className="text-base font-normal text-gray-400">
                — {user?.displayName ?? `@${user?.username}`}
              </span>
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {activeAlbum
                ? `${EDITION_LABELS[activeAlbum.edition as keyof typeof EDITION_LABELS] ?? activeAlbum.edition} Edition`
                : `${EDITION_LABELS[albumEdition]} Edition`}
            </p>
          </div>

          {albums.length > 0 && (
            <AlbumSelector
              albums={albums}
              activeAlbumId={activeAlbumId}
              onSelect={handleSelectAlbum}
              onAddAlbum={() => setShowAddAlbumModal(true)}
              onEditAlbum={handleEditAlbum}
            />
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <StatsBar stats={stats} loading={loading} />

        <FilterBar
          filters={filters}
          onChange={setFilters}
          groupOptions={filterOptions.groupOptions}
          teamOptions={filterOptions.teamOptions}
          typeOptions={filterOptions.typeOptions}
          variantOptions={filterOptions.variantOptions}
        />

        <div className="flex gap-1 border-b border-gray-200">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {label}
              {id === 'all' && !loading && stickers.length > 0 && (
                <span className="ml-1.5 text-xs text-gray-400">({stickers.length})</span>
              )}
              {id === 'have' && stats && (
                <span className="ml-1.5 text-xs text-gray-400">
                  {totalOwnedQuantity > stats.owned
                    ? `(${stats.owned} / ${totalOwnedQuantity})`
                    : `(${stats.owned})`}
                </span>
              )}
              {id === 'missing' && stats && (
                <span className="ml-1.5 text-xs text-gray-400">({stats.missing})</span>
              )}
              {id === 'duplicates' && stats && (
                <span className="ml-1.5 text-xs text-gray-400">
                  {totalExtraCopies > 0
                    ? `(${stats.duplicates} / +${totalExtraCopies})`
                    : `(${stats.duplicates})`}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
            Loading stickers…
          </div>
        ) : activeAlbumId ? (
          <StickerGrid
            stickers={displayedStickers}
            ownedMap={ownedMap}
            userId={user!.id}
            albumId={activeAlbumId}
            token={token!}
            onCollectionChange={handleCollectionChange}
            onOptimisticAdjust={handleOptimisticAdjust}
            crossAlbumNeeded={crossAlbumNeeded}
            crossAlbumAvailable={crossAlbumAvailable}
          />
        ) : null}
      </div>

      {showAddAlbumModal && (
        <AddAlbumModal
          onConfirm={handleAddAlbum}
          onClose={() => setShowAddAlbumModal(false)}
        />
      )}

      {editingAlbum && (
        <EditAlbumModal
          album={editingAlbum}
          onSave={handleSaveAlbum}
          onDelete={handleDeleteAlbum}
          onClose={() => setEditingAlbum(null)}
        />
      )}
    </div>
  );
}
