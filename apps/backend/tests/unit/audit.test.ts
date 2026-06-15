import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import { recordAudit, recordAuditBulk } from '../../src/utils/audit.js';

function fakeClient() {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  // The Pool/PoolClient surface area we exercise is a single `query` method.
  return { query, asPool: { query } as unknown as Pool };
}

describe('recordAudit', () => {
  it('writes an action-only row when the action has null metadata', async () => {
    const { query, asPool } = fakeClient();
    await recordAudit(asPool, 'user-1', 'password_changed', null);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toMatch(/INSERT INTO audit_log \(user_id, action\) VALUES/);
    expect(params).toEqual(['user-1', 'password_changed']);
  });

  it('writes metadata as JSONB when the action carries a payload', async () => {
    const { query, asPool } = fakeClient();
    await recordAudit(asPool, 'admin-1', 'user_role_changed', {
      targetUserId: 'user-2',
      newRole: 'admin',
    });
    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toMatch(/metadata/);
    expect(sql).toMatch(/\$3::jsonb/);
    expect(params?.[0]).toBe('admin-1');
    expect(params?.[1]).toBe('user_role_changed');
    expect(JSON.parse(params?.[2] as string)).toEqual({
      targetUserId: 'user-2',
      newRole: 'admin',
    });
  });
});

describe('recordAuditBulk', () => {
  it('inserts one row per userId via unnest, sharing the same metadata blob', async () => {
    const { query, asPool } = fakeClient();
    await recordAuditBulk(asPool, ['u1', 'u2', 'u3'], 'trade_completed', {
      tradeId: 't-1',
      items: [{ stickerVariantId: 'sv-1', direction: 'offer', quantity: 2 }],
    });
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toMatch(/unnest\(\$3::uuid\[\]\)/);
    expect(params?.[0]).toBe('trade_completed');
    expect(JSON.parse(params?.[1] as string)).toMatchObject({ tradeId: 't-1' });
    expect(params?.[2]).toEqual(['u1', 'u2', 'u3']);
  });
});
