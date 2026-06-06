'use client';

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
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
  recentMinutes?: number;
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
  showRecent?: boolean;
  extraControls?: ReactNode;
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
  showRecent = true,
  extraControls,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  // Local-state echo for the search input. The committed `filters.search` flows
  // through `router.replace` in useAlbumUrlState, which is async — binding the
  // input directly to it drops characters on fast typing because React reverts
  // the DOM value to the still-stale prop while the URL transition is in
  // flight. Hold the draft locally for instant echo and debounce the commit.
  const [searchDraft, setSearchDraft] = useState(filters.search ?? '');
  const [recentDraft, setRecentDraft] = useState(
    filters.recentMinutes ? String(filters.recentMinutes) : '',
  );

  // Track the last value we committed up through onChange. Sync from prop only
  // when the incoming value isn't our own echo — otherwise a keystroke landing
  // between "commit fired" and "parent rerender" gets clobbered by the stale
  // prop catching up.
  const lastSentRef = useRef(filters.search ?? '');
  const lastSentRecentRef = useRef(filters.recentMinutes ?? 0);

  useEffect(() => {
    const incoming = filters.search ?? '';
    if (incoming === lastSentRef.current) return;
    lastSentRef.current = incoming;
    setSearchDraft(incoming);
  }, [filters.search]);

  useEffect(() => {
    const incoming = filters.recentMinutes ?? 0;
    if (incoming === lastSentRecentRef.current) return;
    lastSentRecentRef.current = incoming;
    setRecentDraft(incoming ? String(incoming) : '');
  }, [filters.recentMinutes]);

  // Use a ref so the debounce timer reads the latest filters/onChange without
  // resetting on every parent rerender.
  const commitRef = useRef({ filters, onChange });
  commitRef.current = { filters, onChange };

  useEffect(() => {
    const t = setTimeout(() => {
      const { filters: f, onChange: cb } = commitRef.current;
      const committed = f.search ?? '';
      if (committed !== searchDraft) {
        lastSentRef.current = searchDraft;
        cb({ ...f, search: searchDraft || undefined });
      }
    }, 250);
    return () => clearTimeout(t);
  }, [searchDraft]);

  useEffect(() => {
    const t = setTimeout(() => {
      const { filters: f, onChange: cb } = commitRef.current;
      const parsed = parseInt(recentDraft, 10);
      const next = Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
      if ((f.recentMinutes ?? 0) !== (next ?? 0)) {
        lastSentRecentRef.current = next ?? 0;
        cb({ ...f, recentMinutes: next });
      }
    }, 250);
    return () => clearTimeout(t);
  }, [recentDraft]);

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
    (filters.wantedOnly ? 1 : 0) +
    (showRecent && filters.recentMinutes && filters.recentMinutes > 0 ? 1 : 0);

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
  if (showRecent && filters.recentMinutes && filters.recentMinutes > 0) {
    activeChips.push({
      label: `Updated < ${filters.recentMinutes} min`,
      onRemove: () => onChange({ ...filters, recentMinutes: undefined }),
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

  // The expandable advanced panel is identical on desktop and mobile — only
  // its container differs (inline on md+, bottom-sheet on mobile). Render it
  // through a single function to keep the two layouts in lockstep without
  // duplicating five MultiSelects.
  const advancedPanel = (
    <div className="flex flex-wrap gap-3 items-end">
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
          className="min-w-52"
        />
      )}

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
      {showRecent && (
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-recent" className="text-xs font-medium text-[var(--cromo-fg-muted)]">
            Updated in last
          </label>
          <div className="flex items-center gap-1.5">
            <input
              id="filter-recent"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              placeholder="—"
              value={recentDraft}
              onChange={(e) => setRecentDraft(e.target.value.replace(/[^\d]/g, ''))}
              className="w-16 rounded-md border border-[var(--cromo-border-strong)] px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)]"
            />
            <span className="text-xs text-[var(--cromo-fg-muted)]">min</span>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-2 bg-[var(--cromo-surface)] border border-[var(--cromo-border)] rounded-xl p-4">

      {/* Primary row: search + filters toggle + clear */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          id="filter-search"
          type="text"
          placeholder="Search player, team, code…"
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          className="basis-full sm:basis-auto sm:flex-1 min-w-0 rounded-md border border-[var(--cromo-border-strong)] px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)]"
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

        {extraControls}

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

      {/* Expanded filter panel — inline on desktop, sheet on mobile. */}
      {expanded && (
        <div className="hidden md:block pt-3 border-t border-[var(--cromo-border)]">
          {advancedPanel}
        </div>
      )}
      {expanded && (
        <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-label="Filter stickers">
          {/* Scrim — taps close. */}
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setExpanded(false)}
            className="absolute inset-0 bg-black/50"
          />
          {/* Sheet body. Pinned to bottom; capped at ~80vh so the user can
              always see they can scroll the inner panel on small phones. */}
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-[var(--cromo-surface)] shadow-cromo-lg flex flex-col"
            style={{
              maxHeight: '80vh',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }}
          >
            <div className="flex items-center justify-between border-b border-[var(--cromo-border)] px-4 py-3">
              <span className="text-sm font-semibold text-[var(--cromo-fg)]">Filters</span>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Close"
                className="text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-fg-muted)] p-1"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto px-4 py-4">{advancedPanel}</div>
            <div className="border-t border-[var(--cromo-border)] px-4 py-3 flex gap-2">
              <button
                type="button"
                onClick={() => onChange({})}
                disabled={!hasActiveFilter}
                className="flex-1 rounded-md border border-[var(--cromo-border-strong)] bg-[var(--cromo-surface)] text-[var(--cromo-fg-muted)] text-sm font-medium py-2 disabled:opacity-50"
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="flex-1 rounded-md bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] text-sm font-semibold py-2 hover:bg-[var(--cromo-accent-strong)]"
              >
                Done
              </button>
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
