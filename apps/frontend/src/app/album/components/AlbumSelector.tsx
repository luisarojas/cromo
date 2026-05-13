'use client';

import { useRef, useState, useEffect } from 'react';
import { albumDisplayName, type UserAlbum } from '@/lib/api';

interface Props {
  albums: UserAlbum[];
  activeAlbumId: string | null;
  onSelect: (albumId: string) => void;
  onAddAlbum: () => void;
  onEditAlbum: (albumId: string) => void;
}

export default function AlbumSelector({ albums, activeAlbumId, onSelect, onAddAlbum, onEditAlbum }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const activeAlbum = albums.find((a) => a.id === activeAlbumId);

  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleDown);
    return () => document.removeEventListener('mousedown', handleDown);
  }, []);

  if (albums.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:border-gray-300 hover:bg-gray-50 transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate max-w-[200px]">
          {activeAlbum ? albumDisplayName(activeAlbum) : 'Select album'}
        </span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          className="absolute left-0 z-40 mt-1 w-72 rounded-xl border border-gray-200 bg-white shadow-xl py-1"
          role="listbox"
        >
          {albums.map((album) => (
            <div
              key={album.id}
              role="option"
              aria-selected={album.id === activeAlbumId}
              className={`flex items-center group ${album.id === activeAlbumId ? 'bg-blue-50' : 'hover:bg-gray-50'} transition-colors`}
            >
              <button
                onClick={() => {
                  onSelect(album.id);
                  setOpen(false);
                }}
                className="flex-1 flex items-start gap-2 px-3 py-2.5 text-left min-w-0"
              >
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium truncate ${album.id === activeAlbumId ? 'text-blue-700' : 'text-gray-800'}`}>
                    {albumDisplayName(album)}
                  </div>
                  {album.alias && (
                    <div className="text-[11px] text-gray-400 truncate mt-0.5">
                      {album.album_type_key === 'fifa_world_cup_2026' ? 'FIFA World Cup 2026™' : album.album_type_key}
                    </div>
                  )}
                </div>
                {album.is_default && (
                  <span className="shrink-0 mt-0.5 text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                    Default
                  </span>
                )}
                {album.id === activeAlbumId && (
                  <svg className="shrink-0 w-4 h-4 text-blue-600 mt-0.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  onEditAlbum(album.id);
                }}
                className="shrink-0 p-2 mr-1 text-gray-300 hover:text-gray-600 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity rounded"
                aria-label={`Edit ${albumDisplayName(album)}`}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
              </button>
            </div>
          ))}

          <div className="h-px bg-gray-100 mx-2 my-1" />

          <button
            onClick={() => {
              setOpen(false);
              onAddAlbum();
            }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-blue-600 hover:bg-blue-50 transition-colors font-medium"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Add new album
          </button>
        </div>
      )}
    </div>
  );
}
