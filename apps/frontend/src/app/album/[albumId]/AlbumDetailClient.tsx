'use client';

import { useEffect, useRef, useState, useCallback, useMemo, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAlbumUrlState, type Tab } from './useAlbumUrlState';
import { useFavourites } from './useFavourites';
import { useWantedVariants } from './useWantedVariants';
import { useFilterOptions } from './useFilterOptions';
import { useStickerSelection } from './useStickerSelection';
import {
  fetchAllStickers,
  fetchAlbumView,
  fetchUserAlbums,
  fetchAlbumEditions,
  fetchAlbumFormats,
  fetchStickersBulk,
  bulkStickers,
  createUserAlbum,
  moveSticker,
  updateUserAlbum,
  deleteUserAlbum,
  setDefaultUserAlbum,
  albumDisplayName,
  DEFAULT_ALBUM_TYPE_KEY,
  type AlbumEditionOption,
  type AlbumFormatOption,
  type AlbumSettings,
  type Sticker,
  type CollectionStats,
  type UserAlbum,
  type CrossAlbum,
  type BulkOp,
} from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import { useAuthStore } from '@/store/auth';
import { useAlbumsStore } from '@/store/albums';
import FilterBar from '@/app/collection/components/FilterBar';
import { ALL_VARIANT_TYPES } from '@/app/collection/components/variantMeta';
import AlbumStats from '@/app/collection/components/AlbumStats';
import StatsBar from '@/app/collection/components/StatsBar';
import StickerGrid, { type OwnedVariantMap } from '@/app/collection/components/StickerGrid';
import PullToRefresh from '@/components/PullToRefresh';
import CompletionCelebration from '@/components/CompletionCelebration';
import AlbumDropDock, { type DragPayload } from '@/app/collection/components/AlbumDropDock';
import { useHotkeys } from '@/lib/hotkeys';
import { useClickOutside } from '@/lib/useClickOutside';
import { foldAccents } from '@/lib/normalize';
import { publishSync, subscribeSync } from '@/lib/syncBus';
import AlbumFormModal from '@/app/collection/components/AlbumFormModal';
import MassActionBar from '@/app/collection/components/MassActionBar';
import VariantPickerModal from '@/app/collection/components/VariantPickerModal';
import type { OwnedVariantEntry } from '@/app/collection/components/VariantPopover';
import Scanner from '@/app/scan/Scanner';
import ShareProfileButton from '@/components/ShareProfileButton';
import ProgressShareCard from '@/components/ProgressShareCard';
import { buildAlbumExportText } from '@/lib/profileExport';

type OwnedMap = Map<string, OwnedVariantMap>;

interface LoadedView {
  ownedMap: OwnedMap;
  stats: CollectionStats;
  totalExtraCopies: number;
  crossAlbum: CrossAlbum;
}

async function loadAlbumView(
  userId: string,
  albumId: string,
  token: string,
): Promise<LoadedView> {
  // One round-trip — server returns every (sticker, variant) the user owns
  // in this album, plus stats, plus cross-album indicators. Keyed by stickerId
  // (UUID) so regional alternates that share an album_code (CC stickers) stay
  // distinct.
  const view = await fetchAlbumView(userId, albumId, token);
  const map: OwnedMap = new Map();
  for (const row of view.ownedVariants) {
    let perSticker = map.get(row.stickerId);
    if (!perSticker) {
      perSticker = new Map<string, OwnedVariantEntry>();
      map.set(row.stickerId, perSticker);
    }
    perSticker.set(row.variantType, {
      variantId: row.stickerVariantId,
      quantity: row.quantity,
      tradeHidden: row.tradeHidden,
      tradeForced: row.tradeForced,
      updatedAt: row.updatedAt,
    });
  }
  return {
    ownedMap: map,
    stats: view.stats,
    totalExtraCopies: view.totalExtraCopies,
    crossAlbum: view.crossAlbum,
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

// Coca-Cola slots (CC1–CC13) arrive ordered by sticker `number`, which doesn't
// match the album-code order collectors expect — and regional alternates share
// one code with different players. Reorder just the (already-contiguous) CC run
// by album code, then by player name, leaving every other section untouched so
// StickerGrid's contiguous-run sectioning still holds.
function orderCocaColaStickers(list: Sticker[]): Sticker[] {
  const ccIndices: number[] = [];
  list.forEach((s, i) => { if (s.stickerType === 'coca_cola_special') ccIndices.push(i); });
  if (ccIndices.length < 2) return list;

  const codeNum = (code: string): number => {
    const m = code.match(/(\d+)$/);
    return m ? parseInt(m[1], 10) : 0;
  };
  const sorted = ccIndices
    .map((i) => list[i]!)
    .sort((a, b) => codeNum(a.albumCode) - codeNum(b.albumCode)
      || (a.playerName ?? '').localeCompare(b.playerName ?? ''));

  const out = list.slice();
  ccIndices.forEach((idx, k) => { out[idx] = sorted[k]!; });
  return out;
}

export default function AlbumDetailClient({ albumId }: { albumId: string }) {

  const t = useTranslations('albumDetail');
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
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
  const { tab, filters, setTab, setFilters, setView } = useAlbumUrlState();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Grid density (2/3/4/5/6 columns) — persisted per browser. 5 and 6 are
  // wide-screen densities that clamp to 4 below lg so phones aren't affected.
  type Density = 2 | 3 | 4 | 5 | 6;
  const [density, setDensityState] = useState<Density>(() => {
    // Kept SSR-deterministic (stored value or a fixed 4) so server and first
    // client render agree. The phone-friendly 3-up default is applied
    // post-mount below to avoid a hydration mismatch.
    if (typeof window === 'undefined') return 4;
    try {
      const raw = window.localStorage.getItem('cromo:gridDensity');
      if (raw) {
        const n = parseInt(raw, 10);
        if (n >= 2 && n <= 6) return n as Density;
      }
    } catch { /* ignore */ }
    return 4;
  });
  const setDensity = useCallback((next: Density) => {
    setDensityState(next);
    try { window.localStorage.setItem('cromo:gridDensity', String(next)); } catch { /* ignore */ }
  }, []);
  // Narrow (phone) viewport flag — caps the density cycler at 4 columns, since
  // the grid clamps to 4 below the `sm` breakpoint anyway; cycling to 5/6 on a
  // phone would just render an identical 4-up grid.
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 639px)');
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // First-visit default: a denser 3-up grid on phones. Done post-mount (not in
  // the useState initialiser) so it can't desync SSR/hydration, and only when
  // the user has no saved density preference. Not persisted — it stays a
  // per-device contextual default until the user picks explicitly.
  useEffect(() => {
    try {
      if (window.localStorage.getItem('cromo:gridDensity')) return;
    } catch { return; }
    if (window.matchMedia('(max-width: 639px)').matches) setDensityState(3);
  }, []);

  // Album-page hotkey: `/` jumps cursor to the FilterBar search input. The
  // input's id is the canonical handle; both FilterBar (which renders it) and
  // this hotkey reference the same string so they don't drift.
  useHotkeys('/', () => {
    const input = document.getElementById('filter-search') as HTMLInputElement | null;
    if (input) {
      input.focus();
      input.select();
    }
  });
  const [editions, setEditions] = useState<AlbumEditionOption[]>([]);
  const [formats, setFormats] = useState<AlbumFormatOption[]>([]);
  const [editingAlbum, setEditingAlbum] = useState<UserAlbum | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const [massWorking, setMassWorking] = useState(false);
  const [variantPicker, setVariantPicker] = useState<'add' | 'remove' | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);
  // Overflow menu for the mobile album header. Secondary actions (set default,
  // share progress) collapse behind a "⋯" tap target on small screens so the
  // primary Scan + Share buttons aren't pushed off-row.
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);
  const closeOverflow = useCallback(() => setOverflowOpen(false), []);
  useClickOutside(overflowRef, closeOverflow, overflowOpen);

  const tokenRef = useRef(token);
  const userRef = useRef(user);
  tokenRef.current = token;
  userRef.current = user;

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Jump back to the top of the results whenever the search query changes.
  // Filtering while scrolled deep into the grid otherwise leaves the user
  // stranded in the middle of a now-shorter (or empty) result set.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [filters.search]);

  // Favourites are persisted server-side (replaces localStorage) and keyed by
  // sticker UUID end-to-end, so the hook gets sticker IDs directly.
  const {
    favouriteSet,
    toggle: handleToggleFavourite,
    setBulk: setFavouritesBulk,
  } = useFavourites({
    userId: user?.id ?? null,
    albumId,
    token,
  });

  const {
    wantedVariantIds,
    wantedStickerIds,
    toggle: handleToggleWanted,
  } = useWantedVariants({ userId: user?.id ?? null, albumId, token });

  // ---------------------------------------------------------------------------
  // Data loaders
  // ---------------------------------------------------------------------------
  const loadView = useCallback(async (tok: string, userId: string, aid: string) => {
    const { ownedMap: map, stats, totalExtraCopies, crossAlbum: ca } = await loadAlbumView(userId, aid, tok);
    setOwnedMap(map);
    setServerStats(stats);
    setServerExtraCopies(totalExtraCopies);
    setCrossAlbum(ca);
  }, []);

  // ---------------------------------------------------------------------------
  // Initial load
  // ---------------------------------------------------------------------------
  // Deliberately omits `token`/`user` from deps: silent 401 refresh in
  // apiClient.ts swaps the access token in the auth store mid-session, and
  // re-running this effect would flip `loading` true, unmount StickerGrid,
  // and collapse the page height — manifesting as a popover dismissal and
  // a scroll-to-top while the user is editing a tile. tokenRef/userRef carry
  // the current values; the render guard at the bottom of the file handles
  // the logged-out case.
  useEffect(() => {
    if (!hydrated) return;
    if (!tokenRef.current || !userRef.current) {
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
        const [allStickers, userAlbums, editionList, formatList] = await Promise.all([
          fetchAllStickers(tok),
          fetchUserAlbums(usr.id, tok),
          fetchAlbumEditions(DEFAULT_ALBUM_TYPE_KEY),
          fetchAlbumFormats(DEFAULT_ALBUM_TYPE_KEY),
        ]);

        if (cancelled) return;
        setStickers(orderCocaColaStickers(allStickers));
        setAlbums(userAlbums);
        setEditions(editionList);
        setFormats(formatList);

        const album = userAlbums.find((a) => a.id === albumId);
        if (!album) {
          router.replace('/collection');
          return;
        }

        await loadView(tok, usr.id, albumId);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t('failedToLoad'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, albumId, router]);

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

  // Per-album setting (moved off user_settings): whether owning different
  // variants of one sticker counts as having a duplicate.
  const duplicatesCountAllVariants = activeAlbum?.settings?.duplicatesCountAllVariants ?? true;

  // Redirect away from ?tab=stats when the active album type doesn't expose
  // stats, so a stale share-link doesn't render the WC-2026-specific panel
  // against an album that doesn't have group/country data.
  useEffect(() => {
    if (tab !== 'stats') return;
    if (!activeAlbum) return;
    if (activeAlbum.albumTypeKey === DEFAULT_ALBUM_TYPE_KEY) return;
    setTab('all', 'replace');
  }, [tab, activeAlbum, setTab]);

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
    if (tab === 'have') return settingsFilteredStickers.filter((s) => ownedMap.has(s.id));
    if (tab === 'missing') return settingsFilteredStickers.filter((s) => !ownedMap.has(s.id));
    return settingsFilteredStickers.filter((s) => {
      const p = ownedMap.get(s.id);
      return p ? isDuplicateSticker(p, duplicatesCountAllVariants) : false;
    });
  }, [settingsFilteredStickers, tab, ownedMap, duplicatesCountAllVariants]);

  const filterOptions = useFilterOptions({
    tabBase,
    filters,
    ownedMap: ownedMap as unknown as Map<string, Map<string, unknown>>,
    favouriteSet,
    wantedStickerIds,
  });

  // Stats come from user_albums (denormalized columns kept fresh by the
  // _sync_user_album_counts trigger, which now honours the owner's
  // duplicatesCountAllVariants preference). The server is the single source
  // of truth — do not re-derive duplicate counts on the client.
  const computedStats = useMemo<CollectionStats | null>(() => {
    if (loading) return null;
    return serverStats;
  }, [loading, serverStats]);

  const totalOwnedQuantity = useMemo(() => {
    let sum = 0;
    for (const s of settingsFilteredStickers) {
      const perSticker = ownedMap.get(s.id);
      if (perSticker) {
        for (const entry of perSticker.values()) sum += entry.quantity;
      }
    }
    return sum;
  }, [settingsFilteredStickers, ownedMap]);

  const totalExtraCopies = serverExtraCopies;

  // Tab-narrowed set before the user's filter chips apply. Used as the
  // denominator of the "Showing X of Y" hint when filters are active.
  const tabStickers = useMemo<Sticker[]>(() => {
    if (tab === 'all') return settingsFilteredStickers;
    if (tab === 'have') return settingsFilteredStickers.filter((s) => ownedMap.has(s.id));
    if (tab === 'missing') return settingsFilteredStickers.filter((s) => !ownedMap.has(s.id));
    return settingsFilteredStickers.filter((s) => {
      const p = ownedMap.get(s.id);
      return p ? isDuplicateSticker(p, duplicatesCountAllVariants) : false;
    });
  }, [settingsFilteredStickers, tab, ownedMap, duplicatesCountAllVariants]);

  const displayedStickers = useMemo<Sticker[]>(() => {
    const recentThresholdMs =
      filters.recentMinutes && filters.recentMinutes > 0
        ? Date.now() - filters.recentMinutes * 60_000
        : null;
    return tabStickers.filter((s) => {
      if (filters.favouritesOnly && !favouriteSet.has(s.id)) return false;
      if (filters.wantedOnly && !wantedStickerIds.has(s.id)) return false;
      if (filters.group?.length && !filters.group.includes(s.groupName ?? '')) return false;
      if (filters.team?.length && !filters.team.includes(s.teamName ?? '') && !filters.team.includes(s.fifaCode ?? '')) return false;
      if (filters.type?.length && !filters.type.includes(s.stickerType)) return false;
      if (filters.variant?.length) {
        const p = ownedMap.get(s.id);
        if (!p || !filters.variant.some((v) => p.has(v))) return false;
      }
      if (recentThresholdMs !== null) {
        const p = ownedMap.get(s.id);
        if (!p) return false;
        let recent = false;
        for (const e of p.values()) {
          if (Date.parse(e.updatedAt) >= recentThresholdMs) {
            recent = true;
            break;
          }
        }
        if (!recent) return false;
      }
      if (filters.search) {
        const q = foldAccents(filters.search);
        if (!foldAccents(s.playerName ?? '').includes(q) && !foldAccents(s.albumCode).includes(q) && !foldAccents(s.teamName ?? '').includes(q)) return false;
      }
      return true;
    });
  }, [tabStickers, filters, ownedMap, favouriteSet, wantedStickerIds]);

  const hasActiveFilter =
    !!filters.search ||
    !!filters.group?.length ||
    !!filters.team?.length ||
    !!filters.type?.length ||
    !!filters.variant?.length ||
    !!filters.favouritesOnly ||
    !!filters.wantedOnly ||
    !!(filters.recentMinutes && filters.recentMinutes > 0);

  // Copy-as-text emits Offers (duplicates) + Needs (wanted) for this album.
  // If neither set has anything, there's nothing meaningful to copy.
  const hasTradeInventory = useMemo(() => {
    for (const p of ownedMap.values()) {
      if (isDuplicateSticker(p, duplicatesCountAllVariants)) return true;
    }
    return wantedStickerIds.size > 0;
  }, [ownedMap, duplicatesCountAllVariants, wantedStickerIds]);

  // ---------------------------------------------------------------------------
  // Selection helpers
  // ---------------------------------------------------------------------------
  const {
    selectionMode,
    setSelectionMode,
    selectedStickerIds,
    setSelectedStickerIds,
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
  // Shared shape for every mass action: build the op list, POST in one shot,
  // reload the view, toast.
  const runMassAction = useCallback(async (
    buildOps: () => { ops: BulkOp[]; emptyMessage?: string; successMessage: (n: number) => string; failMessage: string },
  ) => {
    const tok = tokenRef.current;
    const usr = userRef.current;
    if (!tok || !usr || selectedStickerIds.size === 0) return;
    setMassWorking(true);
    try {
      const { ops, emptyMessage, successMessage } = buildOps();
      if (ops.length === 0) {
        if (emptyMessage) addToast(emptyMessage, { type: 'info' });
        return;
      }
      await bulkStickers(usr.id, albumId, ops, tok);
      await loadView(tok, usr.id, albumId);
      addToast(successMessage(ops.length), { type: 'success' });
      // A completed mass action clears the selection and drops out of select
      // mode — the user's intent for that batch is done. Only on success:
      // a failure keeps the selection so they can retry.
      handleExitSelection();
    } catch (err) {
      console.error('Mass action failed', err);
      addToast(buildOps().failMessage, { type: 'error' });
    } finally {
      setMassWorking(false);
    }
  // buildOps closes over selectedStickerIds/ownedMap/etc. via the caller's closure.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStickerIds, albumId, loadView, addToast, handleExitSelection]);

  const handleMassDelete = useCallback(async () => {
    await runMassAction(() => {
      const ops: BulkOp[] = [];
      for (const id of selectedStickerIds) {
        const variants = ownedMap.get(id);
        if (variants) {
          for (const entry of variants.values()) {
            ops.push({ op: 'remove', variantId: entry.variantId });
          }
        }
      }
      return {
        ops,
        successMessage: (n) => t('removedToast', { count: n }),
        failMessage: t('removeFailedToast'),
      };
    });
    // Selection reset + exit is handled by runMassAction on success.
  }, [selectedStickerIds, ownedMap, runMassAction]);

  const handleMassAddVariant = useCallback(async (variantType: string) => {
    const tok = tokenRef.current;
    const usr = userRef.current;
    if (!tok || !usr || selectedStickerIds.size === 0) return;
    setMassWorking(true);
    try {
      // Include every selected sticker, even ones that already own this
      // variant — the bulk `add` op increments quantity, so re-adding a
      // variant the user already has bumps it to a duplicate (the whole point
      // of "Add variant" while multi-selecting a stack of the same pull).
      const selectedStickerList = stickers.filter((s) => selectedStickerIds.has(s.id));
      if (selectedStickerList.length === 0) {
        addToast(t('allOwnThatVariantToast'), { type: 'info' });
        return;
      }
      // fetchStickersBulk is keyed by album_code on the server. For regional
      // alternates that share a code (CC stickers), pick the variant by sticker
      // id so each card maps to its own underlying variant row.
      const codes = Array.from(new Set(selectedStickerList.map((s) => s.albumCode)));
      const variantIdByStickerId = new Map<string, string>();
      for (let i = 0; i < codes.length; i += 100) {
        const results = await fetchStickersBulk(codes.slice(i, i + 100), tok);
        for (const lookup of results) {
          const v = lookup.variants.find((x) => x.variantType === variantType);
          if (v) variantIdByStickerId.set(lookup.id, v.id);
        }
      }
      const ops: BulkOp[] = [];
      for (const sticker of selectedStickerList) {
        const variantId = variantIdByStickerId.get(sticker.id);
        if (variantId) ops.push({ op: 'add', variantId, quantity: 1 });
      }
      if (ops.length === 0) return;
      await bulkStickers(usr.id, albumId, ops, tok);
      await loadView(tok, usr.id, albumId);
      addToast(t('addedVariantToast', { variant: variantType, count: ops.length }), { type: 'success' });
      handleExitSelection();
    } catch (err) {
      console.error('Mass add variant failed', err);
      addToast(t('addVariantFailedToast'), { type: 'error' });
    } finally {
      setMassWorking(false);
    }
  }, [selectedStickerIds, stickers, ownedMap, albumId, loadView, addToast, handleExitSelection]);

  const handleMassRemoveVariant = useCallback(async (variantType: string) => {
    await runMassAction(() => {
      const ops: BulkOp[] = [];
      for (const id of selectedStickerIds) {
        const entry = ownedMap.get(id)?.get(variantType);
        if (entry) ops.push({ op: 'remove', variantId: entry.variantId });
      }
      return {
        ops,
        successMessage: (n) => t('removedVariantToast', { variant: variantType, count: n }),
        failMessage: t('removeVariantFailedToast'),
      };
    });
  }, [selectedStickerIds, ownedMap, runMassAction]);

  const handleMassToggleFavourite = useCallback(() => {
    const addFav = selectedFavouriteState !== 'all';
    setFavouritesBulk([...selectedStickerIds], addFav);
    handleExitSelection();
  }, [selectedStickerIds, selectedFavouriteState, setFavouritesBulk, handleExitSelection]);

  const handleMassTradeFlags = useCallback(async (flags: { tradeHidden?: boolean; tradeForced?: boolean }) => {
    await runMassAction(() => {
      const ops: BulkOp[] = [];
      for (const id of selectedStickerIds) {
        const variants = ownedMap.get(id);
        if (variants) {
          for (const entry of variants.values()) {
            ops.push({ op: 'flags', variantId: entry.variantId, ...flags });
          }
        }
      }
      return {
        ops,
        successMessage: (n) => t('updatedFlagsToast', { count: n }),
        failMessage: t('updateFlagsFailedToast'),
      };
    });
  }, [selectedStickerIds, ownedMap, runMassAction]);

  // ---------------------------------------------------------------------------
  // Mutation handlers
  // ---------------------------------------------------------------------------
  const handleCollectionChange = useCallback(async () => {
    const tok = tokenRef.current;
    const usr = userRef.current;
    if (tok && usr && albumId) {
      // loadView refreshes ownedMap + stats + crossAlbum in one round trip,
      // so the previous `reloadSummaries` knob is no longer meaningful.
      await loadView(tok, usr.id, albumId);
      // Tell other tabs the user has open that this album's state moved so
      // they reload instead of showing stale ownership data.
      publishSync({ type: 'collection:changed', userId: usr.id, albumId });
    }
  }, [albumId, loadView]);

  // Listen for mutations from other tabs and refresh when one lands in scope.
  // We only react when the message is for *this user* and *this album* (or a
  // broadcast with null albumId, which means "every album view should refetch").
  useEffect(() => {
    if (!user || !token || !albumId) return;
    return subscribeSync((event) => {
      if (event.type !== 'collection:changed') return;
      if (event.userId !== user.id) return;
      if (event.albumId && event.albumId !== albumId) return;
      void loadView(token, user.id, albumId);
    });
  }, [user, token, albumId, loadView]);

  const handleOptimisticAdjust = useCallback(
    (stickerId: string, variantType: string, variantId: string, delta: number) => {
      setOwnedMap((prev) => {
        const next = new Map(prev);
        const perSticker = new Map(next.get(stickerId) ?? []);
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
            updatedAt: new Date().toISOString(),
          });
        }
        if (perSticker.size === 0) next.delete(stickerId);
        else next.set(stickerId, perSticker);
        return next;
      });
    },
    [],
  );

  const handleAddAlbum = useCallback(
    async (data: { alias: string | null; notes: string | null; edition: string; format: string; settings: AlbumSettings; tradeInventoryVisibility: 'private' | 'unlisted' | 'public' }) => {
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
    async (data: { alias: string | null; notes: string | null; edition: string; format: string; settings: AlbumSettings; tradeInventoryVisibility: 'private' | 'unlisted' | 'public' }) => {
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
    router.replace('/collection');
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
  const supportsDetailedStats = activeAlbum?.albumTypeKey === DEFAULT_ALBUM_TYPE_KEY;

  // One declaration, rendered into two surfaces by SecondaryHeaderActions:
  // inline buttons on md+, menu items inside the mobile "⋯" overflow.
  // `runAndClose` ensures the overflow always closes after an action fires,
  // regardless of which surface the user tapped.
  const runAndClose = useCallback(
    (fn: () => void) => () => { closeOverflow(); fn(); },
    [closeOverflow],
  );
  const secondaryActions: HeaderAction[] = useMemo(() => {
    if (!activeAlbum) return [];
    const xs: HeaderAction[] = [];
    if (!activeAlbum.isDefault) {
      xs.push({
        key: 'set-default',
        label: t('setDefault'),
        title: t('setAsDefault'),
        icon: <StarIcon />,
        onClick: runAndClose(handleSetDefault),
        variant: 'warning',
      });
    }
    if (computedStats) {
      xs.push({
        key: 'share-progress',
        label: t('shareProgress'),
        title: t('shareProgressTitle'),
        icon: <ShareIcon />,
        onClick: runAndClose(() => setShowShareCard(true)),
        variant: 'accent',
      });
    }
    return xs;
  }, [activeAlbum, computedStats, handleSetDefault, runAndClose, t]);

  const TABS: { id: Tab; label: string }[] = [
    { id: 'all', label: t('tabAll') },
    { id: 'have', label: t('tabHave') },
    { id: 'missing', label: t('tabMissing') },
    { id: 'duplicates', label: t('tabDuplicates') },
  ];

  if (!hydrated || (!token && hydrated)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-[var(--cromo-fg-subtle)] text-sm">
        {t('loading')}
      </div>
    );
  }

  return (
    <PullToRefresh
      onRefresh={async () => {
        if (token && user && albumId) {
          await loadView(token, user.id, albumId);
        }
      }}
      disabled={showAddModal || editingAlbum !== null || showScanner}
    >
    <div className="min-h-screen bg-[var(--cromo-surface-2)]">
      <div className="max-w-5xl xl:max-w-7xl mx-auto px-4 py-4 sm:py-8 flex flex-col gap-3">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            {albums.length > 1 && (
              <Link
                href="/collection"
                className="mt-1 p-1.5 rounded-lg text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)] transition-colors shrink-0"
                aria-label={t('backToAlbums')}
              >
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                </svg>
              </Link>
            )}
            <div>
              <h1 className="text-2xl font-bold text-[var(--cromo-fg)] leading-tight">
                {activeAlbum ? albumDisplayName(activeAlbum) : t('albumFallback')}
              </h1>
              {activeAlbum && (
                <>
                  <p className="text-sm text-[var(--cromo-fg-muted)] mt-0.5">
                    {activeAlbum.alias && (
                      <span className="mr-1.5">
                        {activeAlbum.albumTypeName} ·
                      </span>
                    )}
                    {t('editionLine', { edition: activeAlbum.editionName, format: activeAlbum.formatName })}
                    {activeAlbum.albumTypeGuidePath && (
                      <Link href={activeAlbum.albumTypeGuidePath} className="ml-2 whitespace-nowrap text-[var(--cromo-accent)] hover:text-[var(--cromo-accent)] hover:underline">
                        {t('viewGuide')}
                      </Link>
                    )}
                    {activeAlbum.isDefault && (
                      <span className="ml-2 inline-flex items-center gap-1 whitespace-nowrap text-[var(--cromo-warning-text)]">
                        <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        {t('defaultBadge')}
                      </span>
                    )}
                  </p>
                  {activeAlbum.notes && (
                    <p className="text-xs text-[var(--cromo-fg-subtle)] italic mt-0.5">
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
                            className="inline-block text-xs px-2 py-0.5 rounded-full bg-[var(--cromo-accent-soft)] text-[var(--cromo-accent)] border border-blue-100"
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
              <button
                onClick={() => setShowScanner(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[var(--cromo-accent-fg)] bg-[var(--cromo-accent)] hover:bg-[var(--cromo-accent-strong)] rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v6a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                </svg>
                {t('scan')}
              </button>
              {user && (
                <ShareProfileButton
                  username={user.username}
                  albumSlug={activeAlbum.slug}
                  albumLabel={albumDisplayName(activeAlbum)}
                  getListText={
                    hasTradeInventory
                      ? () =>
                          buildAlbumExportText(
                            user.username,
                            activeAlbum.id,
                            albumDisplayName(activeAlbum),
                            `${window.location.origin}/profile/${user.username}/${activeAlbum.slug}`,
                          )
                      : undefined
                  }
                  listDisabledReason={
                    hasTradeInventory
                      ? undefined
                      : t('noTradeInventory')
                  }
                />
              )}

              {/* Secondary actions — inline on desktop, behind a "⋯" tap on mobile.
                  One declaration → two surfaces. Mobile albums never need more
                  than two visible action buttons (Scan, Share). */}
              <SecondaryHeaderActions
                actions={secondaryActions}
                overflowRef={overflowRef}
                overflowOpen={overflowOpen}
                onToggleOverflow={() => setOverflowOpen((v) => !v)}
                onCloseOverflow={closeOverflow}
                moreActionsLabel={t('moreActions')}
              />
            </div>
          )}
        </div>

        {activeAlbum && (
          <div className="flex items-center justify-end gap-1.5 -mt-2">
            <button
              onClick={() => setEditingAlbum(activeAlbum)}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded-md text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)] transition-colors"
            >
              <span className="w-3.5 h-3.5"><PencilIcon /></span>
              {t('edit')}
            </button>
            {albums.length < 10 && (
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded-md text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-accent)] hover:bg-[var(--cromo-accent-soft)] transition-colors"
              >
                <span className="w-3.5 h-3.5"><PlusIcon /></span>
                {t('newAlbum')}
              </button>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-[var(--cromo-danger-soft)] border border-[var(--cromo-danger)]/30 p-3 text-sm text-[var(--cromo-danger-text)]">
            {error}
          </div>
        )}

        {/* Pin progress + filter bar + tabs to the top while scrolling the
            (often very long) sticker grid. Collectors flip filters and tab
            into Have/Missing constantly mid-scan; having to scroll-to-top
            to do either is friction. The global NavBar is non-sticky (it
            scrolls away with the page), so pinning this block at top-0 lets it
            reach the very top of the viewport as the nav scrolls off — no dead
            56px gap where the nav used to be. Negative side margins + matching
            padding cancel the parent gutter so the background spans full
            width. Progress bar is compact (single row, thin bar) to keep
            the sticky region small on mobile. */}
        <div className="sticky top-0 z-20 -mx-4 px-4 pt-1.5 pb-1.5 bg-[var(--cromo-bg)]/85 backdrop-blur supports-[backdrop-filter]:bg-[var(--cromo-bg)]/70 flex flex-col gap-1.5">
          <StatsBar
            stats={computedStats}
            loading={loading}
            onViewDetailedStats={
              supportsDetailedStats
                ? () => setTab(tab === 'stats' ? 'all' : 'stats')
                : undefined
            }
            isViewingDetailedStats={tab === 'stats'}
          />

          {tab !== 'stats' && (
            <FilterBar
              filters={filters}
              onChange={setFilters}
              groupOptions={filterOptions.groupOptions}
              teamOptions={filterOptions.teamOptions}
              typeOptions={filterOptions.typeOptions}
              variantOptions={filterOptions.variantOptions}
            />
          )}

          {tab !== 'stats' && (
        <div className="flex items-stretch gap-1 border-b border-[var(--cromo-border)] -mx-4 px-4">
          {/* Tabs scroll horizontally in their own track; the Select + density
              controls are pinned to the right so Select is ALWAYS reachable —
              it previously scrolled off the end of the strip on narrow phones,
              which is the "the button is hidden away" complaint. The -mx-4/px-4
              full-bleeds the bottom divider to the screen edges to match the
              sticky region's background. */}
          <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`shrink-0 whitespace-nowrap px-3 sm:px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  tab === id
                    ? 'border-[var(--cromo-accent)] text-[var(--cromo-accent)]'
                    : 'border-transparent text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)] hover:border-[var(--cromo-border-strong)]'
                }`}
              >
                {label}
                {id === 'all' && !loading && settingsFilteredStickers.length > 0 && (
                  <span className="ml-1.5 text-xs text-[var(--cromo-fg-subtle)]">({settingsFilteredStickers.length})</span>
                )}
                {id === 'have' && computedStats && (
                  <span className="ml-1.5 text-xs text-[var(--cromo-success-text)]">
                    {totalOwnedQuantity > computedStats.owned
                      ? `(${computedStats.owned} / ${totalOwnedQuantity})`
                      : `(${computedStats.owned})`}
                  </span>
                )}
                {id === 'missing' && computedStats && (
                  <span className="ml-1.5 text-xs text-[var(--cromo-danger-text)]">({computedStats.missing})</span>
                )}
                {id === 'duplicates' && computedStats && (
                  <span className="ml-1.5 text-xs text-[var(--cromo-warning-text)]">
                    {totalExtraCopies > 0
                      ? `(${computedStats.duplicates} / +${totalExtraCopies})`
                      : `(${computedStats.duplicates})`}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Pinned right cluster — density + a prominent, always-labelled
              Select toggle. Density is now available on mobile too (the cycler
              caps at 4 on narrow viewports since the grid clamps there). */}
          <div className="shrink-0 flex items-center gap-1 pl-1">
            <button
              onClick={() => {
                const max: Density = isNarrow ? 4 : 6;
                const next = (density >= max ? 2 : ((density + 1) as Density));
                setDensity(next);
              }}
              aria-label={t('densityAria', { count: density })}
              title={t('densityTitle', { count: density })}
              className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 my-1 text-xs font-medium text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)] transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
                {Array.from({ length: density }).map((_, i) => (
                  <rect
                    key={i}
                    x={1 + i * (14 / density)}
                    y={2}
                    width={14 / density - 1}
                    height={12}
                    rx={1}
                    fill="currentColor"
                    fillOpacity={0.25}
                  />
                ))}
              </svg>
              <span>{density}×</span>
            </button>
            <button
              onClick={() => {
                if (selectionMode) {
                  handleExitSelection();
                } else {
                  setSelectionMode(true);
                }
              }}
              aria-label={selectionMode ? t('selecting') : t('select')}
              aria-pressed={selectionMode}
              className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded-full border px-3 py-1 my-1 text-xs font-semibold transition-colors ${
                selectionMode
                  ? 'border-[var(--cromo-accent)] bg-[var(--cromo-accent-soft)] text-[var(--cromo-accent)]'
                  : 'border-[var(--cromo-border-strong)] text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)] hover:border-[var(--cromo-accent)]'
              }`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="3" width="6" height="6" rx="1" />
                <path d="M13 12l2 2 4-3" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="11" y="3" width="6" height="6" rx="1" />
                <rect x="3" y="11" width="6" height="6" rx="1" />
              </svg>
              <span>{selectionMode ? t('selecting') : t('select')}</span>
            </button>
          </div>
        </div>
          )}
        </div>

        {!loading && hasActiveFilter && tab !== 'stats' && (
          <p className="text-xs text-[var(--cromo-fg-muted)]">
            {t('showingOf', { shown: displayedStickers.length, total: tabStickers.length })}
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-64 text-[var(--cromo-fg-subtle)] text-sm">
            {t('loadingStickers')}
          </div>
        ) : tab === 'stats' ? (
          <AlbumStats stickers={settingsFilteredStickers} ownedMap={ownedMap} favouriteSet={favouriteSet} duplicatesCountAllVariants={duplicatesCountAllVariants} onJumpTo={setView} />
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
              wantedVariantIds={wantedVariantIds}
              onToggleWanted={handleToggleWanted}
              selectionMode={selectionMode}
              selectedStickerIds={selectedStickerIds}
              onToggleSelect={handleToggleSelect}
              onRangeSelect={handleRangeSelect}
              defaultBaseVariant={activeAlbum?.settings.defaultBaseVariant ?? 'base_borderless'}
              onRequestSelectionMode={(stickerId) => {
                // Long-press an owned card → flip into multi-select with this
                // sticker pre-selected. Saves the user from tapping the small
                // "Select" toggle hidden in the tab strip.
                setSelectionMode(true);
                setSelectedStickerIds(new Set([stickerId]));
              }}
              density={density}
              hotkeysEnabled={!showAddModal && !editingAlbum && !showScanner && !variantPicker}
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
          // In selection mode the MassActionBar (h-~14) sits above the tab bar,
          // so park above both. Otherwise float above just the tab bar.
          style={{
            bottom: selectionMode
              ? 'calc(var(--cromo-tabbar-h) + 4rem)'
              : 'calc(var(--cromo-tabbar-h) + 1rem)',
          }}
          className="fixed right-4 z-50 p-3 rounded-full bg-[var(--cromo-surface)] border border-[var(--cromo-border)] text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)] hover:border-[var(--cromo-border-strong)] transition-all shadow-cromo-lg"
          aria-label={t('scrollToTop')}
        >
          <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
        </button>
      )}

      {selectionMode && (
        <MassActionBar
          selectedCount={selectedStickerIds.size}
          totalDisplayed={displayedStickers.length}
          allDisplayedSelected={
            displayedStickers.length > 0 &&
            displayedStickers.every((s) => selectedStickerIds.has(s.id))
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

      <AlbumDropDock
        albums={albums}
        currentAlbumId={albumId ?? ''}
        onDropOnAlbum={async (payload: DragPayload, targetAlbumId) => {
          // Move 1 copy of the first owned variant. Multi-variant moves still
          // go through the popover where the user can pick which one and how
          // many. Drag-and-drop is the fast path for "ship one off to album X".
          if (!user || !token || !albumId) return;
          const perSticker = ownedMap.get(payload.stickerId);
          if (!perSticker || perSticker.size === 0) return;
          const first = perSticker.entries().next().value as [string, OwnedVariantEntry];
          const [, entry] = first;
          try {
            await moveSticker(user.id, albumId, entry.variantId, targetAlbumId, 1, token);
            addToast(t('movedToast', { code: payload.albumCode }), { type: 'success' });
            await handleCollectionChange();
          } catch (err) {
            console.error('Failed to move sticker via DnD', err);
            addToast(t('moveFailedToast'));
          }
        }}
      />

      <CompletionCelebration
        albumId={activeAlbum?.id ?? null}
        albumLabel={activeAlbum ? albumDisplayName(activeAlbum) : ''}
        percentage={computedStats?.percentage ?? 0}
      />

      {showShareCard && activeAlbum && computedStats && user && (
        <ProgressShareCard
          collectorName={user.displayName ?? `@${user.username}`}
          username={user.username}
          albumLabel={albumDisplayName(activeAlbum)}
          stats={{
            owned: computedStats.owned,
            total: computedStats.total,
            percentage: computedStats.percentage,
            missing: computedStats.missing,
            duplicates: computedStats.duplicates,
          }}
          onClose={() => setShowShareCard(false)}
        />
      )}

      {showScanner && activeAlbum && (
        <div
          className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-0 sm:p-4 overflow-y-auto"
          onClick={(e) => { if (e.target === e.currentTarget) setShowScanner(false); }}
        >
          <div
            className="w-full max-w-lg bg-[var(--cromo-surface-2)] sm:rounded-2xl shadow-cromo-lg p-4 sm:p-6 min-h-screen sm:min-h-0"
            role="dialog"
            aria-modal="true"
            aria-label={t('scanStickersAria')}
          >
            <Scanner
              album={activeAlbum}
              onClose={() => setShowScanner(false)}
              onChange={handleCollectionChange}
            />
          </div>
        </div>
      )}
    </div>
    </PullToRefresh>
  );
}

// ─── Secondary header actions ───────────────────────────────────────────────
// One action declaration drives two surfaces (inline desktop buttons, mobile
// overflow menu items). Keeping the array as the source of truth means adding
// or reordering an action is one edit instead of two — and the desktop button
// + menu item can't silently drift.

type HeaderActionVariant = 'warning' | 'neutral' | 'accent';

interface HeaderAction {
  key: string;
  label: string;
  title?: string;
  icon: ReactNode;
  onClick: () => void;
  variant: HeaderActionVariant;
}

// Desktop hover affordance per action variant. The mobile menu uses a neutral
// row colour and tints the icon to the variant instead.
const DESKTOP_VARIANT_CLS: Record<HeaderActionVariant, string> = {
  warning: 'text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-warning-text)] hover:bg-[var(--cromo-warning-soft)]',
  neutral: 'text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)]',
  accent:  'text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-accent)] hover:bg-[var(--cromo-accent-soft)]',
};

const MENU_ICON_TINT: Record<HeaderActionVariant, string> = {
  warning: 'text-[var(--cromo-warning-text)]',
  neutral: 'text-[var(--cromo-fg-muted)]',
  accent:  'text-[var(--cromo-accent)]',
};

function SecondaryHeaderActions({
  actions,
  overflowRef,
  overflowOpen,
  onToggleOverflow,
  onCloseOverflow,
  moreActionsLabel,
}: {
  actions: HeaderAction[];
  overflowRef: React.RefObject<HTMLDivElement | null>;
  overflowOpen: boolean;
  onToggleOverflow: () => void;
  onCloseOverflow: () => void;
  moreActionsLabel: string;
}) {
  if (actions.length === 0) return null;
  return (
    <>
      {/* Desktop: inline buttons. The data-testid is consumed by the
          mobile-affordances Playwright spec to assert these are hidden at
          phone widths — keep it in sync with the spec if you rename. */}
      {actions.map((a) => (
        <button
          key={a.key}
          onClick={a.onClick}
          title={a.title}
          data-testid="header-action-inline"
          className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${DESKTOP_VARIANT_CLS[a.variant]}`}
        >
          <span className="w-4 h-4">{a.icon}</span>
          {a.label}
        </button>
      ))}
      {/* Mobile: "⋯" overflow menu */}
      <div ref={overflowRef} className="md:hidden relative">
        <button
          type="button"
          onClick={onToggleOverflow}
          aria-haspopup="menu"
          aria-expanded={overflowOpen}
          aria-label={moreActionsLabel}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)] transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
            <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM18 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </button>
        {overflowOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 min-w-[12rem] z-30 rounded-lg border border-[var(--cromo-border)] bg-[var(--cromo-surface)] shadow-cromo-lg py-1"
          >
            {actions.map((a) => (
              <button
                key={a.key}
                role="menuitem"
                onClick={() => { onCloseOverflow(); a.onClick(); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)] transition-colors"
              >
                <span className={`w-4 h-4 ${MENU_ICON_TINT[a.variant]}`}>{a.icon}</span>
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Icon glyphs ────────────────────────────────────────────────────────────
// Inlined so the action array doesn't need to import an icon set. Each
// renders a `w-full h-full` SVG inside its caller's sizing wrapper.
function StarIcon() {
  return (
    <svg className="w-full h-full" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}
function PencilIcon() {
  return (
    <svg className="w-full h-full" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg className="w-full h-full" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
    </svg>
  );
}
function ShareIcon() {
  return (
    <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}
