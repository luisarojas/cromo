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

  const filters: FilterState = useMemo(() => ({
    group: parseList(searchParams.get('group')),
    team: parseList(searchParams.get('team')),
    type: parseList(searchParams.get('type')),
    variant: parseList(searchParams.get('variant')),
    search: searchParams.get('q') ?? undefined,
    favouritesOnly: searchParams.get('fav') === '1' ? true : undefined,
    wantedOnly: searchParams.get('wanted') === '1' ? true : undefined,
  }), [searchParams]);

  const apply = useCallback(
    (next: { tab?: Tab; filters?: FilterState }) => {
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
      }

      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return { tab, filters, setTab: (t: Tab) => apply({ tab: t }), setFilters: (f: FilterState) => apply({ filters: f }) };
}
