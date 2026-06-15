import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';

// Mock the three downstream email senders that runJob dispatches to.
const { sendVerificationMock, sendResetMock, sendRatingReminderMock } = vi.hoisted(() => ({
  sendVerificationMock: vi.fn(),
  sendResetMock: vi.fn(),
  sendRatingReminderMock: vi.fn(),
}));
vi.mock('../../src/services/email.service.js', () => ({
  sendVerificationEmail: sendVerificationMock,
  sendPasswordResetEmail: sendResetMock,
  sendRatingReminderEmail: sendRatingReminderMock,
}));

import { enqueue, runJob } from '../../src/services/jobs.service.js';

beforeEach(() => {
  sendVerificationMock.mockReset();
  sendResetMock.mockReset();
  sendRatingReminderMock.mockReset();
});

describe('enqueue', () => {
  it('LPUSHes a JSON envelope onto jobs:queue with attempts=0 and a UUID id', async () => {
    const lpush = vi.fn().mockResolvedValue(1);
    const redis = { lpush } as unknown as Redis;
    await enqueue(redis, {
      type: 'email:verify',
      email: 'a@b.c',
      username: 'luisa',
      code: '123456',
    });
    expect(lpush).toHaveBeenCalledTimes(1);
    const [queueKey, raw] = lpush.mock.calls[0]!;
    expect(queueKey).toBe('jobs:queue');
    const entry = JSON.parse(raw as string) as {
      id: string; attempts: number; enqueuedAt: string; job: { type: string };
    };
    expect(entry.attempts).toBe(0);
    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(entry.job.type).toBe('email:verify');
    expect(Number.isNaN(Date.parse(entry.enqueuedAt))).toBe(false);
  });

  it('preserves the job payload verbatim inside the envelope', async () => {
    const lpush = vi.fn().mockResolvedValue(1);
    const redis = { lpush } as unknown as Redis;
    await enqueue(redis, {
      type: 'email:rating-reminder',
      email: 'r@x',
      username: 'r',
      tradeId: 't-1',
      userId: 'u-1',
    });
    const raw = lpush.mock.calls[0]![1] as string;
    expect(JSON.parse(raw).job).toEqual({
      type: 'email:rating-reminder',
      email: 'r@x',
      username: 'r',
      tradeId: 't-1',
      userId: 'u-1',
    });
  });
});

const db = {} as Pool;

describe('runJob — dispatch by job.type', () => {
  it('email:verify dispatches to sendVerificationEmail with email/username/code', async () => {
    await runJob(db, { type: 'email:verify', email: 'a@b.c', username: 'u', code: '123456' });
    expect(sendVerificationMock).toHaveBeenCalledWith(db, 'a@b.c', 'u', '123456');
    expect(sendResetMock).not.toHaveBeenCalled();
    expect(sendRatingReminderMock).not.toHaveBeenCalled();
  });

  it('email:reset dispatches to sendPasswordResetEmail', async () => {
    await runJob(db, { type: 'email:reset', email: 'r@x.y', username: 'u', code: '777' });
    expect(sendResetMock).toHaveBeenCalledWith(db, 'r@x.y', 'u', '777');
  });

  it('email:rating-reminder dispatches to sendRatingReminderEmail with all 5 args', async () => {
    await runJob(db, {
      type: 'email:rating-reminder',
      email: 'p@x', username: 'p', tradeId: 't-1', userId: 'u-1',
    });
    expect(sendRatingReminderMock).toHaveBeenCalledWith(db, 'p@x', 'p', 't-1', 'u-1');
  });

  it('propagates errors from the underlying sender (so the worker can retry)', async () => {
    sendVerificationMock.mockRejectedValueOnce(new Error('smtp down'));
    await expect(
      runJob(db, { type: 'email:verify', email: 'a@b.c', username: 'u', code: '1' }),
    ).rejects.toThrow(/smtp down/);
  });
});
