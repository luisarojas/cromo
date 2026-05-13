import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PreferencesState {
  duplicatesCountAllVariants: boolean;
  setDuplicatesCountAllVariants: (value: boolean) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      duplicatesCountAllVariants: false,
      setDuplicatesCountAllVariants: (value) => set({ duplicatesCountAllVariants: value }),
    }),
    { name: 'stickfolio-preferences' },
  ),
);
