'use client';

import { useState, useCallback } from 'react';
import MultiSelect from './MultiSelect';
import { HeartIcon } from '@/components/HeartIcon';

export interface FilterState {
  group?: string[];
  team?: string[];
  type?: string[];
  variant?: string[];
  search?: string;
  pageFrom?: number;
  pageTo?: number;
  favouritesOnly?: boolean;
}

interface Props {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  groupOptions: { value: string; label: string }[];
  teamOptions: { value: string; label: string }[];
  typeOptions: { value: string; label: string }[];
  variantOptions: { value: string; label: string }[];
}

export default function FilterBar({
  filters,
  onChange,
  groupOptions,
  teamOptions,
  typeOptions,
  variantOptions,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const updateText = useCallback(
    (key: keyof FilterState, value: string) => {
      onChange({ ...filters, [key]: value || undefined });
    },
    [filters, onChange],
  );

  const updateMulti = useCallback(
    (key: keyof FilterState, value: string[]) => {
      onChange({ ...filters, [key]: value.length > 0 ? value : undefined });
    },
    [filters, onChange],
  );

  const nonSearchActiveCount =
    (filters.group?.length ?? 0) +
    (filters.team?.length ?? 0) +
    (filters.type?.length ?? 0) +
    (filters.variant?.length ?? 0) +
    (filters.pageFrom != null || filters.pageTo != null ? 1 : 0) +
    (filters.favouritesOnly ? 1 : 0);

  const hasActiveFilter = nonSearchActiveCount > 0 || !!filters.search;

  const activeChips: { label: string; onRemove: () => void }[] = [];

  if (filters.search) {
    activeChips.push({
      label: `"${filters.search}"`,
      onRemove: () => onChange({ ...filters, search: undefined }),
    });
  }
  if (filters.favouritesOnly) {
    activeChips.push({
      label: 'Favourites',
      onRemove: () => onChange({ ...filters, favouritesOnly: undefined }),
    });
  }
  (filters.group ?? []).forEach((v) => {
    const opt = groupOptions.find((o) => o.value === v);
    activeChips.push({
      label: opt?.label ?? `Group ${v}`,
      onRemove: () => updateMulti('group', (filters.group ?? []).filter((x) => x !== v)),
    });
  });
  (filters.team ?? []).forEach((v) => {
    const opt = teamOptions.find((o) => o.value === v);
    activeChips.push({
      label: opt?.label ?? v,
      onRemove: () => updateMulti('team', (filters.team ?? []).filter((x) => x !== v)),
    });
  });
  (filters.type ?? []).forEach((v) => {
    const opt = typeOptions.find((o) => o.value === v);
    activeChips.push({
      label: opt?.label ?? v,
      onRemove: () => updateMulti('type', (filters.type ?? []).filter((x) => x !== v)),
    });
  });
  (filters.variant ?? []).forEach((v) => {
    const opt = variantOptions.find((o) => o.value === v);
    activeChips.push({
      label: opt?.label ?? v,
      onRemove: () => updateMulti('variant', (filters.variant ?? []).filter((x) => x !== v)),
    });
  });
  if (filters.pageFrom != null || filters.pageTo != null) {
    const { pageFrom: from, pageTo: to } = filters;
    let label: string;
    if (from != null && to != null) {
      label = from === to ? `p. ${from}` : `pp. ${from}–${to}`;
    } else if (from != null) {
      label = `From p. ${from}`;
    } else {
      label = `To p. ${to}`;
    }
    activeChips.push({
      label,
      onRemove: () => onChange({ ...filters, pageFrom: undefined, pageTo: undefined }),
    });
  }

  return (
    <div className="flex flex-col gap-2 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">

      {/* Primary row: search + filters toggle + clear */}
      <div className="flex gap-2 items-center">
        <input
          id="filter-search"
          type="text"
          placeholder="Search player, team, code…"
          value={filters.search ?? ''}
          onChange={(e) => updateText('search', e.target.value)}
          className="flex-1 min-w-0 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={`flex items-center gap-1.5 shrink-0 rounded-md border px-3 py-1.5 text-sm transition-colors ${
            nonSearchActiveCount > 0 || expanded
              ? 'border-blue-300 bg-blue-50 text-blue-600'
              : 'border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700'
          }`}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3 5a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm2 5a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
          Filters
          {nonSearchActiveCount > 0 && (
            <span className="flex items-center justify-center rounded-full bg-blue-500 text-white text-[10px] font-bold w-4 h-4 leading-none">
              {nonSearchActiveCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => hasActiveFilter && onChange({})}
          className={`shrink-0 text-sm px-1 py-1.5 transition-colors ${
            hasActiveFilter
              ? 'text-gray-400 hover:text-gray-600 cursor-pointer'
              : 'text-gray-200 cursor-default'
          }`}
        >
          Clear all
        </button>
      </div>

      {/* Expanded filter panel */}
      {expanded && (
        <div className="flex flex-wrap gap-3 items-end pt-3 border-t border-gray-100">
          <MultiSelect
            id="filter-group"
            label="Group"
            options={groupOptions}
            value={filters.group ?? []}
            onChange={(v) => updateMulti('group', v)}
            placeholder="All groups"
          />

          <MultiSelect
            id="filter-team"
            label="Team"
            options={teamOptions}
            value={filters.team ?? []}
            onChange={(v) => updateMulti('team', v)}
            placeholder="All teams"
          />

          <MultiSelect
            id="filter-type"
            label="Type"
            options={typeOptions}
            value={filters.type ?? []}
            onChange={(v) => updateMulti('type', v)}
            placeholder="All types"
          />

          <MultiSelect
            id="filter-variant"
            label="Variant owned"
            options={variantOptions}
            value={filters.variant ?? []}
            onChange={(v) => updateMulti('variant', v)}
            placeholder="Any variant"
          />

          {/* Favourites toggle */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">Favourites</span>
            <button
              type="button"
              onClick={() => onChange({ ...filters, favouritesOnly: filters.favouritesOnly ? undefined : true })}
              className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                filters.favouritesOnly
                  ? 'border-red-300 bg-red-50 text-red-500'
                  : 'border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700'
              }`}
            >
              <HeartIcon filled={filters.favouritesOnly} className="w-3.5 h-3.5" />
              Only
            </button>
          </div>

          {/* Page range */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">Page</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                placeholder="From"
                value={filters.pageFrom ?? ''}
                onChange={(e) =>
                  onChange({ ...filters, pageFrom: e.target.value ? Number(e.target.value) : undefined })
                }
                className="w-16 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <span className="text-xs text-gray-400">–</span>
              <input
                type="number"
                min={1}
                placeholder="To"
                value={filters.pageTo ?? ''}
                onChange={(e) =>
                  onChange({ ...filters, pageTo: e.target.value ? Number(e.target.value) : undefined })
                }
                className="w-16 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>
        </div>
      )}

      {/* Active filter chips */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {activeChips.map((chip) => (
            <span
              key={chip.label}
              className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs px-2.5 py-0.5"
            >
              {chip.label}
              <button
                type="button"
                onClick={chip.onRemove}
                className="hover:text-blue-900 transition-colors leading-none"
                aria-label={`Remove filter ${chip.label}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
