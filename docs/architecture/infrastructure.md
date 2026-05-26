# Infrastructure

> **Parent document:** [`overview.md`](overview.md#document-map) — this file is the detailed expansion of environment strategy (parent §17) and cloud infrastructure on AWS (parent §19).

## 17. Environment Strategy

### 17.1 The Three Environments

```
LOCAL → DEV → PRODUCTION
```

> **Staging is intentionally deferred.** Cromo runs only `dev` and `prod` in AWS for now (decided 2026-05-25) to control cost — staging alone would add another $80–120 USD/mo. A `staging` row will be inserted into this table when the environment is added; until then, anything the spec assigns to staging (anonymised-prod snapshots, nightly E2E against staging, OWASP ZAP staging scans, soft-launch on staging) is either re-targeted to `dev` with synthetic data or skipped.

| Aspect | Local | Dev | Production |
|---|---|---|---|
| Runs on | Laptop (Docker) | AWS | AWS |
| Cost | $0 | ~$20–25 USD/mo (scheduled) | $110–253 USD/mo |
| Auth | Mock | Cognito | Cognito |
| Groq vision API | Mock | Mock | Real |
| Email | Mailpit | SES sandbox | SES (production access) |
| Data | Seeded test data | Synthetic | Real user data |
| Deletion protection | N/A | No | Yes |
| Log retention | Terminal only | 7 days | 365 days |
| Uptime | On-demand | **Mon–Fri 08:00–19:00 ET** (see §19.2.2) | 24/7 |
| Public access | localhost only | Public DNS, no allowlist | Public |

### 17.2 Moving from Local to Cloud (Phase B)

The transition is straightforward because Docker containers run identically everywhere. See [ADR-0001](decisions/0001-ec2-docker-compose-over-ecs-fargate.md) for the rationale behind the initial Phase B architecture choices.

**Step 1:** AWS account created, MFA enabled on root account.

**Step 2:** AWS infrastructure provisioned (VPC, RDS, ElastiCache, S3, SES, ALB, ACM, Route 53, Secrets Manager, EC2).

**Step 3:** Production Docker images built (`Dockerfile.prod` for frontend and API), pushed to ECR.

**Step 4:** EC2 instance launched with `docker-compose.prod.yml`. Environment variables point to managed AWS services (RDS instead of local PostgreSQL, ElastiCache instead of local Redis, S3 instead of local filesystem, SES instead of Mailpit).

**Step 5:** The seed script runs against the cloud RDS database.

**Step 6:** Health checks pass, domain is pointed at the ALB.

There is no code rewrite. The only changes are configuration (environment variables) and the addition of production Dockerfiles.

### 17.3 Feature Flags

Feature flags are stored in the `feature_flags` database table in **all environments** (local, dev, and production). This is simpler than managing a separate AWS AppConfig service and requires no extra infrastructure.

To toggle a flag, update the row directly (or build a simple admin UI toggle):
```sql
UPDATE feature_flags SET enabled = true WHERE key = 'FEATURE_AI_SCANNING';
```

| Flag | Default | Purpose |
|---|---|---|
| `FEATURE_AI_SCANNING` | false | Enable after Claude API is configured |
| `FEATURE_BATCH_SCANNING` | false | Enable after individual scan is stable |
| `FEATURE_TRADE_MESSAGING` | false | Enable after trade matching is validated |
| `FEATURE_PUBLIC_LEADERBOARD` | false | Privacy-sensitive |
| `FEATURE_COCA_COLA_STICKERS` | true | Coca-Cola bottle sticker section in album |
| `FEATURE_EXTRA_STICKERS` | true | Panini Extra Sticker inserts — 20-player foil set |
| `FEATURE_TRUST_SAFETY` | false | Post-trade ratings, user reporting, and moderation system |
| `FEATURE_WEB_PUSH` | false | Web push notifications for installed PWA |
| `MAINTENANCE_MODE` | false | Redirect to maintenance page |

## 19. Cloud Infrastructure (AWS)

This section covers the AWS infrastructure provisioned in Phase B. Nothing here is needed to run the application locally.

> **Architecture decision:** Phase B launches on EC2 + Docker Compose rather than ECS Fargate. See [ADR-0001](decisions/0001-ec2-docker-compose-over-ecs-fargate.md) for the full rationale and migration path to Fargate when traffic warrants it.

### 19.1 Cloud Provider: AWS ca-central-1 (Montréal)

All personal data stored in Canada. PIPEDA-compliant by default. Secondary region for DR: `ca-west-1` (Calgary).

### 19.2 Domain & DNS

**Production domain: `cromotrade.ca`** — registered through Namecheap (May 2026). Authoritative DNS lives in **Route 53**: a hosted zone for `cromotrade.ca` is created in AWS, and the four `ns-*.awsdns-*` records returned by AWS are set as the custom nameservers at Namecheap. This keeps every DNS record in Terraform without paying to transfer the registration. DNSSEC is enabled on the Route 53 hosted zone.

SSL/TLS certificates are issued via AWS Certificate Manager in `ca-central-1` for use with the ALB (free, auto-renewing). DNS validation is automatic because the hosted zone is in the same AWS account.

Environment subdomains:
- `cromotrade.ca` → production
- `dev.cromotrade.ca` → dev

(`staging.cromotrade.ca` will be added when staging is introduced — see §17.1.)

### 19.2.1 AWS Account & Budget

- **Region:** `ca-central-1` (Montréal). All resources and Terraform providers default here.
- **Root account:** MFA enabled. Day-to-day work uses an IAM admin user (or Identity Center) — root credentials are not used after initial setup.
- **Budget alert:** $75 USD/month (configured in AWS Budgets). Sits ~$15 above a steady-state dev+prod footprint with the business-hours schedule below, so it's a real alert rather than a tripwire. Raise it again before standing up staging or growing the prod instance class.

### 19.2.2 Business-Hours Schedule (dev only)

The dev environment is scheduled **down outside business hours** to keep dev cost in the $20–25 USD/mo range instead of the $55–60 it would cost running 24/7:

| Window | State |
|---|---|
| Mon–Fri 08:00 ET | EC2 ASG scaled to 1, RDS started |
| Mon–Fri 19:00 ET | EC2 ASG scaled to 0, RDS stopped |
| Sat / Sun | Down all day |

Implementation lives in `infrastructure/terraform/modules/scheduling/`: three `aws_autoscaling_schedule` resources (up, down, weekend safety-net) plus two `aws_scheduler_schedule` resources calling `rds:StartDBInstance` / `rds:StopDBInstance` via EventBridge Scheduler universal targets, with a scoped IAM role. The whole module is gated on an `enable` variable that defaults to `true` for dev and **must be `false` in the prod env config**.

ALB, NAT Gateway, and ElastiCache stay up — stopping them either breaks DNS or doesn't save money (NAT bills per AZ-hour regardless of traffic).

If dev returns 502s outside the window, it's the schedule, not an incident.

### 19.3 Infrastructure as Code: Terraform

All AWS resources defined in Terraform. Never click resources into existence in the console.

```
infrastructure/terraform/modules/
  networking/    → VPC, subnets, security groups
  compute/       → EC2 instance, ALB, launch template
  database/      → RDS PostgreSQL (db.t3.micro)
  cache/         → ElastiCache Redis (cache.t3.micro)
  storage/       → S3 buckets (uploads, backups)
  auth/          → Cognito user pool
  monitoring/    → CloudWatch, alarms
  dns/           → Route 53 records
  ses/           → Email domain verification
  secrets/       → Secrets Manager entries
```

### 19.4 Application Hosting: EC2 + Docker Compose

Both the Next.js frontend and Fastify API run on a **single EC2 instance** (t3.small or t3.medium) via `docker-compose.prod.yml`. The same Docker images used locally are pushed to ECR and pulled by the instance.

- ALB handles HTTPS termination (ACM certificate) and routes `/api/*` to the API container, everything else to the frontend container
- EC2 instance is stateless — all persistent state lives in RDS or S3
- `docker-compose.prod.yml` replaces dev-only services (Mailpit, pgAdmin, Redis Commander) with environment variables pointing at managed AWS services

**Migration path to ECS Fargate:** when sustained CPU > 70% or user base exceeds ~1,000–2,000 MAU, ECS task definitions are created directly from the existing production Dockerfiles. Managed services (RDS, ElastiCache, S3, SES) remain unchanged. See [ADR-0001](decisions/0001-ec2-docker-compose-over-ecs-fargate.md).

### 19.5 Database: RDS PostgreSQL (db.t3.micro)

Managed PostgreSQL 16. Automated daily snapshots with 7-day retention. Point-in-time recovery. Deletion protection enabled in production. Runs in a private subnet — never exposed to the public internet. See [ADR-0002](decisions/0002-rds-postgresql-over-aurora-serverless.md) for the rationale over Aurora Serverless v2.

### 19.6 Cache: ElastiCache Redis (cache.t3.micro)

Managed Redis 7. Runs in the same private subnet as RDS. No host-level ops or patching required.

### 19.7 File Storage: S3

Replaces the `local_uploads` Docker volume. The API writes uploaded sticker images directly to S3. Bucket policy restricts access to the EC2 instance IAM role.

### 19.8 Email: SES

Replaces Mailpit. Domain verified in SES with SPF/DKIM/DMARC. Start in SES sandbox; request production access once the domain is verified and first emails are sending.

### 19.9 Estimated Monthly Cost (< 100 users)

| Service | Monthly (USD) |
|---|---|
| EC2 t3.small | ~$15 |
| RDS db.t3.micro (PostgreSQL) | ~$15 |
| ElastiCache cache.t3.micro | ~$12 |
| ALB | ~$8 |
| S3 + data transfer | ~$1–2 |
| SES | ~$1 |
| Route 53 | ~$1–2 |
| Secrets Manager | ~$1 |
| ACM | $0 |
| **Total** | **~$54–56 USD/month** |

### 19.10 Security

- ALB + ACM — all traffic HTTPS; HTTP redirects to HTTPS at the load balancer
- Private VPC subnets — RDS and ElastiCache never exposed to the public internet
- EC2 security group — inbound 443/80 from ALB only; no direct SSH from the internet (use AWS Systems Manager Session Manager)
- AWS Shield Standard (free) — DDoS protection
- AWS CloudTrail — audit log of all AWS API calls

