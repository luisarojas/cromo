'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth';
import { refreshApi } from '@/lib/api';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const setAuth = useAuthStore((s) => s.setAuth);
  const setHydrated = useAuthStore((s) => s.setHydrated);

  useEffect(() => {
    refreshApi()
      .then((data) => {
        if (data) setAuth(data.accessToken, data.user);
      })
      .finally(() => setHydrated());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <>{children}</>;
}
