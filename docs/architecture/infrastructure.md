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
| Public access | localhost only | IP allowlist only (see §19.2.3) | Public |

### 17.2 Moving from Local to Cloud (Phase B)

The transition is straightforward because Docker containers run identically everywhere. See [ADR-0001](decisions/0001-ec2-docker-compose-over-ecs-fargate.md) for the rationale behind the initial Phase B architecture choices.

**Step 1:** AWS account created, MFA enabled on root account.

**Step 2:** AWS infrastructure provisioned (VPC, RDS, ElastiCache, S3, SES, ALB, ACM, Route 53, Secrets Manager, EC2).

**Step 3:** Cloud Docker images built (`Dockerfile.cloud` for frontend and API), pushed to ECR.

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

### 19.0 Big-Picture Diagram

Production topology end-to-end. Every box is a real AWS resource provisioned by a Terraform module under `infrastructure/terraform/modules/` — the module name is in parentheses next to each box. Dev looks the same with smaller instance types, a single NAT, and the §19.2.2 business-hours schedule layered on top.

```
                       ┌──────────────────────┐
                       │  User's browser /    │
                       │  installed PWA       │
                       └──────────┬───────────┘
                                  │ https://cromotrade.ca
                                  ▼
                       ┌──────────────────────┐
                       │  Route 53            │   Authoritative DNS for
                       │  hosted zone (dns)   │   cromotrade.ca. Resolves the
                       └──────────┬───────────┘   apex to the ALB below.
                                  │
                                  ▼
                       ┌──────────────────────┐
                       │  ACM certificate     │   Free TLS cert auto-renewed
                       │  (compute)           │   by AWS, attached to the ALB.
                       └──────────┬───────────┘
                                  │ HTTPS 443
                                  ▼
   ╔══════════════════════════════════════════════════════════════════════╗
   ║  VPC 10.30.0.0/16  ·  ca-central-1  (networking module)              ║
   ║                                                                      ║
   ║   ┌──── Public subnets (AZ-a, AZ-b) ────────────────────────────┐    ║
   ║   │                                                             │    ║
   ║   │   ┌──────────────────────┐    ┌──────────────────────┐      │    ║
   ║   │   │  Application Load    │    │  NAT Gateway × 2     │      │    ║
   ║   │   │  Balancer (compute)  │    │  (networking)        │      │    ║
   ║   │   │  · :443 → frontend   │    │  Outbound internet   │      │    ║
   ║   │   │  · /api/* → api      │    │  for private subnets │      │    ║
   ║   │   └──────────┬───────────┘    └──────────▲───────────┘      │    ║
   ║   └──────────────│───────────────────────────│──────────────────┘    ║
   ║                  │ (in-VPC, port 80)         │ (egress only)         ║
   ║   ┌──── Private │ subnets (AZ-a, AZ-b) ──────│──────────────────┐    ║
   ║   │              ▼                           │                  │    ║
   ║   │   ┌──────────────────────────────────────│──────────┐       │    ║
   ║   │   │  EC2 Auto Scaling Group (compute)    │          │       │    ║
   ║   │   │  t3.medium · Amazon Linux 2023       │          │       │    ║
   ║   │   │  ┌─────────────────────────────────┐ │          │       │    ║
   ║   │   │  │  docker-compose.prod.yml        │ │          │       │    ║
   ║   │   │  │  ┌──────────┐   ┌──────────┐    │ │          │       │    ║
   ║   │   │  │  │ frontend │   │   api    │    │ │          │       │    ║
   ║   │   │  │  │ Next.js  │   │ Fastify  │    │ │          │       │    ║
   ║   │   │  │  └──────────┘   └────┬─────┘    │ │          │       │    ║
   ║   │   │  └────────────────────┬─┼──────────┘ │          │       │    ║
   ║   │   └───────┬────────┬──────┼─┼────────────┘          │       │    ║
   ║   │           │        │      │ │                       │       │    ║
   ║   │           ▼        ▼      │ │                       │       │    ║
   ║   │   ┌──────────┐ ┌─────────┐│ │                       │       │    ║
   ║   │   │   RDS    │ │ Elasti- ││ │                       │       │    ║
   ║   │   │ Postgres │ │ Cache   ││ │                       │       │    ║
   ║   │   │ Multi-AZ │ │ Redis   ││ │                       │       │    ║
   ║   │   │(database)│ │ (cache) ││ │                       │       │    ║
   ║   │   └──────────┘ └─────────┘│ │                       │       │    ║
   ║   └───────────────────────────│─│───────────────────────────────┘    ║
   ╚═══════════════════════════════│═│════════════════════════════════════╝
                                   │ │  (via NAT, AWS service endpoints)
              ┌────────────────────┘ └───────────────────────┐
              │                                              │
   ┌──────────▼─────────┐  ┌──────────────────┐  ┌──────────▼──────────┐
   │  S3 uploads bucket │  │  Cognito user    │  │  SES domain         │
   │  (storage)         │  │  pool (auth)     │  │  identity (ses)     │
   │  Sticker photos    │  │  Email/password  │  │  Verification +     │
   │  + binaries        │  │  + JWT issuance  │  │  password reset     │
   └──────────┬─────────┘  └──────────────────┘  └─────────────────────┘
              │  (origin)
              ▼
   ┌────────────────────┐    ┌──────────────────┐    ┌─────────────────┐
   │  CloudFront        │    │  Secrets Manager │    │  ECR Docker     │
   │  distribution      │    │  cromo-prod      │    │  registry       │
   │  (cdn)             │    │  (secrets)       │    │  (bootstrap)    │
   │  Public read URL   │    │  DB URL, JWT,    │    │  Pulled by EC2  │
   │  for uploaded imgs │    │  Groq key, …     │    │  on deploy      │
   └────────────────────┘    └──────────────────┘    └─────────────────┘

   ┌──────────────── Observability + Ops ──────────────────────────────┐
   │                                                                   │
   │   CloudWatch Logs       CloudWatch Alarms       SNS → alert email │
   │   (monitoring)          (monitoring)            (monitoring)      │
   │   API + frontend logs   RDS CPU, ALB 5xx,       Pages you when an │
   │   365-day retention     unhealthy hosts         alarm trips       │
   │                                                                   │
   │   IAM instance profile  Systems Manager         AppRegistry app   │
   │   (compute)             Session Manager         (appregistry)     │
   │   Lets EC2 read S3 +    SSH-less shell to EC2   Groups every res. │
   │   Secrets + write logs  via the AWS console     in a console view │
   └───────────────────────────────────────────────────────────────────┘

   ┌──────────────── Deploy pipeline ──────────────────────────────────┐
   │                                                                   │
   │   GitHub Actions   ──OIDC──▶   IAM role (cicd)   ──▶   ECR push   │
   │   on tag v*                    no long-lived keys      + ASG roll │
   └───────────────────────────────────────────────────────────────────┘
```

#### What each AWS service actually does (plain English)

If you've never used AWS before, here is what every box above is and why Cromo needs it.

| Service | What it is | Why Cromo uses it |
|---|---|---|
| **Route 53** | AWS's DNS — translates `cromotrade.ca` into an IP address. | Owns the records for the apex domain and `dev.cromotrade.ca`. The domain is registered at Namecheap (cheaper), but the *nameservers* point at Route 53 so every record lives in Terraform. |
| **ACM (Certificate Manager)** | Issues and auto-renews free TLS certificates. | Gives the ALB the cert behind `https://cromotrade.ca` so the browser shows the padlock. No manual renewals, no Let's Encrypt cron job. |
| **VPC (Virtual Private Cloud)** | A private network inside AWS that you fully control. | The fence around every Cromo resource. Nothing in here is reachable from the public internet unless we explicitly open a door (the ALB). |
| **Public subnet** | A slice of the VPC whose traffic *can* reach the internet directly. | Holds only the ALB and NAT Gateways — the things that genuinely need a public IP. Nothing with user data lives here. |
| **Private subnet** | A slice of the VPC with no inbound internet route. | Where the app, database, and cache live. Even if a bug exposed Postgres on `0.0.0.0`, the network would still refuse outside connections. |
| **Internet Gateway** | The single doorway between the VPC and the public internet. | Lets the ALB receive user requests. Attached to public subnets only. |
| **NAT Gateway** | One-way outbound internet for private subnets. | Lets EC2 reach Groq's vision API, SES, and ECR without giving it a public IP. Prod runs one per AZ so an AZ outage doesn't kill outbound traffic. |
| **Application Load Balancer (ALB)** | A managed HTTPS reverse proxy. | The only public entry point. Terminates TLS, routes `/api/*` to the API container and everything else to the frontend container, and health-checks both. |
| **EC2** | A virtual machine you rent by the hour. | Runs the same `docker compose` setup you use locally, with `docker-compose.prod.yml`. One instance (t3.medium in prod, t3.small in dev) wrapped in an Auto Scaling Group so it self-heals if it crashes. |
| **Auto Scaling Group (ASG)** | A controller that keeps N copies of an EC2 instance alive. | Today N=1. Its real job is self-healing (a crashed instance is replaced automatically) and being the hook the §19.2.2 dev schedule uses to scale to zero overnight. |
| **RDS (PostgreSQL)** | A managed database. AWS handles backups, patching, failover. | Cromo's primary store: users, stickers, trades, etc. `db.t3.small` in prod with Multi-AZ (a hot standby in a second datacentre) and 30-day point-in-time recovery. |
| **ElastiCache (Redis)** | A managed Redis cluster. | Caches API responses (sticker catalog, version probe), holds BullMQ background-job queues, and stores SSE pub/sub fan-out. `cache.t3.micro` × 2 nodes in prod for failover. |
| **S3 (Simple Storage Service)** | Cheap, durable object storage — files on a URL. | Replaces the `local_uploads` Docker volume. User-uploaded sticker photos land here. The bucket is private; only the EC2 IAM role and CloudFront can read it. |
| **CloudFront** | AWS's CDN. Caches S3 objects at edge locations worldwide. | Serves uploaded images fast from anywhere, and is the *only* thing allowed to read the uploads bucket directly. The frontend builds image URLs against the CloudFront domain, never S3. |
| **Cognito** | A managed identity service: signup, login, password reset, JWTs. | Issues the access tokens the API validates on every request. Replaces the mock auth used locally. |
| **SES (Simple Email Service)** | AWS's transactional email sender. | Sends verification, password-reset, and trade-notification emails from `no-reply@cromotrade.ca`. SPF/DKIM/DMARC records are provisioned automatically. |
| **Secrets Manager** | Encrypted key/value store for runtime config. | Holds `DATABASE_URL`, `JWT_SECRET`, `GROQ_API_KEY`, Cognito IDs, etc. EC2 reads this at boot — secrets never sit in the AMI, the Compose file, or git. |
| **ECR (Elastic Container Registry)** | A private Docker registry. | Stores the `frontend` and `api` images produced by CI. EC2 pulls them on deploy. Provisioned once by the `bootstrap` workspace because it outlives any env. |
| **CloudWatch Logs** | Managed log aggregation. | Both containers stream stdout/stderr here via the Docker awslogs driver. 365-day retention in prod, 7-day in dev. |
| **CloudWatch Alarms + SNS** | Alarms watch metrics; SNS delivers the page. | Three alarms today: RDS CPU > 80%, ALB 5xx surge, zero healthy hosts. Each one publishes to an SNS topic that emails the on-call address. |
| **IAM (Identity and Access Management)** | AWS's permission system. | Two roles matter here: the **instance profile** EC2 wears (read S3, read Secrets Manager, write CloudWatch, pull from ECR) and the **deploy role** GitHub Actions assumes via OIDC (push to ECR, refresh the ASG). No long-lived AWS keys exist anywhere. |
| **Systems Manager Session Manager** | Browser-based shell into EC2 without SSH. | The only way to get a terminal on the box. Port 22 is closed to the world; you connect through the AWS console and IAM authorises the session. |
| **AppRegistry (myApplications)** | A console-side grouping of resources tagged with the same application ID. | Powers the `cromo-prod` "myApplications" dashboard — one place in the console that shows the running cost and health of every resource in this stack, no tag-filter spelunking. |
| **GitHub OIDC + IAM role** | A trust between GitHub Actions and AWS — no stored keys. | CI tag pushes (`v*`) assume the prod deploy role for ~1 hour, push images to ECR, and trigger an instance refresh. Pushes to `main` get the dev role only. |

#### How a single request flows through this

1. Browser asks Route 53 for `cromotrade.ca` → gets the ALB's IP.
2. Browser opens TLS to the ALB; ACM provides the cert.
3. ALB inspects the path. `/api/*` → API container on EC2:3001. Anything else → frontend container on EC2:3000.
4. The API container reads its config from environment variables that EC2 hydrated from **Secrets Manager** at boot.
5. The API talks to **RDS** for persistent data and **ElastiCache** for cached/queued data — both over the private subnet, never the internet.
6. If the request involves an uploaded image, the API writes the file to **S3** and stores its key in Postgres. The frontend later builds a **CloudFront** URL for that key so the browser fetches the image from the CDN.
7. If the request triggers an email (verify, reset, trade alert), the API hands the message to **SES**, which sends it from `no-reply@cromotrade.ca`.
8. If the request requires auth, the API validates the JWT against **Cognito**'s public keys.
9. Every container log line is shipped to **CloudWatch Logs**. If something goes badly wrong (5xx storm, RDS CPU spike, zero healthy hosts), a CloudWatch Alarm fires → SNS → email.

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

### 19.2.3 Dev ALB IP Allowlist

The dev environment is not publicly accessible. The ALB security group restricts inbound traffic (ports 80 and 443) to an explicit CIDR allowlist defined in `infrastructure/terraform/env/dev/terraform.tfvars`:

```hcl
alb_ingress_cidrs = ["<your-ip>/32"]
```

Anyone outside the allowlist receives a connection timeout. Production is unaffected — its networking module defaults to `["0.0.0.0/0"]`.

**Updating the allowlist** (e.g. when your home IP changes):

1. Get your current IP: `curl https://checkip.amazonaws.com`
2. Update `alb_ingress_cidrs` in `infrastructure/terraform/env/dev/terraform.tfvars`
3. Apply: `AWS_PROFILE=cromo terraform -chdir=infrastructure/terraform/env/dev apply -target=module.networking -auto-approve`

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
- Dev ALB IP allowlist — dev environment not publicly reachable; see §19.2.3
- Private VPC subnets — RDS and ElastiCache never exposed to the public internet
- EC2 security group — inbound 443/80 from ALB only; no direct SSH from the internet (use AWS Systems Manager Session Manager)
- AWS Shield Standard (free) — DDoS protection
- AWS CloudTrail — audit log of all AWS API calls

