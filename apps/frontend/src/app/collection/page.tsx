'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  fetchUserAlbums,
  fetchAlbumStats,
  fetchAlbumEditions,
  fetchAlbumFormats,
  fetchAllStickersCached,
  createUserAlbum,
  updateUserAlbum,
  deleteUserAlbum,
  setDefaultUserAlbum,
  albumDisplayName,
  DEFAULT_ALBUM_TYPE_KEY,
  type AlbumEditionOption,
  type AlbumFormatOption,
  type AlbumSettings,
  type AlbumStats,
  type Sticker,
  type UserAlbum,
} from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useAlbumsStore } from '@/store/albums';
import AlbumFormModal from './components/AlbumFormModal';

const MAX_ALBUMS = 10;

const EDITION_COLORS: Record<string, { bg: string; text: string }> = {
  north_america: { bg: 'bg-[var(--cromo-accent-soft)]', text: 'text-[var(--cromo-accent)]' },
  international: { bg: 'bg-[var(--cromo-success-soft)]', text: 'text-[var(--cromo-success-text)]' },
  swiss_gold: { bg: 'bg-[var(--cromo-warning-soft)]', text: 'text-[var(--cromo-warning-text)]' },
  south_america: { bg: 'bg-[var(--cromo-tier-very-rare)]/10', text: 'text-[var(--cromo-tier-very-rare)]' },
};

export default function AlbumsPage() {
  const t = useTranslations('albumList');
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);

  const albums = useAlbumsStore((s) => s.albums);
  const setAlbums = useAlbumsStore((s) => s.setAlbums);
  const upsertAlbum = useAlbumsStore((s) => s.upsertAlbum);
  const removeAlbum = useAlbumsStore((s) => s.removeAlbum);

  const [albumStats, setAlbumStats] = useState<Map<string, AlbumStats>>(new Map());
  const [editions, setEditions] = useState<AlbumEditionOption[]>([]);
  const [formats, setFormats] = useState<AlbumFormatOption[]>([]);
  // Loaded lazily when opening the modal so it can show sticker-count hints.
  const [modalStickers, setModalStickers] = useState<Sticker[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAlbum, setEditingAlbum] = useState<UserAlbum | null>(null);

  const tokenRef = useRef(token);
  const userRef = useRef(user);
  tokenRef.current = token;
  userRef.current = user;

  useEffect(() => {
    if (!hydrated) return;
    if (!token || !user) {
      router.replace('/login');
      return;
    }

    let cancelled = false;

    async function init() {
      const tok = tokenRef.current;
      const usr = userRef.current;
      if (!tok || !usr) return;
      setLoading(true);
      setError(null);
      try {
        const [userAlbums, statsList, editionList, formatList] = await Promise.all([
          fetchUserAlbums(usr.id, tok),
          fetchAlbumStats(usr.id, tok),
          fetchAlbumEditions(DEFAULT_ALBUM_TYPE_KEY),
          fetchAlbumFormats(DEFAULT_ALBUM_TYPE_KEY),
        ]);
        if (cancelled) return;
        setAlbums(userAlbums);
        setEditions(editionList);
        setFormats(formatList);

        if (userAlbums.length === 1) {
          router.replace(`/album/${userAlbums[0].id}`);
          return;
        }

        setAlbumStats(new Map(statsList.map((s) => [s.albumId, s])));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t('failedToLoad'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, token, user, router]);

  // Lazy-load the catalog when the modal is about to open. Cached in localStorage.
  const ensureModalStickers = useCallback(async () => {
    if (modalStickers) return;
    const tok = tokenRef.current;
    if (!tok) return;
    try {
      const all = await fetchAllStickersCached(tok);
      setModalStickers(all);
    } catch { /* show modal without counts if catalog fetch fails */ }
  }, [modalStickers]);

  const handleOpenAdd = useCallback(() => {
    setShowAddModal(true);
    void ensureModalStickers();
  }, [ensureModalStickers]);

  const handleOpenEdit = useCallback((album: UserAlbum) => {
    setEditingAlbum(album);
    void ensureModalStickers();
  }, [ensureModalStickers]);

  const handleAddAlbum = useCallback(
    async (data: { alias: string | null; notes: string | null; edition: string; format: string; settings: AlbumSettings; tradeInventoryVisibility: 'private' | 'unlisted' | 'public' }) => {
      const tok = tokenRef.current;
      const usr = userRef.current;
      if (!tok || !usr) throw new Error('Not authenticated');
      const created = await createUserAlbum(usr.id, data, tok);
      upsertAlbum(created);
      setAlbumStats((prev) => new Map(prev).set(created.id, created.stats));
    },
    [upsertAlbum]
  );

  const handleSaveAlbum = useCallback(
    async (data: { alias: string | null; notes: string | null; edition: string; format: string; settings: AlbumSettings; tradeInventoryVisibility: 'private' | 'unlisted' | 'public' }) => {
      const tok = tokenRef.current;
      const usr = userRef.current;
      if (!tok || !usr || !editingAlbum) throw new Error('Not authenticated');
      const updated = await updateUserAlbum(usr.id, editingAlbum.id, data, tok);
      upsertAlbum(updated);
      setAlbumStats((prev) => new Map(prev).set(updated.id, updated.stats));
    },
    [editingAlbum, upsertAlbum]
  );

  const handleDeleteAlbum = useCallback(async () => {
    const tok = tokenRef.current;
    const usr = userRef.current;
    if (!tok || !usr || !editingAlbum) throw new Error('Not authenticated');
    await deleteUserAlbum(usr.id, editingAlbum.id, tok);
    removeAlbum(editingAlbum.id);
    setAlbumStats((prev) => {
      const next = new Map(prev);
      next.delete(editingAlbum.id);
      return next;
    });
  }, [editingAlbum, removeAlbum]);

  const handleSetDefault = useCallback(
    async (albumId: string) => {
      const tok = tokenRef.current;
      const usr = userRef.current;
      if (!tok || !usr) return;
      try {
        await setDefaultUserAlbum(usr.id, albumId, tok);
        const fresh = await fetchUserAlbums(usr.id, tok);
        setAlbums(fresh);
      } catch (err) {
        console.error('Failed to set default album', err);
      }
    },
    [setAlbums]
  );

  if (!hydrated || (!token && hydrated)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-[var(--cromo-fg-subtle)] text-sm">
        {t('loading')}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[var(--cromo-fg)]">{t('title')}</h1>
          </div>
          {albums.length < MAX_ALBUMS && !loading && (
            <button
              onClick={handleOpenAdd}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--cromo-accent)] px-4 py-2 text-sm font-medium text-[var(--cromo-accent-fg)] hover:bg-[var(--cromo-accent-strong)] transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              {t('newAlbum')}
            </button>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-[var(--cromo-danger-soft)] border border-[var(--cromo-danger)]/30 p-3 text-sm text-[var(--cromo-danger-text)] mb-6">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-44 rounded-xl bg-[var(--cromo-surface-2)] animate-pulse" />
            ))}
          </div>
        ) : albums.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-[var(--cromo-fg-subtle)] mb-4">{t('noAlbumsYet')}</p>
            <button
              onClick={handleOpenAdd}
              className="rounded-lg bg-[var(--cromo-accent)] px-5 py-2.5 text-sm font-medium text-[var(--cromo-accent-fg)] hover:bg-[var(--cromo-accent-strong)] transition-colors"
            >
              {t('addFirstAlbum')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {albums.map((album) => {
              const stats = albumStats.get(album.id);
              const colors = EDITION_COLORS[album.edition] ?? { bg: 'bg-[var(--cromo-surface-2)]', text: 'text-[var(--cromo-fg-muted)]' };
              return (
                <div
                  key={album.id}
                  className="relative group bg-[var(--cromo-surface)] rounded-xl border border-[var(--cromo-border)] hover:border-[var(--cromo-border-strong)] hover:border-[var(--cromo-accent)]/30 transition-all overflow-hidden"
                >
                  <Link href={`/album/${album.id}`} className="block p-5">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex-1 min-w-0">
                        <h2 className="font-semibold text-[var(--cromo-fg)] truncate leading-snug">
                          {albumDisplayName(album)}
                        </h2>
                        {album.alias && (
                          <p className="text-[11px] text-[var(--cromo-fg-subtle)] truncate mt-0.5 leading-snug">
                            {album.albumTypeName}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                            {album.editionName}
                          </span>
                          <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--cromo-surface-2)] text-[var(--cromo-fg-muted)]">
                            {album.formatName}
                          </span>
                        </div>
                        {album.notes && (
                          <p className="text-[11px] text-[var(--cromo-fg-subtle)] italic truncate mt-1">
                            {album.notes}
                          </p>
                        )}
                      </div>
                      {album.isDefault && (
                        <svg
                          className="w-4 h-4 text-[var(--cromo-warning-text)] shrink-0 mt-0.5"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-label={t('defaultAlbum')}
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      )}
                    </div>

                    {stats ? (
                      <>
                        <div className="flex justify-between text-xs text-[var(--cromo-fg-muted)] mb-1.5">
                          <span>{t('ownedCount', { count: stats.owned })}</span>
                          <span className="font-medium">{stats.percentage.toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-[var(--cromo-surface-2)] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[var(--cromo-success)] transition-all"
                            style={{ width: `${stats.percentage}%` }}
                          />
                        </div>
                        <p className="text-xs text-[var(--cromo-fg-subtle)] mt-2.5">
                          {t('missingDuplicatesLine', { missing: stats.missing, duplicates: stats.duplicates })}
                        </p>
                      </>
                    ) : (
                      <div className="space-y-2">
                        <div className="h-3 rounded bg-[var(--cromo-surface-2)] animate-pulse" />
                        <div className="h-1.5 rounded-full bg-[var(--cromo-surface-2)] animate-pulse" />
                      </div>
                    )}
                  </Link>

                  {album.albumTypeGuidePath && (
                    <Link
                      href={album.albumTypeGuidePath}
                      className="block px-5 py-2 text-[11px] text-[var(--cromo-accent)] hover:underline border-t border-[var(--cromo-border)] bg-[var(--cromo-accent-soft)]/40 hover:bg-[var(--cromo-accent-soft)] transition-colors"
                    >
                      {t('viewCollectionGuide')}
                    </Link>
                  )}

                  {/* Card actions — always visible on touch; on desktop they
                      fade in on card hover to keep the grid restful. */}
                  <div className="absolute top-3 right-3 flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    {!album.isDefault && (
                      <button
                        onClick={(e) => { e.preventDefault(); handleSetDefault(album.id); }}
                        className="p-2 rounded-lg text-[var(--cromo-fg-subtle)] bg-[var(--cromo-surface)]/80 md:bg-transparent hover:text-[var(--cromo-warning-text)] hover:bg-[var(--cromo-warning-soft)] transition-colors"
                        title={t('setAsDefault')}
                        aria-label={t('setAsDefault')}
                      >
                        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.preventDefault(); handleOpenEdit(album); }}
                      className="p-2 rounded-lg text-[var(--cromo-fg-subtle)] bg-[var(--cromo-surface)]/80 md:bg-transparent hover:text-[var(--cromo-fg-muted)] hover:bg-[var(--cromo-surface-2)] transition-colors"
                      title={t('editAlbum')}
                      aria-label={t('editAlbum')}
                    >
                      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showAddModal && (
        <AlbumFormModal
          mode="create"
          editions={editions}
          formats={formats}
          allStickers={modalStickers ?? undefined}
          onConfirm={handleAddAlbum}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {editingAlbum && (
        <AlbumFormModal
          mode="edit"
          album={editingAlbum}
          editions={editions}
          formats={formats}
          allStickers={modalStickers ?? undefined}
          onConfirm={handleSaveAlbum}
          onDelete={handleDeleteAlbum}
          onClose={() => setEditingAlbum(null)}
        />
      )}
    </div>
  );
}
