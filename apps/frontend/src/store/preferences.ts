import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AlbumEdition } from '@/lib/albumPages';

interface PreferencesState {
  duplicatesCountAllVariants: boolean;
  setDuplicatesCountAllVariants: (value: boolean) => void;
  albumEdition: AlbumEdition;
  setAlbumEdition: (edition: AlbumEdition) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      duplicatesCountAllVariants: false,
      setDuplicatesCountAllVariants: (value) => set({ duplicatesCountAllVariants: value }),
      albumEdition: 'north_america',
      setAlbumEdition: (edition) => set({ albumEdition: edition }),
    }),
    { name: 'stickfolio-preferences' },
  ),
);
