// Concrete handlers for every scheduled job in jobs.md §34.1.
// Each export is `(deps: JobDeps) => Promise<JobResult>` so they can be invoked
// directly from tests or the one-off CLI runner without node-cron involved.

import type { JobDeps, JobResult } from './types.js';

// ─── Trade lifecycle ─────────────────────────────────────────────────────────

export async function expirePendingTrades({ db, log }: JobDeps): Promise<JobResult> {
  const { rowCount } = await db.query(
    `UPDATE trade_requests
        SET status = 'expired', updated_at = now()
      WHERE status = 'pending'
        AND updated_at < now() - INTERVAL '30 days'`,
  );
  log.info('expire-pending-trades complete', { affected: rowCount ?? 0 });
  return { affected: rowCount ?? 0 };
}

export async function expireAcceptedTrades({ db, log }: JobDeps): Promise<JobResult> {
  const { rowCount } = await db.query(
    `UPDATE trade_requests
        SET status = 'expired', updated_at = now()
      WHERE status = 'accepted'
        AND expires_at IS NOT NULL
        AND expires_at < now()`,
  );
  log.info('expire-accepted-trades complete', { affected: rowCount ?? 0 });
  return { affected: rowCount ?? 0 };
}

export async function purgeTradeMessages({ db, log }: JobDeps): Promise<JobResult> {
  // Delete messages whose parent trade closed 90+ days ago.
  const { rowCount } = await db.query(
    `DELETE FROM trade_messages tm
      USING trade_requests tr
      WHERE tm.trade_id = tr.id
        AND tr.status IN ('completed', 'declined', 'cancelled', 'expired')
        AND COALESCE(tr.completed_at, tr.updated_at) < now() - INTERVAL '90 days'`,
  );
  log.info('purge-trade-messages complete', { affected: rowCount ?? 0 });
  return { affected: rowCount ?? 0 };
}

// ─── Trust & Safety ──────────────────────────────────────────────────────────

export async function redactOldReports({ db, log }: JobDeps): Promise<JobResult> {
  const { rowCount } = await db.query(
    `UPDATE user_reports
        SET description = '[redacted]', updated_at = now()
      WHERE resolved_at IS NOT NULL
        AND resolved_at < now() - INTERVAL '2 years'
        AND description <> '[redacted]'`,
  );
  log.info('redact-old-reports complete', { affected: rowCount ?? 0 });
  return { affected: rowCount ?? 0 };
}

export async function autoFlagSweep({ db, log }: JobDeps): Promise<JobResult> {
  // Re-evaluate the 3-reports-in-30-days threshold. Soft-ban any newly-eligible
  // user for 48h. We intentionally don't email — that's handled by the trust
  // service when a soft ban is created via the normal path.
  const { rows } = await db.query<{ reported_user_id: string }>(
    `SELECT reported_user_id
       FROM user_reports
      WHERE created_at > now() - INTERVAL '30 days'
        AND status IN ('open', 'under_review')
   GROUP BY reported_user_id
     HAVING COUNT(*) >= 3
        AND NOT EXISTS (
          SELECT 1 FROM user_bans b
           WHERE b.user_id = user_reports.reported_user_id
             AND b.lifted_at IS NULL
             AND (b.expires_at IS NULL OR b.expires_at > now())
        )`,
  );

  let banned = 0;
  for (const row of rows) {
    await db.query(
      `INSERT INTO user_bans (user_id, ban_type, reason, banned_by, expires_at)
       VALUES ($1, 'soft', 'auto: 3 reports within 30 days', $1, now() + INTERVAL '48 hours')`,
      [row.reported_user_id],
    );
    banned += 1;
  }
  log.info('auto-flag-sweep complete', { evaluated: rows.length, banned });
  return { affected: banned, details: { evaluated: rows.length } };
}

export async function ratingReminderEmail({ db, redis, log }: JobDeps): Promise<JobResult> {
  // Find completed trades 24h+ old where the participant has not rated.
  const { rows } = await db.query<{ user_id: string; email: string; username: string; trade_id: string }>(
    `SELECT u.id AS user_id, u.email, u.username, tr.id AS trade_id
       FROM trade_requests tr
       JOIN users u ON u.id IN (tr.requester_id, tr.recipient_id)
      WHERE tr.status = 'completed'
        AND tr.completed_at < now() - INTERVAL '24 hours'
        AND tr.completed_at > now() - INTERVAL '14 days'
        AND NOT EXISTS (
          SELECT 1 FROM trade_ratings r
           WHERE r.trade_id = tr.id AND r.rater_id = u.id
        )`,
  );
  for (const row of rows) {
    // Reuse the async queue rather than blocking on SMTP here.
    await redis.lpush('jobs:queue', JSON.stringify({
      id: crypto.randomUUID(),
      job: { type: 'email:rating-reminder', email: row.email, username: row.username, tradeId: row.trade_id },
      attempts: 0,
      enqueuedAt: new Date().toISOString(),
    }));
  }
  log.info('rating-reminder-email complete', { queued: rows.length });
  return { affected: rows.length };
}

// ─── Privacy / GDPR-style maintenance ────────────────────────────────────────

export async function truncateAuditLogIps({ db, log }: JobDeps): Promise<JobResult> {
  // Truncate IPv4 → /24, IPv6 → /48 for audit_log rows older than 90 days.
  const { rowCount } = await db.query(
    `UPDATE audit_log
        SET ip_address = CASE
          WHEN family(ip_address) = 4 THEN set_masklen(ip_address, 24)
          WHEN family(ip_address) = 6 THEN set_masklen(ip_address, 48)
          ELSE ip_address
        END
      WHERE ip_address IS NOT NULL
        AND occurred_at < now() - INTERVAL '90 days'
        AND (
          (family(ip_address) = 4 AND masklen(ip_address) > 24) OR
          (family(ip_address) = 6 AND masklen(ip_address) > 48)
        )`,
  );
  log.info('truncate-audit-log-ips complete', { affected: rowCount ?? 0 });
  return { affected: rowCount ?? 0 };
}

export async function hardDeleteSoftDeletedUsers({ db, log }: JobDeps): Promise<JobResult> {
  // 14-day grace window from §23.5 of compliance.md.
  const { rowCount } = await db.query(
    `DELETE FROM users
      WHERE deleted_at IS NOT NULL
        AND deleted_at < now() - INTERVAL '14 days'`,
  );
  log.info('hard-delete-soft-deleted-users complete', { affected: rowCount ?? 0 });
  return { affected: rowCount ?? 0 };
}

export async function purgeEmailVerificationTokens({ db, log }: JobDeps): Promise<JobResult> {
  const { rowCount } = await db.query(
    `DELETE FROM email_verification_tokens
      WHERE expires_at < now() - INTERVAL '7 days'`,
  );
  log.info('purge-email-verification-tokens complete', { affected: rowCount ?? 0 });
  return { affected: rowCount ?? 0 };
}

export async function purgeStalePushSubscriptions({ db, log }: JobDeps): Promise<JobResult> {
  // A push endpoint that hasn't been seen for 90 days has effectively gone
  // away (uninstalled the PWA, denied notifications, expired endpoint). The
  // VAPID retry path also marks 410 GONE responses by bumping last_seen_at
  // backwards — anything older than 90 days is safe to drop.
  const { rowCount } = await db.query(
    `DELETE FROM push_subscriptions
      WHERE last_seen_at < now() - INTERVAL '90 days'`,
  );
  log.info('purge-stale-push-subscriptions complete', { affected: rowCount ?? 0 });
  return { affected: rowCount ?? 0 };
}

export async function purgeOldShareTokens({ db, log }: JobDeps): Promise<JobResult> {
  const { rowCount } = await db.query(
    `DELETE FROM public_lists
      WHERE expires_at IS NOT NULL
        AND expires_at < now()`,
  );
  log.info('purge-old-share-tokens complete', { affected: rowCount ?? 0 });
  return { affected: rowCount ?? 0 };
}

// ─── Cache warming ───────────────────────────────────────────────────────────

export async function cacheWarmStickers({ db, redis, log }: JobDeps): Promise<JobResult> {
  // Re-populate stickers:all 10 min before its 1h TTL expires to defend against
  // stampedes on event spikes (matchday, post-pack-drop traffic).
  const { rows } = await db.query(
    `SELECT s.id, s.album_code, s.number, s.player_name, s.sticker_type, s.is_foil,
            t.fifa_code, t.name AS team_name, t.group_name
       FROM stickers s
       LEFT JOIN teams t ON t.id = s.team_id
       ORDER BY s.number`,
  );
  await redis.set('stickers:all', JSON.stringify(rows), 'EX', 3600);
  log.info('cache-warm-stickers complete', { rows: rows.length });
  return { affected: rows.length };
}

// ─── Cloud-only jobs (registered only when NODE_ENV=production) ──────────────

export async function dmarcReportAggregation({ log }: JobDeps): Promise<JobResult> {
  log.warn('dmarc-report-aggregation skipped: requires SES inbox receipt rules + S3 (not yet provisioned)');
  return { affected: 0 };
}

export async function syntheticCanaryWarmAurora({ db, redis, log }: JobDeps): Promise<JobResult> {
  await db.query('SELECT 1');
  await redis.ping();
  log.info('synthetic-canary ok: db + redis reachable');
  return { affected: 1 };
}
