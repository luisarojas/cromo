'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  fetchUserAlbums,
  fetchUserAlbumsWithStats,
  updateUserAlbum,
  deleteUserAlbum,
  albumDisplayName,
  evaluateMyAchievements,
  type AlbumStats,
} from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useAlbumsStore } from '@/store/albums';
import { Alert, Badge, Button, Card, PageHeader, Stat } from '@/components/ui';
import { readLastScan, clearLastScan, readStreak, type LastScan } from '@/lib/lastScan';
import { subscribeSync } from '@/lib/syncBus';
import ProgressShareCard from '@/components/ProgressShareCard';

// New users on the dashboard who have never scanned see a one-time card that
// explains we'll ask for camera access on first scan. Browsers only prompt in
// response to a user gesture, so we precondition the user mentally before they
// land on /scan — denial is sticky on most browsers and a cold prompt is the
// most common cause of denials.
const PRIMER_DISMISS_KEY = 'cromo:dashboardCameraPrimerDismissed';
const CAMERA_PRIMED_KEY = 'cromo:cameraPrimed';
function shouldShowDashboardPrimer(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.localStorage.getItem(PRIMER_DISMISS_KEY) === '1') return false;
    if (window.localStorage.getItem(CAMERA_PRIMED_KEY) === '1') return false;
    return true;
  } catch {
    return false;
  }
}

const EDITION_TINTS: Record<string, { dot: string; bar: string }> = {
  north_america: { dot: '#60A5FA', bar: '#60A5FA' },
  international: { dot: '#34D399', bar: '#34D399' },
  swiss_gold:    { dot: '#FBBF24', bar: '#FBBF24' },
  south_america: { dot: '#A78BFA', bar: '#A78BFA' },
};

export default function DashboardPage() {
  const t = useTranslations('dashboard');
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
  const [lastScan, setLastScan] = useState<LastScan | null>(null);
  const [showCameraPrimer, setShowCameraPrimer] = useState(false);
  const [streak, setStreak] = useState(0);
  const [showShareCard, setShowShareCard] = useState(false);

  useEffect(() => {
    setLastScan(readLastScan());
    setShowCameraPrimer(shouldShowDashboardPrimer());
    setStreak(readStreak().current);
  }, []);
  const [allAlbumTypeNames, setAllAlbumTypeNames] = useState<string[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  // Bumped by cross-tab sync events; the load effect depends on it so a
  // mutation in another tab re-fetches dashboard stats here.
  const [reloadTick, setReloadTick] = useState(0);

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
          setError(err instanceof Error ? err.message : t('failedToLoad'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, token, user, router, sortOrder, filterType, reloadTick]);

  // Re-evaluate achievements when the dashboard mounts and whenever the
  // collection state changes (via reloadTick). Fire-and-forget — the
  // profile page reads the persisted set, so any newly unlocked badge
  // shows up next time the collector visits their profile.
  useEffect(() => {
    if (!hydrated || !token) return;
    void evaluateMyAchievements(token).catch(() => {
      // Achievements are decorative; a transient failure is fine.
    });
  }, [hydrated, token, reloadTick]);

  // Cross-tab refresh: a collection change in any tab (album view, scanner)
  // should reflect on the dashboard's stats and progress bars without the
  // user having to reload. We only react to events for THIS user.
  useEffect(() => {
    if (!user) return;
    return subscribeSync((event) => {
      if (event.type !== 'collection:changed') return;
      if (event.userId !== user.id) return;
      setReloadTick((n) => n + 1);
    });
  }, [user]);

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
        {t('loading')}
      </div>
    );
  }

  const displayName = user?.displayName ?? `@${user?.username}`;
  const defaultAlbum = albums.find((a) => a.isDefault) ?? albums[0] ?? null;
  const defaultAlbumStats = defaultAlbum ? albumStats.get(defaultAlbum.id) : null;

  let insightText: string | null = null;
  if (defaultAlbum && defaultAlbumStats) {
    insightText = defaultAlbumStats.missing === 0
      ? t('insightComplete', { album: albumDisplayName(defaultAlbum) })
      : t('insightLeft', { count: defaultAlbumStats.missing, album: albumDisplayName(defaultAlbum) });
  }

  const allSelected = displayedAlbums.length > 0 && selectedIds.size === displayedAlbums.length;

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-8">

        <PageHeader
          eyebrow={t('eyebrow')}
          title={<>{t('welcomeBack')} <span className="cromo-chrome-text">{displayName}</span></>}
          subtitle={
            user?.emailVerifiedAt === null
              ? <span className="text-[var(--cromo-warning-text)]">{t('emailNotVerified')}</span>
              : defaultAlbum
                ? t('trackingAlbums', { count: albums.length })
                : t('addFirstAlbumPrompt')
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
                <StatLink albumId={defaultAlbum?.id} tab="all">
                  <Stat label={t('statTotal')} value={defaultAlbumStats?.total ?? 0} tone="chrome" />
                </StatLink>
                <StatLink albumId={defaultAlbum?.id} tab="have">
                  <Stat label={t('statOwned')} value={defaultAlbumStats?.owned ?? 0} tone="success" />
                </StatLink>
                <StatLink albumId={defaultAlbum?.id} tab="missing">
                  <Stat label={t('statMissing')} value={defaultAlbumStats?.missing ?? 0} />
                </StatLink>
                <StatLink albumId={defaultAlbum?.id} tab="duplicates">
                  <Stat label={t('statDuplicates')} value={defaultAlbumStats?.duplicates ?? 0} tone="accent" />
                </StatLink>
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
                className={`h-full rounded-full transition-all duration-700 ${
                  defaultAlbumStats.percentage >= 100
                    ? 'cromo-chrome-fill'
                    : 'bg-[var(--cromo-accent)]'
                }`}
                style={{ width: `${defaultAlbumStats.percentage}%` }}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              {insightText && (
                <p className="text-xs text-[var(--cromo-fg-subtle)]">{insightText}</p>
              )}
              <button
                onClick={() => setShowShareCard(true)}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-btn border border-[var(--cromo-border)] bg-[var(--cromo-surface-2)] px-3 py-1.5 text-xs font-medium text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)] hover:border-[var(--cromo-border-strong)] transition-colors"
                aria-label={t('shareProgressAria')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
                {t('shareProgress')}
              </button>
            </div>
          </Card>
        )}

        {showShareCard && defaultAlbum && defaultAlbumStats && user && (
          <ProgressShareCard
            collectorName={user.displayName ?? `@${user.username}`}
            username={user.username}
            albumLabel={albumDisplayName(defaultAlbum)}
            stats={{
              owned: defaultAlbumStats.owned,
              total: defaultAlbumStats.total,
              percentage: defaultAlbumStats.percentage,
              missing: defaultAlbumStats.missing,
              duplicates: defaultAlbumStats.duplicates,
            }}
            onClose={() => setShowShareCard(false)}
          />
        )}

        {/* Albums */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-[var(--cromo-fg-subtle)] uppercase tracking-wider">
              {t('albumsHeading')}
            </h2>
            <div className="flex items-center gap-3">
              {selectMode ? (
                <button
                  onClick={exitSelectMode}
                  className="text-xs text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)] font-medium transition-colors"
                >
                  {t('cancel')}
                </button>
              ) : (
                <>
                  {albums.length > 0 && (
                    <button
                      onClick={() => setSelectMode(true)}
                      className="text-xs text-[var(--cromo-fg-muted)] hover:text-[var(--cromo-fg)] font-medium transition-colors"
                    >
                      {t('select')}
                    </button>
                  )}
                  <Link
                    href="/album"
                    className="text-xs text-[var(--cromo-accent)] hover:underline font-medium"
                  >
                    {t('manage')}
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
                    {t('filterAll')}
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
                {t('sortCompletion')}
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
                {allSelected ? t('deselectAll') : t('selectAll')}
              </button>
              {selectedIds.size > 0 && (
                <span className="text-xs text-[var(--cromo-fg-subtle)]">{t('selectedCount', { count: selectedIds.size })}</span>
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
              <p className="text-sm text-[var(--cromo-fg-muted)] mb-4">{t('noAlbumsYet')}</p>
              <Link href="/album">
                <Button>{t('addFirstAlbum')}</Button>
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
                            aria-label={t('defaultAlbumAria')}
                          >
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        )
                      )}
                    </div>

                    {st ? (
                      <>
                        <div className="flex justify-between text-xs text-[var(--cromo-fg-muted)] mb-1.5">
                          <span>{t('ownedCount', { count: st.owned })}</span>
                          <span className="font-mono font-semibold text-[var(--cromo-fg)]">{st.percentage.toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-[var(--cromo-surface-2)] overflow-hidden mb-2">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${st.percentage}%`, background: tint.bar }}
                          />
                        </div>
                        <p className="text-[11px] text-[var(--cromo-fg-subtle)]">
                          {t('missingDuplicatesLine', { missing: st.missing, duplicates: st.duplicates })}
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
                    {t('viewCollectionGuide')}
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

        {/* Camera primer for new users — shown once, dismissed forever once
            the user either taps "Got it" or successfully grants camera access
            in the Scanner (which sets cromo:cameraPrimed). */}
        {showCameraPrimer && albums.length > 0 && (
          <div className="mb-6 flex items-start gap-3 rounded-card border border-[var(--cromo-border)] bg-[var(--cromo-surface)] p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-btn bg-[var(--cromo-accent-soft)] text-[var(--cromo-accent)]">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8a2 2 0 012-2h2l2-2h6l2 2h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--cromo-fg)] leading-tight">{t('primerTitle')}</p>
              <p className="text-xs text-[var(--cromo-fg-muted)] leading-tight mt-1">
                {t('primerBody')}
              </p>
            </div>
            <button
              onClick={() => {
                try { window.localStorage.setItem(PRIMER_DISMISS_KEY, '1'); } catch { /* ignore */ }
                setShowCameraPrimer(false);
              }}
              className="shrink-0 rounded-btn px-2.5 py-1 text-xs font-medium text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)]"
            >
              {t('gotIt')}
            </button>
          </div>
        )}

        {/* Resume scanning — surfaces only when there's a fresh lastScan
            pointer (set whenever the Scanner mounts for an album). One tap
            puts the user back in the same scanning context they left. */}
        {lastScan && albums.some((a) => a.id === lastScan.albumId) && (
          <div className="mb-8">
            <h2 className="text-xs font-semibold text-[var(--cromo-fg-subtle)] uppercase tracking-wider mb-3">
              {t('pickUpHeading')}
            </h2>
            <div className="flex items-center gap-3 rounded-card border border-[var(--cromo-accent)]/30 bg-[var(--cromo-accent-soft)] px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-btn bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)]">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 7V5a1 1 0 011-1h2M17 4h2a1 1 0 011 1v2M20 17v2a1 1 0 01-1 1h-2M7 20H5a1 1 0 01-1-1v-2" />
                  <circle cx="12" cy="12" r="3.5" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--cromo-fg)] leading-tight">{t('resumeScanning')}</p>
                <p className="text-xs text-[var(--cromo-fg-muted)] leading-tight mt-0.5 truncate">{lastScan.albumLabel}</p>
                {streak >= 2 && (
                  <p className="text-[11px] font-semibold text-[var(--cromo-accent)] mt-0.5">
                    🔥 {t('scanStreak', { count: streak })}
                  </p>
                )}
              </div>
              <Link
                href="/scan"
                className="shrink-0 rounded-btn bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--cromo-accent-strong)] transition-colors"
              >
                {t('continue')}
              </Link>
              <button
                aria-label={t('dismiss')}
                onClick={() => { clearLastScan(); setLastScan(null); }}
                className="shrink-0 text-[var(--cromo-fg-subtle)] hover:text-[var(--cromo-fg-muted)] p-1"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div>
          <h2 className="text-xs font-semibold text-[var(--cromo-fg-subtle)] uppercase tracking-wider mb-3">
            {t('quickLinks')}
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
                <div className="font-display font-semibold text-sm text-[var(--cromo-fg)]">{t('quickTrade')}</div>
                <div className="text-xs text-[var(--cromo-fg-muted)]">{t('quickTradeDesc')}</div>
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
                <div className="font-display font-semibold text-sm text-[var(--cromo-fg)]">{t('quickSettings')}</div>
                <div className="text-xs text-[var(--cromo-fg-muted)]">{t('quickSettingsDesc')}</div>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* Bulk action bar — anchored above the MobileTabBar via the shared
          --cromo-tabbar-h token (0px on desktop, h-14 + safe area on mobile). */}
      {selectMode && selectedIds.size > 0 && (
        <div
          className="fixed inset-x-0 z-40 border-t shadow-cromo-lg"
          style={{
            background: 'var(--cromo-surface)',
            borderColor: 'var(--cromo-border)',
            bottom: 'var(--cromo-tabbar-h)',
          }}
        >
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-[var(--cromo-fg)] mr-auto">
              {t('bulkSelectedAlbums', { count: selectedIds.size })}
            </span>
            {!confirmBulkDelete ? (
              <>
                <Button size="sm" variant="secondary" onClick={() => bulkSetTrade(true)} disabled={bulkBusy}>
                  {t('makeTradePublic')}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => bulkSetTrade(false)} disabled={bulkBusy}>
                  {t('makeTradePrivate')}
                </Button>
                <Button size="sm" variant="danger" onClick={() => setConfirmBulkDelete(true)} disabled={bulkBusy}>
                  {t('delete')}
                </Button>
              </>
            ) : (
              <>
                <span className="text-xs text-[var(--cromo-danger-text)]">
                  {t('bulkDeletePrompt', { count: selectedIds.size })}
                </span>
                <Button size="sm" variant="secondary" onClick={() => setConfirmBulkDelete(false)} disabled={bulkBusy}>
                  {t('cancel')}
                </Button>
                <Button size="sm" variant="danger" onClick={bulkDelete} loading={bulkBusy}>
                  {bulkBusy ? t('deleting') : t('confirmDelete')}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatLink({
  albumId,
  tab,
  children,
}: {
  albumId: string | undefined;
  tab: 'all' | 'have' | 'missing' | 'duplicates';
  children: React.ReactNode;
}) {
  if (!albumId) return <>{children}</>;
  return (
    <Link
      href={`/album/${albumId}?tab=${tab}`}
      className="block rounded-card transition-transform hover:-translate-y-0.5 hover:shadow-cromo focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cromo-accent)]"
    >
      {children}
    </Link>
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
