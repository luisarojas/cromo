import type { Pool } from 'pg';
import webpush, { type PushSubscription as WebPushSubscription } from 'web-push';
import { env } from '../env.js';

let vapidConfigured = false;

/**
 * configureVapid — idempotent setup. Until VAPID keys are configured, the
 * push service is in degraded mode: it accepts subscriptions but cannot send.
 * This keeps local dev working without forcing a per-developer key generation.
 */
export function configureVapid(): boolean {
  if (vapidConfigured) return true;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  vapidConfigured = true;
  return true;
}

export interface SubscribeInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}

export async function saveSubscription(
  db: Pool,
  userId: string,
  input: SubscribeInput,
): Promise<void> {
  await db.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (user_id, endpoint) DO UPDATE SET
       p256dh       = EXCLUDED.p256dh,
       auth         = EXCLUDED.auth,
       user_agent   = EXCLUDED.user_agent,
       last_seen_at = now()`,
    [userId, input.endpoint, input.keys.p256dh, input.keys.auth, input.userAgent ?? null],
  );
}

export async function removeSubscription(
  db: Pool,
  userId: string,
  endpoint: string,
): Promise<void> {
  await db.query(
    `DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`,
    [userId, endpoint],
  );
}

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
}

/**
 * publishToUser — fan a payload out to every active subscription for a user.
 * Errors per-endpoint are swallowed (the most common cause is a 410 Gone, which
 * we use as the signal to drop the row).
 */
export async function publishToUser(
  db: Pool,
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; pruned: number }> {
  if (!configureVapid()) {
    return { sent: 0, pruned: 0 };
  }

  const { rows } = await db.query<{ endpoint: string; p256dh: string; auth: string }>(
    `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
    [userId],
  );

  const json = JSON.stringify(payload);
  let sent = 0;
  let pruned = 0;
  for (const row of rows) {
    const sub: WebPushSubscription = {
      endpoint: row.endpoint,
      keys: { p256dh: row.p256dh, auth: row.auth },
    };
    try {
      await webpush.sendNotification(sub, json);
      sent += 1;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await removeSubscription(db, userId, row.endpoint);
        pruned += 1;
      }
    }
  }
  return { sent, pruned };
}
