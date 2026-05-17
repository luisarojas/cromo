'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  fetchStats,
  fetchUserAlbums,
  fetchAlbumStats,
  albumDisplayName,
  type CollectionStats,
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

  const [stats, setStats] = useState<CollectionStats | null>(null);
  const [albumStats, setAlbumStats] = useState<Map<string, AlbumStats>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        const [aggregateStats, userAlbums, statsList] = await Promise.all([
          fetchStats(user.id, token),
          fetchUserAlbums(user.id, token),
          fetchAlbumStats(user.id, token),
        ]);
        if (cancelled) return;
        setStats(aggregateStats);
        setAlbums(userAlbums);
        setAlbumStats(new Map(statsList.map((s) => [s.albumId, s])));
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
  }, [hydrated, token, user, router]);

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
                { label: 'Total',      value: stats?.total      ?? 0, color: 'text-gray-800', bg: 'bg-white',     border: 'border-gray-200'  },
                { label: 'Owned',      value: stats?.owned      ?? 0, color: 'text-green-600', bg: 'bg-green-50',  border: 'border-green-100' },
                { label: 'Missing',    value: stats?.missing    ?? 0, color: 'text-red-500',   bg: 'bg-red-50',    border: 'border-red-100'   },
                { label: 'Duplicates', value: stats?.duplicates ?? 0, color: 'text-amber-500', bg: 'bg-amber-50',  border: 'border-amber-100' },
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
        {stats && !loading && (
          <div className="mb-8">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Overall progress</span>
              <span>{stats.percentage.toFixed(1)}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden mb-2">
              <div
                className="h-full rounded-full bg-green-500 transition-all duration-700"
                style={{ width: `${stats.percentage}%` }}
              />
            </div>
            {insightText && (
              <p className="text-xs text-gray-400">{insightText}</p>
            )}
          </div>
        )}

        {/* Albums */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Albums</h2>
            <Link
              href="/album"
              className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
            >
              Manage →
            </Link>
          </div>

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
              {albums.map((album) => {
                const st = albumStats.get(album.id);
                const colors = EDITION_COLORS[album.edition] ?? { bg: 'bg-gray-100', text: 'text-gray-600', bar: 'bg-gray-500' };
                return (
                  <Link
                    key={album.id}
                    href={`/album/${album.id}`}
                    className="group block bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-200 transition-all p-4"
                  >
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
                      {album.isDefault && (
                        <svg className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor" aria-label="Default album">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
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
                  </Link>
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
    </div>
  );
}
