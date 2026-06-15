import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';

// We need to control web-push entirely: setVapidDetails / sendNotification.
// The module is imported as default in push.service.ts, so the mock has to
// expose `default` as the namespace too.
vi.mock('web-push', () => {
  const setVapidDetails = vi.fn();
  const sendNotification = vi.fn();
  return {
    default: { setVapidDetails, sendNotification },
    setVapidDetails,
    sendNotification,
  };
});

// env carries the VAPID config; we tweak it per test via vi.stubEnv before
// importing the SUT, but the env module reads values once at module load.
// Easiest path: mock the env module entirely.
vi.mock('../../src/env.js', () => ({
  env: {
    VAPID_PUBLIC_KEY: 'test-pub',
    VAPID_PRIVATE_KEY: 'test-priv',
    VAPID_SUBJECT: 'mailto:test@cromo.local',
  },
}));

import webpush from 'web-push';
import {
  configureVapid,
  saveSubscription,
  removeSubscription,
  publishToUser,
} from '../../src/services/push.service.js';

function makeDb() {
  const query = vi.fn();
  return { query, asPool: { query } as unknown as Pool };
}

beforeEach(() => {
  vi.mocked(webpush.setVapidDetails).mockClear();
  vi.mocked(webpush.sendNotification).mockClear();
});

describe('configureVapid', () => {
  it('returns true after the first successful call and caches the result', () => {
    expect(configureVapid()).toBe(true);
    expect(vi.mocked(webpush.setVapidDetails)).toHaveBeenCalledWith(
      'mailto:test@cromo.local',
      'test-pub',
      'test-priv',
    );
    // Second call must skip the setup entirely (idempotent).
    vi.mocked(webpush.setVapidDetails).mockClear();
    expect(configureVapid()).toBe(true);
    expect(vi.mocked(webpush.setVapidDetails)).not.toHaveBeenCalled();
  });
});

describe('saveSubscription', () => {
  it('upserts the subscription row with the provided keys and user agent', async () => {
    const { query, asPool } = makeDb();
    query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    await saveSubscription(asPool, 'u-1', {
      endpoint: 'https://push.example/endpoint',
      keys: { p256dh: 'p1', auth: 'a1' },
      userAgent: 'Cromo/1.0',
    });
    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toMatch(/INSERT INTO push_subscriptions/);
    expect(sql).toMatch(/ON CONFLICT \(user_id, endpoint\) DO UPDATE/);
    expect(params).toEqual([
      'u-1',
      'https://push.example/endpoint',
      'p1',
      'a1',
      'Cromo/1.0',
    ]);
  });

  it('writes null for a missing userAgent', async () => {
    const { query, asPool } = makeDb();
    query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    await saveSubscription(asPool, 'u-1', {
      endpoint: 'e',
      keys: { p256dh: 'p', auth: 'a' },
    });
    expect(query.mock.calls[0]![1]![4]).toBeNull();
  });
});

describe('removeSubscription', () => {
  it('deletes the row matching (user_id, endpoint)', async () => {
    const { query, asPool } = makeDb();
    query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    await removeSubscription(asPool, 'u-1', 'https://e');
    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toMatch(/DELETE FROM push_subscriptions WHERE user_id = \$1 AND endpoint = \$2/);
    expect(params).toEqual(['u-1', 'https://e']);
  });
});

describe('publishToUser', () => {
  it('sends one notification per active subscription and counts successes', async () => {
    const { query, asPool } = makeDb();
    query.mockResolvedValueOnce({
      rowCount: 2,
      rows: [
        { endpoint: 'https://e1', p256dh: 'p1', auth: 'a1' },
        { endpoint: 'https://e2', p256dh: 'p2', auth: 'a2' },
      ],
    });
    vi.mocked(webpush.sendNotification).mockResolvedValue({} as never);

    const result = await publishToUser(asPool, 'u-1', { title: 'Hi', body: 'There' });
    expect(result).toEqual({ sent: 2, pruned: 0 });
    expect(vi.mocked(webpush.sendNotification)).toHaveBeenCalledTimes(2);
    // Verify the payload JSON we sent matches the input.
    const [, payloadJson] = vi.mocked(webpush.sendNotification).mock.calls[0]!;
    expect(JSON.parse(payloadJson as string)).toEqual({ title: 'Hi', body: 'There' });
  });

  it('prunes dead endpoints when web-push returns 404/410', async () => {
    const { query, asPool } = makeDb();
    query
      .mockResolvedValueOnce({
        rowCount: 2,
        rows: [
          { endpoint: 'https://gone', p256dh: 'p', auth: 'a' },
          { endpoint: 'https://ok', p256dh: 'p', auth: 'a' },
        ],
      })
      // Subsequent removeSubscription DELETE call:
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    vi.mocked(webpush.sendNotification)
      .mockRejectedValueOnce(Object.assign(new Error('Gone'), { statusCode: 410 }))
      .mockResolvedValueOnce({} as never);

    const result = await publishToUser(asPool, 'u-1', { title: 'Hello' });
    expect(result).toEqual({ sent: 1, pruned: 1 });
    // The DELETE was issued against the 410'd endpoint specifically.
    const deleteCall = query.mock.calls.find(([sql]) => /DELETE FROM push_subscriptions/.test(sql as string));
    expect(deleteCall?.[1]).toEqual(['u-1', 'https://gone']);
  });

  it('does NOT prune on other error statuses (e.g. 500)', async () => {
    const { query, asPool } = makeDb();
    query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ endpoint: 'https://e', p256dh: 'p', auth: 'a' }],
    });
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce(
      Object.assign(new Error('boom'), { statusCode: 500 }),
    );
    const result = await publishToUser(asPool, 'u-1', { title: 'x' });
    expect(result).toEqual({ sent: 0, pruned: 0 });
    // No DELETE happened.
    const hadDelete = query.mock.calls.some(([sql]) => /DELETE FROM push_subscriptions/.test(sql as string));
    expect(hadDelete).toBe(false);
  });
});
