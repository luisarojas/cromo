'use client';

import { useCallback } from 'react';
import { ALL_VARIANT_TYPES, variantLabel } from './variantMeta';
import MultiSelect from './MultiSelect';

export interface FilterState {
  group?: string[];
  team?: string;
  type?: string[];
  variant?: string[];
  search?: string;
}

interface Props {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}

const GROUP_OPTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].map(
  (g) => ({ value: g, label: `Group ${g}` }),
);

const TYPE_OPTIONS = [
  { value: 'player', label: 'Player' },
  { value: 'badge', label: 'Badge' },
  { value: 'team_photo', label: 'Team Photo' },
  { value: 'intro', label: 'Intro' },
  { value: 'museum', label: 'Museum' },
  { value: 'coca_cola', label: 'Coca-Cola' },
];

const VARIANT_OPTIONS = ALL_VARIANT_TYPES.map((v) => ({
  value: v,
  label: variantLabel(v),
}));

export default function FilterBar({ filters, onChange }: Props) {
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

  const hasActiveFilter =
    (filters.group?.length ?? 0) > 0 ||
    !!filters.team ||
    (filters.type?.length ?? 0) > 0 ||
    (filters.variant?.length ?? 0) > 0 ||
    !!filters.search;

  return (
    <div className="flex flex-wrap gap-3 items-end bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      {/* Search */}
      <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
        <label
          htmlFor="filter-search"
          className="text-xs font-medium text-gray-500"
        >
          Search
        </label>
        <input
          id="filter-search"
          type="text"
          placeholder="Player, team…"
          value={filters.search ?? ''}
          onChange={(e) => updateText('search', e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {/* Group */}
      <MultiSelect
        id="filter-group"
        label="Group"
        options={GROUP_OPTIONS}
        value={filters.group ?? []}
        onChange={(v) => updateMulti('group', v)}
        placeholder="All groups"
      />

      {/* Team */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="filter-team"
          className="text-xs font-medium text-gray-500"
        >
          Team
        </label>
        <input
          id="filter-team"
          type="text"
          placeholder="e.g. Brazil"
          value={filters.team ?? ''}
          onChange={(e) => updateText('team', e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {/* Type */}
      <MultiSelect
        id="filter-type"
        label="Type"
        options={TYPE_OPTIONS}
        value={filters.type ?? []}
        onChange={(v) => updateMulti('type', v)}
        placeholder="All types"
      />

      {/* Variant */}
      <MultiSelect
        id="filter-variant"
        label="Variant owned"
        options={VARIANT_OPTIONS}
        value={filters.variant ?? []}
        onChange={(v) => updateMulti('variant', v)}
        placeholder="Any variant"
      />

      {/* Clear */}
      {hasActiveFilter && (
        <button
          onClick={() => onChange({})}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 transition-colors self-end"
        >
          Clear
        </button>
      )}
    </div>
  );
}
