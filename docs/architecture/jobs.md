# Background Jobs

> **Parent document:** [`overview.md`](overview.md#document-map) — this file is the detailed expansion of scheduled jobs (parent §34) and the asynchronous job queue (parent §35).

## 34. Scheduled Jobs

The system depends on several time-based behaviours (auto-expire, retention, sweeps). All are implemented as **scheduled jobs**:

| Local | Cloud |
|---|---|
| `node-cron` running inside the API container | AWS ECS Scheduled Tasks (cheaper than Lambda + EventBridge for cron, identical container) |

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
| `synthetic-canary-warm-aurora` | Every 4 minutes | Hits `/health/ready` to keep Aurora connection pool warm (§20.6) | (off-app) |

### 34.2 Failure Handling

- Each job runs inside a try/catch with structured error logs (`level=error`, `job_name`, `error_class`, `error_message`).
- Three consecutive failures of the same job triggers the alert in §20.3.
- The `scheduled-jobs.md` runbook (§28) describes how to pause a misbehaving job: `UPDATE feature_flags SET enabled = false WHERE key = 'JOB_<name>'` (jobs check this flag before running). This is the primary safety valve — no need to redeploy.

### 34.3 Local Behaviour

Locally, `node-cron` runs in the same Node.js process as the API. Setting `JOBS_MODE=disabled` in `.env.local` (default for `docker compose` to keep dev iteration fast) skips job registration entirely. To test a specific job locally, run `pnpm job -- <job_name>` which invokes the job once and exits.

## 35. Asynchronous Job Queue

§34 covers **time-based** work (run every hour, run nightly). This section covers **event-based** background work — units of work triggered by something that just happened (a user registered, a scan was uploaded, a trade was accepted) that should not block the originating API request.

### 35.1 Why a queue, not inline

If the API tries to send the verification email synchronously inside `POST /auth/register`, the user waits for SES to respond — and if SES is slow or briefly unavailable, the registration appears to fail. The same problem applies to:
- AI scan processing (Groq vision can take 5–15 s per image)
- Web push fan-out to multiple subscribers
- Notification emails (trade requests, accepted, completed)
- DMARC report ingestion
- Audit log enrichment (e.g., GeoIP lookup)

A queue decouples request handling from external dependencies and gives free retries.

### 35.2 Stack: BullMQ on Redis

BullMQ is a battle-tested Node.js queue library that runs on the Redis already in the stack (§7.4). No new infrastructure.

| Concern | Local | Cloud |
|---|---|---|
| Queue backend | Redis in Docker | ElastiCache Redis |
| Worker process | Same Node.js container, separate process | Dedicated ECS Fargate task (`api-worker`), 1–2 instances |
| Dashboard | Bull Board at `localhost:3001/admin/queues` | Same, gated behind admin auth |

Workers are deployed as a second ECS service in cloud — same Docker image as the API but with `WORKER_MODE=true` env var that starts the BullMQ worker instead of the Fastify server.

### 35.3 Queue Definitions

| Queue | Producer | Job payload | Retry policy |
|---|---|---|---|
| `email` | API on registration / password reset / trade events | `{ template, to, vars }` | 5 attempts with exponential backoff (1m, 5m, 30m, 2h, 8h) |
| `scan` | API on `POST /scan/identify` after upload validation | `{ scanId, userId, s3Key }` | 3 attempts with 30s/2m/10m backoff |
| `push` | API on trade events; expanded by `push-fanout` job | `{ subscriptionId, payload }` | 3 attempts; on `410 Gone`, delete the subscription |
| `webhook-ingest` | SNS topic (SES bounces/complaints, DMARC reports) | `{ source, body }` | 5 attempts |
| `account-deletion` | API on deletion request (queues the immediate soft-delete tasks; the 14-day hard delete is the cron job in §34) | `{ userId, requestedAt }` | 3 attempts |
| `audit-enrichment` | API after writing audit_log row (GeoIP, user-agent parsing) | `{ auditLogId }` | 3 attempts; failure is non-blocking |

### 35.4 Job Patterns

**Idempotency.** Every job handler is idempotent — re-processing the same job must not cause duplicate side effects. Achieved by: (1) using stable job IDs (`email:registration:{userId}`), and (2) checking state before acting (e.g., `email` job checks `users.email_verified_at` before re-sending the verification mail).

**Dead-letter handling.** A job that fails all retry attempts is moved to a dead-letter queue (`{queueName}:dead`). Bull Board lists dead jobs; the daily Grafana alert notifies admins. Manually requeue or discard via the dashboard.

**Concurrency.** Each worker handles configurable concurrency per queue:
- `email`: 10 concurrent
- `scan`: 2 concurrent (Claude API rate-limit-friendly)
- `push`: 50 concurrent (cheap I/O)

**Job timeouts.** Each job has a hard timeout (e.g., `scan` = 30s, `email` = 10s). Timed-out jobs are marked failed and retried per policy.

### 35.5 Cron vs Async Queue — Quick Reference

| Use cron (§34) | Use async queue (§35) |
|---|---|
| "Run every night at 02:00" | "When a user registers, send a welcome email" |
| Periodic sweeps over the database | One-off work tied to a specific user action |
| Tasks that don't need retry semantics (next run will pick up missed work) | Tasks where each event must be processed exactly once |
| No payload | Payload travels with the job |

### 35.6 Local Behaviour

Locally, the API container starts the BullMQ worker in-process (controlled by `WORKER_INPROCESS=true` in `.env.local`). This avoids running a second Docker service for dev iteration. Bull Board UI is reachable at `http://localhost:3001/admin/queues` — convenient for inspecting jobs while developing.

When `EMAIL_PROVIDER=mailpit`, the email worker delivers to Mailpit. When `GROQ_API_KEY=mock`, the scan worker returns the mock response. No code path differences — only env vars.

