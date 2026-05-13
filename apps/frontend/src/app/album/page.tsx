'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  fetchStickers,
  fetchStats,
  fetchCollection,
  fetchMissing,
  fetchDuplicates,
  type Sticker,
  type CollectionStats,
  type MissingItem,
  type DuplicateItem,
} from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { usePreferencesStore } from '@/store/preferences';
import FilterBar, { type FilterState } from './components/FilterBar';
import { variantLabel } from './components/variantMeta';
import StatsBar from './components/StatsBar';
import StickerGrid, { type OwnedVariantMap } from './components/StickerGrid';
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

/** Fetch ALL pages of stickers up to maxItems, looping cursor. */
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

export default function AlbumPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const duplicatesCountAllVariants = usePreferencesStore((s) => s.duplicatesCountAllVariants);

  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [stats, setStats] = useState<CollectionStats | null>(null);
  const [ownedMap, setOwnedMap] = useState<OwnedMap>(new Map());
  const [missingItems, setMissingItems] = useState<MissingItem[]>([]);
  const [duplicateItems, setDuplicateItems] = useState<DuplicateItem[]>([]);

  const [tab, setTab] = useState<Tab>('all');
  const [filters, setFilters] = useState<FilterState>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Load collection — paginates by variant row, so we walk pages
  // ---------------------------------------------------------------------------
  const loadCollection = useCallback(async (tok: string, userId: string) => {
    try {
      const statsData = await fetchStats(userId, tok);
      setStats(statsData);

      // Walk all collection pages so multi-variant owners are fully captured.
      const map: OwnedMap = new Map();
      let cursor: number | null | undefined = undefined;
      // Safety cap — variants can exceed sticker count, so allow generous walk.
      for (let i = 0; i < 50; i++) {
        const page = await fetchCollection(
          userId,
          { limit: 1000, cursor: cursor ?? undefined },
          tok,
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

      setOwnedMap(map);
    } catch (err) {
      console.error('Failed to load collection', err);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Initial load — redirects to /login if not authenticated
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
        const [allStickers] = await Promise.all([
          fetchAllStickers({}),
          loadCollection(token, user.id),
        ]);
        if (!cancelled) {
          setStickers(allStickers);
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
    return () => {
      cancelled = true;
    };
  }, [hydrated, token, user, router, loadCollection]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Load missing/duplicates when those tabs are active
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!token || !user) return;

    if (tab === 'missing' && missingItems.length === 0) {
      fetchMissing(user.id, { limit: 200 }, token)
        .then((r) => setMissingItems(r.items))
        .catch((err) => console.error('Failed to load missing', err));
    }

    if (tab === 'duplicates' && duplicateItems.length === 0) {
      fetchDuplicates(user.id, { limit: 200 }, token)
        .then((r) => setDuplicateItems(r.items))
        .catch((err) => console.error('Failed to load duplicates', err));
    }
  }, [tab, token, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Derived totals from ownedMap (across all variants)
  // ---------------------------------------------------------------------------
  // Stickers scoped to the active tab, used as the base for dynamic filter options.
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

  // For each filter dimension, compute available options by applying all *other* active filters.
  const filterOptions = useMemo(() => {
    const filterExcept = (exclude: keyof FilterState): Sticker[] =>
      tabBase.filter((s) => {
        if (exclude !== 'group' && filters.group?.length && !filters.group.includes(s.group_name ?? '')) return false;
        if (
          exclude !== 'team' &&
          filters.team?.length &&
          !filters.team.includes(s.team_name ?? '') &&
          !filters.team.includes(s.fifa_code ?? '')
        ) return false;
        if (exclude !== 'type' && filters.type?.length && !filters.type.includes(s.sticker_type)) return false;
        if (exclude !== 'variant' && filters.variant?.length) {
          const p = ownedMap.get(s.album_code);
          if (!p || !filters.variant.some((v) => p.has(v))) return false;
        }
        if (exclude !== 'search' && filters.search) {
          const q = filters.search.toLowerCase();
          if (
            !s.player_name?.toLowerCase().includes(q) &&
            !s.album_code.toLowerCase().includes(q) &&
            !s.team_name?.toLowerCase().includes(q)
          ) return false;
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
    const typeOptions = Object.entries(TYPE_LABELS)
      .filter(([v]) => typeSet.has(v))
      .map(([value, label]) => ({ value, label }));

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

  // ---------------------------------------------------------------------------
  // Derive displayed stickers from active tab + filters
  // ---------------------------------------------------------------------------
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
      // duplicates: any sticker with at least one variant qty > 1
      if (duplicateItems.length > 0) {
        // Collapse duplicate rows to unique stickers (popover handles per-variant)
        const seen = new Set<string>();
        base = [];
        for (const d of duplicateItems) {
          if (seen.has(d.album_code)) continue;
          seen.add(d.album_code);
          // Merge into the sticker list if we have the full Sticker; otherwise cast.
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

    // Client-side filters
    return base.filter((s) => {
      if (filters.group?.length && !filters.group.includes(s.group_name ?? '')) return false;
      if (
        filters.team?.length &&
        !filters.team.includes(s.team_name ?? '') &&
        !filters.team.includes(s.fifa_code ?? '')
      )
        return false;
      if (filters.type?.length && !filters.type.includes(s.sticker_type)) return false;
      if (filters.variant?.length) {
        const perSticker = ownedMap.get(s.album_code);
        if (!perSticker || !filters.variant.some((v) => perSticker.has(v))) return false;
      }
      if (
        filters.search &&
        !s.player_name
          ?.toLowerCase()
          .includes(filters.search.toLowerCase()) &&
        !s.album_code.toLowerCase().includes(filters.search.toLowerCase()) &&
        !s.team_name?.toLowerCase().includes(filters.search.toLowerCase())
      )
        return false;
      return true;
    });
  }, [stickers, tab, filters, ownedMap, missingItems, duplicateItems, duplicatesCountAllVariants]);

  // ---------------------------------------------------------------------------
  // Mutation handlers
  // ---------------------------------------------------------------------------
  const handleCollectionChange = useCallback(async () => {
    if (token && user) await loadCollection(token, user.id);
    setMissingItems([]);
    setDuplicateItems([]);
  }, [loadCollection, token, user]);

  const handleOptimisticAdjust = useCallback(
    (
      albumCode: string,
      variantType: string,
      variantId: string,
      delta: number,
    ) => {
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
        <h1 className="text-2xl font-bold text-gray-800">
          Album{' '}
          <span className="text-base font-normal text-gray-400">
            — {user?.displayName ?? `@${user?.username}`}
          </span>
        </h1>

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
                <span className="ml-1.5 text-xs text-gray-400">
                  ({stickers.length})
                </span>
              )}
              {id === 'have' && stats && (
                <span className="ml-1.5 text-xs text-gray-400">
                  {totalOwnedQuantity > stats.owned
                    ? `(${stats.owned} / ${totalOwnedQuantity})`
                    : `(${stats.owned})`}
                </span>
              )}
              {id === 'missing' && stats && (
                <span className="ml-1.5 text-xs text-gray-400">
                  ({stats.missing})
                </span>
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
        ) : (
          <StickerGrid
            stickers={displayedStickers}
            ownedMap={ownedMap}
            userId={user!.id}
            token={token!}
            onCollectionChange={handleCollectionChange}
            onOptimisticAdjust={handleOptimisticAdjust}
          />
        )}
      </div>
    </div>
  );
}
