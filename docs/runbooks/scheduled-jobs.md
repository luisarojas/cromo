# Scheduled Jobs

Operational runbook for the time-based jobs catalogued in
`docs/architecture/jobs.md §34`.

## Where they run

- **Phase A (local):** `node-cron` runs inside the same Node.js process as the
  API (`apps/backend/src/jobs/scheduler.ts`). Set `JOBS_MODE=disabled` in
  `.env.local` to skip registration entirely (useful when iterating on routes —
  avoids surprise queries during dev).
- **Phase B (cloud):** an ECS Scheduled Task fires the same job entrypoints from
  a small dedicated container.

## Job catalog

| Job | Cadence | Flag key |
|---|---|---|
| `expire-pending-trades` | Daily 02:00 UTC | `JOB_EXPIRE_PENDING_TRADES` |
| `expire-accepted-trades` | Daily 02:15 UTC | `JOB_EXPIRE_ACCEPTED_TRADES` |
| `purge-trade-messages` | Weekly Sun 03:00 | `JOB_PURGE_TRADE_MESSAGES` |
| `redact-old-reports` | Weekly Sun 03:30 | `JOB_REDACT_OLD_REPORTS` |
| `auto-flag-sweep` | Hourly | `JOB_AUTO_FLAG_SWEEP` |
| `rating-reminder-email` | Daily 16:00 local | `JOB_RATING_REMINDER_EMAIL` |
| `truncate-audit-log-ips` | Daily 04:00 UTC | `JOB_TRUNCATE_AUDIT_LOG_IPS` |
| `hard-delete-soft-deleted-users` | Daily 04:30 UTC | `JOB_HARD_DELETE_USERS` |
| `purge-email-verification-tokens` | Daily 05:00 UTC | `JOB_PURGE_VERIFICATION_TOKENS` |
| `purge-old-share-tokens` | Daily 05:15 UTC | `JOB_PURGE_SHARE_TOKENS` |
| `cache-warm-stickers` | Every 50 min | `JOB_CACHE_WARM_STICKERS` |
| `dmarc-report-aggregation` | Weekly (cloud-only) | `JOB_DMARC_REPORT_AGG` |
| `synthetic-canary-warm-aurora` | Every 4 min (cloud-only) | `JOB_SYNTHETIC_CANARY` |

`expire-soft-bans` from §34.1 is a lazy-expiry no-op (checked at lookup time)
and intentionally has no scheduled entry.

## Pause / resume a job

The primary safety valve is the per-job feature flag — **no redeploy required**.

```sql
-- Pause
UPDATE feature_flags SET enabled = false WHERE key = 'JOB_EXPIRE_PENDING_TRADES';

-- Resume
UPDATE feature_flags SET enabled = true  WHERE key = 'JOB_EXPIRE_PENDING_TRADES';
```

The scheduler reads `feature_flags` at each tick, so the change takes effect on
the next scheduled run (within the job's cadence). If you need it to stop
*right now*, kill the API process — the next start will re-read the flag and
skip registration.

## Run a job manually

```bash
# Phase A: pnpm job -- <name>
pnpm --filter @cromo/backend job -- expire-pending-trades

# What it does internally
node --import tsx src/jobs/run-once.ts expire-pending-trades
```

The runner exits non-zero on failure so it can be wrapped in CI / a one-shot
container.

## What to do when a job fails

1. **Check the structured log line.** Every job catch-block logs `level=error`,
   `job_name`, `error_class`, `error_message`. Grep for the job name in `docker
   compose logs api`.
2. **Three consecutive failures triggers the alert** in `observability.md §20.3`
   (Slack #cromo-alerts in Phase B).
3. **If the job is misbehaving** (e.g., a query plan went bad after a schema
   change), pause it with the flag (above), open an issue, fix it, then re-enable.
4. **If the job is fine but data is wrong** (e.g., a stuck row), prefer fixing
   the data manually and letting the job catch up on its next run rather than
   special-casing the code.

## How a new job is added

1. Implement the unit of work in `apps/backend/src/jobs/<name>.ts` exporting a
   default async function with signature `(deps: JobDeps) => Promise<void>`.
2. Register the cron spec in `apps/backend/src/jobs/scheduler.ts`.
3. Add a row to `06_feature_flags.sql` keyed `JOB_<NAME>` defaulting to
   `enabled = true` (or `false` if you want it gated initially).
4. Add the job + flag to the table above.
5. Write a unit test in `apps/backend/tests/unit/jobs/<name>.test.ts` against an
   in-memory or test-DB harness — the job entrypoints take `JobDeps` so they
   can be invoked directly without `node-cron` running.

## Local sanity checks

```bash
# Did the scheduler register? Look for these lines on API startup:
docker compose logs api | grep "\[jobs\]"
# [jobs] registered expire-pending-trades (cron: 0 2 * * *)
# [jobs] registered cache-warm-stickers (cron: */50 * * * *)
# …

# Trigger the cache-warm job and confirm Redis now has stickers:all
pnpm --filter @cromo/backend job -- cache-warm-stickers
docker compose exec cache redis-cli EXISTS stickers:all
```
