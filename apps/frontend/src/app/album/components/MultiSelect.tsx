'use client';

import { useEffect, useRef, useState } from 'react';

interface Option {
  value: string;
  label: string;
}

interface Props {
  id: string;
  label: string;
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  searchable?: boolean;
}

export default function MultiSelect({
  id,
  label,
  options,
  value,
  onChange,
  placeholder = 'All',
  searchable = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleDown);
    return () => document.removeEventListener('mousedown', handleDown);
  }, []);

  useEffect(() => {
    if (open && searchable) {
      setTimeout(() => searchRef.current?.focus(), 0);
    }
    if (!open) setSearch('');
  }, [open, searchable]);

  const toggle = (v: string) => {
    if (value.includes(v)) {
      onChange(value.filter((x) => x !== v));
    } else {
      onChange([...value, v]);
    }
  };

  const filteredOptions = (search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options
  ).slice().sort((a, b) => {
    const aChecked = value.includes(a.value);
    const bChecked = value.includes(b.value);
    if (aChecked === bChecked) return 0;
    return aChecked ? -1 : 1;
  });

  const buttonLabel =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? (options.find((o) => o.value === value[0])?.label ?? value[0])
        : `${value.length} selected`;

  const hasSelection = value.length > 0;

  return (
    <div className="flex flex-col gap-1" ref={ref}>
      <label htmlFor={id} className="text-xs font-medium text-[var(--cromo-fg-muted)]">
        {label}
      </label>
      <div className="relative">
        <button
          id={id}
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`rounded-md border px-3 py-1.5 text-sm text-left w-full flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-[var(--cromo-accent)] bg-[var(--cromo-surface)] ${
            hasSelection
              ? 'border-[var(--cromo-accent)] text-[var(--cromo-accent)]'
              : 'border-[var(--cromo-border-strong)] text-[var(--cromo-fg)]'
          }`}
        >
          <span className="truncate">{buttonLabel}</span>
          <svg
            className={`w-3 h-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M2 4l4 4 4-4" />
          </svg>
        </button>
        {open && (
          <div className="absolute z-20 top-full mt-1 left-0 min-w-full bg-[var(--cromo-surface)] border border-[var(--cromo-border)] rounded-lg shadow-cromo-lg py-1 max-h-64 flex flex-col">
            <div className="px-2 py-1.5 border-b border-[var(--cromo-border)] shrink-0 flex items-center gap-2">
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="flex-1 rounded border border-[var(--cromo-border)] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--cromo-accent)]"
              />
              {value.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="shrink-0 text-xs text-[var(--cromo-accent)] hover:text-[var(--cromo-accent)] whitespace-nowrap"
                >
                  Clear all
                </button>
              )}
            </div>
            <div className="overflow-y-auto">
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-2 text-xs text-[var(--cromo-fg-subtle)]">No results</div>
              ) : (
                filteredOptions.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--cromo-surface-2)] cursor-pointer text-sm text-[var(--cromo-fg)]"
                  >
                    <input
                      type="checkbox"
                      checked={value.includes(opt.value)}
                      onChange={() => toggle(opt.value)}
                      className="rounded border-[var(--cromo-border-strong)] text-[var(--cromo-accent)] focus:ring-[var(--cromo-accent)]"
                    />
                    {opt.label}
                  </label>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
