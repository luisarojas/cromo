# Infrastructure

> **Parent document:** [`overview.md`](overview.md#document-map) — this file is the detailed expansion of environment strategy (parent §17) and cloud infrastructure on AWS (parent §19).

## 17. Environment Strategy

### 17.1 The Four Environments

```
LOCAL → DEV → STAGING → PRODUCTION
```

| Aspect | Local | Dev | Staging | Production |
|---|---|---|---|---|
| Runs on | Laptop (Docker) | AWS | AWS | AWS |
| Cost | $0 | $15–30 USD/mo | $80–120 USD/mo | $110–253 USD/mo |
| Auth | Mock | Cognito | Cognito | Cognito |
| Claude API | Mock | Mock | Real | Real |
| Email | Mailpit | SES sandbox | SES | SES |
| Data | Seeded test data | Synthetic | Anonymised prod | Real user data |
| Deletion protection | N/A | No | No | Yes |
| Log retention | Terminal only | 7 days | 30 days | 365 days |
| Public access | localhost only | IP allowlist | Basic Auth | Yes |

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

Feature flags are stored in the `feature_flags` database table in **all environments** (local, dev, staging, and production). This is simpler than managing a separate AWS AppConfig service and requires no extra infrastructure.

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
- `staging.cromotrade.ca` → staging
- `dev.cromotrade.ca` → dev

### 19.2.1 AWS Account & Budget

- **Region:** `ca-central-1` (Montréal). All resources and Terraform providers default here.
- **Root account:** MFA enabled. Day-to-day work uses an IAM admin user (or Identity Center) — root credentials are not used after initial setup.
- **Budget alert:** $50 USD/month (configured in AWS Budgets). The spec's launch estimate is ~$55–61/month, so the alert is intentionally tight — it will fire as soon as a full environment is running. Treat it as a tripwire, not a headroom buffer. Raise it before standing up staging or production.

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

