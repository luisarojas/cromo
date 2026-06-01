import { create } from 'zustand';
import type { City, ProfileVisibility, UserPreferences } from '@/lib/api';

interface PreferencesState {
  duplicatesCountAllVariants: boolean;
  cities: City[];
  profileVisibility: ProfileVisibility;
  tradeMatchingEnabled: boolean;
  loaded: boolean;

  setFromServer: (prefs: UserPreferences) => void;
  setDuplicatesCountAllVariants: (value: boolean) => void;
  setCities: (cities: City[]) => void;
  setProfileVisibility: (value: ProfileVisibility) => void;
  setTradeMatchingEnabled: (value: boolean) => void;
  reset: () => void;
}

const DEFAULTS = {
  duplicatesCountAllVariants: false,
  cities: [] as City[],
  profileVisibility: 'public' as ProfileVisibility,
  tradeMatchingEnabled: true,
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
      loaded: true,
    }),
  setDuplicatesCountAllVariants: (value) => set({ duplicatesCountAllVariants: value }),
  setCities: (cities) => set({ cities }),
  setProfileVisibility: (value) => set({ profileVisibility: value }),
  setTradeMatchingEnabled: (value) => set({ tradeMatchingEnabled: value }),
  reset: () => set({ ...DEFAULTS, loaded: false }),
}));
