# Runbooks

Operational playbooks for Cromo. Each runbook is task-focused: how to *do*
a specific operation safely, not background context (that lives in
`docs/architecture/`).

Per `docs/architecture/operations.md §28`, the following runbooks are required
before public launch. Phase A delivers the local-only ones in full; cloud
runbooks are stubbed and will be completed during Phase B once AWS infra exists.

| Runbook | Phase | Status |
|---|---|---|
| [`local-setup.md`](./local-setup.md) | A | ✅ written |
| [`scheduled-jobs.md`](./scheduled-jobs.md) | A | ✅ written |
| [`cloud-bootstrap.md`](./cloud-bootstrap.md) | B1 | ✅ written |
| `deploy-hotfix.md` | B | TODO (extension of cloud-bootstrap §7) |
| `rollback-deployment.md` | B | TODO |
| `restore-database.md` | B | TODO (Aurora PITR) |
| `disaster-recovery.md` | B | TODO (regional failover) |
| `data-breach-response.md` | B | TODO (CPPA workflow) |
| `process-data-request.md` | B | TODO (export / delete) |
| `rotate-secrets.md` | B | TODO |
| `update-sticker-database.md` | A | TODO (covered in seed-data.md §11 for now) |
| `scale-infrastructure.md` | B | TODO |
| `grafana-guide.md` | B | TODO |
| `redis-guide.md` | A | TODO |
| `dr-exercise-log.md` | B | TODO (populated after first DR exercise) |
