'use client';

import { useEffect, useState } from 'react';

// Top-edge banner that appears when the browser reports `offline`. We track
// `navigator.onLine` for the cheap signal — it's not authoritative (a flaky
// captive portal still reports online) but it's the right cue for the common
// case: the user walks out of Wi-Fi range mid-session and starts wondering
// why their swipe-add toasts say "Failed".

export default function OfflineIndicator() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    setOffline(!navigator.onLine);
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 bg-[var(--cromo-warning)] text-[var(--cromo-warning-text)] text-center text-xs font-medium py-1.5 shadow-cromo"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      You&apos;re offline. Changes will fail until your connection returns.
    </div>
  );
}
