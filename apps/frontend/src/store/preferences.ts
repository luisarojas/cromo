import { create } from 'zustand';
import type { City, ProfileVisibility, UserPreferences } from '@/lib/api';

interface PreferencesState {
  duplicatesCountAllVariants: boolean;
  cities: City[];
  profileVisibility: ProfileVisibility;
  tradeMatchingEnabled: boolean;
  searchRadiusKm: number;
  loaded: boolean;

  setFromServer: (prefs: UserPreferences) => void;
  setDuplicatesCountAllVariants: (value: boolean) => void;
  setCities: (cities: City[]) => void;
  setProfileVisibility: (value: ProfileVisibility) => void;
  setTradeMatchingEnabled: (value: boolean) => void;
  setSearchRadiusKm: (value: number) => void;
  reset: () => void;
}

const DEFAULTS = {
  duplicatesCountAllVariants: true,
  cities: [] as City[],
  profileVisibility: 'public' as ProfileVisibility,
  tradeMatchingEnabled: true,
  searchRadiusKm: 50,
};

export const usePreferencesStore = create<PreferencesState>((set) => ({
  ...DEFAULTS,
  loaded: false,

  setFromServer: (prefs) =>
    set({
      duplicatesCountAllVariants: prefs.duplicatesCountAllVariants,
      cities: prefs.cities,
      profileVisibility: prefs.profileVisibility,
      tradeMatchingEnabled: prefs.tradeMatchingEnabled,
      searchRadiusKm: prefs.searchRadiusKm,
      loaded: true,
    }),
  setDuplicatesCountAllVariants: (value) => set({ duplicatesCountAllVariants: value }),
  setCities: (cities) => set({ cities }),
  setProfileVisibility: (value) => set({ profileVisibility: value }),
  setTradeMatchingEnabled: (value) => set({ tradeMatchingEnabled: value }),
  setSearchRadiusKm: (value) => set({ searchRadiusKm: value }),
  reset: () => set({ ...DEFAULTS, loaded: false }),
}));
