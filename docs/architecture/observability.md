# Observability

> **Parent document:** [`overview.md`](overview.md#document-map) — this file is the detailed expansion of analytics (parent §13), health checks (parent §16), and monitoring/alerting (parent §20).

## 13. Analytics

### 13.1 Local: None

Analytics are not active in local development. No analytics service is included in docker-compose.

### 13.2 Cloud: Plausible Analytics (Self-Hosted)

Privacy-respecting, cookieless analytics hosted on a small EC2 instance in `ca-central-1`. Data stays in Canada. No consent banner required. ~$3–5 USD/month.

## 16. Health Checks

### 16.1 Two Endpoints

**`GET /health` — Liveness (lightweight, local and cloud)**

Called every 10 seconds by Docker (locally) and ECS (cloud). Confirms the Node.js process is alive. Does not check dependencies.

```json
HTTP 200 { "status": "ok", "version": "1.2.4", "uptime_seconds": 86423 }
```

**`GET /health/ready` — Readiness (comprehensive)**

Called before routing any traffic to a new container. Checks all dependencies.

```json
HTTP 200 {
  "status": "ok",
  "checks": {
    "database": { "status": "ok", "latency_ms": 4 },
    "redis":    { "status": "ok", "latency_ms": 1 },
    "storage":  { "status": "ok" }
  }
}
```

Returns HTTP 503 if any dependency is unhealthy.

### 16.2 Local Health Check

In local development, `storage` check verifies the local upload directory is writable (instead of checking S3). The health check behaviour is otherwise identical to cloud.

### 16.3 Dependency Check Timeouts

| Dependency | Method | Timeout |
|---|---|---|
| PostgreSQL | `SELECT 1` | 2 seconds |
| Redis | `PING` | 1 second |
| Storage | Local write / S3 HeadObject | 3 seconds |

Total endpoint timeout: 5 seconds.

## 20. Monitoring, Alerting & Observability

### 20.1 Local Monitoring

In local development, all logs appear in the Docker Compose terminal output in structured JSON. Redis Commander at `localhost:8081` shows cache state in real time. pgAdmin at `localhost:5050` allows direct database inspection.

### 20.2 Cloud: Three Pillars

**Logs — CloudWatch Logs**

Structured JSON with `version`, `environment`, and `requestId` on every line. Retention: 7d (dev), 30d (staging), 365d (production).

**Metrics + Dashboards — CloudWatch + Grafana**

Grafana connects to CloudWatch as a data source. Dashboards are JSON-defined and version-controlled in the repository. `docs/runbooks/grafana-guide.md` explains how to read them and add panels.

**Traces — AWS X-Ray**

Slow request debugging — shows which specific query or API call caused a delay.

### 20.3 Alerts (Cloud)

| Alert | Threshold |
|---|---|
| API error rate | > 1% over 5 min |
| API p99 response | > 2 seconds |
| ECS CPU | > 80% for 10 min |
| Aurora CPU | > 80% for 5 min |
| Redis memory | > 80% |
| Health check failures | 3 consecutive |
| AWS spend | > $400 USD/month |
| SES bounce rate | > 4% (warns before SES auto-suspend at 5%) |
| SES complaint rate | > 0.05% (warns before suspend at 0.1%) |
| Frontend error rate | > 1% of sessions over 30 min (Sentry) |
| Background job failure | Any scheduled job fails 3× consecutively |

### 20.4 Frontend Error Tracking

Backend logs do not catch errors that happen in the user's browser (component crashes, failed fetches, JS exceptions). To close that gap, the frontend integrates **Sentry** (or **GlitchTip** if data residency is a concern — GlitchTip can be self-hosted in `ca-central-1`).

| Aspect | Choice |
|---|---|
| Service | Sentry SaaS (default) or self-hosted GlitchTip in `ca-central-1` (if PIPEDA review prefers) |
| Captured | Unhandled exceptions, React error-boundary errors, slow transactions, failed `fetch` requests with status ≥ 500 |
| Not captured | URLs containing `share/<token>`, request bodies, anything matching email regex |
| User context | Anonymous user-ID hash only; no email or username |
| Sample rate | 100% errors, 10% performance traces |
| Release tag | `APP_VERSION` from §15 |

Errors are correlated to backend logs via the `requestId` header (sent on every API response, captured by the frontend client and attached to Sentry events).

### 20.5 Cache Stampede Prevention

Hot keys (`stickers:all`, `user:{id}:summary` for popular users) expiring during peak load (the pack-opening spike in §21.7) cause "thundering herd" — many concurrent requests recompute the value and pile onto PostgreSQL.

Mitigation (singleflight pattern):
1. On cache miss, the request acquires a short-TTL Redis lock: `SET cache:lock:{key} 1 NX PX 5000`
2. The winner computes the value and writes it to cache; losers wait briefly (200 ms) and re-read
3. After write, the lock is released
4. If a loser still misses after the wait, it computes anyway (lock-failure escape hatch)

Implemented as a wrapper helper (`cachedOrCompute(key, ttl, fn)`) and applied to all GET endpoints that hit cached read-mostly data.

### 20.6 Aurora Serverless v2 Cold Start

Aurora Serverless v2 with `min_capacity = 0` saves money at night but adds 10–30 s latency on the first request after a scale-to-zero. Our mitigations:

1. **Production min_capacity = 0.5 ACU** — never scales to zero. The ~$15/month cost is worth the consistent UX.
2. **Dev/staging min_capacity = 0** — saves money, accepts cold-start during dev work.
3. **CloudWatch Synthetics canary** — an external GET to `/health/ready` every 4 minutes keeps the connection pool warm even outside business hours (defence in depth).
4. **Frontend UX during cold start** — the `/health/ready` endpoint is checked from the landing page; if it returns 503, the UI shows a "Waking up — this takes about 20 seconds" notice rather than a generic error.

