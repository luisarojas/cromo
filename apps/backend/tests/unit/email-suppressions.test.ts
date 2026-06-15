import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import {
  isSuppressed,
  suppress,
} from '../../src/services/email-suppressions.service.js';

let queryMock = vi.fn();
const db = { query: (...args: unknown[]) => queryMock(...args) } as unknown as Pool;

beforeEach(() => {
  queryMock = vi.fn();
});

describe('isSuppressed', () => {
  it('lowercases the email before the lookup', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ exists: true }] });
    await isSuppressed(db, 'User@Example.COM');
    const [, params] = queryMock.mock.calls[0]!;
    expect(params).toEqual(['user@example.com']);
  });

  it('returns true when the row exists', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ exists: true }] });
    expect(await isSuppressed(db, 'a@b.c')).toBe(true);
  });

  it('returns false when the row does not exist', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ exists: false }] });
    expect(await isSuppressed(db, 'a@b.c')).toBe(false);
  });

  it('returns false when the query returns no rows at all', async () => {
    // Defensive: the EXISTS query should always return one row, but
    // the optional chain guards against a future change to the SQL.
    queryMock.mockResolvedValueOnce({ rows: [] });
    expect(await isSuppressed(db, 'a@b.c')).toBe(false);
  });
});

describe('suppress', () => {
  it('writes all bounce metadata fields, with email lowercased', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await suppress(db, 'A@B.C', {
      reason: 'bounce',
      bounceType: 'Permanent',
      bounceSubtype: 'General',
      diagnosticCode: '550 user unknown',
      payload: { notificationType: 'Bounce' },
    });
    const [, params] = queryMock.mock.calls[0]!;
    expect(params?.[0]).toBe('a@b.c');
    expect(params?.[1]).toBe('bounce');
    expect(params?.[2]).toBe('Permanent');
    expect(params?.[3]).toBe('General');
    expect(params?.[4]).toBe('550 user unknown');
    expect(JSON.parse(params?.[5] as string)).toEqual({ notificationType: 'Bounce' });
  });

  it('passes null for missing optional bounce fields and a missing payload', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await suppress(db, 'c@d.e', { reason: 'complaint' });
    const [, params] = queryMock.mock.calls[0]!;
    expect(params?.[2]).toBeNull();
    expect(params?.[3]).toBeNull();
    expect(params?.[4]).toBeNull();
    expect(params?.[5]).toBeNull();
  });

  it('uses an upsert (ON CONFLICT) so a re-bounce updates the existing row', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await suppress(db, 'a@b.c', { reason: 'bounce' });
    const [sql] = queryMock.mock.calls[0]!;
    expect(sql).toMatch(/ON CONFLICT \(email\) DO UPDATE/);
  });
});
