'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { fetchUserAlbums, albumDisplayName, type UserAlbum } from '@/lib/api';
import Scanner from './Scanner';
import { readLastScan } from '@/lib/lastScan';

export default function ScanPage() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);

  const [albums, setAlbums] = useState<UserAlbum[] | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<UserAlbum | null>(null);

  useEffect(() => {
    if (!user || !token) return;
    fetchUserAlbums(user.id, token)
      .then((list) => {
        setAlbums(list);
        // Auto-pick when there's only one album, so the picker step is skipped.
        if (list.length === 1) {
          setSelectedAlbum(list[0]!);
          return;
        }
        // If the user scanned recently and that album still exists, skip the
        // picker and resume on the same album. Cuts a step out of the common
        // "open the app, keep adding to the album I'm working through" loop.
        const last = readLastScan();
        if (last) {
          const match = list.find((a) => a.id === last.albumId);
          if (match) setSelectedAlbum(match);
        }
      })
      .catch(() => setAlbums([]));
  }, [user, token]);

  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center text-sm text-[var(--cromo-fg-muted)]">
        Please log in to use the sticker scanner.
      </div>
    );
  }

  if (albums === null) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center text-sm text-[var(--cromo-fg-subtle)]">
        Loading…
      </div>
    );
  }

  if (albums.length === 0) {
    return (
      <main className="max-w-lg mx-auto px-4 py-10 text-center space-y-4">
        <h1 className="text-2xl font-bold text-[var(--cromo-fg)]">Scan Stickers</h1>
        <p className="text-sm text-[var(--cromo-fg-muted)]">
          You need an album before you can scan stickers into your collection.
        </p>
        <Link
          href="/album"
          className="inline-block rounded-lg bg-[var(--cromo-accent)] text-[var(--cromo-accent-fg)] px-5 py-2.5 text-sm font-medium hover:bg-[var(--cromo-accent-strong)]"
        >
          Create your first album
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-[var(--cromo-fg)] mb-1">Scan Stickers</h1>
      <p className="text-sm text-[var(--cromo-fg-muted)] mb-6">
        Upload one or more sticker photos and AI will identify them for you.
      </p>

      {selectedAlbum ? (
        <Scanner
          album={selectedAlbum}
          // Only allow "Change" when there's another album to switch to.
          onChangeAlbum={albums.length > 1 ? () => setSelectedAlbum(null) : undefined}
        />
      ) : (
        <AlbumPicker albums={albums} onPick={setSelectedAlbum} />
      )}
    </main>
  );
}

function AlbumPicker({
  albums,
  onPick,
}: {
  albums: UserAlbum[];
  onPick: (album: UserAlbum) => void;
}) {
  // Surface the default first; everything else in the order returned by the API.
  const sorted = [...albums].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-[var(--cromo-fg)]">Which album are these stickers for?</p>
      <ul className="space-y-2">
        {sorted.map((album) => (
          <li key={album.id}>
            <button
              onClick={() => onPick(album)}
              className="w-full text-left rounded-xl border border-[var(--cromo-border)] bg-[var(--cromo-surface)] hover:border-[var(--cromo-accent)]/40 hover:bg-[var(--cromo-accent-soft)]/40 transition-colors px-4 py-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--cromo-fg)] truncate">
                  {albumDisplayName(album)}
                  {album.isDefault && (
                    <span className="ml-2 text-[11px] font-normal text-[var(--cromo-warning-text)]">· Default</span>
                  )}
                </p>
                <p className="text-xs text-[var(--cromo-fg-subtle)] truncate">
                  {album.editionName} Edition · {album.formatName}
                </p>
              </div>
              <svg className="w-4 h-4 text-[var(--cromo-fg-subtle)] shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
