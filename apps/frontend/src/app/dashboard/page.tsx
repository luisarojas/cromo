'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  fetchUserAlbums,
  fetchUserAlbumsWithStats,
  updateUserAlbum,
  deleteUserAlbum,
  albumDisplayName,
  type AlbumStats,
} from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useAlbumsStore } from '@/store/albums';

const EDITION_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  north_america: { bg: 'bg-blue-100',   text: 'text-blue-700',   bar: 'bg-blue-500'   },
  international: { bg: 'bg-green-100',  text: 'text-green-700',  bar: 'bg-green-500'  },
  swiss_gold:    { bg: 'bg-amber-100',  text: 'text-amber-700',  bar: 'bg-amber-500'  },
  south_america: { bg: 'bg-purple-100', text: 'text-purple-700', bar: 'bg-purple-500' },
};

export default function DashboardPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);

  const albums = useAlbumsStore((s) => s.albums);
  const setAlbums = useAlbumsStore((s) => s.setAlbums);

  const [albumStats, setAlbumStats] = useState<Map<string, AlbumStats>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterType, setFilterType] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'none' | 'asc' | 'desc'>('none');
  const [allAlbumTypeNames, setAllAlbumTypeNames] = useState<string[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    if (!token || !user) {
      router.replace('/login');
      return;
    }

    let cancelled = false;

    async function load() {
      if (!token || !user) return;
      try {
        const albumSort = sortOrder === 'desc' ? 'completion_desc'
          : sortOrder === 'asc' ? 'completion_asc'
          : 'default';
        // Single round-trip: albums + per-album stats. The dashboard's top
        // stat cards used to also fetch /collection/stats for the default
        // album, but those numbers are already in the bundled per-album
        // stats — we derive them from the default album below.
        const userAlbums = await fetchUserAlbumsWithStats(user.id, token, albumSort, filterType);
        if (cancelled) return;
        setAlbums(userAlbums);
        setAlbumStats(new Map(userAlbums.map((a) => [a.id, { ...a.stats, albumId: a.id }])));
        if (filterType === 'all') {
          setAllAlbumTypeNames([...new Set(userAlbums.map((a) => a.albumTypeName))]);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  // re-fetches when sort/filter changes so the server reorders/filters the rows
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, token, user, router, sortOrder, filterType]);

  // Server applies sort AND type filter (see fetchUserAlbums above). Chip list
  // comes from allAlbumTypeNames captured on the unfiltered fetch.
  const albumTypes = allAlbumTypeNames;
  const displayedAlbums = albums;

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === displayedAlbums.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayedAlbums.map((a) => a.id)));
    }
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
    setConfirmBulkDelete(false);
  }

  async function bulkSetTrade(value: boolean) {
    if (!user || !token || selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      await Promise.all(
        [...selectedIds].map((id) =>
          updateUserAlbum(user.id, id, { isTradeInventoryPublic: value }, token),
        ),
      );
      const userAlbums = await fetchUserAlbums(user.id, token);
      setAlbums(userAlbums);
      exitSelectMode();
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkDelete() {
    if (!user || !token || selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      await Promise.all([...selectedIds].map((id) => deleteUserAlbum(user.id, id, token)));
      const userAlbums = await fetchUserAlbumsWithStats(user.id, token);
      setAlbums(userAlbums);
      setAlbumStats(new Map(userAlbums.map((a) => [a.id, { ...a.stats, albumId: a.id }])));
      exitSelectMode();
    } finally {
      setBulkBusy(false);
    }
  }

  if (!hydrated || (!token && hydrated)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-gray-400 text-sm">
        Loading…
      </div>
    );
  }

  const displayName = user?.displayName ?? `@${user?.username}`;
  const defaultAlbum = albums.find((a) => a.isDefault) ?? albums[0] ?? null;
  const defaultAlbumStats = defaultAlbum ? albumStats.get(defaultAlbum.id) : null;

  let insightText: string | null = null;
  if (defaultAlbum && defaultAlbumStats) {
    insightText = defaultAlbumStats.missing === 0
      ? `You've completed ${albumDisplayName(defaultAlbum)}!`
      : `${defaultAlbumStats.missing} stickers left to complete ${albumDisplayName(defaultAlbum)}`;
  }

  const allSelected = displayedAlbums.length > 0 && selectedIds.size === displayedAlbums.length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* Greeting */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800">
            Welcome back, {displayName}
          </h1>
          {user?.emailVerifiedAt === null && (
            <p className="text-sm text-amber-500 mt-1">
              Email not verified. Check your inbox.
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 mb-6">
            {error}
          </div>
        )}

        {/* Aggregate stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {loading
            ? [...Array(4)].map((_, i) => (
                <div key={i} className="h-20 rounded-xl bg-gray-200 animate-pulse" />
              ))
            : [
                { label: 'Total',      value: defaultAlbumStats?.total      ?? 0, color: 'text-gray-800',   bg: 'bg-white',     border: 'border-gray-200'  },
                { label: 'Owned',      value: defaultAlbumStats?.owned      ?? 0, color: 'text-green-600',  bg: 'bg-green-50',  border: 'border-green-100' },
                { label: 'Missing',    value: defaultAlbumStats?.missing    ?? 0, color: 'text-red-500',    bg: 'bg-red-50',    border: 'border-red-100'   },
                { label: 'Duplicates', value: defaultAlbumStats?.duplicates ?? 0, color: 'text-amber-500',  bg: 'bg-amber-50',  border: 'border-amber-100' },
              ].map(({ label, value, color, bg, border }) => (
                <div
                  key={label}
                  className={`rounded-xl border ${border} ${bg} p-4 flex flex-col items-center shadow-sm`}
                >
                  <span className={`text-2xl font-extrabold ${color}`}>{value}</span>
                  <span className="text-xs text-gray-500 mt-0.5">{label}</span>
                </div>
              ))}
        </div>

        {/* Overall progress + insight */}
        {defaultAlbumStats && !loading && (
          <div className="mb-8">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Overall progress</span>
              <span>{defaultAlbumStats.percentage.toFixed(1)}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden mb-2">
              <div
                className="h-full rounded-full bg-green-500 transition-all duration-700"
                style={{ width: `${defaultAlbumStats.percentage}%` }}
              />
            </div>
            {insightText && (
              <p className="text-xs text-gray-400">{insightText}</p>
            )}
          </div>
        )}

        {/* Albums */}
        <div className="mb-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Albums</h2>
            <div className="flex items-center gap-3">
              {selectMode ? (
                <button
                  onClick={exitSelectMode}
                  className="text-xs text-gray-500 hover:text-gray-700 font-medium transition-colors"
                >
                  Cancel
                </button>
              ) : (
                <>
                  {albums.length > 0 && (
                    <button
                      onClick={() => setSelectMode(true)}
                      className="text-xs text-gray-500 hover:text-gray-700 font-medium transition-colors"
                    >
                      Select
                    </button>
                  )}
                  <Link
                    href="/album"
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
                  >
                    Manage →
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Filter + sort controls */}
          {!loading && albums.length > 0 && (
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {albumTypes.length > 1 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => setFilterType('all')}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                      filterType === 'all'
                        ? 'bg-gray-800 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    All
                  </button>
                  {albumTypes.map((type) => (
                    <button
                      key={type}
                      onClick={() => setFilterType(type)}
                      className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                        filterType === type
                          ? 'bg-gray-800 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() =>
                  setSortOrder((o) => (o === 'none' ? 'desc' : o === 'desc' ? 'asc' : 'none'))
                }
                className={`ml-auto flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                  sortOrder !== 'none'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Completion
                {sortOrder === 'desc' && <span>↓</span>}
                {sortOrder === 'asc' && <span>↑</span>}
              </button>
            </div>
          )}

          {/* Select-all row */}
          {selectMode && displayedAlbums.length > 0 && (
            <div className="flex items-center gap-3 mb-2 px-1">
              <button
                onClick={toggleSelectAll}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
              {selectedIds.size > 0 && (
                <span className="text-xs text-gray-400">{selectedIds.size} selected</span>
              )}
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-32 rounded-xl bg-gray-200 animate-pulse" />
              ))}
            </div>
          ) : albums.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
              <p className="text-sm text-gray-400 mb-3">No albums yet</p>
              <Link
                href="/album"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Add your first album
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {displayedAlbums.map((album) => {
                const st = albumStats.get(album.id);
                const colors = EDITION_COLORS[album.edition] ?? { bg: 'bg-gray-100', text: 'text-gray-600', bar: 'bg-gray-500' };
                const isSelected = selectedIds.has(album.id);

                const cardContent = (
                  <>
                    <div className="flex items-start justify-between gap-2 mb-2.5">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-800 text-sm truncate leading-snug group-hover:text-blue-700 transition-colors">
                          {albumDisplayName(album)}
                        </h3>
                        <div className="flex flex-wrap items-center gap-1 mt-1">
                          <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                            {album.editionName}
                          </span>
                          <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                            {album.formatName}
                          </span>
                        </div>
                      </div>
                      {selectMode ? (
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                          isSelected ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'
                        }`}>
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M2 6l3 3 5-5" />
                            </svg>
                          )}
                        </div>
                      ) : (
                        album.isDefault && (
                          <svg className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor" aria-label="Default album">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        )
                      )}
                    </div>

                    {st ? (
                      <>
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                          <span>{st.owned} owned</span>
                          <span className="font-medium text-gray-600">{st.percentage.toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden mb-2">
                          <div
                            className={`h-full rounded-full ${colors.bar} transition-all`}
                            style={{ width: `${st.percentage}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-gray-400">
                          {st.missing} missing · {st.duplicates} duplicates
                        </p>
                      </>
                    ) : (
                      <div className="space-y-1.5 mt-1">
                        <div className="h-2.5 rounded bg-gray-100 animate-pulse" />
                        <div className="h-1.5 rounded-full bg-gray-100 animate-pulse" />
                      </div>
                    )}
                  </>
                );

                const guideLink = album.albumTypeKey === 'fifa_world_cup_2026' && (
                  <Link
                    href="/guide/wc-2026"
                    onClick={(e) => e.stopPropagation()}
                    className="block px-4 py-2 text-[11px] text-blue-600 hover:text-blue-800 border-t border-gray-100 bg-blue-50/40 hover:bg-blue-50 transition-colors"
                  >
                    View WC 2026 Collection Guide →
                  </Link>
                );

                if (selectMode) {
                  return (
                    <div
                      key={album.id}
                      className={`group bg-white rounded-xl border shadow-sm transition-all overflow-hidden cursor-pointer select-none ${
                        isSelected
                          ? 'border-blue-400 ring-2 ring-blue-200'
                          : 'border-gray-200 hover:shadow-md hover:border-blue-200'
                      }`}
                    >
                      <div onClick={() => toggleSelect(album.id)} className="p-4">
                        {cardContent}
                      </div>
                      {guideLink}
                    </div>
                  );
                }

                return (
                  <div
                    key={album.id}
                    className="group bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-200 transition-all overflow-hidden"
                  >
                    <Link href={`/album/${album.id}`} className="block p-4">
                      {cardContent}
                    </Link>
                    {guideLink}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Quick Links</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link
              href="/trade"
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5 hover:bg-gray-50 hover:border-gray-300 transition-all group shadow-sm"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M8 5a1 1 0 100 2h5.586l-1.293 1.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L13.586 5H8zM12 15a1 1 0 100-2H6.414l1.293-1.293a1 1 0 10-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L6.414 15H12z" />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-sm text-gray-800 group-hover:text-gray-900">Trade</div>
                <div className="text-xs text-gray-400">Find matches and swap stickers</div>
              </div>
            </Link>

            <Link
              href="/settings"
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5 hover:bg-gray-50 hover:border-gray-300 transition-all group shadow-sm"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-sm text-gray-800 group-hover:text-gray-900">Settings</div>
                <div className="text-xs text-gray-400">Manage your account and preferences</div>
              </div>
            </Link>
          </div>
        </div>

      </div>

      {/* Bulk action bar */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 shadow-lg">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-700 mr-auto">
              {selectedIds.size} album{selectedIds.size > 1 ? 's' : ''} selected
            </span>
            {!confirmBulkDelete ? (
              <>
                <button
                  onClick={() => bulkSetTrade(true)}
                  disabled={bulkBusy}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 transition-colors"
                >
                  Make trade public
                </button>
                <button
                  onClick={() => bulkSetTrade(false)}
                  disabled={bulkBusy}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
                >
                  Make trade private
                </button>
                <button
                  onClick={() => setConfirmBulkDelete(true)}
                  disabled={bulkBusy}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors"
                >
                  Delete
                </button>
              </>
            ) : (
              <>
                <span className="text-xs text-red-600">
                  Delete {selectedIds.size} album{selectedIds.size > 1 ? 's' : ''}? This cannot be undone.
                </span>
                <button
                  onClick={() => setConfirmBulkDelete(false)}
                  disabled={bulkBusy}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={bulkDelete}
                  disabled={bulkBusy}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {bulkBusy ? 'Deleting…' : 'Confirm delete'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
