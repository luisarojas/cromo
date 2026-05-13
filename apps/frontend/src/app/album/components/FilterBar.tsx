'use client';

import { useCallback } from 'react';
import { ALL_VARIANT_TYPES, variantLabel } from './variantMeta';

export interface FilterState {
  group?: string;
  team?: string;
  type?: string;
  variant?: string;
  search?: string;
}

interface Props {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
const TYPES = [
  { value: '', label: 'All types' },
  { value: 'player', label: 'Player' },
  { value: 'badge', label: 'Badge' },
  { value: 'team_photo', label: 'Team Photo' },
  { value: 'intro', label: 'Intro' },
  { value: 'museum', label: 'Museum' },
  { value: 'coca_cola', label: 'Coca-Cola' },
];

export default function FilterBar({ filters, onChange }: Props) {
  const update = useCallback(
    (key: keyof FilterState, value: string) => {
      onChange({ ...filters, [key]: value || undefined });
    },
    [filters, onChange],
  );

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
          onChange={(e) => update('search', e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {/* Group */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="filter-group"
          className="text-xs font-medium text-gray-500"
        >
          Group
        </label>
        <select
          id="filter-group"
          value={filters.group ?? ''}
          onChange={(e) => update('group', e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
        >
          <option value="">All groups</option>
          {GROUPS.map((g) => (
            <option key={g} value={g}>
              Group {g}
            </option>
          ))}
        </select>
      </div>

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
          onChange={(e) => update('team', e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {/* Type */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="filter-type"
          className="text-xs font-medium text-gray-500"
        >
          Type
        </label>
        <select
          id="filter-type"
          value={filters.type ?? ''}
          onChange={(e) => update('type', e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
        >
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {/* Clear */}
      {(filters.group || filters.team || filters.type || filters.search) && (
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
