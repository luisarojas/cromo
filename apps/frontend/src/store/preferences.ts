import { create } from 'zustand';
import type { BaseVariantPreference, City, UserPreferences } from '@/lib/api';

interface PreferencesState {
  duplicatesCountAllVariants: boolean;
  defaultBaseVariant: BaseVariantPreference;
  cities: City[];
  loaded: boolean;

  setFromServer: (prefs: UserPreferences) => void;
  setDuplicatesCountAllVariants: (value: boolean) => void;
  setDefaultBaseVariant: (value: BaseVariantPreference) => void;
  setCities: (cities: City[]) => void;
  reset: () => void;
}

const DEFAULTS = {
  duplicatesCountAllVariants: false,
  defaultBaseVariant: 'base_border' as BaseVariantPreference,
  cities: [] as City[],
};

export const usePreferencesStore = create<PreferencesState>((set) => ({
  ...DEFAULTS,
  loaded: false,

  setFromServer: (prefs) =>
    set({
      duplicatesCountAllVariants: prefs.duplicatesCountAllVariants,
      defaultBaseVariant: prefs.defaultBaseVariant,
      cities: prefs.cities,
      loaded: true,
    }),
  setDuplicatesCountAllVariants: (value) => set({ duplicatesCountAllVariants: value }),
  setDefaultBaseVariant: (value) => set({ defaultBaseVariant: value }),
  setCities: (cities) => set({ cities }),
  reset: () => set({ ...DEFAULTS, loaded: false }),
}));
