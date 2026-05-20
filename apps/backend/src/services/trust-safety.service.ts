import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { safeCacheGet, safeCacheSet } from './cache.js';
import { recordAudit } from '../utils/audit.js';

export type TrustTier = 'new_trader' | 'good_trader' | 'trusted_trader' | 'caution';

type BanStatusInactive = { banned: false };
type BanStatusActive = { banned: true; type: 'soft' | 'hard'; expiresAt: string | null; message: string };
export type BanStatus = BanStatusInactive | BanStatusActive;

export interface TrustScore {
  tier: TrustTier;
  totalRatings: number;
  positiveCount: number;
  negativeCount: number;
  positivePercent: number;
}

const BAN_STATUS_TTL = 120;
const TRUST_SCORE_TTL = 600;

export async function getBanStatus(
  db: Pool,
  redis: Redis,
  userId: string,
): Promise<BanStatus> {
  const cacheKey = `user:${userId}:ban_status`;
  const cached = await safeCacheGet(redis, cacheKey);
  if (cached) return JSON.parse(cached) as BanStatus;

  const { rows } = await db.query<{
    ban_type: string;
    expires_at: string | null;
  }>(
    `SELECT ban_type, expires_at
     FROM user_bans
     WHERE user_id = $1
       AND lifted_at IS NULL
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId],
  );

  let result: BanStatus;
  if (rows.length === 0) {
    result = { banned: false };
  } else {
    const row = rows[0]!;
    result = {
      banned: true,
      type: row.ban_type as 'soft' | 'hard',
      expiresAt: row.expires_at,
      message:
        row.ban_type === 'hard'
          ? 'Your account has been suspended. Please contact support.'
          : 'Your account has temporary trading restrictions.',
    };
  }

  await safeCacheSet(redis, cacheKey, JSON.stringify(result), BAN_STATUS_TTL);
  return result;
}

export async function getTrustScore(
  db: Pool,
  redis: Redis,
  userId: string,
): Promise<TrustScore> {
  const cacheKey = `user:${userId}:trust_score`;
  const cached = await safeCacheGet(redis, cacheKey);
  if (cached) return JSON.parse(cached) as TrustScore;

  const { rows } = await db.query<{
    total: string;
    positive_count: string;
  }>(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE is_positive) AS positive_count
     FROM (
       SELECT is_positive
       FROM trade_ratings
       WHERE rated_user_id = $1
       ORDER BY created_at DESC
       LIMIT 50
     ) sub`,
    [userId],
  );

  const total = parseInt(rows[0]!.total, 10);
  const positiveCount = parseInt(rows[0]!.positive_count, 10);
  const negativeCount = total - positiveCount;
  const positivePercent = total === 0 ? 0 : Math.round((positiveCount / total) * 100);

  let tier: TrustTier;
  if (total < 3) {
    tier = 'new_trader';
  } else if (positivePercent >= 80) {
    tier = 'trusted_trader';
  } else if (positivePercent >= 60) {
    tier = 'good_trader';
  } else if (total >= 5) {
    tier = 'caution';
  } else {
    tier = 'new_trader';
  }

  const result: TrustScore = { tier, totalRatings: total, positiveCount, negativeCount, positivePercent };
  await safeCacheSet(redis, cacheKey, JSON.stringify(result), TRUST_SCORE_TTL);
  return result;
}

export async function checkAutoFlag(
  db: Pool,
  userId: string,
  redis: Redis,
): Promise<void> {
  const { rows } = await db.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM user_reports
     WHERE reported_user_id = $1
       AND status IN ('open', 'under_review')
       AND category <> 'underage'
       AND created_at > NOW() - INTERVAL '30 days'`,
    [userId],
  );

  const count = parseInt(rows[0]!.count, 10);
  if (count < 3) return;

  await db.query(
    `UPDATE user_reports
     SET status = 'under_review', updated_at = NOW()
     WHERE reported_user_id = $1
       AND status = 'open'`,
    [userId],
  );

  const SYSTEM_USER = '00000000-0000-0000-0000-000000000099';

  const { rows: banRows } = await db.query<{ id: string }>(
    `INSERT INTO user_bans (user_id, ban_type, reason, banned_by)
     VALUES ($1, 'soft', 'Auto-flagged: 3 or more reports in 30 days', $2)
     RETURNING id`,
    [userId, SYSTEM_USER],
  );

  await redis.del(`user:${userId}:ban_status`).catch(() => undefined);

  await recordAudit(db, SYSTEM_USER, 'user_banned', {
    targetUserId: userId,
    banId: banRows[0]!.id,
    banType: 'soft',
  });
}

export async function isFeatureFlagEnabled(db: Pool, key: string): Promise<boolean> {
  const { rows } = await db.query<{ enabled: boolean }>(
    `SELECT enabled FROM feature_flags WHERE key = $1`,
    [key],
  );
  return rows.length > 0 && rows[0]!.enabled;
}
