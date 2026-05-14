import { create } from 'zustand';

interface PreferencesState {
  duplicatesCountAllVariants: boolean;
  loaded: boolean;

  setFromServer: (prefs: { duplicatesCountAllVariants: boolean }) => void;
  setDuplicatesCountAllVariants: (value: boolean) => void;
  reset: () => void;
}

const DEFAULTS = {
  duplicatesCountAllVariants: false,
};

export const usePreferencesStore = create<PreferencesState>((set) => ({
  ...DEFAULTS,
  loaded: false,

  setFromServer: (prefs) =>
    set({ duplicatesCountAllVariants: prefs.duplicatesCountAllVariants, loaded: true }),
  setDuplicatesCountAllVariants: (value) => set({ duplicatesCountAllVariants: value }),
  reset: () => set({ ...DEFAULTS, loaded: false }),
}));
