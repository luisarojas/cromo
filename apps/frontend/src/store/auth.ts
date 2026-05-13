import { create } from 'zustand';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  role: string;
  emailVerifiedAt: string | null;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  /** True once the initial refresh attempt has completed (success or failure). */
  hydrated: boolean;
  setAuth: (token: string, user: AuthUser) => void;
  updateUser: (patch: Partial<AuthUser>) => void;
  clearAuth: () => void;
  setHydrated: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  hydrated: false,
  setAuth: (token, user) => set({ token, user }),
  updateUser: (patch) =>
    set((state) => ({ user: state.user ? { ...state.user, ...patch } : state.user })),
  clearAuth: () => set({ token: null, user: null }),
  setHydrated: () => set({ hydrated: true }),
}));
