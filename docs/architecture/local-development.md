# Local Development

> **Parent document:** [`overview.md`](overview.md#document-map) — this file is the detailed expansion of the local-first development approach (parent §2) and the local-development environment (parent §4).

## 2. Development Approach: Local First, Cloud Second

### 2.1 Is This a Good Approach?

**Yes — absolutely.** Building and running the application locally first is not just acceptable, it is the recommended professional approach. Every experienced development team does this. It is cheaper, faster to iterate, easier to debug, and lets you validate the entire application before spending a single dollar on cloud infrastructure.

The local-first approach means:

- You can see the application working on your own machine before any cloud account is needed
- Every feature can be built, tested, and corrected in seconds rather than minutes
- Cloud infrastructure mistakes don't cost money during the learning and building phase
- The transition to cloud is clean because local and cloud are identical in their use of Docker containers

### 2.2 The Two Environments

**Local Development (build everything, validate it works)**

The entire application runs on your laptop using Docker Compose. No AWS account needed for day-to-day work. No domain. No SSL certificates. Just a `docker compose up` command and you have a fully working application at `http://localhost:3000`.

Locally:
- All application features are built and tested
- The database is seeded with the full 2026 World Cup data
- The test suite runs in `pnpm test`
- The AI scanning feature uses a local mock
- Performance is validated with a local load test (k6)

**Cloud (the same containers, deployed to AWS)**

The exact same Docker images that run locally are deployed to AWS. Because Docker packages the application identically regardless of where it runs, the cloud deployment is reliable. We are not rewriting anything — we are running a proven, tested system on managed infrastructure.

The dev environment is live today; production is provisioned with the same Terraform modules using prod-specific inputs (see [`devops.md` §18.3](./devops.md#183-production-pipeline-future)).

### 2.3 What Changes Between Local and Cloud

| Concern | Local | Cloud (AWS) |
|---|---|---|
| Database | PostgreSQL in Docker | RDS PostgreSQL (`db.t3.micro` at launch — see [ADR-0002](decisions/0002-rds-postgresql-over-aurora-serverless.md)) |
| Cache | Redis in Docker | ElastiCache Redis (`cache.t3.micro`) |
| Auth | Local mock (any email/password works) | AWS Cognito |
| Email | Mailpit (local inbox at localhost:8025) | AWS SES |
| File storage | Local filesystem directory | AWS S3 |
| AI scanning | Returns hardcoded mock result | Gemini API (Gemini 2.5 Flash) |
| Frontend hosting | `localhost:3000` | EC2 + Docker Compose (co-hosted with API — see [ADR-0001](decisions/0001-ec2-docker-compose-over-ecs-fargate.md)) |
| API hosting | `localhost:3001` | EC2 + Docker Compose |
| SSL/TLS | None (HTTP only) | AWS Certificate Manager (HTTPS) terminating at ALB |
| Domain | None | Route 53 (`cromotrade.ca`) |
| Monitoring | Console logs | CloudWatch metric alarms (RDS CPU, ALB unhealthy hosts) |
| Cost | $0 | ~$55–61 USD/month (see `overview.md §32`) |

Everything else — the codebase, the database schema, the API routes, the frontend, the tests — is **identical** between local and cloud. This is the power of containerisation.

### 2.4 Prerequisites for Local Development

Before a developer can run the application locally, they need:

| Tool | Purpose | Install |
|---|---|---|
| **Docker Desktop** | Runs all services in containers | docker.com/products/docker-desktop |
| **Node.js 22 LTS** | Runs the build tools | nodejs.org |
| **Git** | Version control | git-scm.com |
| **VS Code** (recommended) | Code editor | code.visualstudio.com |
| A terminal (zsh/bash) | Running commands | Built into macOS/Linux |

That is the complete list. No AWS account. No database installation. No Redis installation. Docker handles all of it.

### 2.5 Running the Application Locally — The Developer Experience

Once the repository is cloned and Docker Desktop is running:

```bash
# Clone the repository
git clone https://github.com/your-org/cromo.git
cd cromo

# Copy the example environment file
cp .env.example .env.local
# (no changes needed — defaults work for local)

# Start everything: PostgreSQL, Redis, API, Frontend
docker compose up

# In a separate terminal, seed the database
pnpm db:seed
```

After about 30 seconds, the application is available at:
- **Frontend:** http://localhost:3000
- **API:** http://localhost:3001
- **Email inbox (Mailpit):** http://localhost:8025
- **Redis Commander (cache viewer):** http://localhost:8081
- **pgAdmin (database viewer):** http://localhost:5050

A developer does not need to understand AWS, Terraform, or cloud concepts to start contributing on day one.

---
## 4. Local Development Environment

### 4.1 docker-compose.yml

This single file defines the complete local environment. Running `docker compose up` starts every service automatically.

```yaml
# infrastructure/docker/docker-compose.yml
version: "3.9"

services:

  # ─── PostgreSQL Database ───────────────────────────────────
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: cromo
      POSTGRES_PASSWORD: localpassword
      POSTGRES_DB: cromo_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ../../data/migrations:/docker-entrypoint-initdb.d  # auto-runs on first start
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U cromo"]
      interval: 5s
      timeout: 3s
      retries: 5

  # ─── Redis Cache ───────────────────────────────────────────
  cache:
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  # ─── Backend API ───────────────────────────────────────────
  api:
    build:
      context: ../../apps/backend
      dockerfile: Dockerfile.local         # uses ts-node for live reload
    restart: unless-stopped
    ports:
      - "3001:3001"
    environment:
      NODE_ENV: development
      DATABASE_URL: postgres://cromo:localpassword@db:5432/cromo_dev
      REDIS_URL: redis://cache:6379
      JWT_SECRET: local-dev-secret-not-for-production
      AUTH_MODE: local                    # bypasses Cognito locally
      GEMINI_API_KEY: mock                  # returns mock scan results locally
      S3_MODE: local                      # saves files to ./uploads/ locally
      PORT: 3001
    volumes:
      - ../../apps/backend/src:/app/src   # live code reload
      - local_uploads:/app/uploads        # local file storage mock
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_healthy

  # ─── Frontend ──────────────────────────────────────────────
  frontend:
    build:
      context: ../../apps/frontend
      dockerfile: Dockerfile.local
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3001
      NEXT_PUBLIC_ENV: development
    volumes:
      - ../../apps/frontend/src:/app/src  # live code reload
    depends_on:
      - api

  # ─── Mailpit (local email catcher) ─────────────────────────
  mailpit:
    image: axllent/mailpit:latest
    restart: unless-stopped
    ports:
      - "8025:8025"   # web UI
      - "1025:1025"   # SMTP port

  # ─── Redis Commander (cache browser) ───────────────────────
  redis-commander:
    image: rediscommander/redis-commander:latest
    restart: unless-stopped
    environment:
      REDIS_HOSTS: local:cache:6379
    ports:
      - "8081:8081"
    depends_on:
      - cache

  # ─── pgAdmin (database browser) ────────────────────────────
  pgadmin:
    image: dpage/pgadmin4:latest
    restart: unless-stopped
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@local.dev
      PGADMIN_DEFAULT_PASSWORD: admin
    ports:
      - "5050:80"
    depends_on:
      - db

volumes:
  postgres_data:
  local_uploads:
```

### 4.2 Environment Variables (.env.example)

```bash
# .env.example — copy to .env.local for local development
# All values shown are safe defaults for local use only

# Application
NODE_ENV=development
APP_VERSION=0.0.0-local
PORT=3001

# Database
DATABASE_URL=postgres://cromo:localpassword@localhost:5432/cromo_dev

# Redis
REDIS_URL=redis://localhost:6379

# Auth (set to 'local' to bypass Cognito locally)
AUTH_MODE=local
JWT_SECRET=local-dev-secret-change-this-in-all-real-environments

# AWS Cognito (not needed in local mode)
COGNITO_USER_POOL_ID=
COGNITO_CLIENT_ID=
COGNITO_REGION=ca-central-1

# AI Scanning (set to 'mock' locally to skip Gemini API calls)
GEMINI_API_KEY=mock

# File Storage (set to 'local' to save files to disk)
S3_MODE=local
S3_BUCKET_NAME=
AWS_REGION=ca-central-1

# Email (points to Mailpit locally — no real emails sent)
EMAIL_PROVIDER=mailpit
SMTP_HOST=localhost
SMTP_PORT=1025
EMAIL_FROM=noreply@cromo.local

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_ENV=development
```

### 4.3 Database Schema & First-Run Setup

The database schema is managed by **Drizzle ORM**. Tables are defined in
`apps/backend/src/db/schema.ts`; generated migrations live in
`apps/backend/src/db/migrations/` alongside a `meta/_journal.json` index and
per-migration snapshots. The API container applies pending migrations at startup
via `runMigrations()` in `apps/backend/src/db/migrate.ts`, which delegates to
Drizzle's `migrate()` and records progress in `drizzle.__drizzle_migrations`.

To change the schema:

1. Edit `apps/backend/src/db/schema.ts`.
2. Generate a migration: `pnpm db:generate` (routes through `docker compose exec api` automatically).
3. Review the generated SQL in `src/db/migrations/`. For things Drizzle can't infer
   (PL/pgSQL functions, triggers, views), hand-write a separate `NNNN_*.sql` file
   and add a matching entry to `meta/_journal.json` plus a placeholder
   `meta/NNNN_snapshot.json` (copy the previous snapshot, refresh `id`/`prevId`).
4. Apply: `pnpm db:migrate` (via docker compose exec). On the next API startup the
   migration is also applied automatically.

Catalog seed data (album types, editions, formats, scan prompts, teams, stickers,
variants, test users, etc.) lives in `scripts/seeds/` and is loaded by
`pnpm db:seed`, not by the migration system.

```bash
# After docker compose up, seed the database with World Cup data:
pnpm db:seed

# To reset the local database entirely (wipes all data, re-runs migrations, re-seeds):
pnpm db:reset

# To re-apply pending migrations manually (the API also does this at startup):
pnpm db:migrate
```

### 4.4 Development Workflow

```bash
# Start all services
docker compose up

# In a second terminal — run tests in watch mode (re-runs on file save)
pnpm test:watch

# In a third terminal — optional: run the type checker in watch mode
pnpm typecheck:watch

# Stop everything
docker compose down

# Stop and wipe all data (fresh start)
docker compose down -v
```

Live reload is configured for both the frontend (Next.js fast refresh) and the backend (`tsx watch`). Saving a file reflects the change in the browser within 1–2 seconds.

