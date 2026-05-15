'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { fetchPublicList, type PublicList, type PublicListItem } from '@/lib/api';

const LIST_TYPE_LABELS: Record<string, string> = {
  missing: 'Missing Stickers',
  duplicates: 'Duplicate Stickers',
  full_collection: 'Full Collection',
};

function groupByTeam(items: PublicListItem[]): Map<string, PublicListItem[]> {
  const grouped = new Map<string, PublicListItem[]>();
  for (const item of items) {
    const key = item.teamName ?? 'Other';
    const bucket = grouped.get(key) ?? [];
    bucket.push(item);
    grouped.set(key, bucket);
  }
  return grouped;
}

export default function ShareListPage() {
  const params = useParams();
  const token =
    typeof params.token === 'string' ? params.token : (params.token?.[0] ?? '');

  const [list, setList] = useState<PublicList | null>(null);
  const [loading, setLoading] = useState(true);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    async function load() {
      try {
        const data = await fetchPublicList(token);
        if (!cancelled) setList(data);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('410') || msg.includes('404') || msg.includes('not found')) {
          setGone(true);
        } else {
          setError(msg || 'Failed to load list');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const filteredItems = useMemo(() => {
    if (!list) return [];
    const q = search.toLowerCase().trim();
    if (!q) return list.items;
    return list.items.filter(
      (item) =>
        item.albumCode.toLowerCase().includes(q) ||
        (item.playerName?.toLowerCase().includes(q) ?? false),
    );
  }, [list, search]);

  const groupedItems = useMemo(() => groupByTeam(filteredItems), [filteredItems]);
  const sortedTeams = useMemo(
    () =>
      [...groupedItems.keys()].sort((a, b) => {
        if (a === 'Other') return 1;
        if (b === 'Other') return -1;
        return a.localeCompare(b);
      }),
    [groupedItems],
  );

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="space-y-4">
          <div className="h-8 w-64 rounded bg-gray-200 animate-pulse" />
          <div className="h-4 w-40 rounded bg-gray-200 animate-pulse" />
          <div className="h-10 rounded-lg bg-gray-200 animate-pulse" />
          <div className="h-48 rounded-xl bg-gray-200 animate-pulse" />
        </div>
      </div>
    );
  }

  if (gone) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10 text-center">
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-10">
          <div className="text-4xl mb-3">410</div>
          <h1 className="text-xl font-semibold text-gray-800 mb-2">List no longer available</h1>
          <p className="text-sm text-gray-500">
            This shared list has expired or been revoked by its owner.
          </p>
        </div>
      </div>
    );
  }

  if (error || !list) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error ?? 'Failed to load list.'}
        </div>
      </div>
    );
  }

  const ownerName = list.owner.displayName ?? `@${list.owner.username}`;
  const listTypeLabel = LIST_TYPE_LABELS[list.listType] ?? list.listType;
  const createdDate = new Date(list.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const showQuantity = list.listType === 'duplicates';

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 mb-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-800">{ownerName}&apos;s {listTypeLabel}</h1>
            <div className="text-xs text-gray-400 mt-1">
              @{list.owner.username} &middot; Shared on {createdDate}
            </div>
          </div>
          <div className="shrink-0 rounded-full bg-blue-100 text-blue-700 px-3 py-1 text-xs font-medium">
            {list.items.length} stickers
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by album code or player name..."
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {search && (
          <p className="text-xs text-gray-400 mt-1">
            Showing {filteredItems.length} of {list.items.length} stickers
          </p>
        )}
      </div>

      {filteredItems.length === 0 && (
        <div className="text-center py-8">
          <p className="text-sm text-gray-500">
            {search ? 'No stickers match your search.' : 'This list is empty.'}
          </p>
        </div>
      )}

      {/* Grouped sticker list */}
      <div className="space-y-4">
        {sortedTeams.map((team) => {
          const teamItems = groupedItems.get(team) ?? [];
          return (
            <div key={team} className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 rounded-t-xl">
                <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  {team}{' '}
                  <span className="font-normal text-gray-400">({teamItems.length})</span>
                </h2>
              </div>
              <div className="divide-y divide-gray-50">
                {teamItems.map((item) => (
                  <div
                    key={item.stickerVariantId}
                    className="flex items-center justify-between px-4 py-2.5 gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-medium text-gray-500 shrink-0">
                          {item.albumCode}
                        </span>
                        {item.playerName && (
                          <span className="text-sm text-gray-800 truncate">
                            {item.playerName}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5 flex gap-1.5">
                        <span>{item.variantType}</span>
                        {item.stickerType !== 'player' && (
                          <span>&middot; {item.stickerType}</span>
                        )}
                      </div>
                    </div>
                    {showQuantity && item.quantity != null && item.quantity > 1 && (
                      <span className="shrink-0 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-xs font-medium">
                        &times;{item.quantity}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
