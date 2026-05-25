# ADR-0001: EC2 + Docker Compose over ECS Fargate for Initial Phase B Deployment

**Status:** Accepted
**Date:** 2026-05-25

## Context

Phase B moves the application from local Docker Compose to AWS. The app is already fully containerized: a Next.js frontend, a Fastify API, PostgreSQL, and Redis — all running via `docker-compose.yml`.

The original architecture plan called for:
- **ECS Fargate** (backend API + frontend, auto-scaling 1–4 tasks)
- **Aurora PostgreSQL Serverless v2** (scales to zero)
- **Vercel** (frontend hosting)
- **RDS Proxy** (connection pooling)

Constraints at Phase B launch:
- Expected user base: **< 100 users in the first month**
- Budget: cost should be minimized at low traffic
- Complexity: single developer, no dedicated DevOps role
- The Docker Compose workflow is already proven locally and requires no code changes

Estimated monthly costs:
| Architecture | ~Cost/mo (USD) |
|---|---|
| ECS Fargate + Aurora + Vercel (original plan) | $110–150 |
| EC2 (single instance) + RDS + ElastiCache | $50–70 |

## Decision

Deploy Phase B on a **single EC2 instance** running Docker Compose in production mode, with **managed AWS services** for the stateful components:

| Component | Service | Notes |
|---|---|---|
| Frontend (Next.js) | EC2 — Docker Compose | Same image as local dev, production build |
| Backend API (Fastify) | EC2 — Docker Compose | Same image as local dev, production build |
| Database | RDS PostgreSQL (db.t3.micro) | Managed backups, automated patching |
| Cache | ElastiCache Redis (cache.t3.micro) | Managed, no host-level ops |
| File uploads | S3 | Replaces local filesystem volume |
| Email | SES | Replaces Mailpit |
| HTTPS + routing | ALB + ACM | SSL termination, path-based routing to containers |
| DNS | Route 53 | |
| Secrets | AWS Secrets Manager | Replaces `.env.local` |

Rationale for keeping RDS + ElastiCache as managed services (rather than running them in Docker on EC2):
- Automated daily snapshots and point-in-time recovery on RDS — if data is corrupted the EC2 instance can be terminated and rebuilt without data loss
- EC2 instance becomes stateless, making replacement, resizing, or AMI changes safe operations
- The cost delta (~$27/mo) is cheap insurance at any scale

## Consequences

**Good:**
- ~$50–70/mo vs $110–150/mo — roughly half the cost at low traffic
- No ECS task definitions, service discovery, or Fargate networking to learn up front
- `docker-compose.prod.yml` is a near-identical copy of the local compose file — minimal new surface area
- Managed RDS + ElastiCache provide the same backup and failover guarantees as Aurora
- EC2 instance can be resized vertically (t3.small → t3.medium → t3.large) without any architecture change

**Bad / Trade-offs:**
- No horizontal auto-scaling on the compute layer — the EC2 instance is a single point of failure for the application tier (database and cache remain HA via managed services)
- Deployments require SSHing into the instance or a deploy script that pulls and restarts containers; no blue/green deploy out of the box
- If the EC2 instance is terminated, containers need to be restarted manually (or via User Data / a systemd service)
- ECS would eventually offer better observability integration (CloudWatch Container Insights, task-level metrics)

**Migration path:**
- **Trigger:** sustained CPU > 70% on the EC2 instance, or user base grows beyond ~1,000–2,000 MAU, or a need for zero-downtime blue/green deploys
- **Migration:** ECS Fargate task definitions are created directly from the existing production Dockerfiles — no code changes required. The managed services (RDS, ElastiCache, S3, SES, Route 53, ACM) are unchanged and simply pointed to by the new Fargate tasks via environment variables. The ALB target group is re-pointed from the EC2 instance to the ECS service.
- **Estimated migration effort:** 1–2 days of Terraform and CI/CD changes
