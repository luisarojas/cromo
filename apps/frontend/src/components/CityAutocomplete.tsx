'use client';

import { useEffect, useRef, useState } from 'react';
import type { City } from '@/lib/api';

interface NominatimResult {
  place_id: number;
  display_name: string;
  address: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    country?: string;
  };
}

function formatCity(result: NominatimResult): string {
  const place =
    result.address.city ??
    result.address.town ??
    result.address.village ??
    result.address.municipality ??
    result.display_name.split(',')[0]!.trim();
  const country = result.address.country ?? '';
  return country ? `${place}, ${country}` : place;
}

interface Props {
  cities: City[];
  onChange: (cities: City[]) => void;
  maxCities?: number;
}

export default function CityAutocomplete({ cities, onChange, maxCities = 5 }: Props) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<City[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function search(q: string) {
    if (!q.trim()) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    setLoading(true);
    fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } }
    )
      .then((r) => r.json() as Promise<NominatimResult[]>)
      .then((results) => {
        const seen = new Set<number>();
        const items: City[] = [];
        for (const r of results) {
          if (!seen.has(r.place_id)) {
            seen.add(r.place_id);
            items.push({ label: formatCity(r), placeId: r.place_id });
          }
        }
        setSuggestions(items);
        setOpen(items.length > 0);
      })
      .catch(() => setSuggestions([]))
      .finally(() => setLoading(false));
  }

  function handleInput(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 350);
  }

  function addCity(city: City) {
    if (!cities.some((c) => c.placeId === city.placeId) && cities.length < maxCities) {
      onChange([...cities, city]);
    }
    setQuery('');
    setSuggestions([]);
    setOpen(false);
  }

  function removeCity(placeId: number) {
    onChange(cities.filter((c) => c.placeId !== placeId));
  }

  const atLimit = cities.length >= maxCities;

  return (
    <div className="flex flex-col gap-3">
      {cities.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {cities.map((city) => (
            <span
              key={city.placeId}
              className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-sm text-blue-800"
            >
              {city.label}
              <button
                type="button"
                onClick={() => removeCity(city.placeId)}
                className="ml-0.5 text-blue-400 hover:text-blue-700 leading-none"
                aria-label={`Remove ${city.label}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {!atLimit && (
        <div ref={containerRef} className="relative max-w-xs">
          <input
            type="text"
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            placeholder="Search for a city…"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          {loading && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
              Searching…
            </span>
          )}
          {open && suggestions.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg max-h-52 overflow-y-auto">
              {suggestions.map((s) => {
                const alreadyAdded = cities.some((c) => c.placeId === s.placeId);
                return (
                  <li key={s.placeId}>
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); addCity(s); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 disabled:opacity-40"
                      disabled={alreadyAdded}
                    >
                      {s.label}
                      {alreadyAdded && (
                        <span className="ml-2 text-xs text-gray-400">already added</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {atLimit && (
        <p className="text-xs text-gray-400">Maximum of {maxCities} cities reached.</p>
      )}
    </div>
  );
}
