'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAlbumUrlState, type Tab } from './useAlbumUrlState';
import { useFavourites } from './useFavourites';
import { useFilterOptions } from './useFilterOptions';
import { useStickerSelection } from './useStickerSelection';
import {
  fetchAllStickersCached,
  fetchCollection,
  fetchCollectionPage,
  fetchMissing,
  fetchDuplicates,
  fetchUserAlbums,
  fetchAlbumCrossAlbum,
  fetchAlbumEditions,
  fetchAlbumFormats,
  fetchStickersBulk,
  createUserAlbum,
  updateUserAlbum,
  deleteUserAlbum,
  setDefaultUserAlbum,
  addSticker,
  deleteSticker,
  setTradeFlags,
  albumDisplayName,
  toEditionKey,
  DEFAULT_ALBUM_TYPE_KEY,
  type AlbumEditionOption,
  type AlbumFormatOption,
  type AlbumSettings,
  type Sticker,
  type CollectionStats,
  type MissingItem,
  type DuplicateItem,
  type UserAlbum,
  type CrossAlbum,
} from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import { useAuthStore } from '@/store/auth';
import { usePreferencesStore } from '@/store/preferences';
import { useAlbumsStore } from '@/store/albums';
import FilterBar, { type FilterState } from '../components/FilterBar';
import { ALL_VARIANT_TYPES } from '../components/variantMeta';
import StatsBar from '../components/StatsBar';
import StickerGrid, { type OwnedVariantMap } from '../components/StickerGrid';
import AlbumFormModal from '../components/AlbumFormModal';
import MassActionBar from '../components/MassActionBar';
import VariantPickerModal from '../components/VariantPickerModal';
import type { OwnedVariantEntry } from '../components/VariantPopover';

async function runBatched<T>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    await Promise.allSettled(items.slice(i, i + batchSize).map(fn));
  }
}

type OwnedMap = Map<string, OwnedVariantMap>;

interface LoadedCollection {
  ownedMap: OwnedMap;
  stats: CollectionStats;
  totalExtraCopies: number;
}

async function loadOwnedAndStats(
  userId: string,
  albumId: string,
  token: string,
): Promise<LoadedCollection> {
  // First request uses the bundled endpoint so we get server-authoritative
  // stats + total-extra-copies in the same round trip as the first page of
  // items. Subsequent pages use the lighter items-only endpoint.
  const first = await fetchCollectionPage(
    userId,
    { albumId, limit: 1000 },
    token,
  );
  const map: OwnedMap = new Map();
  const consume = (items: typeof first.items): void => {
    for (const item of items) {
      let perSticker = map.get(item.albumCode);
      if (!perSticker) {
        perSticker = new Map<string, OwnedVariantEntry>();
        map.set(item.albumCode, perSticker);
      }
      perSticker.set(item.variantType, {
        variantId: item.stickerVariantId,
        quantity: item.quantity,
        tradeHidden: item.tradeHidden,
        tradeForced: item.tradeForced,
      });
    }
  };

  consume(first.items);
  let cursor: number | null = first.nextCursor;
  for (let i = 0; i < 50 && cursor !== null; i++) {
    const page = await fetchCollection(
      userId,
      { albumId, limit: 1000, cursor },
      token,
    );
    consume(page.items);
    if (page.items.length === 0) break;
    cursor = page.nextCursor;
  }

  return {
    ownedMap: map,
    stats: first.stats,
    totalExtraCopies: first.totalExtraCopies,
  };
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

export default function AlbumDetailClient({ albumId }: { albumId: string }) {

  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const duplicatesCountAllVariants = usePreferencesStore((s) => s.duplicatesCountAllVariants);
  const { addToast } = useToast();

  const albums = useAlbumsStore((s) => s.albums);
  const setAlbums = useAlbumsStore((s) => s.setAlbums);
  const upsertAlbum = useAlbumsStore((s) => s.upsertAlbum);
  const removeAlbum = useAlbumsStore((s) => s.removeAlbum);

  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [ownedMap, setOwnedMap] = useState<OwnedMap>(new Map());
  // Server-authoritative stats — denormalized on user_albums and kept fresh by
  // the trg_user_stickers_sync_counts trigger. Replaces the previous
  // computedStats that iterated the entire catalog on every render.
  const [serverStats, setServerStats] = useState<CollectionStats | null>(null);
  const [serverExtraCopies, setServerExtraCopies] = useState<number>(0);
  const [crossAlbum, setCrossAlbum] = useState<CrossAlbum>({ neededIn: {}, availableIn: {}, presentIn: {} });
  const [missingItems, setMissingItems] = useState<MissingItem[]>([]);
  const [duplicateItems, setDuplicateItems] = useState<DuplicateItem[]>([]);

  const { tab, filters, setTab, setFilters } = useAlbumUrlState();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editions, setEditions] = useState<AlbumEditionOption[]>([]);
  const [formats, setFormats] = useState<AlbumFormatOption[]>([]);
  const [editingAlbum, setEditingAlbum] = useState<UserAlbum | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const [massWorking, setMassWorking] = useState(false);
  const [variantPicker, setVariantPicker] = useState<'add' | 'remove' | null>(null);

  const tokenRef = useRef(token);
  const userRef = useRef(user);
  tokenRef.current = token;
  userRef.current = user;

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Favourites are persisted server-side (replaces localStorage). The hook
  // takes a sticker-by-code map because the API canonicalises by UUID while
  // the UI keys everything by album_code.
  const stickersByAlbumCode = useMemo(() => {
    const m = new Map<string, Sticker>();
    for (const s of stickers) m.set(s.albumCode, s);
    return m;
  }, [stickers]);
  const {
    favouriteSet,
    toggle: handleToggleFavourite,
    setBulk: setFavouritesBulk,
  } = useFavourites({
    userId: user?.id ?? null,
    albumId,
    token,
    stickersByAlbumCode,
  });

  // ---------------------------------------------------------------------------
  // Data loaders
  // ---------------------------------------------------------------------------
  const loadCollection = useCallback(async (tok: string, userId: string, aid: string) => {
    const { ownedMap: map, stats, totalExtraCopies } = await loadOwnedAndStats(userId, aid, tok);
    setOwnedMap(map);
    setServerStats(stats);
    setServerExtraCopies(totalExtraCopies);
  }, []);

  const loadCrossAlbum = useCallback(async (tok: string, userId: string, aid: string) => {
    const data = await fetchAlbumCrossAlbum(userId, aid, tok);
    setCrossAlbum(data);
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
      // Tab + filters live in the URL now — no localStorage restore needed.
      setMissingItems([]);
      setDuplicateItems([]);

      try {
        const [allStickers, userAlbums, editionList, formatList] = await Promise.all([
          fetchAllStickersCached(tok),
          fetchUserAlbums(usr.id, tok),
          fetchAlbumEditions(DEFAULT_ALBUM_TYPE_KEY),
          fetchAlbumFormats(DEFAULT_ALBUM_TYPE_KEY),
        ]);

        if (cancelled) return;
        setStickers(allStickers);
        setAlbums(userAlbums);
        setEditions(editionList);
        setFormats(formatList);

        const album = userAlbums.find((a) => a.id === albumId);
        if (!album) {
          router.replace('/album');
          return;
        }

        await Promise.all([
          loadCollection(tok, usr.id, albumId),
          loadCrossAlbum(tok, usr.id, albumId),
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
  // Cross-album indicators — computed server-side in a single SQL query.
  // ---------------------------------------------------------------------------
  const crossAlbumNeeded = useMemo<Map<string, string[]>>(() => {
    const map = new Map<string, string[]>();
    for (const [code, refs] of Object.entries(crossAlbum.neededIn)) {
      map.set(code, refs.map((r) => r.name));
    }
    return map;
  }, [crossAlbum]);

  const crossAlbumAvailable = useMemo<Map<string, string[]>>(() => {
    const map = new Map<string, string[]>();
    for (const [code, refs] of Object.entries(crossAlbum.availableIn)) {
      map.set(code, refs.map((r) => r.name));
    }
    return map;
  }, [crossAlbum]);

  const crossAlbumHasSticker = useMemo<Map<string, Array<{ id: string; name: string }>>>(() => {
    const map = new Map<string, Array<{ id: string; name: string }>>();
    for (const [code, refs] of Object.entries(crossAlbum.presentIn)) {
      map.set(code, refs);
    }
    return map;
  }, [crossAlbum]);

  // ---------------------------------------------------------------------------
  // Derived totals
  // ---------------------------------------------------------------------------
  const activeAlbum = useMemo(() => albums.find((a) => a.id === albumId), [albums, albumId]);

  const settingsFilteredStickers = useMemo<Sticker[]>(() => {
    const albumSettings = activeAlbum?.settings;
    if (!albumSettings) return stickers;
    return stickers.filter((s) => {
      if (s.stickerType === 'coca_cola_special') return albumSettings.includeCocaCola;
      if (s.stickerType === 'extra') return albumSettings.includeExtras;
      return true;
    });
  }, [stickers, activeAlbum]);

  const tabBase = useMemo(() => {
    if (tab === 'all') return settingsFilteredStickers;
    if (tab === 'have') return settingsFilteredStickers.filter((s) => ownedMap.has(s.albumCode));
    if (tab === 'missing') return settingsFilteredStickers.filter((s) => !ownedMap.has(s.albumCode));
    return settingsFilteredStickers.filter((s) => {
      const p = ownedMap.get(s.albumCode);
      return p ? isDuplicateSticker(p, duplicatesCountAllVariants) : false;
    });
  }, [settingsFilteredStickers, tab, ownedMap, duplicatesCountAllVariants]);

  const filterOptions = useFilterOptions({
    tabBase,
    filters,
    ownedMap: ownedMap as unknown as Map<string, Map<string, unknown>>,
    activeAlbum,
    favouriteSet,
  });

  // Stats come from user_albums (denormalized columns kept fresh by the
  // sync trigger). The serverStats.duplicates count uses the "any variant
  // qty > 1" rule; for users who flipped the duplicatesCountAllVariants
  // preference to true we re-derive that one value locally — the rest
  // (total/owned/missing/percentage) are unaffected by the preference.
  const computedStats = useMemo<CollectionStats | null>(() => {
    if (loading) return null;
    if (!serverStats) return null;
    if (!duplicatesCountAllVariants) return serverStats;
    let duplicates = 0;
    for (const s of settingsFilteredStickers) {
      const perSticker = ownedMap.get(s.albumCode);
      if (perSticker && isDuplicateSticker(perSticker, true)) duplicates++;
    }
    return { ...serverStats, duplicates };
  }, [loading, serverStats, duplicatesCountAllVariants, settingsFilteredStickers, ownedMap]);

  const totalOwnedQuantity = useMemo(() => {
    let sum = 0;
    for (const s of settingsFilteredStickers) {
      const perSticker = ownedMap.get(s.albumCode);
      if (perSticker) {
        for (const entry of perSticker.values()) sum += entry.quantity;
      }
    }
    return sum;
  }, [settingsFilteredStickers, ownedMap]);

  // Server provides the canonical "sum of (quantity - 1)" via the bundled
  // /collection?bundle=page response. Two modes give the same number unless
  // the user has duplicatesCountAllVariants flipped — in that case we
  // re-aggregate per-sticker locally over the owned map (small set).
  const totalExtraCopies = useMemo(() => {
    if (!duplicatesCountAllVariants) return serverExtraCopies;
    let sum = 0;
    for (const s of settingsFilteredStickers) {
      const perSticker = ownedMap.get(s.albumCode);
      if (!perSticker) continue;
      let total = 0;
      for (const entry of perSticker.values()) total += entry.quantity;
      if (total > 1) sum += total - 1;
    }
    return sum;
  }, [serverExtraCopies, duplicatesCountAllVariants, settingsFilteredStickers, ownedMap]);

  const displayedStickers = useMemo<Sticker[]>(() => {
    let base: Sticker[];

    if (tab === 'all') {
      base = settingsFilteredStickers;
    } else if (tab === 'have') {
      base = settingsFilteredStickers.filter((s) => ownedMap.has(s.albumCode));
    } else if (tab === 'missing') {
      base = missingItems.length > 0
        ? missingItems.filter((s) => settingsFilteredStickers.some((sf) => sf.albumCode === s.albumCode))
        : settingsFilteredStickers.filter((s) => !ownedMap.has(s.albumCode));
    } else {
      if (duplicateItems.length > 0) {
        const seen = new Set<string>();
        base = [];
        for (const d of duplicateItems) {
          if (seen.has(d.albumCode)) continue;
          seen.add(d.albumCode);
          const match = settingsFilteredStickers.find((s) => s.albumCode === d.albumCode);
          if (match) base.push(match);
          else base.push(d as unknown as Sticker);
        }
      } else {
        base = settingsFilteredStickers.filter((s) => {
          const p = ownedMap.get(s.albumCode);
          return p ? isDuplicateSticker(p, duplicatesCountAllVariants) : false;
        });
      }
    }

    const edition = activeAlbum?.edition;

    return base.filter((s) => {
      if (filters.favouritesOnly && !favouriteSet.has(s.albumCode)) return false;
      if (filters.group?.length && !filters.group.includes(s.groupName ?? '')) return false;
      if (filters.team?.length && !filters.team.includes(s.teamName ?? '') && !filters.team.includes(s.fifaCode ?? '')) return false;
      if (filters.type?.length && !filters.type.includes(s.stickerType)) return false;
      if (filters.variant?.length) {
        const p = ownedMap.get(s.albumCode);
        if (!p || !filters.variant.some((v) => p.has(v))) return false;
      }
      if (filters.search && !s.playerName?.toLowerCase().includes(filters.search.toLowerCase()) && !s.albumCode.toLowerCase().includes(filters.search.toLowerCase()) && !s.teamName?.toLowerCase().includes(filters.search.toLowerCase())) return false;
      if (filters.pageFrom != null || filters.pageTo != null) {
        if (!edition) return false;
        const ek = toEditionKey(edition);
        const sp = s.stickerPages?.[ek];
        let sStart: number | null = null;
        let sEnd: number | null = null;
        if (sp?.pageStart != null && sp?.pageEnd != null) {
          sStart = sp.pageStart; sEnd = sp.pageEnd;
        } else {
          const tp = s.teamPages?.[ek];
          if (tp) { sStart = tp[0]; sEnd = tp[1]; }
        }
        if (sStart == null || sEnd == null) return false;
        if (filters.pageFrom != null && sEnd < filters.pageFrom) return false;
        if (filters.pageTo != null && sStart > filters.pageTo) return false;
      }
      return true;
    });
  }, [settingsFilteredStickers, tab, filters, ownedMap, missingItems, duplicateItems, duplicatesCountAllVariants, activeAlbum, favouriteSet]);

  // ---------------------------------------------------------------------------
  // Selection helpers
  // ---------------------------------------------------------------------------
  const {
    selectionMode,
    setSelectionMode,
    selectedCodes,
    setSelectedCodes,
    selectedHasAnyOwned,
    selectedFavouriteState,
    removableVariantTypes,
    handleToggleSelect,
    handleRangeSelect,
    handleSelectAll,
    handleDeselectAll,
    handleExitSelection,
  } = useStickerSelection({ displayedStickers, ownedMap, favouriteSet });

  // ---------------------------------------------------------------------------
  // Mass action handlers
  // ---------------------------------------------------------------------------
  const handleMassDelete = useCallback(async () => {
    const tok = tokenRef.current;
    const usr = userRef.current;
    if (!tok || !usr || selectedCodes.size === 0) return;
    setMassWorking(true);
    try {
      const toDelete: string[] = [];
      for (const code of selectedCodes) {
        const variants = ownedMap.get(code);
        if (variants) {
          for (const entry of variants.values()) toDelete.push(entry.variantId);
        }
      }
      await runBatched(toDelete, 10, (variantId) =>
        deleteSticker(usr.id, variantId, tok, albumId),
      );
      setSelectedCodes(new Set());
      await loadCollection(tok, usr.id, albumId);
      setMissingItems([]);
      setDuplicateItems([]);
      addToast(`Removed ${toDelete.length} sticker variant${toDelete.length === 1 ? '' : 's'} from collection`);
    } catch (err) {
      console.error('Mass delete failed', err);
      addToast('Failed to delete stickers. Please try again.');
    } finally {
      setMassWorking(false);
    }
  }, [selectedCodes, ownedMap, albumId, loadCollection, addToast]);

  const handleMassAddVariant = useCallback(async (variantType: string) => {
    const tok = tokenRef.current;
    const usr = userRef.current;
    if (!tok || !usr || selectedCodes.size === 0) return;
    setMassWorking(true);
    try {
      const selectedStickerList = stickers.filter(
        (s) => selectedCodes.has(s.albumCode) && !ownedMap.get(s.albumCode)?.has(variantType),
      );
      if (selectedStickerList.length === 0) {
        addToast('All selected stickers already own that variant.');
        return;
      }
      if (variantType === 'base') {
        await runBatched(selectedStickerList, 10, async (sticker) => {
          if (!sticker.baseVariantId) return;
          await addSticker(usr.id, sticker.baseVariantId, 1, tok, albumId);
        });
      } else {
        const codes = selectedStickerList.map((s) => s.albumCode);
        const variantIdMap = new Map<string, string>();
        for (let i = 0; i < codes.length; i += 100) {
          const results = await fetchStickersBulk(codes.slice(i, i + 100), tok);
          for (const lookup of results) {
            const v = lookup.variants.find((x) => x.variantType === variantType);
            if (v) variantIdMap.set(lookup.albumCode, v.id);
          }
        }
        await runBatched(selectedStickerList, 10, async (sticker) => {
          const variantId = variantIdMap.get(sticker.albumCode);
          if (!variantId) return;
          await addSticker(usr.id, variantId, 1, tok, albumId);
        });
      }
      await loadCollection(tok, usr.id, albumId);
      setMissingItems([]);
      setDuplicateItems([]);
      addToast(`Added ${variantType} variant to ${selectedStickerList.length} sticker${selectedStickerList.length === 1 ? '' : 's'}`);
    } catch (err) {
      console.error('Mass add variant failed', err);
      addToast('Failed to add variants. Please try again.');
    } finally {
      setMassWorking(false);
    }
  }, [selectedCodes, stickers, ownedMap, albumId, loadCollection, addToast]);

  const handleMassRemoveVariant = useCallback(async (variantType: string) => {
    const tok = tokenRef.current;
    const usr = userRef.current;
    if (!tok || !usr || selectedCodes.size === 0) return;
    setMassWorking(true);
    try {
      const toRemove: string[] = [];
      for (const code of selectedCodes) {
        const entry = ownedMap.get(code)?.get(variantType);
        if (entry) toRemove.push(entry.variantId);
      }
      await runBatched(toRemove, 10, (variantId) =>
        deleteSticker(usr.id, variantId, tok, albumId),
      );
      await loadCollection(tok, usr.id, albumId);
      setMissingItems([]);
      setDuplicateItems([]);
      addToast(`Removed ${variantType} from ${toRemove.length} sticker${toRemove.length === 1 ? '' : 's'}`);
    } catch (err) {
      console.error('Mass remove variant failed', err);
      addToast('Failed to remove variants. Please try again.');
    } finally {
      setMassWorking(false);
    }
  }, [selectedCodes, ownedMap, albumId, loadCollection, addToast]);

  const handleMassToggleFavourite = useCallback(() => {
    const addFav = selectedFavouriteState !== 'all';
    setFavouritesBulk([...selectedCodes], addFav);
  }, [selectedCodes, selectedFavouriteState, setFavouritesBulk]);

  const handleMassTradeFlags = useCallback(async (flags: { tradeHidden?: boolean; tradeForced?: boolean }) => {
    const tok = tokenRef.current;
    const usr = userRef.current;
    if (!tok || !usr || selectedCodes.size === 0) return;
    setMassWorking(true);
    try {
      const toUpdate: string[] = [];
      for (const code of selectedCodes) {
        const variants = ownedMap.get(code);
        if (variants) {
          for (const entry of variants.values()) toUpdate.push(entry.variantId);
        }
      }
      await runBatched(toUpdate, 10, (variantId) =>
        setTradeFlags(usr.id, variantId, flags, tok, albumId),
      );
      await loadCollection(tok, usr.id, albumId);
      setMissingItems([]);
      setDuplicateItems([]);
      addToast(`Updated trade flags for ${toUpdate.length} sticker variant${toUpdate.length === 1 ? '' : 's'}`);
    } catch (err) {
      console.error('Mass trade flags failed', err);
      addToast('Failed to update trade flags. Please try again.');
    } finally {
      setMassWorking(false);
    }
  }, [selectedCodes, ownedMap, albumId, loadCollection, addToast]);

  // ---------------------------------------------------------------------------
  // Mutation handlers
  // ---------------------------------------------------------------------------
  const handleCollectionChange = useCallback(async (options?: { reloadSummaries?: boolean }) => {
    const tok = tokenRef.current;
    const usr = userRef.current;
    if (tok && usr && albumId) {
      const tasks: Promise<unknown>[] = [loadCollection(tok, usr.id, albumId)];
      if (options?.reloadSummaries) tasks.push(loadCrossAlbum(tok, usr.id, albumId));
      await Promise.all(tasks);
    }
    setMissingItems([]);
    setDuplicateItems([]);
  }, [albumId, loadCollection, loadCrossAlbum]);

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
            tradeHidden: current?.tradeHidden ?? false,
            tradeForced: current?.tradeForced ?? false,
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
    async (data: { alias: string | null; notes: string | null; edition: string; format: string; settings: AlbumSettings; isTradeInventoryPublic: boolean }) => {
      const tok = tokenRef.current;
      const usr = userRef.current;
      if (!tok || !usr) throw new Error('Not authenticated');
      const newAlbum = await createUserAlbum(usr.id, data, tok);
      upsertAlbum(newAlbum);
      router.push(`/album/${newAlbum.id}`);
    },
    [upsertAlbum, router]
  );

  const handleSaveAlbum = useCallback(
    async (data: { alias: string | null; notes: string | null; edition: string; format: string; settings: AlbumSettings; isTradeInventoryPublic: boolean }) => {
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
            {albums.length > 1 && (
              <Link
                href="/album"
                className="mt-1 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
                aria-label="Back to albums"
              >
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                </svg>
              </Link>
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-800 leading-tight">
                {activeAlbum ? albumDisplayName(activeAlbum) : 'Album'}
              </h1>
              {activeAlbum && (
                <>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {activeAlbum.alias && (
                      <span className="mr-1.5">
                        {activeAlbum.albumTypeName} ·
                      </span>
                    )}
                    {activeAlbum.editionName} Edition · {activeAlbum.formatName}
                    {activeAlbum.albumTypeKey === 'fifa_world_cup_2026' && (
                      <Link href="/guide/wc-2026" className="ml-2 text-blue-600 hover:text-blue-800 hover:underline">
                        View Guide →
                      </Link>
                    )}
                    {activeAlbum.isDefault && (
                      <span className="ml-2 inline-flex items-center gap-1 text-amber-500">
                        <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        Default
                      </span>
                    )}
                  </p>
                  {activeAlbum.notes && (
                    <p className="text-xs text-gray-400 italic mt-0.5">
                      {activeAlbum.notes}
                    </p>
                  )}
                  {(() => {
                    const s = activeAlbum.settings;
                    const chips = [
                      s.includeCocaCola && 'Coca-Cola',
                      s.includeExtras   && 'Extras',
                    ].filter(Boolean) as string[];
                    return chips.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {chips.map((label) => (
                          <span
                            key={label}
                            className="inline-block text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    ) : null;
                  })()}
                </>
              )}
            </div>
          </div>

          {activeAlbum && (
            <div className="flex items-center gap-2">
              {!activeAlbum.isDefault && (
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
              {albums.length < 10 && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  New Album
                </button>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <StatsBar stats={computedStats} loading={loading} />

        <FilterBar
          filters={filters}
          onChange={setFilters}
          groupOptions={filterOptions.groupOptions}
          teamOptions={filterOptions.teamOptions}
          typeOptions={filterOptions.typeOptions}
          variantOptions={filterOptions.variantOptions}
        />

        <div className="flex items-center gap-1 border-b border-gray-200">
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
              {id === 'all' && !loading && settingsFilteredStickers.length > 0 && (
                <span className="ml-1.5 text-xs text-gray-400">({settingsFilteredStickers.length})</span>
              )}
              {id === 'have' && computedStats && (
                <span className="ml-1.5 text-xs text-gray-400">
                  {totalOwnedQuantity > computedStats.owned
                    ? `(${computedStats.owned} / ${totalOwnedQuantity})`
                    : `(${computedStats.owned})`}
                </span>
              )}
              {id === 'missing' && computedStats && (
                <span className="ml-1.5 text-xs text-gray-400">({computedStats.missing})</span>
              )}
              {id === 'duplicates' && computedStats && (
                <span className="ml-1.5 text-xs text-gray-400">
                  {totalExtraCopies > 0
                    ? `(${computedStats.duplicates} / +${totalExtraCopies})`
                    : `(${computedStats.duplicates})`}
                </span>
              )}
            </button>
          ))}
          <button
            onClick={() => {
              if (selectionMode) {
                handleExitSelection();
              } else {
                setSelectionMode(true);
              }
            }}
            className={`ml-auto px-3 py-2 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              selectionMode
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300'
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="3" width="6" height="6" rx="1" />
              <path d="M13 12l2 2 4-3" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="11" y="3" width="6" height="6" rx="1" />
              <rect x="3" y="11" width="6" height="6" rx="1" />
            </svg>
            {selectionMode ? 'Selecting…' : 'Select'}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
            Loading stickers…
          </div>
        ) : albumId ? (
          <div className={selectionMode ? 'pb-20' : ''}>
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
              crossAlbumHasSticker={crossAlbumHasSticker}
              favouriteSet={favouriteSet}
              onToggleFavourite={handleToggleFavourite}
              selectionMode={selectionMode}
              selectedCodes={selectedCodes}
              onToggleSelect={handleToggleSelect}
              onRangeSelect={handleRangeSelect}
            />
          </div>
        ) : null}
      </div>

      {showAddModal && (
        <AlbumFormModal
          mode="create"
          editions={editions}
          formats={formats}
          allStickers={stickers}
          onConfirm={handleAddAlbum}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {editingAlbum && (
        <AlbumFormModal
          mode="edit"
          album={editingAlbum}
          editions={editions}
          formats={formats}
          allStickers={stickers}
          onConfirm={handleSaveAlbum}
          onDelete={handleDeleteAlbum}
          onClose={() => setEditingAlbum(null)}
        />
      )}

      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'instant' })}
          className={`fixed ${selectionMode ? 'bottom-20' : 'bottom-6'} right-6 z-50 p-3 rounded-full bg-white border border-gray-200 shadow-md text-gray-500 hover:text-gray-800 hover:shadow-lg transition-all`}
          aria-label="Scroll to top"
        >
          <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
        </button>
      )}

      {selectionMode && (
        <MassActionBar
          selectedCount={selectedCodes.size}
          totalDisplayed={displayedStickers.length}
          allDisplayedSelected={
            displayedStickers.length > 0 &&
            displayedStickers.every((s) => selectedCodes.has(s.albumCode))
          }
          hasAnyOwned={selectedHasAnyOwned}
          favouriteState={selectedFavouriteState}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
          onDelete={handleMassDelete}
          onToggleFavourite={handleMassToggleFavourite}
          onAddVariant={() => setVariantPicker('add')}
          onRemoveVariant={() => setVariantPicker('remove')}
          onTradeHide={() => handleMassTradeFlags({ tradeHidden: true, tradeForced: false })}
          onTradeShow={() => handleMassTradeFlags({ tradeForced: true, tradeHidden: false })}
          onTradeReset={() => handleMassTradeFlags({ tradeHidden: false, tradeForced: false })}
          onExit={handleExitSelection}
          isWorking={massWorking}
        />
      )}

      {variantPicker && (
        <VariantPickerModal
          mode={variantPicker}
          availableTypes={variantPicker === 'remove' ? removableVariantTypes : ALL_VARIANT_TYPES}
          onConfirm={(variantType) => {
            setVariantPicker(null);
            if (variantPicker === 'add') handleMassAddVariant(variantType);
            else handleMassRemoveVariant(variantType);
          }}
          onClose={() => setVariantPicker(null)}
        />
      )}
    </div>
  );
}
