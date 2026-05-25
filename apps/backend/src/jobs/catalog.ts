// Single source of truth for the §34 scheduled-job catalog.
// New jobs are added here, in 06_feature_flags.sql, and in docs/runbooks/scheduled-jobs.md.

import * as handlers from './handlers.js';
import type { JobDefinition } from './types.js';

export const JOB_CATALOG: JobDefinition[] = [
  {
    name: 'expire-pending-trades',
    cron: '0 2 * * *',                  // daily 02:00 UTC
    flagKey: 'JOB_EXPIRE_PENDING_TRADES',
    handler: handlers.expirePendingTrades,
  },
  {
    name: 'expire-accepted-trades',
    cron: '15 2 * * *',                 // daily 02:15 UTC
    flagKey: 'JOB_EXPIRE_ACCEPTED_TRADES',
    handler: handlers.expireAcceptedTrades,
  },
  {
    name: 'purge-trade-messages',
    cron: '0 3 * * 0',                  // weekly Sun 03:00 UTC
    flagKey: 'JOB_PURGE_TRADE_MESSAGES',
    handler: handlers.purgeTradeMessages,
  },
  {
    name: 'redact-old-reports',
    cron: '30 3 * * 0',                 // weekly Sun 03:30 UTC
    flagKey: 'JOB_REDACT_OLD_REPORTS',
    handler: handlers.redactOldReports,
  },
  {
    name: 'auto-flag-sweep',
    cron: '0 * * * *',                  // hourly
    flagKey: 'JOB_AUTO_FLAG_SWEEP',
    handler: handlers.autoFlagSweep,
  },
  {
    name: 'rating-reminder-email',
    cron: '0 16 * * *',                 // daily 16:00 local (server tz)
    flagKey: 'JOB_RATING_REMINDER_EMAIL',
    handler: handlers.ratingReminderEmail,
  },
  {
    name: 'truncate-audit-log-ips',
    cron: '0 4 * * *',                  // daily 04:00 UTC
    flagKey: 'JOB_TRUNCATE_AUDIT_LOG_IPS',
    handler: handlers.truncateAuditLogIps,
  },
  {
    name: 'hard-delete-soft-deleted-users',
    cron: '30 4 * * *',                 // daily 04:30 UTC
    flagKey: 'JOB_HARD_DELETE_USERS',
    handler: handlers.hardDeleteSoftDeletedUsers,
  },
  {
    name: 'purge-email-verification-tokens',
    cron: '0 5 * * *',                  // daily 05:00 UTC
    flagKey: 'JOB_PURGE_VERIFICATION_TOKENS',
    handler: handlers.purgeEmailVerificationTokens,
  },
  {
    name: 'purge-old-share-tokens',
    cron: '15 5 * * *',                 // daily 05:15 UTC
    flagKey: 'JOB_PURGE_SHARE_TOKENS',
    handler: handlers.purgeOldShareTokens,
  },
  {
    name: 'cache-warm-stickers',
    cron: '*/50 * * * *',               // every 50 minutes
    flagKey: 'JOB_CACHE_WARM_STICKERS',
    handler: handlers.cacheWarmStickers,
  },
  {
    name: 'dmarc-report-aggregation',
    cron: '0 6 * * 1',                  // weekly Mon 06:00 UTC
    flagKey: 'JOB_DMARC_REPORT_AGG',
    handler: handlers.dmarcReportAggregation,
    cloudOnly: true,
  },
  {
    name: 'synthetic-canary-warm-aurora',
    cron: '*/4 * * * *',                // every 4 minutes
    flagKey: 'JOB_SYNTHETIC_CANARY',
    handler: handlers.syntheticCanaryWarmAurora,
    cloudOnly: true,
  },
];

export function findJob(name: string): JobDefinition | undefined {
  return JOB_CATALOG.find((j) => j.name === name);
}
