'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth';
import { usePreferencesStore } from '@/store/preferences';
import { refreshApi, fetchUserPreferences } from '@/lib/api';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const setAuth = useAuthStore((s) => s.setAuth);
  const setHydrated = useAuthStore((s) => s.setHydrated);
  const setFromServer = usePreferencesStore((s) => s.setFromServer);

  useEffect(() => {
    refreshApi()
      .then(async (data) => {
        if (data) {
          setAuth(data.accessToken, data.user);
          try {
            const prefs = await fetchUserPreferences(data.accessToken);
            setFromServer(prefs);
          } catch {
            setFromServer({ duplicatesCountAllVariants: true, cities: [], profileVisibility: 'public', tradeMatchingEnabled: true, searchRadiusKm: 50, emailTradeRequests: true, emailTradeMessages: true, emailMarketing: false });
          }
        }
      })
      .finally(() => setHydrated());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <>{children}</>;
}
