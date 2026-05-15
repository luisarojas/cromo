'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { fetchPublicProfile, type PublicProfile } from '@/lib/api';

export default function PublicProfilePage() {
  const params = useParams();
  const username =
    typeof params.username === 'string' ? params.username : (params.username?.[0] ?? '');

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;

    let cancelled = false;

    async function load() {
      try {
        const data = await fetchPublicProfile(username);
        if (!cancelled) setProfile(data);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('404') || msg.includes('not found')) {
          setNotFound(true);
        } else {
          setError(msg || 'Failed to load profile');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [username]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="space-y-4">
          <div className="h-16 w-16 rounded-full bg-gray-200 animate-pulse" />
          <div className="h-6 w-40 rounded bg-gray-200 animate-pulse" />
          <div className="h-4 w-32 rounded bg-gray-200 animate-pulse" />
          <div className="h-32 rounded-xl bg-gray-200 animate-pulse" />
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10 text-center">
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-10">
          <div className="text-4xl mb-3">404</div>
          <h1 className="text-xl font-semibold text-gray-800 mb-2">User not found</h1>
          <p className="text-sm text-gray-500">
            The profile for <span className="font-medium">@{username}</span> does not exist.
          </p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error ?? 'Failed to load profile.'}
        </div>
      </div>
    );
  }

  const stats = profile.collectionStats;
  const displayName = profile.displayName ?? `@${profile.username}`;
  const memberSince = new Date(profile.memberSince).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      {/* Profile header */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 mb-5">
        <div className="flex items-center gap-4">
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatarUrl}
              alt={displayName}
              className="h-16 w-16 rounded-full object-cover border border-gray-200"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-blue-600 text-2xl font-bold text-white">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{displayName}</h1>
            {profile.displayName && (
              <div className="text-sm text-gray-500">@{profile.username}</div>
            )}
            <div className="text-xs text-gray-400 mt-1">Member since {memberSince}</div>
          </div>
        </div>
      </div>

      {/* Collection stats */}
      {stats ? (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Collection Stats</h2>

          {/* Progress bar */}
          <div className="mb-5">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Collection progress</span>
              <span>{stats.percentage.toFixed(1)}%</span>
            </div>
            <div className="h-3 w-full rounded-full bg-gray-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-green-500 transition-all duration-700"
                style={{ width: `${Math.min(stats.percentage, 100)}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total', value: stats.total, color: 'text-gray-800', bg: 'bg-white' },
              { label: 'Owned', value: stats.owned, color: 'text-green-600', bg: 'bg-green-50' },
              { label: 'Missing', value: stats.missing, color: 'text-red-500', bg: 'bg-red-50' },
              { label: 'Duplicates', value: stats.duplicates, color: 'text-amber-500', bg: 'bg-amber-50' },
            ].map(({ label, value, color, bg }) => (
              <div
                key={label}
                className={`rounded-xl border border-gray-200 ${bg} p-3 flex flex-col items-center shadow-sm`}
              >
                <span className={`text-xl font-extrabold ${color}`}>{value}</span>
                <span className="text-xs text-gray-500 mt-0.5">{label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 text-center">
          <p className="text-sm text-gray-500">This user&apos;s collection is private.</p>
        </div>
      )}
    </div>
  );
}
