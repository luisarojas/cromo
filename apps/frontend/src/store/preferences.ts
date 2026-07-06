import { create } from 'zustand';
import type { City, ProfileVisibility, UserPreferences } from '@/lib/api';

interface PreferencesState {
  cities: City[];
  profileVisibility: ProfileVisibility;
  tradeMatchingEnabled: boolean;
  searchRadiusKm: number;
  emailTradeRequests: boolean;
  emailTradeMessages: boolean;
  emailMarketing: boolean;
  loaded: boolean;

  setFromServer: (prefs: UserPreferences) => void;
  setCities: (cities: City[]) => void;
  setProfileVisibility: (value: ProfileVisibility) => void;
  setTradeMatchingEnabled: (value: boolean) => void;
  setSearchRadiusKm: (value: number) => void;
  setEmailTradeRequests: (value: boolean) => void;
  setEmailTradeMessages: (value: boolean) => void;
  setEmailMarketing: (value: boolean) => void;
  reset: () => void;
}

const DEFAULTS = {
  cities: [] as City[],
  profileVisibility: 'public' as ProfileVisibility,
  tradeMatchingEnabled: true,
  searchRadiusKm: 50,
  emailTradeRequests: true,
  emailTradeMessages: true,
  emailMarketing: false,
};

export const usePreferencesStore = create<PreferencesState>((set) => ({
  ...DEFAULTS,
  loaded: false,

  setFromServer: (prefs) =>
    set({
      cities: prefs.cities,
      profileVisibility: prefs.profileVisibility,
      tradeMatchingEnabled: prefs.tradeMatchingEnabled,
      searchRadiusKm: prefs.searchRadiusKm,
      emailTradeRequests: prefs.emailTradeRequests,
      emailTradeMessages: prefs.emailTradeMessages,
      emailMarketing: prefs.emailMarketing,
      loaded: true,
    }),
  setCities: (cities) => set({ cities }),
  setProfileVisibility: (value) => set({ profileVisibility: value }),
  setTradeMatchingEnabled: (value) => set({ tradeMatchingEnabled: value }),
  setSearchRadiusKm: (value) => set({ searchRadiusKm: value }),
  setEmailTradeRequests: (value) => set({ emailTradeRequests: value }),
  setEmailTradeMessages: (value) => set({ emailTradeMessages: value }),
  setEmailMarketing: (value) => set({ emailMarketing: value }),
  reset: () => set({ ...DEFAULTS, loaded: false }),
}));
