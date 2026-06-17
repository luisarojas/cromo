'use client';

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import type { FilterState } from '../components/FilterBar';

export type Tab = 'all' | 'have' | 'missing' | 'duplicates' | 'stats';
const VALID_TABS: readonly Tab[] = ['all', 'have', 'missing', 'duplicates', 'stats'];

function parseList(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const arr = value.split(',').filter(Boolean);
  return arr.length > 0 ? arr : undefined;
}

/**
 * useAlbumUrlState — single source of truth for the album page's tab + filter
 * state, encoded into URL search params instead of localStorage. Shareable
 * links, browser back/forward, and SSR are all "free" as a consequence.
 */
export function useAlbumUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tab: Tab = useMemo(() => {
    const raw = searchParams.get('tab');
    return VALID_TABS.includes(raw as Tab) ? (raw as Tab) : 'all';
  }, [searchParams]);

  const filters: FilterState = useMemo(() => {
    const recentRaw = searchParams.get('recent');
    const recentParsed = recentRaw !== null ? parseInt(recentRaw, 10) : NaN;
    return {
      group: parseList(searchParams.get('group')),
      team: parseList(searchParams.get('team')),
      type: parseList(searchParams.get('type')),
      variant: parseList(searchParams.get('variant')),
      search: searchParams.get('q') ?? undefined,
      favouritesOnly: searchParams.get('fav') === '1' ? true : undefined,
      wantedOnly: searchParams.get('wanted') === '1' ? true : undefined,
      recentMinutes: Number.isFinite(recentParsed) && recentParsed > 0 ? recentParsed : undefined,
    };
  }, [searchParams]);

  // history: 'push' creates a new browser-history entry (back returns the user
  // to where they were); 'replace' overwrites the current one. Tab switches
  // and stats jumps are discrete user actions and should be reversible via
  // browser back; filter typing fires per-keystroke and must stay on replace
  // or each character would create a history entry.
  const apply = useCallback(
    (next: { tab?: Tab; filters?: FilterState }, history: 'push' | 'replace' = 'replace') => {
      const params = new URLSearchParams(searchParams.toString());

      if (next.tab !== undefined) {
        if (next.tab === 'all') params.delete('tab');
        else params.set('tab', next.tab);
      }

      if (next.filters !== undefined) {
        const f = next.filters;
        const setList = (key: string, list?: string[]) => {
          if (list && list.length > 0) params.set(key, list.join(','));
          else params.delete(key);
        };
        const setScalar = (key: string, val?: string | number) => {
          if (val === undefined || val === '' || val === null) params.delete(key);
          else params.set(key, String(val));
        };
        setList('group', f.group);
        setList('team', f.team);
        setList('type', f.type);
        setList('variant', f.variant);
        setScalar('q', f.search);
        if (f.favouritesOnly) params.set('fav', '1');
        else params.delete('fav');
        if (f.wantedOnly) params.set('wanted', '1');
        else params.delete('wanted');
        if (f.recentMinutes && f.recentMinutes > 0) params.set('recent', String(f.recentMinutes));
        else params.delete('recent');
      }

      const qs = params.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (history === 'push') router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return {
    tab,
    filters,
    setTab: (t: Tab, history: 'push' | 'replace' = 'push') => apply({ tab: t }, history),
    setFilters: (f: FilterState) => apply({ filters: f }),
    // Combined setter — used when "jumping" from a stats card to a specific
    // tab + filter combo. `apply` replaces all filter keys at once, so any
    // filter not present in `next.filters` is cleared (the intended "fresh
    // view" semantics for stats drill-downs). Pushes history so browser back
    // returns to the stats view the user jumped from.
    setView: (next: { tab?: Tab; filters?: FilterState }) => apply(next, 'push'),
  };
}
