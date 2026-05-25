// Client-side helpers for subscribing the browser to web push.
//
// Flow:
//   1. Frontend calls GET /api/v1/push/vapid-public-key — 404 means push is
//      not enabled on the server, so we silently skip without prompting.
//   2. Frontend calls Notification.requestPermission(). If denied, abort.
//   3. Frontend calls navigator.serviceWorker.ready.pushManager.subscribe()
//      with the VAPID public key.
//   4. Frontend POSTs the resulting subscription to /api/v1/push/subscribe.
//
// We don't trigger subscription automatically — call `enablePushNotifications`
// from a user action (e.g., a settings toggle) so the permission prompt is
// tied to intent, not surprise.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function urlBase64ToArrayBuffer(base64: string): ArrayBuffer {
  // PushManager.subscribe wants a BufferSource backed by a non-shared
  // ArrayBuffer. Allocating a fresh ArrayBuffer (rather than returning the
  // Uint8Array directly) sidesteps the ArrayBufferLike vs ArrayBuffer lib-dom
  // type mismatch in TS 5.5+.
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/push/vapid-public-key`);
    if (!res.ok) return null;
    const body = (await res.json()) as { publicKey?: string };
    return body.publicKey ?? null;
  } catch {
    return null;
  }
}

export type PushEnableResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'feature-off' | 'permission-denied' | 'failed' };

export async function enablePushNotifications(token: string): Promise<PushEnableResult> {
  if (typeof window === 'undefined') return { ok: false, reason: 'unsupported' };
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'unsupported' };
  }

  const publicKey = await fetchVapidPublicKey();
  if (!publicKey) return { ok: false, reason: 'feature-off' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'permission-denied' };

  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const subscription =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(publicKey),
      }));

    const json = subscription.toJSON();
    const res = await fetch(`${API_URL}/api/v1/push/subscribe`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: json.keys,
      }),
    });
    return res.ok ? { ok: true } : { ok: false, reason: 'failed' };
  } catch (err) {
    console.warn('[push] subscribe failed', err);
    return { ok: false, reason: 'failed' };
  }
}

export async function disablePushNotifications(token: string): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.getSubscription();
  if (!subscription) return;
  await subscription.unsubscribe().catch(() => undefined);
  await fetch(`${API_URL}/api/v1/push/unsubscribe`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => undefined);
}
