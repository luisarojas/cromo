'use client';

import { useEffect, useState } from 'react';
import { albumDisplayName, type UserAlbum } from '@/lib/api';

// Slides up from the bottom while a sticker drag is in progress, showing the
// user's *other* albums as drop targets. Lives outside the StickerGrid so it
// can listen to drag events on the document root and stay visible regardless
// of where in the page the cursor is.
//
// The drag payload is a JSON string written into the dataTransfer with the
// custom mime type `application/x-cromo-sticker`; we read it back here to
// know which sticker is being dragged. No reliance on cross-origin types.

export const DRAG_MIME = 'application/x-cromo-sticker';

export interface DragPayload {
  stickerId: string;
  fromAlbumId: string;
  // We carry just enough display info to label the drag preview / dock — full
  // sticker hydration happens on drop via the existing variant lookup.
  albumCode: string;
  playerName: string | null;
}

interface Props {
  albums: UserAlbum[];
  currentAlbumId: string;
  // Fires when the user drops on an album target. Caller resolves the variant
  // id and invokes moveSticker.
  onDropOnAlbum: (payload: DragPayload, targetAlbumId: string) => void;
}

export default function AlbumDropDock({ albums, currentAlbumId, onDropOnAlbum }: Props) {
  const [dragging, setDragging] = useState<DragPayload | null>(null);
  const [overAlbumId, setOverAlbumId] = useState<string | null>(null);

  // Listen for drag start/end at the document level. dragstart fires on any
  // descendant element when its draggable child begins a drag; we filter for
  // our custom mime type so we don't show the dock for non-sticker drags
  // (e.g. text selection drags).
  useEffect(() => {
    function onStart(e: DragEvent) {
      const data = e.dataTransfer?.getData(DRAG_MIME);
      // dataTransfer.getData is only readable during 'drop' on most browsers;
      // for dragstart we instead rely on the element having a marker.
      const target = e.target as HTMLElement | null;
      const raw = target?.dataset?.cromoDrag;
      if (!raw && !data) return;
      try {
        const payload = JSON.parse(raw ?? data!) as DragPayload;
        setDragging(payload);
      } catch {
        // ignore malformed payloads
      }
    }
    function onEnd() {
      setDragging(null);
      setOverAlbumId(null);
    }
    document.addEventListener('dragstart', onStart);
    document.addEventListener('dragend', onEnd);
    return () => {
      document.removeEventListener('dragstart', onStart);
      document.removeEventListener('dragend', onEnd);
    };
  }, []);

  if (!dragging) return null;

  const others = albums.filter((a) => a.id !== currentAlbumId);
  if (others.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Drop on album"
      className="hidden md:flex fixed inset-x-0 bottom-4 z-40 justify-center pointer-events-none"
    >
      <div className="pointer-events-auto bg-[var(--cromo-surface)] border border-[var(--cromo-border)] rounded-2xl shadow-cromo-lg p-3 flex items-start gap-3 max-w-3xl">
        <div className="text-xs font-medium text-[var(--cromo-fg-muted)] pr-3 border-r border-[var(--cromo-border)] shrink-0 self-stretch flex flex-col justify-center">
          <div>Drop on album</div>
          <div className="font-mono text-[10px] text-[var(--cromo-fg-subtle)] mt-0.5 max-w-[10rem] truncate">
            {dragging.albumCode}{dragging.playerName ? ` · ${dragging.playerName}` : ''}
          </div>
        </div>
        {/* flex-wrap so a user with many albums sees rows of targets rather
            than buttons sliding off the right edge of the dock. */}
        <ul className="flex flex-wrap items-center gap-2">
          {others.map((album) => {
            const isOver = overAlbumId === album.id;
            return (
              <li key={album.id}>
                <div
                  onDragEnter={() => setOverAlbumId(album.id)}
                  onDragLeave={() => setOverAlbumId((cur) => (cur === album.id ? null : cur))}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const raw = e.dataTransfer.getData(DRAG_MIME);
                    if (!raw) return;
                    try {
                      const payload = JSON.parse(raw) as DragPayload;
                      onDropOnAlbum(payload, album.id);
                    } catch { /* ignore */ }
                    setDragging(null);
                    setOverAlbumId(null);
                  }}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    isOver
                      ? 'border-[var(--cromo-accent)] bg-[var(--cromo-accent-soft)] text-[var(--cromo-accent)]'
                      : 'border-[var(--cromo-border-strong)] text-[var(--cromo-fg)]'
                  }`}
                >
                  {albumDisplayName(album)}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
