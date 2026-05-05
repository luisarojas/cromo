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

The transition is straightforward because Docker containers run identically everywhere:

**Step 1:** AWS account created, MFA enabled on root account.

**Step 2:** Terraform provisions the AWS infrastructure for dev environment:
```bash
cd infrastructure/terraform/environments/dev
terraform init
terraform apply
```

**Step 3:** GitHub Actions CI/CD is configured with AWS credentials.

**Step 4:** The same Docker image that ran locally is pushed to AWS ECR and deployed to ECS Fargate. The environment variables are updated to point to real AWS services (Aurora instead of local PostgreSQL, ElastiCache instead of local Redis, etc.).

**Step 5:** The seed script runs against the new cloud database.

**Step 6:** Staging is provisioned and verified. Production follows once staging is stable.

There is no code rewrite. The only changes are configuration (environment variables) and infrastructure (Terraform).

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
| `FEATURE_COCA_COLA_STICKERS` | false | Enable when sticker list confirmed |
| `MAINTENANCE_MODE` | false | Redirect to maintenance page |

## 19. Cloud Infrastructure (AWS)

This section covers the AWS infrastructure provisioned in Phase B. Nothing here is needed to run the application locally.

### 19.1 Cloud Provider: AWS ca-central-1 (Montréal)

All personal data stored in Canada. PIPEDA-compliant by default. Secondary region for DR: `ca-west-1` (Calgary).

### 19.2 Domain & DNS

Register domain via AWS Route 53 or Namecheap (~$15–20 CAD/year for `.ca`). DNS via Route 53 with DNSSEC. SSL/TLS via AWS Certificate Manager (free, auto-renewing).

### 19.3 Infrastructure as Code: Terraform

All AWS resources defined in Terraform. Never click resources into existence in the console.

```
infrastructure/terraform/modules/
  networking/    → VPC, subnets, NAT gateway, security groups
  compute/       → ECS cluster, Fargate task definitions, ALB
  database/      → Aurora PostgreSQL, RDS Proxy
  cache/         → ElastiCache Redis
  storage/       → S3 buckets
  auth/          → Cognito user pool
  monitoring/    → CloudWatch, alarms
  grafana/       → Grafana EC2 instance
  plausible/     → Plausible analytics EC2
  waf/           → WAF rules and rate limits
  dns/           → Route 53 records
  cdn/           → CloudFront distribution
  ses/           → Email domain verification
```

### 19.4 Frontend Hosting: Vercel

Next.js frontend hosted on Vercel. No AWS infrastructure needed for the frontend. Native GitHub integration deploys every PR as a preview URL. Frontend files are HTML/CSS/JS only — no personal data, not a PIPEDA concern.

### 19.5 Backend Hosting: AWS ECS Fargate

Same Docker container that ran locally runs in ECS Fargate. Auto-scales between 1 and 4 tasks based on CPU. No servers to manage or patch.

### 19.6 Database: Aurora PostgreSQL Serverless v2

Minimum 0 ACUs (scales to zero after 5 min inactivity). Maximum 4 ACUs at launch. Deletion protection enabled in production. Point-in-time recovery for 35 days.

### 19.7 Security

- AWS WAF — blocks attacks, enforces rate limits
- AWS Shield Standard (free) — DDoS protection
- Private VPC — database never exposed to the public internet
- AWS GuardDuty — automated threat detection
- AWS CloudTrail — 1 year audit log of all AWS API calls

