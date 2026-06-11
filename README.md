# Cromo

> _**Cromo** (n., Spanish) — a trading sticker or collector's card. From Greek **chroma**, "color."_

A multi-user web application for tracking, managing, and trading stickers from the 2026 FIFA World Cup Panini sticker collection. See [`BRAND.md`](BRAND.md) for the visual identity spec.

The repository name and internal workspace package names (`@cromo/*`) still reflect the project's original codename and are intentionally untouched — renaming them requires a coordinated lockfile + import sweep best done as a separate change.

## Getting Started

### Prerequisites

- [Docker Desktop](https://docker.com/products/docker-desktop)
- [Node.js 22 LTS](https://nodejs.org)
- [pnpm](https://pnpm.io/installation) (`npm install -g pnpm`)
- Git

### Run Locally

1. **Clone the repo**
   ```bash
   git clone https://github.com/your-org/cromo.git
   cd cromo
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment**
   ```bash
   cp .env.example .env.local
   ```
   No changes needed — defaults work for local development.

4. **Start all services**
   ```bash
   docker compose -f infrastructure/docker/docker-compose.yml up -d
   ```

5. **Seed catalog data**
   ```bash
   pnpm db:seed
   ```
   Drizzle migrations apply automatically when the API container starts
   (`runMigrations()` in `apps/backend/src/db/migrate.ts`). `pnpm db:migrate`
   is available for manual re-runs against the API container.

6. **Open the app**

   | Service | URL |
   |---|---|
   | Frontend | http://localhost:3000 |
   | API | http://localhost:3001/api/v1/health |
   | API Docs | http://localhost:3001/docs |
   | Email inbox (Mailpit) | http://localhost:8025 |
   | Cache browser | http://localhost:8081 |
   | Database viewer | http://localhost:5050 |

### Test accounts

In local mode, any password is accepted.

| Role | Email |
|---|---|
| Admin | admin@test.local |
| Alice (partial collection) | alice@test.local |
| Bob (overlapping collection) | bob@test.local |
| Charlie | charlie@test.local |
| Diana | diana@test.local |
| Evan | evan@test.local |

### Development workflow

```bash
# Start all Docker services
docker compose -f infrastructure/docker/docker-compose.yml up -d

# Run tests once
pnpm test

# Run tests in watch mode
pnpm test:watch

# TypeScript type check
pnpm typecheck

# Stop all services
docker compose -f infrastructure/docker/docker-compose.yml down

# Stop and wipe all data (fresh start)
docker compose -f infrastructure/docker/docker-compose.yml down -v
```

## Architecture

### How the app works

A user request enters at `cromotrade.ca`. Route 53 resolves the hostname to an Application Load Balancer fronting the application tier; the ALB terminates TLS (ACM-issued certificate) and routes by path — HTML/JS/CSS to the Next.js frontend container, `/api/*` to the Fastify backend container. Both containers run on EC2 instances managed by an Auto Scaling Group.

The backend reaches sideways to four AWS-managed services that hold persistent state and provide capabilities the app doesn't run itself:

- **RDS PostgreSQL** — every row of application state: users, albums, stickers, trades, ratings, and the `email_suppressions` table that backs the bounce/complaint guard. Schema is managed by Drizzle ORM with migrations applied at API startup.
- **ElastiCache Redis** — two jobs: (1) read-through cache for hot endpoints (sticker catalog, profile cards) and (2) the in-process job queue that defers email sending off the request path so SES latency never blocks a handler.
- **S3 + CloudFront** — uploaded images (avatars, sticker scans). S3 holds the bytes; CloudFront serves them from an edge POP close to the collector. The bucket is private; CloudFront uses an Origin Access Control identity to read.
- **Cognito** — authentication. The frontend handles signup/login against the user pool directly and forwards the JWT to the backend, which verifies the signature via JWKS and trusts the claims.

Two asynchronous loops run inside the backend process, started from `app.ts` next to the request handler:

1. **Email-send worker** — drains the Redis job queue and hands each message to SES (via Nodemailer's SESv2 transport). Sends that target an address listed in `email_suppressions` are dropped before the wire call.
2. **SES event poller** — long-polls the per-environment SQS queue (`cromo-{env}-ses-events`) that SES populates with bounce and complaint events. Each event writes the affected address into `email_suppressions`. See the dedicated section below.

Two outbound integrations sit outside AWS: **Gemini or Groq** for sticker identification (provider selected via `SCAN_PROVIDER`), and the standard browser **Web Push** service for VAPID-signed notifications.

### High-level component diagram

```
                ┌─────────────────┐
                │ Browser / PWA   │
                │ • Next.js client│
                │ • Service Worker│
                └────────┬────────┘
                         │ HTTPS
                         ▼
                ┌─────────────────┐
                │ Route 53 DNS    │
                │ (cromotrade.ca) │
                └────────┬────────┘
                         ▼
        ┌─────────────────────────────────────────┐
        │ Application Load Balancer (ACM TLS)     │
        └──┬────────────────────────────────┬─────┘
           │ /                              │ /api/*
           ▼                                ▼
   ┌──────────────┐                  ┌──────────────┐
   │  Frontend    │                  │  Backend     │
   │  Next.js 15  │                  │  Fastify     │
   │  EC2 / ASG   │                  │  EC2 / ASG   │
   └──────────────┘                  └──────┬───────┘
                                            │
       ┌────────────┬────────────┬──────────┴──────────┬────────────┬────────────┐
       ▼            ▼            ▼                     ▼            ▼            ▼
  ┌──────────┐ ┌─────────┐ ┌─────────────┐  ┌───────────────┐ ┌──────────┐ ┌────────────┐
  │   RDS    │ │  Redis  │ │     S3      │  │    Cognito    │ │   SES    │ │ Gemini /   │
  │ Postgres │ │  cache  │ │ + CloudFront│  │   user pool   │ │ outbound │ │ Groq       │
  │  state   │ │  + jobs │ │   uploads   │  │   (auth/JWT)  │ │  email   │ │ scan AI    │
  └──────────┘ └─────────┘ └─────────────┘  └───────────────┘ └──────────┘ └────────────┘
```

### Email reliability: the SES bounce/complaint pipeline

Bounce and complaint events follow a deliberate path designed to survive backend rolls and rule out the "send to a known-bad address twice" failure mode that gets SES senders throttled. SES publishes events to two account-level SNS topics; SNS fans them out to a per-environment SQS queue (the per-env split keeps dev's suppressions from interfering with prod's). The backend's in-process poller drains the queue and writes every affected address into the `email_suppressions` table. Every outgoing send checks that table first.

Two layers of suppression run in parallel: the AWS account-level suppression list catches anything that slips past the app, and the app-level table catches addresses before they reach SES at all.

```
   ┌──────────┐
   │   SES    │ ──── bounce event ─────┐
   │ outbound │ ──── complaint event ──┤
   └──────────┘                        │
                                       ▼
                              ┌──────────────────┐
                              │ SNS topics       │
                              │  • bounces       │
                              │  • complaints    │
                              └────────┬─────────┘
                                       │  raw_message_delivery
                                       ▼
                              ┌──────────────────┐
                              │ SQS queue        │
                              │ cromo-{env}-     │
                              │ ses-events       │
                              └────────┬─────────┘
                                       │  long-poll (20s)
                                       ▼
                              ┌──────────────────┐
                              │ Backend          │
                              │ ses-poller       │
                              │ (in-process)     │
                              └────────┬─────────┘
                                       │  INSERT/UPSERT
                                       ▼
                              ┌──────────────────┐
                              │ email_suppressions│
                              │ table (RDS)      │
                              └──────────────────┘
```

The queue's 14-day retention means a rolling deploy, an overnight scale-to-zero on dev, or any other temporary unavailability doesn't drop bounce events — they sit safely until the next poll. Five failed delivery attempts on a message send it to a dead-letter queue rather than blocking fresh events behind it.

### Infrastructure-as-code and deploys

All cloud resources are managed by Terraform in `infrastructure/terraform/`, split across three independently-applied stacks: `env/shared/` (account-wide: Route 53 zone, SES identity, SNS topics, the OIDC role for the deploy pipeline), `env/dev/`, and `env/prod/`. Routine applies run through GitHub Actions OIDC — pushes to `main` apply `shared` and `dev` automatically; `prod` applies only when a `v*` release tag is pushed via `scripts/release.sh`. Local `terraform apply` from the laptop is reserved for break-glass recovery.

The application itself is shipped as two Docker images (frontend, backend) built and pushed to ECR by the CI/CD workflow on every merge to `main`; the dev ASG instance refresh pulls the new image and replaces the running container. The runtime configuration each container reads (database URL, Cognito IDs, SQS queue URL, scan provider keys) lives in a per-environment Secrets Manager blob whose JSON is materialised onto disk at instance launch by user-data.

### Tech stack reference

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 + TypeScript + Tailwind CSS |
| Backend | Node.js + Fastify + TypeScript |
| Database | PostgreSQL 16 (Docker) → RDS PostgreSQL `db.t3.micro` (cloud) |
| Cache | Redis 7 (Docker) → ElastiCache (cloud) |
| Auth | Local mock → AWS Cognito (cloud) |
| Email | Mailpit (local) → AWS SES + SNS + SQS (cloud) |
| File storage | Local filesystem (Docker) → S3 + CloudFront (cloud) |
| Sticker AI | Mock (local) → Gemini 2.5 Flash or Groq Llama 4 Scout (cloud) |
| Schema & migrations | Drizzle ORM (`apps/backend/src/db/schema.ts` + `migrations/`), applied at API startup |
| Infrastructure | Terraform (multi-stack: shared / dev / prod) |
| CI/CD | GitHub Actions + OIDC role assumption |
| Monorepo | Turborepo |

See [`docs/architecture/overview.md`](docs/architecture/overview.md) for the full technical specification, including request-flow sequence diagrams, capacity planning, and the per-module design rationale.
