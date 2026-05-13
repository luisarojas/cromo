'use client';

import { useCallback } from 'react';
import MultiSelect from './MultiSelect';

interface ActiveChip {
  label: string;
  onRemove: () => void;
}

export interface FilterState {
  group?: string[];
  team?: string[];
  type?: string[];
  variant?: string[];
  search?: string;
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
    (filters.team?.length ?? 0) > 0 ||
    (filters.type?.length ?? 0) > 0 ||
    (filters.variant?.length ?? 0) > 0 ||
    !!filters.search;

  const activeChips: ActiveChip[] = [];

  if (filters.search) {
    activeChips.push({
      label: `"${filters.search}"`,
      onRemove: () => onChange({ ...filters, search: undefined }),
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

  return (
    <div className="flex flex-col gap-2 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <div className="flex flex-wrap gap-3 items-end">
        {/* Search */}
        <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
          <label htmlFor="filter-search" className="text-xs font-medium text-gray-500">
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

        {hasActiveFilter && (
          <button
            onClick={() => onChange({})}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 transition-colors self-end"
          >
            Clear
          </button>
        )}
      </div>

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
