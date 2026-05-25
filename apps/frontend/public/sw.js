// Stickfolio service worker.
//
// Strategy:
//   - Precache the app shell on install
//   - "Network-first, fall back to cache" for navigations (so users see updated
//     pages when online, and a cached version when offline)
//   - "Stale-while-revalidate" for the sticker catalog (/api/v1/stickers),
//     since the frontend already keys cache invalidation off /api/v1/stickers/version
//   - Pass-through (no caching) for everything else, including mutations
//
// Cache versioning: bump CACHE_VERSION when the SW logic changes. Stale caches
// are deleted on `activate`.

const CACHE_VERSION = 'v1';
const APP_SHELL_CACHE = `cromo-shell-${CACHE_VERSION}`;
const STICKERS_CACHE = `cromo-stickers-${CACHE_VERSION}`;

const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/cromo-mark.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('cromo-') && !k.endsWith(`-${CACHE_VERSION}`))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function isStickerCatalogRequest(url) {
  return (
    url.pathname === '/api/v1/stickers' ||
    url.pathname.startsWith('/api/v1/stickers/')
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Same-origin navigation: network-first, fall back to cached app shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          const cache = await caches.open(APP_SHELL_CACHE);
          cache.put(request, res.clone());
          return res;
        } catch {
          const cached = await caches.match(request);
          return cached ?? caches.match('/') ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Sticker catalog: stale-while-revalidate. The frontend's localStorage cache
  // already invalidates against /stickers/version, so even slightly stale
  // cached responses are safe — the next page load triggers a fresh fetch.
  if (isStickerCatalogRequest(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STICKERS_CACHE);
        const cached = await cache.match(request);
        const networkFetch = fetch(request)
          .then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          })
          .catch(() => null);
        return cached ?? (await networkFetch) ?? Response.error();
      })(),
    );
    return;
  }

  // Everything else: passthrough.
});

// ─── Web Push handler (FEATURE_WEB_PUSH) ─────────────────────────────────────
// The push subscription is generated client-side by /lib/push.ts and posted to
// the API. When the API publishes a push payload, the browser fires `push`,
// which this handler turns into a system notification.
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Cromo', body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Cromo', {
      body: payload.body ?? '',
      icon: '/cromo-mark.svg',
      badge: '/cromo-mark.svg',
      tag: payload.tag ?? 'cromo',
      data: payload.url ? { url: payload.url } : undefined,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.endsWith(url));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    }),
  );
});
