'use client';

import { useEffect } from 'react';

// Registers /sw.js once per session. Disabled in development to avoid stale
// cache surprises during hot reload — flip the guard if you need to test the
// SW locally.
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production' && !window.location.search.includes('sw=1')) return;

    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((err) => {
          console.warn('[sw] registration failed', err);
        });
    };

    window.addEventListener('load', onLoad);
    return () => window.removeEventListener('load', onLoad);
  }, []);

  return null;
}
