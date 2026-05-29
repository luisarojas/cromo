'use client';

import { useMemo } from 'react';
import type { Sticker } from '@/lib/api';
import type { FilterState } from '../components/FilterBar';
import { variantLabel } from '../components/variantMeta';

const TYPE_LABELS: Record<string, string> = {
  player: 'Player',
  badge: 'Badge',
  team_photo: 'Team Photo',
  intro: 'Intro',
  coca_cola_special: 'Coca-Cola',
  extra: 'Extra',
};

const GROUP_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

interface Args {
  tabBase: Sticker[];
  filters: FilterState;
  ownedMap: Map<string, Map<string, unknown>>;
  favouriteSet: Set<string>;
  wantedAlbumCodeSet: Set<string>;
}

/**
 * useFilterOptions — derives the faceted filter dropdown options for the
 * album page. Pulled out of the page component so the page can stop
 * recomputing four separate filterExcept passes inline.
 *
 * Faceting: each dropdown's option list is computed *excluding its own
 * filter*, so toggling a single team value doesn't immediately drop the
 * other team options from the dropdown.
 */
export function useFilterOptions({ tabBase, filters, ownedMap, favouriteSet, wantedAlbumCodeSet }: Args) {
  return useMemo(() => {
    const filterExcept = (exclude: keyof FilterState): Sticker[] =>
      tabBase.filter((s) => {
        if (exclude !== 'favouritesOnly' && filters.favouritesOnly && !favouriteSet.has(s.albumCode)) return false;
        if (exclude !== 'wantedOnly' && filters.wantedOnly && !wantedAlbumCodeSet.has(s.albumCode)) return false;
        if (exclude !== 'group' && filters.group?.length && !filters.group.includes(s.groupName ?? '')) return false;
        if (exclude !== 'team' && filters.team?.length && !filters.team.includes(s.teamName ?? '') && !filters.team.includes(s.fifaCode ?? '')) return false;
        if (exclude !== 'type' && filters.type?.length && !filters.type.includes(s.stickerType)) return false;
        if (exclude !== 'variant' && filters.variant?.length) {
          const p = ownedMap.get(s.albumCode);
          if (!p || !filters.variant.some((v) => p.has(v))) return false;
        }
        if (exclude !== 'search' && filters.search) {
          const q = filters.search.toLowerCase();
          if (!s.playerName?.toLowerCase().includes(q)
              && !s.albumCode.toLowerCase().includes(q)
              && !s.teamName?.toLowerCase().includes(q)) return false;
        }
        return true;
      });

    const groupSet = new Set(filterExcept('group').map((s) => s.groupName).filter(Boolean) as string[]);
    const groupOptions = GROUP_KEYS
      .filter((g) => groupSet.has(g))
      .map((g) => ({ value: g, label: `Group ${g}` }));

    const teamSeen = new Set<string>();
    const teamOptions: { value: string; label: string }[] = [];
    for (const s of filterExcept('team')) {
      if (s.teamName && !teamSeen.has(s.teamName)) {
        teamSeen.add(s.teamName);
        teamOptions.push({ value: s.teamName, label: s.teamName });
      }
    }
    teamOptions.sort((a, b) => a.label.localeCompare(b.label));

    const typeSet = new Set(filterExcept('type').map((s) => s.stickerType).filter(Boolean));
    const typeOptions = Object.entries(TYPE_LABELS)
      .filter(([v]) => typeSet.has(v))
      .map(([value, label]) => ({ value, label }));

    const variantSet = new Set<string>();
    for (const s of filterExcept('variant')) {
      const p = ownedMap.get(s.albumCode);
      if (p) for (const vt of p.keys()) variantSet.add(vt);
    }
    const variantOptions = [...variantSet].map((v) => ({ value: v, label: variantLabel(v) }));

    return { groupOptions, teamOptions, typeOptions, variantOptions };
  }, [tabBase, filters, ownedMap, favouriteSet, wantedAlbumCodeSet]);
}
