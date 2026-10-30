# Background Jobs

> **Parent document:** [`overview.md`](overview.md#document-map) — this file is the detailed expansion of scheduled jobs (parent §34) and the asynchronous job queue (parent §35).

## 34. Scheduled Jobs

The system depends on several time-based behaviours (auto-expire, retention, sweeps). All are implemented as **scheduled jobs**:

| Local | Cloud |
|---|---|
| `node-cron` running inside the API container | `node-cron` running inside the same API container on EC2 (see [ADR-0001](decisions/0001-ec2-docker-compose-over-ecs-fargate.md)) |

Jobs are defined in `apps/backend/src/jobs/` and discovered at startup. Each job logs to `audit_log` with `action = 'scheduled_job_run'` on success and an error metric on failure.

### 34.1 Job Catalog

| Job | Cadence | Description | Owner table(s) |
|---|---|---|---|
| `expire-pending-trades` | Daily 02:00 UTC | Marks `pending` trades with no activity for 30 days as `expired` | `trade_requests` |
| `expire-accepted-trades` | Daily 02:15 UTC | Marks `accepted` trades whose `expires_at` has passed as `expired`; notifies both parties | `trade_requests` |
| `purge-trade-messages` | Weekly Sun 03:00 | Deletes `trade_messages` 90 days after the trade closed | `trade_messages` |
| `redact-old-reports` | Weekly Sun 03:30 | Sets `user_reports.description = '[redacted]'` for reports `resolved_at < now() - 2 years` | `user_reports` |
| `expire-soft-bans` | No-op (lazy expiry) | Soft bans with `expires_at` in the past are skipped at lookup time; no scheduled work needed | `user_bans` |
| `auto-flag-sweep` | Hourly | Re-evaluates the 3-reports-in-30-days threshold for users with new reports since the last run | `user_reports`, `user_bans` |
| `rating-reminder-email` | Daily 16:00 local | Sends a reminder 24h after a trade `completed` if the user has not yet rated their counterpart | `trade_requests`, `trade_ratings` |
| `truncate-audit-log-ips` | Daily 04:00 UTC | Truncates IPv4 → /24 and IPv6 → /48 for `audit_log` rows older than 90 days (§23.6) | `audit_log` |
| `hard-delete-soft-deleted-users` | Daily 04:30 UTC | Anonymises and deletes user data 14 days after `deleted_at` (§23.5) | `users` and dependents |
| `purge-email-verification-tokens` | Daily 05:00 UTC | Removes expired tokens older than 7 days (orphans from abandoned signups) | `email_verification_tokens` |
| `purge-old-share-tokens` | Daily 05:15 UTC | Deletes `public_lists` with `expires_at < now()` | `public_lists` |
| `cache-warm-stickers` | Every 50 minutes | Re-populates `stickers:all` before its 1h TTL expires (defends against stampede on world-cup-event spikes) | Redis only |
| `dmarc-report-aggregation` | Weekly | Pulls DMARC aggregate reports from S3 inbox and emails the summary to admins | (off-app) |
| `synthetic-canary-warm-aurora` | Every 4 minutes | Hits `/health/ready` to keep the cloud DB connection pool warm. *Job name is a historical artifact from when the planned DB was Aurora Serverless v2; the actual DB is now RDS `db.t3.micro` (see [ADR-0002](decisions/0002-rds-postgresql-over-aurora-serverless.md)) and the canary's relevance is reduced — it remains as a cheap liveness check.* | (off-app) |

### 34.2 Failure Handling

- Each job runs inside a try/catch with structured error logs (`level=error`, `job_name`, `error_class`, `error_message`).
- Three consecutive failures of the same job triggers the alert in §20.3.
- The `scheduled-jobs.md` runbook (§28) describes how to pause a misbehaving job: `UPDATE feature_flags SET enabled = false WHERE key = 'JOB_<name>'` (jobs check this flag before running). This is the primary safety valve — no need to redeploy.

### 34.3 Local Behaviour

Locally, `node-cron` runs in the same Node.js process as the API. Setting `JOBS_MODE=disabled` in `.env.local` (default for `docker compose` to keep dev iteration fast) skips job registration entirely. To test a specific job locally, run `pnpm job -- <job_name>` which invokes the job once and exits.

## 35. Asynchronous Job Queue

> Status: the current implementation is a lightweight Redis-backed FIFO queue, not BullMQ. The queueing design described below reflects the implementation in [apps/backend/src/services/jobs.service.ts](../../apps/backend/src/services/jobs.service.ts) and the worker startup in [apps/backend/src/app.ts](../../apps/backend/src/app.ts). Any broader BullMQ-style architecture is still planned, not live.

§34 covers **time-based** work (run every hour, run nightly). This section covers **event-based** background work triggered by user actions that should not block the request path.

### 35.1 Why a queue, not inline

If the API sends verification or reminder emails synchronously inside the request path, the user waits for the SMTP call to finish. The current queue moves those email tasks off the request thread while retaining simple retry behaviour in Redis.

The actual runtime queue is intentionally small and conservative:
- email verification
- password reset emails
- rating reminder emails

That is enough for the codebase today; broader producer/consumer flows (scan jobs, push fan-out, webhook ingestion) are not implemented in the current backend.

### 35.2 Current stack: Redis list queue

The implemented design is a single Redis-backed FIFO queue with a tiny dead-letter list. It does not use BullMQ, does not run a separate worker container, and does not expose a queue dashboard.

| Concern | Current implementation |
|---|---|
| Queue backend | Redis list (`jobs:queue`) and dead-letter list (`jobs:dead`) |
| Worker process | Same Node.js API process; a single in-process consumer starts in `startWorker()` |
| Dashboard | Not implemented |
| Worker mode toggle | Not present; the worker starts automatically when `NODE_ENV !== 'test'` |

This is a deliberate simplification: no priorities, no repeatables, no queue admin UI, and no external queue service. The worker uses `BRPOP` on the Redis queue and re-enqueues failed jobs up to a small retry limit before dead-lettering them.

### 35.3 Current queue definitions

| Queue / stream | Producer | Job payload | Retry policy |
|---|---|---|---|
| `jobs:queue` | API on registration / password reset / trade rating reminders | `QueueEntry { id, job, attempts, enqueuedAt }` | Up to 3 attempts before dead-letter |
| `jobs:dead` | Worker after repeated failures | Same `QueueEntry` payload as above | No auto-retry; manual inspection or replay |

The actual job types implemented today are limited to:

| Job type | Producer | Notes |
|---|---|---|
| `email:verify` | register flow | Sends verification mail |
| `email:reset` | password-reset flow | Sends reset link |
| `email:rating-reminder` | trade completion / reminder workflow | Sends reminder if the user has not rated |

Any queue names like `scan`, `push`, or `webhook-ingest` are planned future work, not current runtime behaviour.

### 35.4 Job patterns

**Idempotency.** The implemented worker expects the producer to send jobs with stable payloads; the service is designed to avoid duplicate side effects by reusing the same business workflow rather than by a queue-specific dedupe layer.

**Dead-letter handling.** A failed job is retried a small number of times. After the retry budget is exhausted it is pushed to `jobs:dead` for inspection or replay.

**Concurrency.** There is a single worker loop, not per-queue concurrency settings.

**Timeouts.** The current worker does not enforce per-job timeouts at the queue level; it simply runs the job and retries on thrown errors.

### 35.5 Cron vs Async Queue — Quick Reference

| Use cron (§34) | Use async queue (§35) |
|---|---|
| "Run every night at 02:00" | "When a user registers, send a welcome email" |
| Periodic sweeps over the database | One-off work tied to a specific user action |
| Tasks that don't need retry semantics | Tasks where work should not block the request path |
| No payload | Payload travels with the job |

### 35.6 Local behaviour

Locally, the API process starts the Redis-backed worker automatically when `NODE_ENV !== 'test'`. The worker is in-process and uses `BRPOP` on `jobs:queue`; there is no `WORKER_MODE`, Bull Board, or separate Docker worker container in the repo today.

The test suite skips the worker entirely to avoid SMTP or long-lived Redis side effects. In local development the same queue is used for email delivery; there is no alternate `EMAIL_PROVIDER`-specific queue implementation described by the code.

