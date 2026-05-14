'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  fetchAllStickersCached,
  fetchStats,
  fetchCollection,
  fetchMissing,
  fetchDuplicates,
  fetchUserAlbums,
  fetchAlbumSummaries,
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
import FilterBar, { type FilterState } from '../components/FilterBar';
import { variantLabel } from '../components/variantMeta';
import { EDITION_LABELS } from '@/lib/albumPages';
import type { AlbumEdition } from '@/lib/albumPages';
import StatsBar from '../components/StatsBar';
import StickerGrid, { type OwnedVariantMap } from '../components/StickerGrid';
import AlbumFormModal from '../components/AlbumFormModal';
import type { OwnedVariantEntry } from '../components/VariantPopover';

type Tab = 'all' | 'have' | 'missing' | 'duplicates';

const TYPE_LABELS: Record<string, string> = {
  player: 'Player',
  badge: 'Badge',
  team_photo: 'Team Photo',
  intro: 'Intro',
  museum: 'Museum',
  coca_cola: 'Coca-Cola',
};

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

export default function AlbumDetailPage() {
  const params = useParams();
  const albumId = params.albumId as string;

  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const duplicatesCountAllVariants = usePreferencesStore((s) => s.duplicatesCountAllVariants);

  const albums = useAlbumsStore((s) => s.albums);
  const setAlbums = useAlbumsStore((s) => s.setAlbums);
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
  const [editingAlbum, setEditingAlbum] = useState<UserAlbum | null>(null);

  const tokenRef = useRef(token);
  const userRef = useRef(user);
  tokenRef.current = token;
  userRef.current = user;

  // ---------------------------------------------------------------------------
  // Data loaders
  // ---------------------------------------------------------------------------
  const loadCollection = useCallback(async (tok: string, userId: string, aid: string) => {
    const [statsData, map] = await Promise.all([
      fetchStats(userId, tok, aid),
      loadOwnedMap(userId, aid, tok),
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
      setTab('all');
      setFilters({});
      setMissingItems([]);
      setDuplicateItems([]);

      try {
        const [allStickers, userAlbums] = await Promise.all([
          fetchAllStickersCached(tok),
          fetchUserAlbums(usr.id, tok),
        ]);

        if (cancelled) return;
        setStickers(allStickers);
        setAlbums(userAlbums);

        const album = userAlbums.find((a) => a.id === albumId);
        if (!album) {
          router.replace('/album');
          return;
        }

        await Promise.all([
          loadCollection(tok, usr.id, albumId),
          loadSummaries(tok, usr.id),
        ]);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, token, user, albumId, router]);

  // ---------------------------------------------------------------------------
  // Load missing/duplicates on demand
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const tok = tokenRef.current;
    const usr = userRef.current;
    if (!tok || !usr || !albumId) return;

    if (tab === 'missing' && missingItems.length === 0) {
      fetchMissing(usr.id, { albumId, limit: 200 }, tok)
        .then((r) => setMissingItems(r.items))
        .catch((err) => console.error('Failed to load missing', err));
    }

    if (tab === 'duplicates' && duplicateItems.length === 0) {
      fetchDuplicates(usr.id, { albumId, limit: 200 }, tok)
        .then((r) => setDuplicateItems(r.items))
        .catch((err) => console.error('Failed to load duplicates', err));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, albumId]);

  // ---------------------------------------------------------------------------
  // Cross-album indicators
  // ---------------------------------------------------------------------------
  const crossAlbumNeeded = useMemo<Map<string, string[]>>(() => {
    if (albumSummaries.length === 0) return new Map();
    const map = new Map<string, string[]>();
    for (const summary of albumSummaries) {
      if (summary.album_id === albumId) continue;
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
  }, [albumSummaries, ownedMap, albumId, albums]);

  const crossAlbumAvailable = useMemo<Map<string, string[]>>(() => {
    if (albumSummaries.length === 0) return new Map();
    const map = new Map<string, string[]>();
    for (const summary of albumSummaries) {
      if (summary.album_id === albumId) continue;
      const album = albums.find((a) => a.id === summary.album_id);
      const name = album ? albumDisplayName(album) : 'Another album';
      for (const albumCode of summary.duplicate_album_codes) {
        if (!map.has(albumCode)) map.set(albumCode, []);
        map.get(albumCode)!.push(name);
      }
    }
    return map;
  }, [albumSummaries, albumId, albums]);

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
    if (tok && usr && albumId) {
      const tasks: Promise<unknown>[] = [loadCollection(tok, usr.id, albumId)];
      if (options?.reloadSummaries) tasks.push(loadSummaries(tok, usr.id));
      await Promise.all(tasks);
    }
    setMissingItems([]);
    setDuplicateItems([]);
  }, [albumId, loadCollection, loadSummaries]);

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

  const handleDeleteAlbum = useCallback(async () => {
    const tok = tokenRef.current;
    const usr = userRef.current;
    if (!tok || !usr || !editingAlbum) throw new Error('Not authenticated');
    await deleteUserAlbum(usr.id, editingAlbum.id, tok);
    removeAlbum(editingAlbum.id);
    router.replace('/album');
  }, [editingAlbum, removeAlbum, router]);

  const handleSetDefault = useCallback(async () => {
    const tok = tokenRef.current;
    const usr = userRef.current;
    if (!tok || !usr) return;
    try {
      await setDefaultUserAlbum(usr.id, albumId, tok);
      const fresh = await fetchUserAlbums(usr.id, tok);
      setAlbums(fresh);
    } catch (err) {
      console.error('Failed to set default album', err);
    }
  }, [albumId, setAlbums]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const TABS: { id: Tab; label: string }[] = [
    { id: 'all', label: 'All Stickers' },
    { id: 'have', label: 'Have' },
    { id: 'missing', label: 'Missing' },
    { id: 'duplicates', label: 'Duplicates' },
  ];

  const activeAlbum = albums.find((a) => a.id === albumId);

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

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <Link
              href="/album"
              className="mt-1 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
              aria-label="Back to albums"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-800 leading-tight">
                {activeAlbum ? albumDisplayName(activeAlbum) : 'Album'}
              </h1>
              {activeAlbum && (
                <p className="text-sm text-gray-500 mt-0.5">
                  {EDITION_LABELS[activeAlbum.edition as AlbumEdition] ?? activeAlbum.edition} Edition
                  {activeAlbum.is_default && (
                    <span className="ml-2 inline-flex items-center gap-1 text-amber-500">
                      <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                      Default
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>

          {activeAlbum && (
            <div className="flex items-center gap-2">
              {!activeAlbum.is_default && (
                <button
                  onClick={handleSetDefault}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors"
                  title="Set as default"
                >
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  Set default
                </button>
              )}
              <button
                onClick={() => setEditingAlbum(activeAlbum)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
                Edit
              </button>
            </div>
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
        ) : albumId ? (
          <StickerGrid
            stickers={displayedStickers}
            ownedMap={ownedMap}
            userId={user!.id}
            albumId={albumId}
            token={token!}
            onCollectionChange={handleCollectionChange}
            onOptimisticAdjust={handleOptimisticAdjust}
            crossAlbumNeeded={crossAlbumNeeded}
            crossAlbumAvailable={crossAlbumAvailable}
          />
        ) : null}
      </div>

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
