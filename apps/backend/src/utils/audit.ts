import type { Pool, PoolClient } from 'pg';

/**
 * Typed audit-log builder. Every admin-visible state change in the system
 * writes one row to `audit_log`, and the `metadata` JSONB column is the only
 * place we record *why*. The shape of that JSON drifts very easily if every
 * caller hand-writes its own object literal — see the historical mix of
 * `target_user_id` (snake) and `tradeId` (camel). Funneling every insert
 * through this enum-and-helper pair gives us:
 *
 *   1. A single, exhaustive list of action names.
 *   2. Per-action TypeScript types for the metadata payload.
 *   3. One consistent key style on disk (camelCase).
 *
 * Add a new action by extending `AuditMetadataMap`; the compiler will then
 * refuse `recordAudit` calls that drop required fields or supply unknown ones.
 */
export type AuditMetadataMap = {
  user_role_changed: { targetUserId: string; newRole: string };
  user_banned:       { targetUserId: string; banId: string; banType: string };
  user_unbanned:     { targetUserId: string };
  user_deleted:      { targetUserId: string };
  sticker_updated:   { stickerId: string; changes: Record<string, unknown> };
  email_changed:     { to: string };
  username_changed:  { to: string };
  password_changed:  null;
  account_deleted:   null;
  trade_completed:      {
    tradeId: string;
    items: { stickerVariantId: string; direction: string; quantity: number }[];
  };
  trade_rating_submitted: {
    tradeId: string;
    ratedUserId: string;
    isPositive: boolean;
  };
  user_report_submitted: {
    reportId: string;
    reportedUserId: string;
    category: string;
    attachmentCount: number;
    messageRefCount: number;
  };
  report_status_changed: {
    reportId: string;
    status: string;
  };
  ban_lifted: {
    targetUserId: string;
    banId: string;
  };
};

export type AuditAction = keyof AuditMetadataMap;

type Querier = Pool | PoolClient;

export async function recordAudit<A extends AuditAction>(
  client: Querier,
  userId: string,
  action: A,
  metadata: AuditMetadataMap[A],
): Promise<void> {
  if (metadata === null) {
    await client.query(
      `INSERT INTO audit_log (user_id, action) VALUES ($1, $2)`,
      [userId, action],
    );
    return;
  }
  await client.query(
    `INSERT INTO audit_log (user_id, action, metadata)
     VALUES ($1, $2, $3::jsonb)`,
    [userId, action, JSON.stringify(metadata)],
  );
}

/**
 * Bulk variant — writes one row per userId with the same action + metadata.
 * Used for actions that need to be attributed to multiple participants (e.g.
 * trade_completed).
 */
export async function recordAuditBulk<A extends AuditAction>(
  client: Querier,
  userIds: string[],
  action: A,
  metadata: Exclude<AuditMetadataMap[A], null>,
): Promise<void> {
  await client.query(
    `INSERT INTO audit_log (user_id, action, metadata)
     SELECT user_id, $1, $2::jsonb FROM unnest($3::uuid[]) AS user_id`,
    [action, JSON.stringify(metadata), userIds],
  );
}
