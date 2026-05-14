'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  fetchAllStickersCached,
  fetchStats,
  fetchCollection,
  fetchMissing,
  fetchDuplicates,
  fetchUserAlbums,
  fetchAlbumSummaries,
  createUserAlbum,
  updateUserAlbum,
  deleteUserAlbum,
  setDefaultUserAlbum,
  albumDisplayName,
  type Sticker,
  type CollectionStats,
  type MissingItem,
  type DuplicateItem,
  type UserAlbum,
  type AlbumSummary,
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
import AlbumFormModal from './components/AlbumFormModal';
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

function isDuplicateSticker(
  perSticker: OwnedVariantMap,
  duplicatesCountAllVariants: boolean,
): boolean {
  if (duplicatesCountAllVariants) {
    let total = 0;
    for (const e of perSticker.values()) total += e.quantity;
    return total > 1;
  }
  for (const e of perSticker.values()) if (e.quantity > 1) return true;
  return false;
}

export default function AlbumPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const duplicatesCountAllVariants = usePreferencesStore((s) => s.duplicatesCountAllVariants);

  const albums = useAlbumsStore((s) => s.albums);
  const activeAlbumId = useAlbumsStore((s) => s.activeAlbumId);
  const setAlbums = useAlbumsStore((s) => s.setAlbums);
  const setActiveAlbumId = useAlbumsStore((s) => s.setActiveAlbumId);
  const upsertAlbum = useAlbumsStore((s) => s.upsertAlbum);
  const removeAlbum = useAlbumsStore((s) => s.removeAlbum);

  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [stats, setStats] = useState<CollectionStats | null>(null);
  const [ownedMap, setOwnedMap] = useState<OwnedMap>(new Map());
  const [albumSummaries, setAlbumSummaries] = useState<AlbumSummary[]>([]);
  const [missingItems, setMissingItems] = useState<MissingItem[]>([]);
  const [duplicateItems, setDuplicateItems] = useState<DuplicateItem[]>([]);

  const [tab, setTab] = useState<Tab>('all');
  const [filters, setFilters] = useState<FilterState>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddAlbumModal, setShowAddAlbumModal] = useState(false);
  const [editingAlbum, setEditingAlbum] = useState<UserAlbum | null>(null);

  // ── Stable refs so callbacks don't recreate on every render ─────────────────
  const tokenRef = useRef(token);
  const userRef = useRef(user);
  tokenRef.current = token;
  userRef.current = user;

  // ---------------------------------------------------------------------------
  // Data loaders
  // ---------------------------------------------------------------------------
  const loadCollection = useCallback(async (tok: string, userId: string, albumId: string) => {
    const [statsData, map] = await Promise.all([
      fetchStats(userId, tok, albumId),
      loadOwnedMap(userId, albumId, tok),
    ]);
    setStats(statsData);
    setOwnedMap(map);
  }, []);

  const loadSummaries = useCallback(async (tok: string, userId: string) => {
    const items = await fetchAlbumSummaries(userId, tok);
    setAlbumSummaries(items);
  }, []);

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
      const tok = tokenRef.current;
      const usr = userRef.current;
      if (!tok || !usr) return;

      setLoading(true);
      setError(null);
      try {
        const [allStickers, userAlbums] = await Promise.all([
          fetchAllStickersCached(tok),
          fetchUserAlbums(usr.id, tok),
        ]);

        if (cancelled) return;
        setStickers(allStickers);
        setAlbums(userAlbums);

        const defaultAlbum = userAlbums.find((a) => a.is_default) ?? userAlbums[0];
        if (defaultAlbum) {
          await Promise.all([
            loadCollection(tok, usr.id, defaultAlbum.id),
            loadSummaries(tok, usr.id),
          ]);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally runs once on mount/auth change
  }, [hydrated, token, user, router]);

  // ---------------------------------------------------------------------------
  // Reload when active album changes (album switch only)
  // ---------------------------------------------------------------------------
  const prevActiveAlbumIdRef = useRef<string | null>(null);
  useEffect(() => {
    const tok = tokenRef.current;
    const usr = userRef.current;
    if (!tok || !usr || !activeAlbumId || loading) return;
    if (activeAlbumId === prevActiveAlbumIdRef.current) return;
    prevActiveAlbumIdRef.current = activeAlbumId;

    setMissingItems([]);
    setDuplicateItems([]);
    loadCollection(tok, usr.id, activeAlbumId).catch(console.error);
  }, [activeAlbumId, loading, loadCollection]);

  // ---------------------------------------------------------------------------
  // Load missing/duplicates on demand
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const tok = tokenRef.current;
    const usr = userRef.current;
    if (!tok || !usr || !activeAlbumId) return;

    if (tab === 'missing' && missingItems.length === 0) {
      fetchMissing(usr.id, { albumId: activeAlbumId, limit: 200 }, tok)
        .then((r) => setMissingItems(r.items))
        .catch((err) => console.error('Failed to load missing', err));
    }

    if (tab === 'duplicates' && duplicateItems.length === 0) {
      fetchDuplicates(usr.id, { albumId: activeAlbumId, limit: 200 }, tok)
        .then((r) => setDuplicateItems(r.items))
        .catch((err) => console.error('Failed to load duplicates', err));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only fire when tab or album changes
  }, [tab, activeAlbumId]);

  // ---------------------------------------------------------------------------
  // Cross-album indicators derived from summaries (no full album fetches)
  // ---------------------------------------------------------------------------
  const crossAlbumNeeded = useMemo<Map<string, string[]>>(() => {
    if (albumSummaries.length === 0) return new Map();
    const map = new Map<string, string[]>();
    for (const summary of albumSummaries) {
      if (summary.album_id === activeAlbumId) continue;
      const album = albums.find((a) => a.id === summary.album_id);
      const name = album ? albumDisplayName(album) : 'Another album';
      const otherOwned = new Set(summary.owned_album_codes);
      for (const albumCode of ownedMap.keys()) {
        if (!otherOwned.has(albumCode)) {
          if (!map.has(albumCode)) map.set(albumCode, []);
          map.get(albumCode)!.push(name);
        }
      }
    }
    return map;
  }, [albumSummaries, ownedMap, activeAlbumId, albums]);

  const crossAlbumAvailable = useMemo<Map<string, string[]>>(() => {
    if (albumSummaries.length === 0) return new Map();
    const map = new Map<string, string[]>();
    for (const summary of albumSummaries) {
      if (summary.album_id === activeAlbumId) continue;
      const album = albums.find((a) => a.id === summary.album_id);
      const name = album ? albumDisplayName(album) : 'Another album';
      for (const albumCode of summary.duplicate_album_codes) {
        if (!map.has(albumCode)) map.set(albumCode, []);
        map.get(albumCode)!.push(name);
      }
    }
    return map;
  }, [albumSummaries, activeAlbumId, albums]);

  // ---------------------------------------------------------------------------
  // Derived totals
  // ---------------------------------------------------------------------------
  const tabBase = useMemo(() => {
    if (tab === 'all') return stickers;
    if (tab === 'have') return stickers.filter((s) => ownedMap.has(s.album_code));
    if (tab === 'missing') return stickers.filter((s) => !ownedMap.has(s.album_code));
    return stickers.filter((s) => {
      const p = ownedMap.get(s.album_code);
      return p ? isDuplicateSticker(p, duplicatesCountAllVariants) : false;
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
      base = missingItems.length > 0
        ? missingItems
        : stickers.filter((s) => !ownedMap.has(s.album_code));
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
          const p = ownedMap.get(s.album_code);
          return p ? isDuplicateSticker(p, duplicatesCountAllVariants) : false;
        });
      }
    }

    return base.filter((s) => {
      if (filters.group?.length && !filters.group.includes(s.group_name ?? '')) return false;
      if (filters.team?.length && !filters.team.includes(s.team_name ?? '') && !filters.team.includes(s.fifa_code ?? '')) return false;
      if (filters.type?.length && !filters.type.includes(s.sticker_type)) return false;
      if (filters.variant?.length) {
        const p = ownedMap.get(s.album_code);
        if (!p || !filters.variant.some((v) => p.has(v))) return false;
      }
      if (filters.search && !s.player_name?.toLowerCase().includes(filters.search.toLowerCase()) && !s.album_code.toLowerCase().includes(filters.search.toLowerCase()) && !s.team_name?.toLowerCase().includes(filters.search.toLowerCase())) return false;
      return true;
    });
  }, [stickers, tab, filters, ownedMap, missingItems, duplicateItems, duplicatesCountAllVariants]);

  // ---------------------------------------------------------------------------
  // Mutation handlers
  // ---------------------------------------------------------------------------
  const handleCollectionChange = useCallback(async (options?: { reloadSummaries?: boolean }) => {
    const tok = tokenRef.current;
    const usr = userRef.current;
    if (tok && usr && activeAlbumId) {
      const tasks: Promise<unknown>[] = [loadCollection(tok, usr.id, activeAlbumId)];
      if (options?.reloadSummaries) tasks.push(loadSummaries(tok, usr.id));
      await Promise.all(tasks);
    }
    setMissingItems([]);
    setDuplicateItems([]);
  }, [activeAlbumId, loadCollection, loadSummaries]);

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
        if (perSticker.size === 0) next.delete(albumCode);
        else next.set(albumCode, perSticker);
        return next;
      });
    },
    [],
  );

  const handleAddAlbum = useCallback(
    async (data: { alias: string | null; edition: AlbumEdition }) => {
      const tok = tokenRef.current;
      const usr = userRef.current;
      if (!tok || !usr) throw new Error('Not authenticated');
      const newAlbum = await createUserAlbum(usr.id, data, tok);
      upsertAlbum(newAlbum);
    },
    [upsertAlbum]
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
    async (data: { alias: string | null; edition: AlbumEdition }) => {
      const tok = tokenRef.current;
      const usr = userRef.current;
      if (!tok || !usr || !editingAlbum) throw new Error('Not authenticated');
      const updated = await updateUserAlbum(usr.id, editingAlbum.id, data, tok);
      upsertAlbum(updated);
    },
    [editingAlbum, upsertAlbum]
  );

  const handleDeleteAlbum = useCallback(
    async () => {
      const tok = tokenRef.current;
      const usr = userRef.current;
      if (!tok || !usr || !editingAlbum) throw new Error('Not authenticated');
      await deleteUserAlbum(usr.id, editingAlbum.id, tok);
      removeAlbum(editingAlbum.id);
    },
    [editingAlbum, removeAlbum]
  );

  const handleSetDefault = useCallback(
    async (albumId: string) => {
      const tok = tokenRef.current;
      const usr = userRef.current;
      if (!tok || !usr) return;
      try {
        const updated = await setDefaultUserAlbum(usr.id, albumId, tok);
        // Refresh full albums list to reflect is_default changes
        const freshAlbums = await fetchUserAlbums(usr.id, tok);
        setAlbums(freshAlbums);
        upsertAlbum(updated);
      } catch (err) {
        console.error('Failed to set default album', err);
      }
    },
    [setAlbums, upsertAlbum]
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
                : null}
            </p>
          </div>

          {albums.length > 0 && (
            <AlbumSelector
              albums={albums}
              activeAlbumId={activeAlbumId}
              onSelect={handleSelectAlbum}
              onAddAlbum={() => setShowAddAlbumModal(true)}
              onEditAlbum={handleEditAlbum}
              onSetDefault={handleSetDefault}
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
        <AlbumFormModal
          mode="create"
          defaultEdition={(activeAlbum?.edition ?? 'north_america') as AlbumEdition}
          onConfirm={handleAddAlbum}
          onClose={() => setShowAddAlbumModal(false)}
        />
      )}

      {editingAlbum && (
        <AlbumFormModal
          mode="edit"
          album={editingAlbum}
          onConfirm={handleSaveAlbum}
          onDelete={handleDeleteAlbum}
          onClose={() => setEditingAlbum(null)}
        />
      )}
    </div>
  );
}
