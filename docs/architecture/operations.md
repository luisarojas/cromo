# Operations

> **Parent document:** [`overview.md`](overview.md#document-map) — this file is the detailed expansion of disaster recovery (parent §22), error handling (parent §26), support & feedback (parent §27), the operational runbook (parent §28), and security testing & disclosure policy (parent §29).

## 22. Disaster Recovery

### 22.1 Recovery Objectives

- **RTO:** ≤ 30 minutes
- **RPO:** ≤ 5 minutes of data loss

### 22.2 Backup Strategy

**Current (RDS PostgreSQL `db.t3.micro` — see [ADR-0002](decisions/0002-rds-postgresql-over-aurora-serverless.md)):**

- RDS automated backups with point-in-time recovery (retention configured in Terraform; default 7 days).
- Manual snapshots before any destructive migration or before a reseed.

**Planned for prod:**

- Cross-region snapshot copy to `ca-west-1` (Calgary).
- S3 cross-region replication for user-uploaded assets.

> The original spec called for Aurora Global Database replication to `ca-west-1` (~1 second lag) and sub-minute regional failover. That guarantee does not hold with `db.t3.micro` — restore from a snapshot in another region is on the order of tens of minutes. When traffic warrants Aurora, the original RTO/RPO targets become reachable.

### 22.3 Quarterly DR Exercise

Recovery procedure is tested every quarter. Results documented in `docs/runbooks/dr-exercise-log.md`.

## 26. Error Handling & Graceful Degradation

### 26.1 Custom Error Pages

- **404** — friendly, links back to album
- **500** — "Something went wrong" with report option; no stack traces exposed
- **503 Maintenance** — shown when maintenance flag is active

### 26.2 API Error Format

```json
{
  "error": {
    "code": "STICKER_NOT_FOUND",
    "message": "Sticker number 981 does not exist.",
    "requestId": "req-abc-123"
  }
}
```

### 26.3 Degradation Rules

| Service Down | User Impact | Code Behaviour |
|---|---|---|
| **Gemini API** | `/scan` returns 503 with "AI scan temporarily unavailable"; manual entry still works | `services/scan.service.ts` catches Gemini errors and returns a typed unavailable status |
| **Redis** | Slightly slower responses (cache misses fall through to Postgres) | Every Redis read uses `safeCacheGet`; every write uses `safeCacheSet` — both swallow errors and the request still completes against Postgres |
| **S3 / local upload dir** | Avatar / scan-image uploads return 503; existing avatars still render | `services/upload.service.ts` checks write permission at startup and surfaces a degraded mode flag |
| **SES (email)** | Verification / notification emails queued in BullMQ; user sees "we'll email you shortly" | The async-queue worker retries 3× then dead-letters; nothing blocks the originating request |
| **Postgres** | Hard outage — 503 on all endpoints | `/health/ready` returns 503, ALB stops routing traffic, scheduled jobs skip their tick |

Core collection management requires only the API and PostgreSQL. Every other
dependency is wrapped in a fail-soft helper so a single dependency outage
degrades gracefully rather than taking the site down.

#### Implementation pointers

- Redis: `apps/backend/src/services/cache.ts` (`safeCacheGet`, `safeCacheSet`, `singleflight`).
- Gemini: `apps/backend/src/services/scan.service.ts` — returns `{ ok: false, reason }`; the route maps to 503.
- Email: jobs flow through `apps/backend/src/services/jobs.service.ts` (async queue) — never inline.
- Uploads: `apps/backend/src/services/upload.service.ts` validates magic bytes before write.
- Frontend: `apps/frontend/src/lib/api.ts#retryFetch` retries 502/503/504 on GET only (2 attempts, exponential backoff with jitter).

## 27. Support & Feedback

- `support@cromo.ca` — forwarded via SES
- In-app feedback button on every page
- Public status page on Upptime (GitHub Pages, free)
- GitHub Issues with templates for bug reports and feature requests

## 28. Operational Runbook

Stored in `docs/runbooks/`. Required before public launch.

| Runbook | Contents |
|---|---|
| `local-setup.md` | How to get the application running locally from scratch |
| `deploy-hotfix.md` | Deploy a critical fix bypassing normal pipeline |
| `rollback-deployment.md` | Revert to previous Docker image |
| `restore-database.md` | Restore from RDS point-in-time backup |
| `disaster-recovery.md` | Full regional failover to ca-west-1 |
| `data-breach-response.md` | CPPA breach notification workflow |
| `process-data-request.md` | Handle export / delete account requests |
| `rotate-secrets.md` | Rotate secrets without downtime |
| `update-sticker-database.md` | Add or correct stickers (including admin UI) |
| `scale-infrastructure.md` | Increase capacity under high load |
| `grafana-guide.md` | Read dashboards, add panels, query CloudWatch |
| `redis-guide.md` | Cache key patterns, Redis CLI inspection |
| `scheduled-jobs.md` | List of all cron jobs, how to pause/resume, what to do if a job fails (see §34) |
| `dr-exercise-log.md` | Quarterly DR exercise results |

## 29. Security Testing & Disclosure Policy

### 29.1 At Launch

- OWASP ZAP automated scanning in CI
- OWASP Top 10 developer review documented
- Responsible disclosure policy at `cromo.ca/security`
- GitLeaks, Snyk, Trivy active in CI

### 29.2 Responsible Disclosure Policy

- Contact: `security@cromo.ca`
- Safe harbour for good-faith researchers
- Acknowledge within 5 business days
- Hall of Fame with reporter's permission

### 29.3 At 1,000 Users

Professional penetration test scheduled ($3,000–8,000 CAD).

