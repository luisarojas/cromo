# Operations

> **Parent document:** [`overview.md`](overview.md#document-map) — this file is the detailed expansion of disaster recovery (parent §22), error handling (parent §26), support & feedback (parent §27), the operational runbook (parent §28), and security testing & disclosure policy (parent §29).

## 22. Disaster Recovery

### 22.1 Recovery Objectives

- **RTO:** ≤ 30 minutes
- **RPO:** ≤ 5 minutes of data loss

### 22.2 Backup Strategy (3-2-1)

- Aurora continuous backup: 35-day point-in-time recovery
- Aurora Global Database: replication to ca-west-1 (~1 second lag)
- S3 cross-region replication: assets mirrored to ca-west-1

Failover to Calgary in under 1 minute if Montréal region fails.

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

| Service Down | Impact | Core Functions |
|---|---|---|
| Claude Vision API | Scan temporarily unavailable | All other features work |
| Redis | Slightly slower responses | No feature loss |
| S3 | Avatars show placeholder | No data loss |
| SES (email) | Notification delay | No feature loss |

Core collection management requires only the API and PostgreSQL.

## 27. Support & Feedback

- `support@stickerswap2026.ca` — forwarded via SES
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
| `restore-database.md` | Restore from Aurora point-in-time backup |
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
- Responsible disclosure policy at `stickerswap2026.ca/security`
- GitLeaks, Snyk, Trivy active in CI

### 29.2 Responsible Disclosure Policy

- Contact: `security@stickerswap2026.ca`
- Safe harbour for good-faith researchers
- Acknowledge within 5 business days
- Hall of Fame with reporter's permission

### 29.3 At 1,000 Users

Professional penetration test scheduled ($3,000–8,000 CAD).

