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
  favouritesOnly?: boolean;
  wantedOnly?: boolean;
}

interface Props {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  groupOptions: { value: string; label: string }[];
  teamOptions: { value: string; label: string }[];
  typeOptions: { value: string; label: string }[];
  variantOptions: { value: string; label: string; swatch?: string }[];
  showFavourites?: boolean;
  showWanted?: boolean;
}

export default function FilterBar({
  filters,
  onChange,
  groupOptions,
  teamOptions,
  typeOptions,
  variantOptions,
  showFavourites = true,
  showWanted = true,
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
    (filters.favouritesOnly ? 1 : 0) +
    (filters.wantedOnly ? 1 : 0);

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
  if (filters.wantedOnly) {
    activeChips.push({
      label: 'Wanted',
      onRemove: () => onChange({ ...filters, wantedOnly: undefined }),
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
    <div className="flex flex-col gap-2 bg-[var(--cromo-surface)] border border-[var(--cromo-border)] rounded-xl p-4">

      {/* Primary row: search + filters toggle + clear */}
      <div className="flex gap-2 items-center">
        <input
          id="filter-search"
          type="text"
          placeholder="Search player, team, code…"
          value={filters.search ?? ''}
          onChange={(e) => updateText('search', e.target.value)}
          className="flex-1 min-w-0 rounded-md border border-[var(--cromo-border-strong)] px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)]"
        />

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={`flex items-center gap-1.5 shrink-0 rounded-md border px-3 py-1.5 text-sm transition-colors ${
            nonSearchActiveCount > 0 || expanded
              ? 'border-[var(--cromo-accent)]/40 bg-[var(--cromo-accent-soft)] text-[var(--cromo-accent)]'
              : 'border-[var(--cromo-border-strong)] text-[var(--cromo-fg-muted)] hover:border-[var(--cromo-border-strong)] hover:text-[var(--cromo-fg)]'
          }`}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3 5a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm2 5a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
          Filters
          {nonSearchActiveCount > 0 && (
            <span className="flex items-center justify-center rounded-full bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] text-[10px] font-bold w-4 h-4 leading-none">
              {nonSearchActiveCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => hasActiveFilter && onChange({})}
          className={`shrink-0 text-sm px-1 py-1.5 transition-colors ${
            hasActiveFilter
              ? 'text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-fg-muted)] cursor-pointer'
              : 'text-gray-200 cursor-default'
          }`}
        >
          Clear all
        </button>
      </div>

      {/* Expanded filter panel */}
      {expanded && (
        <div className="flex flex-wrap gap-3 items-end pt-3 border-t border-[var(--cromo-border)]">
          {groupOptions.length > 0 && (
            <MultiSelect
              id="filter-group"
              label="Group"
              options={groupOptions}
              value={filters.group ?? []}
              onChange={(v) => updateMulti('group', v)}
              placeholder="All groups"
            />
          )}

          {teamOptions.length > 0 && (
            <MultiSelect
              id="filter-team"
              label="Team"
              options={teamOptions}
              value={filters.team ?? []}
              onChange={(v) => updateMulti('team', v)}
              placeholder="All teams"
            />
          )}

          {typeOptions.length > 0 && (
            <MultiSelect
              id="filter-type"
              label="Type"
              options={typeOptions}
              value={filters.type ?? []}
              onChange={(v) => updateMulti('type', v)}
              placeholder="All types"
            />
          )}

          {variantOptions.length > 0 && (
            <MultiSelect
              id="filter-variant"
              label="Variant"
              options={variantOptions}
              value={filters.variant ?? []}
              onChange={(v) => updateMulti('variant', v)}
              placeholder="Any variant"
            />
          )}

          {/* Favourites toggle */}
          {showFavourites && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-[var(--cromo-fg-muted)]">Favourites</span>
              <button
                type="button"
                onClick={() => onChange({ ...filters, favouritesOnly: filters.favouritesOnly ? undefined : true })}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  filters.favouritesOnly
                    ? 'border-[var(--cromo-danger)]/40 bg-[var(--cromo-danger-soft)] text-[var(--cromo-danger-text)]'
                    : 'border-[var(--cromo-border-strong)] text-[var(--cromo-fg-muted)] hover:border-[var(--cromo-border-strong)] hover:text-[var(--cromo-fg)]'
                }`}
              >
                <HeartIcon filled={filters.favouritesOnly} className="w-3.5 h-3.5" />
                Only
              </button>
            </div>
          )}

          {/* Wishlist toggle */}
          {showWanted && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-[var(--cromo-fg-muted)]">Wishlist</span>
              <button
                type="button"
                onClick={() => onChange({ ...filters, wantedOnly: filters.wantedOnly ? undefined : true })}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  filters.wantedOnly
                    ? 'border-[var(--cromo-accent)]/40 bg-[var(--cromo-accent-soft)] text-[var(--cromo-accent)]'
                    : 'border-[var(--cromo-border-strong)] text-[var(--cromo-fg-muted)] hover:border-[var(--cromo-border-strong)] hover:text-[var(--cromo-fg)]'
                }`}
                aria-pressed={filters.wantedOnly ?? false}
              >
                <span aria-hidden>{filters.wantedOnly ? '★' : '☆'}</span>
                Wanted
              </button>
            </div>
          )}
        </div>
      )}

      {/* Active filter chips */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {activeChips.map((chip) => (
            <span
              key={chip.label}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--cromo-accent-soft)] border border-[var(--cromo-accent)]/30 text-[var(--cromo-accent)] text-xs px-2.5 py-0.5"
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
