# DevOps

> **Parent document:** [`overview.md`](overview.md#document-map) — this file is the detailed expansion of repository structure & branch strategy (parent §14), application versioning (parent §15), and CI/CD (parent §18).

## 14. Repository Structure & Branch Strategy

### 14.1 Monorepo Structure

```
stickfolio/
│
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                    # Runs on every PR
│   │   ├── deploy-dev.yml            # Auto on merge to main
│   │   ├── deploy-staging.yml        # Auto after dev passes
│   │   └── deploy-production.yml     # Manual approval gate
│   ├── PULL_REQUEST_TEMPLATE.md
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   └── feature_request.md
│   └── CODEOWNERS
│
├── apps/
│   ├── frontend/                     # Next.js 15
│   │   ├── src/
│   │   │   ├── app/                  # App Router pages
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── lib/                  # API client
│   │   │   ├── store/                # Zustand
│   │   │   └── types/
│   │   ├── tests/
│   │   │   ├── unit/
│   │   │   └── e2e/                  # Playwright
│   │   ├── Dockerfile.dev
│   │   ├── Dockerfile                # Production build
│   │   └── package.json
│   │
│   └── backend/                      # Fastify API
│       ├── src/
│       │   ├── routes/v1/            # API route handlers
│       │   ├── services/             # Business logic
│       │   ├── middleware/           # Auth, rate limiting
│       │   ├── plugins/              # Redis, DB plugins
│       │   └── server.ts
│       ├── tests/
│       │   ├── unit/
│       │   └── integration/
│       ├── Dockerfile.dev
│       ├── Dockerfile                # Production build
│       └── package.json
│
├── packages/
│   └── shared/                       # Types shared between frontend & backend
│       └── src/
│           ├── types/                # Sticker, User, Trade types
│           └── constants/
│
├── infrastructure/
│   ├── docker/
│   │   └── docker-compose.yml        # Local dev environment
│   └── terraform/                    # Cloud infrastructure (Phase B)
│       ├── modules/
│       └── environments/
│           ├── dev/
│           ├── staging/
│           └── production/
│
├── apps/backend/src/db/
│   ├── schema.sql                    # Phase A: single source-of-truth, applied at startup
│   ├── schema.ts                     # Drizzle table definitions (used in Phase B for migrations)
│   ├── migrate.ts                    # runMigrations() — applies schema.sql
│   └── migrations/                   # (Phase B) Drizzle-generated SQL migrations — empty in Phase A
│
├── scripts/
│   ├── seed-database.sh              # Master seed script — runs all seeds in order
│   ├── anonymise-dump.sh
│   ├── load-test.sh
│   └── seeds/                        # Seed data scripts
│       ├── 01_teams.sql
│       ├── 02_intro_stickers.sql     # 20 intro/FWC stickers (front FWC1–FWC8 + back FWC9–FWC19)
│       ├── 03_team_stickers.sql      # 960 team stickers (48 × 20)
│       ├── 05_variants.sql
│       ├── 06_feature_flags.sql
│       ├── 07_test_users.sql
│       ├── 08_coca_cola_stickers.sql # 12 Coca-Cola partnership stickers
│       ├── 09_trust_safety.sql
│       ├── 10_extra_stickers.sql     # 20 Extra stickers, 4 rarities each
│       ├── 13_team_album_pages.sql
│       └── 14_sticker_album_pages.sql
│
├── docs/
│   ├── architecture/
│   │   ├── overview.md               # This document
│   │   └── decisions/                # Architecture Decision Records (ADRs)
│   │       ├── _template.md          # ADR template (context, decision, consequences)
│   │       ├── 0001-drizzle-over-prisma-flyway.md
│   │       ├── 0002-sse-over-websockets.md
│   │       └── 0003-vercel-frontend-ecs-backend.md
│   ├── api/v1/                       # OpenAPI spec
│   └── runbooks/
│
├── .env.example
├── .gitignore
├── CHANGELOG.md
├── turbo.json
├── package.json
└── README.md
```

### 14.2 README.md — Getting Started in 5 Minutes

The repository README is the single most important document for a new developer. It must contain a working "Getting Started" section that a brand-new developer can follow in under 5 minutes:

```markdown
## Getting Started

### Prerequisites
- Docker Desktop (docker.com/products/docker-desktop)
- Node.js 22 LTS (nodejs.org)
- Git

### Run Locally

1. Clone the repo
   git clone https://github.com/your-org/stickfolio.git
   cd stickfolio

2. Install dependencies
   pnpm install

3. Set up environment
   cp .env.example .env.local

4. Start all services
   docker compose -f infrastructure/docker/docker-compose.yml up -d

5. Apply schema and seed data
   pnpm db:migrate && pnpm db:seed
   # Phase A: pnpm db:migrate executes apps/backend/src/db/schema.sql once.
   # Phase B will replace this with Drizzle migrations.

6. Open the app
   Frontend:        http://localhost:3000
   API:             http://localhost:3001/health
   Email inbox:     http://localhost:8025
   Cache browser:   http://localhost:8081
   Database viewer: http://localhost:5050

### Test accounts (6 pre-verified users — any password works in local mode)
  Admin:   admin@test.local
  Alice:   alice@test.local   (partial collection)
  Bob:     bob@test.local     (overlapping collection for trade testing)
  Charlie: charlie@test.local
  Diana:   diana@test.local
  Evan:    evan@test.local
```

### 14.3 Branch Strategy: GitHub Flow

- `main` is always deployable
- All work on feature branches cut from `main`
- Merges only via reviewed Pull Requests
- Feature branches deleted after merge

**Branch naming:**
```
feature/batch-sticker-scanning
fix/sticker-number-validation
hotfix/trade-matching-wrong-results
chore/update-dependencies
docs/add-redis-guide
```

### 14.4 Conventional Commits

```
feat: add batch sticker scanning
fix: correct trade matching for Crumple variants
feat!: restructure collection API response
chore: update Node.js to v22
docs: add local development guide
test: add integration tests for trade endpoints
```

### 14.5 Protected Branch Rules

For `main`: require PR, require CI to pass, disallow force pushes, disallow deletion.

## 15. Application Versioning

### 15.1 Semantic Versioning (SemVer)

`MAJOR.MINOR.PATCH` — managed by `semantic-release`, driven by commit message prefixes.

| Prefix | Bump |
|---|---|
| `feat:` | MINOR |
| `fix:` | PATCH |
| `feat!:` / `BREAKING CHANGE:` | MAJOR |
| `chore:`, `docs:`, `test:` | No bump |

### 15.2 Single Source of Truth

Version lives in root `package.json`. All other references are derived:

```
package.json  "version": "1.2.4"
     ↓
Git tag:             v1.2.4
Docker image tag:    stickfolio-api:1.2.4
ENV variable:        APP_VERSION=1.2.4
/health response:    { "version": "1.2.4" }
CloudWatch logs:     [version=1.2.4]
GitHub Release:      v1.2.4
```

### 15.3 Docker Image Tagging

```bash
stickfolio-api:1.2.4       # exact version — permanent
stickfolio-api:sha-a1b2c3  # git SHA — traceable
stickfolio-api:production  # mutable alias — updated after healthy deploy
```

Never deploy `:latest`. Always use a specific version or SHA tag.

### 15.4 Version API Endpoint

```json
GET /api/v1/version
{
  "version": "1.2.4",
  "environment": "production",
  "gitSha": "a1b2c3d4",
  "deployedAt": "2026-05-15T14:00:00Z"
}
```

## 18. DevOps & CI/CD Pipeline

### 18.1 Local-First, Then CI/CD

During Phase A (local development), there is no CI/CD pipeline. Developers run tests locally:

```bash
pnpm test           # run all tests once
pnpm test:watch     # run tests on file change
pnpm lint           # check code style
pnpm typecheck      # TypeScript validation
```

CI/CD is set up at the start of Phase B when the first cloud environment is provisioned.

### 18.2 Full Pipeline (Phase B)

```
Developer opens Pull Request
         ↓
┌──────────────────────────────────┐
│  CI — PULL REQUEST CHECKS        │
│  · ESLint + Prettier             │
│  · TypeScript compilation        │
│  · Unit tests (Vitest)           │
│  · Coverage ≥ 80%                │
│  · Snyk vulnerability scan       │
│  · Build Docker image            │
│  · Trivy container scan          │
└──────────────────────────────────┘
         ↓  Merge to main
┌──────────────────────────────────┐
│  DEPLOY TO DEV (automatic)       │
│  · semantic-release → version    │
│  · Build + tag Docker image      │
│  · Push to AWS ECR               │
│  · ECS blue/green deploy         │
│  · Drizzle migrations            │
│  · Integration tests             │
│  · OWASP ZAP scan                │
│  · Smoke tests                   │
└──────────────────────────────────┘
         ↓  Dev passes
┌──────────────────────────────────┐
│  DEPLOY TO STAGING (automatic)   │
│  · Terraform apply               │
│  · Same image → ECS Staging      │
│  · Full Playwright E2E tests     │
│  · Accessibility audit           │
│  · k6 load test                  │
└──────────────────────────────────┘
         ↓  Manual approval
┌──────────────────────────────────┐
│  DEPLOY TO PRODUCTION            │
│  · Blue/green deploy             │
│  · Smoke tests at 10% traffic    │
│  · Full cutover or rollback      │
│  · GitHub Release created        │
└──────────────────────────────────┘
```

