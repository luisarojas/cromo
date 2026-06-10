'use client';

import { useId, useMemo, useState } from 'react';
import { variantLabel, variantSwatch, compareVariantTypes } from '@/app/album/components/variantMeta';

export type SortKey = 'code' | 'player' | 'team' | 'country' | 'group' | 'variant';

export const SORT_LABELS: Record<SortKey, string> = {
  code: 'Album code',
  player: 'Player',
  team: 'Team',
  country: 'Country',
  group: 'Group',
  variant: 'Variant',
};

export interface ToggleSpec {
  key: string;
  label: string;
  icon?: React.ReactNode;
  active: boolean;
  onToggle: () => void;
}

interface Props {
  /** Visual accent tied to the parent panel (offer = accent blue, want = success green). */
  accent: 'accent' | 'success';
  search: string;
  onSearchChange: (s: string) => void;
  searchPlaceholder?: string;

  sort: SortKey;
  onSortChange: (s: SortKey) => void;

  variantOptions: string[];
  variantFilters: string[];
  onVariantFiltersChange: (next: string[]) => void;

  countryOptions: string[];
  countryFilters: string[];
  onCountryFiltersChange: (next: string[]) => void;

  groupOptions: string[];
  groupFilters: string[];
  onGroupFiltersChange: (next: string[]) => void;

  /** Pill-style boolean toggles rendered above the search. Each panel decides
   *  which ones are relevant (e.g. "They Need", "I Need", "Favourited",
   *  "Extras only"). */
  toggles?: ToggleSpec[];

  resultCount: number;
}

export default function PickerToolbar({
  accent,
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  sort,
  onSortChange,
  variantOptions,
  variantFilters,
  onVariantFiltersChange,
  countryOptions,
  countryFilters,
  onCountryFiltersChange,
  groupOptions,
  groupFilters,
  onGroupFiltersChange,
  toggles = [],
  resultCount,
}: Props) {
  const sortId = useId();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const activeCount =
    variantFilters.length + countryFilters.length + groupFilters.length;

  const accentSolid = accent === 'accent' ? 'var(--cromo-accent)' : 'var(--cromo-success)';
  const accentFg = accent === 'accent' ? 'var(--cromo-accent-fg)' : 'var(--cromo-success-fg)';

  const sortedVariantOptions = useMemo(
    () => [...variantOptions].sort(compareVariantTypes),
    [variantOptions],
  );

  function toggleInArray(arr: string[], val: string, setter: (n: string[]) => void) {
    if (arr.includes(val)) setter(arr.filter((x) => x !== val));
    else setter([...arr, val]);
  }

  return (
    <div className="flex flex-col gap-2 shrink-0">
      {toggles.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {toggles.map((t) => (
            <button
              key={t.key}
              onClick={t.onToggle}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-[11px] font-medium transition-colors min-h-[32px] ${
                t.active
                  ? 'border-transparent'
                  : 'bg-[var(--cromo-surface)] text-[var(--cromo-fg-muted)] border-[var(--cromo-border)] hover:bg-[var(--cromo-surface-2)]'
              }`}
              style={
                t.active
                  ? { background: accentSolid, color: accentFg, borderColor: accentSolid }
                  : undefined
              }
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-1.5">
        <div className="relative flex-1 min-w-0">
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-md border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-2.5 py-2 pr-7 text-xs focus:outline-none focus:ring-2"
            style={{ ['--tw-ring-color' as string]: accentSolid }}
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center justify-center w-4 h-4 rounded-full text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-fg)] hover:bg-[var(--cromo-surface-2)]"
            >
              <svg className="w-2.5 h-2.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            </button>
          )}
        </div>
        <select
          id={sortId}
          aria-label="Sort"
          value={sort}
          onChange={(e) => onSortChange(e.target.value as SortKey)}
          className="rounded-md border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] px-2 py-2 text-xs focus:outline-none focus:ring-2"
          style={{ ['--tw-ring-color' as string]: accentSolid }}
        >
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <option key={k} value={k}>
              {SORT_LABELS[k]}
            </option>
          ))}
        </select>
        <button
          onClick={() => setFiltersOpen((v) => !v)}
          aria-expanded={filtersOpen}
          aria-label="Toggle filters"
          className={`relative shrink-0 inline-flex items-center justify-center px-2.5 py-2 rounded-md border text-xs font-medium transition-colors ${
            activeCount > 0 || filtersOpen
              ? 'border-transparent'
              : 'border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)]'
          }`}
          style={
            activeCount > 0 || filtersOpen
              ? { background: accentSolid, color: accentFg, borderColor: accentSolid }
              : undefined
          }
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M3 4a1 1 0 011-1h12a1 1 0 01.8 1.6L12 11v5a1 1 0 01-1.45.89l-2-1A1 1 0 018 15v-4L3.2 4.6A1 1 0 013 4z" />
          </svg>
          {activeCount > 0 && (
            <span
              className="ml-1 text-[10px] font-semibold tabular-nums"
              aria-label={`${activeCount} active`}
            >
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {filtersOpen && (
        <div className="rounded-md border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-2.5 flex flex-col gap-2.5">
          {sortedVariantOptions.length > 0 && (
            <FilterGroup
              label="Variant"
              accent={accent}
              options={sortedVariantOptions}
              selected={variantFilters}
              onToggle={(v) => toggleInArray(variantFilters, v, onVariantFiltersChange)}
              renderOption={(v) => (
                <span className="inline-flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full border ${variantSwatch(v)}`} />
                  {variantLabel(v)}
                </span>
              )}
              onClear={() => onVariantFiltersChange([])}
            />
          )}
          {countryOptions.length > 0 && (
            <FilterGroup
              label="Country"
              accent={accent}
              options={countryOptions}
              selected={countryFilters}
              onToggle={(v) => toggleInArray(countryFilters, v, onCountryFiltersChange)}
              onClear={() => onCountryFiltersChange([])}
            />
          )}
          {groupOptions.length > 0 && (
            <FilterGroup
              label="Group"
              accent={accent}
              options={groupOptions}
              selected={groupFilters}
              onToggle={(v) => toggleInArray(groupFilters, v, onGroupFiltersChange)}
              onClear={() => onGroupFiltersChange([])}
            />
          )}
          {activeCount > 0 && (
            <button
              onClick={() => {
                onVariantFiltersChange([]);
                onCountryFiltersChange([]);
                onGroupFiltersChange([]);
              }}
              className="self-end text-[11px] text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-danger-text)] transition-colors"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-[10px] text-[var(--cromo-fg-subtle)] tabular-nums px-0.5">
        <span>
          {resultCount} {resultCount === 1 ? 'result' : 'results'}
        </span>
        {activeCount > 0 && !filtersOpen && (
          <button
            onClick={() => setFiltersOpen(true)}
            className="text-[10px] underline-offset-2 hover:underline"
          >
            {activeCount} filter{activeCount === 1 ? '' : 's'} active
          </button>
        )}
      </div>
    </div>
  );
}

function FilterGroup({
  label,
  accent,
  options,
  selected,
  onToggle,
  onClear,
  renderOption,
}: {
  label: string;
  accent: 'accent' | 'success';
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  onClear: () => void;
  renderOption?: (v: string) => React.ReactNode;
}) {
  const accentSolid = accent === 'accent' ? 'var(--cromo-accent)' : 'var(--cromo-success)';
  const accentFg = accent === 'accent' ? 'var(--cromo-accent-fg)' : 'var(--cromo-success-fg)';
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--cromo-fg-muted)]">
          {label}
        </span>
        {selected.length > 0 && (
          <button
            onClick={onClear}
            className="text-[10px] text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-danger-text)]"
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {options.map((v) => {
          const isActive = selected.includes(v);
          return (
            <button
              key={v}
              onClick={() => onToggle(v)}
              className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                isActive
                  ? 'border-transparent'
                  : 'bg-[var(--cromo-surface)] border-[var(--cromo-border)] text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)]'
              }`}
              style={
                isActive
                  ? { background: accentSolid, color: accentFg }
                  : undefined
              }
            >
              {renderOption ? renderOption(v) : v}
            </button>
          );
        })}
      </div>
    </div>
  );
}
