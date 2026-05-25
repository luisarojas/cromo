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
import { Alert, Badge, Button, Card, PageHeader, Stat } from '@/components/ui';

const EDITION_TINTS: Record<string, { dot: string; bar: string }> = {
  north_america: { dot: '#60A5FA', bar: '#60A5FA' },
  international: { dot: '#34D399', bar: '#34D399' },
  swiss_gold:    { dot: '#FBBF24', bar: '#FBBF24' },
  south_america: { dot: '#A78BFA', bar: '#A78BFA' },
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, token, user, router, sortOrder, filterType]);

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
      <div className="flex items-center justify-center min-h-[60vh] text-[var(--cromo-fg-subtle)] text-sm">
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
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-8">

        <PageHeader
          eyebrow="Dashboard"
          title={<>Welcome back, <span className="cromo-chrome-text">{displayName}</span></>}
          subtitle={
            user?.emailVerifiedAt === null
              ? <span className="text-[var(--cromo-warning)]">Email not verified — check your inbox.</span>
              : defaultAlbum
                ? `Tracking ${albums.length} album${albums.length !== 1 ? 's' : ''}`
                : 'Add your first album to start tracking'
          }
        />

        {error && (
          <div className="mb-6">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}

        {/* Aggregate stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {loading
            ? [...Array(4)].map((_, i) => (
                <div key={i} className="h-24 rounded-card bg-[var(--cromo-surface-2)] animate-pulse" />
              ))
            : (
              <>
                <Stat label="Total" value={defaultAlbumStats?.total ?? 0} />
                <Stat label="Owned" value={defaultAlbumStats?.owned ?? 0} tone="success" />
                <Stat label="Missing" value={defaultAlbumStats?.missing ?? 0} />
                <Stat label="Duplicates" value={defaultAlbumStats?.duplicates ?? 0} tone="accent" />
              </>
            )}
        </div>

        {/* Overall progress + insight */}
        {defaultAlbumStats && !loading && (
          <Card className="mb-8">
            <div className="flex justify-between text-xs text-[var(--cromo-fg-muted)] mb-2">
              <span className="font-semibold uppercase tracking-wider">{albumDisplayName(defaultAlbum!)}</span>
              <span className="font-mono text-[var(--cromo-fg)]">{defaultAlbumStats.percentage.toFixed(1)}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-[var(--cromo-surface-2)] overflow-hidden mb-2">
              <div
                className="h-full rounded-full bg-[var(--cromo-accent)] transition-all duration-700"
                style={{ width: `${defaultAlbumStats.percentage}%` }}
              />
            </div>
            {insightText && (
              <p className="text-xs text-[var(--cromo-fg-subtle)]">{insightText}</p>
            )}
          </Card>
        )}

        {/* Albums */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-[var(--cromo-fg-subtle)] uppercase tracking-wider">
              Albums
            </h2>
            <div className="flex items-center gap-3">
              {selectMode ? (
                <button
                  onClick={exitSelectMode}
                  className="text-xs text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)] font-medium transition-colors"
                >
                  Cancel
                </button>
              ) : (
                <>
                  {albums.length > 0 && (
                    <button
                      onClick={() => setSelectMode(true)}
                      className="text-xs text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)] font-medium transition-colors"
                    >
                      Select
                    </button>
                  )}
                  <Link
                    href="/album"
                    className="text-xs text-[var(--cromo-accent)] hover:underline font-medium"
                  >
                    Manage →
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Filter + sort */}
          {!loading && albums.length > 0 && (
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {albumTypes.length > 1 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <FilterChip active={filterType === 'all'} onClick={() => setFilterType('all')}>
                    All
                  </FilterChip>
                  {albumTypes.map((type) => (
                    <FilterChip
                      key={type}
                      active={filterType === type}
                      onClick={() => setFilterType(type)}
                    >
                      {type}
                    </FilterChip>
                  ))}
                </div>
              )}
              <button
                onClick={() =>
                  setSortOrder((o) => (o === 'none' ? 'desc' : o === 'desc' ? 'asc' : 'none'))
                }
                className={`ml-auto flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                  sortOrder !== 'none'
                    ? 'bg-[var(--cromo-accent-soft)] text-[var(--cromo-accent)]'
                    : 'bg-[var(--cromo-surface-2)] text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]'
                }`}
              >
                Completion
                {sortOrder === 'desc' && <span>↓</span>}
                {sortOrder === 'asc' && <span>↑</span>}
              </button>
            </div>
          )}

          {selectMode && displayedAlbums.length > 0 && (
            <div className="flex items-center gap-3 mb-2 px-1">
              <button
                onClick={toggleSelectAll}
                className="text-xs text-[var(--cromo-accent)] hover:underline font-medium"
              >
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
              {selectedIds.size > 0 && (
                <span className="text-xs text-[var(--cromo-fg-subtle)]">{selectedIds.size} selected</span>
              )}
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-36 rounded-card bg-[var(--cromo-surface-2)] animate-pulse" />
              ))}
            </div>
          ) : albums.length === 0 ? (
            <Card className="text-center py-12 border-dashed">
              <p className="text-sm text-[var(--cromo-fg-muted)] mb-4">No albums yet</p>
              <Link href="/album">
                <Button>Add your first album</Button>
              </Link>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {displayedAlbums.map((album) => {
                const st = albumStats.get(album.id);
                const tint = EDITION_TINTS[album.edition] ?? { dot: '#94A3B8', bar: '#94A3B8' };
                const isSelected = selectedIds.has(album.id);

                const cardContent = (
                  <>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-display font-semibold text-[var(--cromo-fg)] text-sm truncate leading-snug">
                          {albumDisplayName(album)}
                        </h3>
                        <div className="flex flex-wrap items-center gap-1 mt-1.5">
                          <Badge tone="neutral" className="!gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: tint.dot }} />
                            {album.editionName}
                          </Badge>
                          <Badge tone="neutral">{album.formatName}</Badge>
                        </div>
                      </div>
                      {selectMode ? (
                        <div
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                            isSelected
                              ? 'bg-[var(--cromo-accent)] border-[var(--cromo-accent)]'
                              : 'bg-transparent border-[var(--cromo-border-strong)]'
                          }`}
                        >
                          {isSelected && (
                            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="var(--cromo-accent-fg)" strokeWidth="2">
                              <path d="M2 6l3 3 5-5" />
                            </svg>
                          )}
                        </div>
                      ) : (
                        album.isDefault && (
                          <svg
                            className="w-4 h-4 shrink-0 mt-0.5"
                            viewBox="0 0 20 20"
                            fill="var(--cromo-warning)"
                            aria-label="Default album"
                          >
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        )
                      )}
                    </div>

                    {st ? (
                      <>
                        <div className="flex justify-between text-xs text-[var(--cromo-fg-muted)] mb-1.5">
                          <span>{st.owned} owned</span>
                          <span className="font-mono font-semibold text-[var(--cromo-fg)]">{st.percentage.toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-[var(--cromo-surface-2)] overflow-hidden mb-2">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${st.percentage}%`, background: tint.bar }}
                          />
                        </div>
                        <p className="text-[11px] text-[var(--cromo-fg-subtle)]">
                          {st.missing} missing · {st.duplicates} duplicates
                        </p>
                      </>
                    ) : (
                      <div className="space-y-1.5 mt-1">
                        <div className="h-2.5 rounded bg-[var(--cromo-surface-2)] animate-pulse" />
                        <div className="h-1.5 rounded-full bg-[var(--cromo-surface-2)] animate-pulse" />
                      </div>
                    )}
                  </>
                );

                const guideLink = album.albumTypeGuidePath && (
                  <Link
                    href={album.albumTypeGuidePath}
                    onClick={(e) => e.stopPropagation()}
                    className="block px-4 py-2 text-[11px] text-[var(--cromo-accent)] border-t border-[var(--cromo-border)] bg-[var(--cromo-accent-soft)] hover:brightness-110 transition-all"
                  >
                    View Collection Guide →
                  </Link>
                );

                if (selectMode) {
                  return (
                    <div
                      key={album.id}
                      className={`group rounded-card border transition-all overflow-hidden cursor-pointer select-none ${
                        isSelected
                          ? 'border-[var(--cromo-accent)] ring-2 ring-[var(--cromo-accent-soft)] bg-[var(--cromo-surface)]'
                          : 'border-[var(--cromo-border)] bg-[var(--cromo-surface)] hover:border-[var(--cromo-border-strong)]'
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
                    className="group rounded-card border border-[var(--cromo-border)] bg-[var(--cromo-surface)] hover:border-[var(--cromo-border-strong)] transition-colors overflow-hidden"
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
          <h2 className="text-xs font-semibold text-[var(--cromo-fg-subtle)] uppercase tracking-wider mb-3">
            Quick Links
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link
              href="/trade"
              className="flex items-center gap-3 rounded-card border border-[var(--cromo-border)] bg-[var(--cromo-surface)] px-4 py-3.5 hover:border-[var(--cromo-border-strong)] transition-colors group"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-btn bg-[var(--cromo-accent-soft)] text-[var(--cromo-accent)]">
                <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M8 5a1 1 0 100 2h5.586l-1.293 1.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L13.586 5H8zM12 15a1 1 0 100-2H6.414l1.293-1.293a1 1 0 10-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L6.414 15H12z" />
                </svg>
              </div>
              <div>
                <div className="font-display font-semibold text-sm text-[var(--cromo-fg)]">Trade</div>
                <div className="text-xs text-[var(--cromo-fg-muted)]">Find matches and swap stickers</div>
              </div>
            </Link>

            <Link
              href="/settings"
              className="flex items-center gap-3 rounded-card border border-[var(--cromo-border)] bg-[var(--cromo-surface)] px-4 py-3.5 hover:border-[var(--cromo-border-strong)] transition-colors group"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-btn bg-[var(--cromo-surface-2)] text-[var(--cromo-fg-muted)]">
                <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <div className="font-display font-semibold text-sm text-[var(--cromo-fg)]">Settings</div>
                <div className="text-xs text-[var(--cromo-fg-muted)]">Manage your account and preferences</div>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectMode && selectedIds.size > 0 && (
        <div
          className="fixed bottom-0 inset-x-0 z-40 border-t shadow-2xl"
          style={{
            background: 'var(--cromo-surface)',
            borderColor: 'var(--cromo-border)',
          }}
        >
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-[var(--cromo-fg)] mr-auto">
              {selectedIds.size} album{selectedIds.size > 1 ? 's' : ''} selected
            </span>
            {!confirmBulkDelete ? (
              <>
                <Button size="sm" variant="secondary" onClick={() => bulkSetTrade(true)} disabled={bulkBusy}>
                  Make trade public
                </Button>
                <Button size="sm" variant="secondary" onClick={() => bulkSetTrade(false)} disabled={bulkBusy}>
                  Make trade private
                </Button>
                <Button size="sm" variant="danger" onClick={() => setConfirmBulkDelete(true)} disabled={bulkBusy}>
                  Delete
                </Button>
              </>
            ) : (
              <>
                <span className="text-xs text-[var(--cromo-danger)]">
                  Delete {selectedIds.size} album{selectedIds.size > 1 ? 's' : ''}? This cannot be undone.
                </span>
                <Button size="sm" variant="secondary" onClick={() => setConfirmBulkDelete(false)} disabled={bulkBusy}>
                  Cancel
                </Button>
                <Button size="sm" variant="danger" onClick={bulkDelete} loading={bulkBusy}>
                  {bulkBusy ? 'Deleting…' : 'Confirm delete'}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
        active
          ? 'bg-[var(--cromo-fg)] text-[var(--cromo-bg)]'
          : 'bg-[var(--cromo-surface-2)] text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)]'
      }`}
    >
      {children}
    </button>
  );
}
