import { create } from 'zustand';
import type { UserAlbum } from '@/lib/api';

interface AlbumsState {
  albums: UserAlbum[];
  activeAlbumId: string | null;

  setAlbums: (albums: UserAlbum[]) => void;
  setActiveAlbumId: (id: string) => void;
  upsertAlbum: (album: UserAlbum) => void;
  removeAlbum: (id: string) => void;
  reset: () => void;
}

export const useAlbumsStore = create<AlbumsState>((set) => ({
  albums: [],
  activeAlbumId: null,

  setAlbums: (albums) => {
    const defaultAlbum = albums.find((a) => a.is_default) ?? albums[0];
    set((state) => ({
      albums,
      activeAlbumId: state.activeAlbumId
        ? (albums.find((a) => a.id === state.activeAlbumId) ? state.activeAlbumId : (defaultAlbum?.id ?? null))
        : (defaultAlbum?.id ?? null),
    }));
  },

  setActiveAlbumId: (id) => set({ activeAlbumId: id }),

  upsertAlbum: (album) =>
    set((state) => {
      const existing = state.albums.findIndex((a) => a.id === album.id);
      if (existing >= 0) {
        const updated = [...state.albums];
        updated[existing] = album;
        return { albums: updated };
      }
      return { albums: [...state.albums, album] };
    }),

  removeAlbum: (id) =>
    set((state) => ({
      albums: state.albums.filter((a) => a.id !== id),
      activeAlbumId: state.activeAlbumId === id
        ? (state.albums.find((a) => a.id !== id && a.is_default)?.id
            ?? state.albums.find((a) => a.id !== id)?.id
            ?? null)
        : state.activeAlbumId,
    })),

  reset: () => set({ albums: [], activeAlbumId: null }),
}));
