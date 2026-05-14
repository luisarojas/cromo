import { create } from 'zustand';
import type { UserAlbum } from '@/lib/api';

interface AlbumsState {
  albums: UserAlbum[];
  setAlbums: (albums: UserAlbum[]) => void;
  upsertAlbum: (album: UserAlbum) => void;
  removeAlbum: (id: string) => void;
  reset: () => void;
}

export const useAlbumsStore = create<AlbumsState>((set) => ({
  albums: [],

  setAlbums: (albums) => set({ albums }),

  upsertAlbum: (album) =>
    set((state) => {
      const idx = state.albums.findIndex((a) => a.id === album.id);
      if (idx >= 0) {
        const updated = [...state.albums];
        updated[idx] = album;
        return { albums: updated };
      }
      return { albums: [...state.albums, album] };
    }),

  removeAlbum: (id) =>
    set((state) => ({ albums: state.albums.filter((a) => a.id !== id) })),

  reset: () => set({ albums: [] }),
}));
