// Tiny pub/sub over BroadcastChannel for cross-tab consistency. When tab A
// adjusts the collection (add/remove/move, favourites, wishlist), we publish
// a `collection:changed` message so tab B's open album view can reload itself
// instead of silently displaying stale data.
//
// Falls back to a no-op publish + an empty subscribe on browsers that don't
// support BroadcastChannel (older Safari). Worst case, the user notices
// stale data and pull-to-refreshes — same as today.

const CHANNEL_NAME = 'cromo';

export type SyncEvent =
  | { type: 'collection:changed'; userId: string; albumId: string | null }
  | { type: 'favourites:changed'; userId: string }
  | { type: 'wanted:changed'; userId: string }
  // Fired when a trade row changes shape: proposal created, status flipped
  // (accepted/declined/cancelled/completed), or a message appended (which
  // bumps messageCount on the summary row). Carries the trade id so a
  // subscriber on a specific trade detail page can match precisely.
  | { type: 'trade:changed'; userId: string; tradeId: string };

type Listener = (event: SyncEvent) => void;

let singleton: BroadcastChannel | null = null;
const listeners = new Set<Listener>();

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null;
  if (singleton) return singleton;
  if (typeof BroadcastChannel === 'undefined') return null;
  singleton = new BroadcastChannel(CHANNEL_NAME);
  singleton.addEventListener('message', (e) => {
    const event = e.data as SyncEvent;
    for (const fn of listeners) fn(event);
  });
  return singleton;
}

export function publishSync(event: SyncEvent): void {
  const ch = getChannel();
  if (!ch) return;
  try {
    ch.postMessage(event);
  } catch {
    // ignore — postMessage can throw if the channel was closed between
    // calls; we'll just miss this notification.
  }
}

export function subscribeSync(listener: Listener): () => void {
  // Ensure the channel exists so `message` events start flowing.
  getChannel();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
