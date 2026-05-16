'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  fetchUserAlbums,
  fetchAlbumStats,
  fetchAlbumEditions,
  fetchAllStickersCached,
  createUserAlbum,
  updateUserAlbum,
  deleteUserAlbum,
  setDefaultUserAlbum,
  albumDisplayName,
  DEFAULT_ALBUM_TYPE_KEY,
  type AlbumEditionOption,
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
  north_america: { bg: 'bg-blue-100', text: 'text-blue-700' },
  international: { bg: 'bg-green-100', text: 'text-green-700' },
  swiss_gold:    { bg: 'bg-amber-100', text: 'text-amber-700' },
  south_america: { bg: 'bg-purple-100', text: 'text-purple-700' },
};

export default function AlbumsPage() {
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
        const [userAlbums, statsList, editionList] = await Promise.all([
          fetchUserAlbums(usr.id, tok),
          fetchAlbumStats(usr.id, tok),
          fetchAlbumEditions(DEFAULT_ALBUM_TYPE_KEY),
        ]);
        if (cancelled) return;
        setAlbums(userAlbums);
        setEditions(editionList);

        if (userAlbums.length === 1) {
          router.replace(`/album/${userAlbums[0].id}`);
          return;
        }

        setAlbumStats(new Map(statsList.map((s) => [s.albumId, s])));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load albums');
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
    async (data: { alias: string | null; edition: string; settings: AlbumSettings; isTradeInventoryPublic: boolean }) => {
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
    async (data: { alias: string | null; edition: string; settings: AlbumSettings; isTradeInventoryPublic: boolean }) => {
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
      <div className="flex items-center justify-center min-h-[60vh] text-gray-400 text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">My Albums</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {user?.displayName ?? `@${user?.username}`}
            </p>
          </div>
          {albums.length < MAX_ALBUMS && !loading && (
            <button
              onClick={handleOpenAdd}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              New Album
            </button>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 mb-6">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-44 rounded-xl bg-gray-200 animate-pulse" />
            ))}
          </div>
        ) : albums.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400 mb-4">No albums yet.</p>
            <button
              onClick={handleOpenAdd}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Add your first album
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {albums.map((album) => {
              const stats = albumStats.get(album.id);
              const colors = EDITION_COLORS[album.edition] ?? { bg: 'bg-gray-100', text: 'text-gray-600' };
              return (
                <div
                  key={album.id}
                  className="relative group bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-200 transition-all overflow-hidden"
                >
                  <Link href={`/album/${album.id}`} className="block p-5">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex-1 min-w-0">
                        <h2 className="font-semibold text-gray-800 truncate leading-snug">
                          {albumDisplayName(album)}
                        </h2>
                        {album.alias && (
                          <p className="text-[11px] text-gray-400 truncate mt-0.5 leading-snug">
                            {album.albumTypeName}
                          </p>
                        )}
                        <span className={`inline-block mt-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                          {album.editionName}
                        </span>
                      </div>
                      {album.isDefault && (
                        <svg
                          className="w-4 h-4 text-amber-400 shrink-0 mt-0.5"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-label="Default album"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      )}
                    </div>

                    {stats ? (
                      <>
                        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                          <span>{stats.owned} owned</span>
                          <span className="font-medium">{stats.percentage.toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-green-500 transition-all"
                            style={{ width: `${stats.percentage}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-400 mt-2.5">
                          {stats.missing} missing · {stats.duplicates} duplicates
                        </p>
                      </>
                    ) : (
                      <div className="space-y-2">
                        <div className="h-3 rounded bg-gray-100 animate-pulse" />
                        <div className="h-1.5 rounded-full bg-gray-100 animate-pulse" />
                      </div>
                    )}
                  </Link>

                  {/* Hover actions */}
                  <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!album.isDefault && (
                      <button
                        onClick={(e) => { e.preventDefault(); handleSetDefault(album.id); }}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-amber-500 hover:bg-amber-50 transition-colors"
                        title="Set as default"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.preventDefault(); handleOpenEdit(album); }}
                      className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                      title="Edit album"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
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
          allStickers={modalStickers ?? undefined}
          onConfirm={handleSaveAlbum}
          onDelete={handleDeleteAlbum}
          onClose={() => setEditingAlbum(null)}
        />
      )}
    </div>
  );
}
