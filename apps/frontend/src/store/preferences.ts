import { create } from 'zustand';
import type { City } from '@/lib/api';

interface PreferencesState {
  duplicatesCountAllVariants: boolean;
  cities: City[];
  loaded: boolean;

  setFromServer: (prefs: { duplicatesCountAllVariants: boolean; cities: City[] }) => void;
  setDuplicatesCountAllVariants: (value: boolean) => void;
  setCities: (cities: City[]) => void;
  reset: () => void;
}

const DEFAULTS = {
  duplicatesCountAllVariants: false,
  cities: [] as City[],
};

export const usePreferencesStore = create<PreferencesState>((set) => ({
  ...DEFAULTS,
  loaded: false,

  setFromServer: (prefs) =>
    set({ duplicatesCountAllVariants: prefs.duplicatesCountAllVariants, cities: prefs.cities, loaded: true }),
  setDuplicatesCountAllVariants: (value) => set({ duplicatesCountAllVariants: value }),
  setCities: (cities) => set({ cities }),
  reset: () => set({ ...DEFAULTS, loaded: false }),
}));
