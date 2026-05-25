# ADR-0002: RDS PostgreSQL over Aurora Serverless v2

**Status:** Accepted
**Date:** 2026-05-25

## Context

Phase B requires a managed PostgreSQL database on AWS. Two primary options were evaluated:

| | RDS PostgreSQL (db.t3.micro) | Aurora Serverless v2 |
|---|---|---|
| Min monthly cost | ~$15 | ~$22 (0.5 ACU minimum) |
| Scales to zero | No | Yes (after 5 min inactivity) |
| Cold-start latency | N/A | ~5–30s after idle scale-down |
| Endpoint model | Single instance endpoint | Cluster writer + optional reader endpoints |
| Engine | PostgreSQL 16 | Aurora PostgreSQL (PostgreSQL-compatible) |
| Max ACUs / scale ceiling | Vertical resize only | Scales horizontally within the cluster |

Expected workload at Phase B launch: < 100 users, low but continuous traffic (no extended idle periods in production).

## Decision

Use **RDS PostgreSQL (db.t3.micro)** for the initial Phase B deployment.

Rationale:

1. **Cost** — Aurora's minimum billing floor (~$22/mo) exceeds RDS `db.t3.micro` (~$15/mo) at low traffic. The "scales to zero" feature only saves money if the database is genuinely idle for extended periods, which a production environment is not.

2. **Simplicity** — RDS exposes a single instance endpoint. Aurora requires managing a cluster endpoint (writer) and understanding the cluster parameter group model. For a single-developer project with no dedicated DBA, simpler is better.

3. **Elasticity is not needed yet** — Aurora Serverless v2's horizontal scaling is valuable under unpredictable, spiky load. At < 100 users with low, continuous traffic, a fixed `db.t3.micro` is more than sufficient and vertical resizing (`t3.micro` → `t3.small` → `t3.medium`) covers growth well into the thousands of users.

4. **Same wire protocol** — both are PostgreSQL. No application code changes are required to switch between them.

## Consequences

**Good:**
- ~$7/mo cheaper than Aurora at minimum billing
- Simpler connection string and endpoint model
- Automated daily snapshots and point-in-time recovery are identical to Aurora
- Vertical resize path (`t3.micro` → `t3.small` → `t3.medium`) covers the expected growth range without any architecture change

**Bad / Trade-offs:**
- No horizontal read scaling (read replicas require a separate RDS instance, whereas Aurora adds readers to the same cluster)
- No sub-minute scale-up under sudden traffic spikes — a vertical resize requires a maintenance window
- Aurora would be preferable for a **staging environment** that sits idle overnight, as it can scale to zero and save ~$15–22/mo in that context

**Migration path:**
- **Trigger:** read-heavy workload that benefits from a read replica, or sustained CPU/memory pressure that vertical resizing can no longer address
- **Migration:** take an RDS snapshot, restore it into an Aurora PostgreSQL cluster. Application connection strings point at the new cluster writer endpoint. No schema or code changes required.
- **Estimated migration effort:** < 1 day
