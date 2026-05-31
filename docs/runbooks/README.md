# Runbooks

Operational playbooks for Cromo. Each runbook is task-focused: how to *do*
a specific operation safely, not background context (that lives in
`docs/architecture/`).

Per `docs/architecture/operations.md §28`, the following runbooks are required
before public launch. Local and dev-cloud runbooks are written today; the
production-only runbooks become TODO once the prod environment is provisioned.

| Runbook | Scope | Status |
|---|---|---|
| [`local-setup.md`](./local-setup.md) | local | ✅ written |
| [`scheduled-jobs.md`](./scheduled-jobs.md) | local + cloud | ✅ written |
| [`cloud-bootstrap.md`](./cloud-bootstrap.md) | cloud | ✅ written |
| [`cloud-recreate.md`](./cloud-recreate.md) | cloud | ✅ written |
| [`dev-schedule.md`](./dev-schedule.md) | cloud (dev) | ✅ written |
| `deploy-hotfix.md` | cloud | TODO (extension of cloud-bootstrap §7) |
| `rollback-deployment.md` | cloud | TODO |
| `restore-database.md` | cloud | TODO (RDS PITR — see ADR-0002) |
| `disaster-recovery.md` | cloud | TODO (regional failover) |
| `data-breach-response.md` | cloud | TODO (CPPA workflow) |
| `process-data-request.md` | cloud | TODO (export / delete) |
| `rotate-secrets.md` | cloud | TODO |
| `update-sticker-database.md` | local + cloud | TODO (covered in seed-data.md §11 for now) |
| `scale-infrastructure.md` | cloud | TODO |
| `cloudwatch-guide.md` | cloud | TODO |
| `redis-guide.md` | local + cloud | TODO |
| `dr-exercise-log.md` | cloud | TODO (populated after first DR exercise) |
