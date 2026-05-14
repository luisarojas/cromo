'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { fetchStats, type CollectionStats } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

export default function DashboardPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);

  const [stats, setStats] = useState<CollectionStats | null>(null);
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
        const data = await fetchStats(user.id, token);
        if (!cancelled) setStats(data);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Failed to load stats');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [hydrated, token, user, router]);

  if (!hydrated || (!token && hydrated)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-gray-400 text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {loading
          ? [...Array(4)].map((_, i) => (
              <div
                key={i}
                className="h-20 rounded-xl bg-gray-200 animate-pulse"
              />
            ))
          : [
              {
                label: 'Total',
                value: stats?.total ?? 0,
                color: 'text-gray-800',
                bg: 'bg-white',
              },
              {
                label: 'Owned',
                value: stats?.owned ?? 0,
                color: 'text-green-600',
                bg: 'bg-green-50',
              },
              {
                label: 'Missing',
                value: stats?.missing ?? 0,
                color: 'text-red-500',
                bg: 'bg-red-50',
              },
              {
                label: 'Duplicates',
                value: stats?.duplicates ?? 0,
                color: 'text-amber-500',
                bg: 'bg-amber-50',
              },
            ].map(({ label, value, color, bg }) => (
              <div
                key={label}
                className={`rounded-xl border border-gray-200 ${bg} p-4 flex flex-col items-center shadow-sm`}
              >
                <span className={`text-2xl font-extrabold ${color}`}>
                  {value}
                </span>
                <span className="text-xs text-gray-500 mt-0.5">{label}</span>
              </div>
            ))}
      </div>

      {stats && !loading && (
        <div className="mb-8">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Collection progress</span>
            <span>{stats.percentage.toFixed(1)}%</span>
          </div>
          <div className="h-3 w-full rounded-full bg-gray-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-green-500 transition-all duration-700"
              style={{ width: `${stats.percentage}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/album"
          className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 hover:bg-blue-100 transition-colors group"
        >
          <div>
            <div className="font-semibold text-blue-700 group-hover:underline">
              Go to Album
            </div>
            <div className="text-xs text-blue-500 mt-0.5">
              Browse, add and manage your stickers
            </div>
          </div>
        </Link>
        {user?.role === 'admin' && (
          <Link
            href="/admin/stickers"
            className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-4 hover:bg-gray-50 transition-colors group"
          >
            <div>
              <div className="font-semibold text-gray-700 group-hover:underline">
                Admin — Stickers
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                Correct player names, positions and metadata
              </div>
            </div>
          </Link>
        )}
        {user?.role === 'admin' && (
          <Link
            href="/admin/users"
            className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-4 hover:bg-gray-50 transition-colors group"
          >
            <div>
              <div className="font-semibold text-gray-700 group-hover:underline">
                Admin — Users
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                Manage roles, bans and accounts
              </div>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}
