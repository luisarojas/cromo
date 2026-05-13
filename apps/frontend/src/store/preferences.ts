import { create } from 'zustand';
import type { AlbumEdition } from '@/lib/albumPages';

interface PreferencesState {
  duplicatesCountAllVariants: boolean;
  albumEdition: AlbumEdition;
  loaded: boolean;

  setFromServer: (prefs: { duplicatesCountAllVariants: boolean; albumEdition: AlbumEdition }) => void;
  setDuplicatesCountAllVariants: (value: boolean) => void;
  setAlbumEdition: (edition: AlbumEdition) => void;
  reset: () => void;
}

const DEFAULTS = {
  duplicatesCountAllVariants: false,
  albumEdition: 'north_america' as AlbumEdition,
};

export const usePreferencesStore = create<PreferencesState>((set) => ({
  ...DEFAULTS,
  loaded: false,

  setFromServer: (prefs) =>
    set({ duplicatesCountAllVariants: prefs.duplicatesCountAllVariants, albumEdition: prefs.albumEdition as AlbumEdition, loaded: true }),
  setDuplicatesCountAllVariants: (value) => set({ duplicatesCountAllVariants: value }),
  setAlbumEdition: (edition) => set({ albumEdition: edition }),
  reset: () => set({ ...DEFAULTS, loaded: false }),
}));
