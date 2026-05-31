# DevOps

> **Parent document:** [`overview.md`](overview.md#document-map) — this file is the detailed expansion of repository structure & branch strategy (parent §14), application versioning (parent §15), and CI/CD (parent §18).

## 14. Repository Structure & Branch Strategy

### 14.1 Monorepo Structure

```
cromo/
│
├── .github/
│   ├── workflows/
│   │   └── ci-cd.yml                 # Single pipeline: CI on PRs; CI + deploy-to-dev on push to main
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
│   │   ├── Dockerfile.local
│   │   ├── Dockerfile.cloud          # Cloud build (dev + prod environments)
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
│       ├── Dockerfile.local
│       ├── Dockerfile.cloud          # Cloud build (dev + prod environments)
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
│   └── terraform/                    # AWS infrastructure (modules + per-env stacks)
│       ├── modules/
│       └── environments/
│           ├── dev/
│           ├── staging/
│           └── production/
│
├── apps/backend/src/db/
│   ├── schema.ts                     # Drizzle table definitions — source of truth for `pnpm db:generate`
│   ├── migrate.ts                    # runMigrations() — applied at API startup AND callable via `pnpm db:migrate`
│   ├── index.ts                      # Drizzle client + raw `pg` pool
│   ├── transaction.ts                # Transaction helper
│   └── migrations/                   # Generated SQL migrations + meta/_journal.json
│       ├── 0000_baseline.sql
│       ├── 0001_normal_redwing.sql
│       ├── 0002_quick_hiroim.sql
│       ├── 0003_bent_captain_midlands.sql
│       └── meta/                     # Drizzle journal + per-migration snapshots
│
├── scripts/
│   ├── app-version.sh                # Computes APP_VERSION from `git describe`
│   ├── release.sh                    # Cuts a SemVer release (bumps four package.json + tags)
│   ├── dev-up.sh                     # Local dev orchestration
│   ├── dev-env.sh
│   ├── seed-database.sh              # Master seed script — runs all seeds in order
│   ├── deploy-dev-bootstrap.sh
│   ├── remote-fix-schema.sh
│   ├── remote-recreate-db.sh
│   └── seeds/                        # Seed data scripts
│       ├── 00_album_catalog.sql      # Album types, editions, formats, scan prompts
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
│   │   ├── overview.md               # Cross-cutting product + architecture context
│   │   ├── devops.md                 # This document
│   │   ├── database.md / backend.md / frontend.md / …  # Per-subsystem details
│   │   └── decisions/                # Architecture Decision Records (ADRs)
│   │       ├── _template.md          # ADR template (context, decision, consequences)
│   │       ├── 0001-ec2-docker-compose-over-ecs-fargate.md
│   │       └── 0002-rds-postgresql-over-aurora-serverless.md
│   ├── runbooks/                     # Operational playbooks (see runbooks/README.md)
│   └── security/                     # Security review docs (e.g. owasp-top-10-review.md)
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
   git clone https://github.com/your-org/cromo.git
   cd cromo

2. Install dependencies
   pnpm install

3. Set up environment
   cp .env.example .env.local

4. Start all services
   docker compose -f infrastructure/docker/docker-compose.yml up -d

5. Seed catalog data
   pnpm db:seed
   # Drizzle migrations are applied automatically when the API container
   # starts (`runMigrations()` in apps/backend/src/db/migrate.ts).
   # `pnpm db:migrate` is available for manual re-runs.

6. Open the app
   Frontend:        http://localhost:3000
   API:             http://localhost:3001/api/v1/health
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

The repository is private on the GitHub free tier, where classic branch protection is unavailable and Rulesets are limited to public repos. `main` therefore has no enforced gate today; the workflow `ci-cd.yml` runs on every PR and push, but a determined push could bypass it. When the project moves to a plan that supports Rulesets on private repos (or goes public), the intended ruleset for `main` is:

- Require a pull request before merging.
- Require the `CI + Deploy` workflow to pass.
- Disallow force pushes and branch deletion.

## 15. Application Versioning

Cromo uses a **hybrid SemVer + `git describe`** model. Two version surfaces exist for different reasons:

### 15.1 The Two Surfaces

1. **Runtime `APP_VERSION`** — what the running app reports to itself and to observability (`/api/v1/health`, Sentry `release` tags, log lines). Computed at build time by `scripts/app-version.sh` (which is `git describe --tags --always --dirty`) and baked into the container image as a build-arg:
   - Backend: `ARG APP_VERSION` → `ENV APP_VERSION` in `apps/backend/Dockerfile.cloud`, read at runtime by `apps/backend/src/env.ts`.
   - Frontend: `ARG NEXT_PUBLIC_APP_VERSION` in `apps/frontend/Dockerfile.cloud`, baked into the Next.js client bundle (`NEXT_PUBLIC_*` is build-time) and re-exported in the runtime stage so server-side Sentry init sees it too.

2. **`package.json` `version`** — the **base SemVer** the runtime version extends. Lives in four files that must stay in lockstep: `package.json`, `apps/backend/package.json`, `apps/frontend/package.json`, `packages/shared/package.json`. It has **no runtime consumer**; it exists purely to (a) answer "what release line are we on?" without git introspection, and (b) satisfy tooling that introspects `package.json`.

The two surfaces converge at tagged commits and diverge in between:

| State                         | `package.json.version` | Runtime `APP_VERSION`        |
| ----------------------------- | ---------------------- | ---------------------------- |
| At tag `v0.2.0`               | `0.2.0`                | `v0.2.0`                     |
| 3 commits past `v0.2.0`       | `0.2.0`                | `v0.2.0-3-gabcd123`          |
| Dirty working tree            | `0.2.0`                | `v0.2.0-3-gabcd123-dirty`    |
| Before any tag exists         | `0.1.0`                | `<short-sha>` or `<…>-dirty` |

### 15.2 Cutting a Release

```bash
git checkout main && git pull
./scripts/release.sh 0.2.0
git push origin main --tags
```

`release.sh` validates SemVer, refuses on a dirty tree or a re-used tag, rewrites the four `version` fields, commits as `Release v0.2.0`, and creates an **annotated** tag `v0.2.0`. Annotated (not lightweight) is the whole point — `git describe` only honours annotated tags by default.

After `git push --tags`, CI's `scripts/app-version.sh` reports `v0.2.0` for that commit and `v0.2.0-N-g<sha>` for each subsequent commit until the next tag. Patch and pre-release follow the same shape: `./scripts/release.sh 0.2.1`, `./scripts/release.sh 0.3.0-rc.1`.

### 15.3 Docker Image Tagging

The deploy pipeline (`.github/workflows/ci-cd.yml`) tags images with the commit SHA plus a mutable env alias:

```
cromo-backend:<git-sha>       # exact commit — permanent, traceable
cromo-backend:dev-latest      # mutable alias — what the dev EC2 pulls

cromo-frontend:<git-sha>
cromo-frontend:dev-latest
```

`APP_VERSION` (from `git describe`) is baked into the image at build time as a build-arg, so the *image tag* is the SHA but the *runtime version string* is the SemVer-aware descriptor. The mutable `dev-latest` alias is environment-scoped (a future `prod-latest` would coexist).

### 15.4 Version on the API

Two endpoints expose the runtime version. Both read `process.env.APP_VERSION`, which is set by the Dockerfile build-arg:

```json
GET /api/v1/version
{
  "version": "v0.2.0-3-gabcd123",
  "env": "production",
  "authMode": "cognito"
}

GET /api/v1/health
{
  "status": "ok",
  "timestamp": "2026-05-15T14:00:00.000Z",
  "version": "v0.2.0-3-gabcd123"
}
```

`/api/v1/health` is the lightweight liveness probe; `/api/v1/version` is the richer build/environment descriptor. **Runtime code must never read `package.json.version`** — that would report the release line, not the commit, and mislead whoever is debugging an incident.

### 15.5 Rolling Back a Botched Release

If `release.sh` succeeded but you have **not yet pushed**:

```bash
git tag -d v0.2.0          # remove the tag locally
git reset --hard HEAD~1    # drop the bump commit (DESTRUCTIVE — unpushed only)
```

If the tag has already been pushed, **roll forward with a new patch release** (`0.2.1`). Deleting a published tag rewrites history for anyone who fetched it and breaks images built from it.

### 15.6 Rules

- **Never edit a workspace `package.json` `version` by hand** — always go through `scripts/release.sh`.
- **Never read `package.json.version` from runtime code** — use `process.env.APP_VERSION`.
- **Adding a new workspace package** requires updating the `FILES=` array in `scripts/release.sh` and the table in §15.1 in lockstep.
- **Build metadata (`+sha…`) is disallowed** in release tags — `release.sh` rejects it because `+` isn't valid in a git tag name. Use a pre-release suffix (`0.2.0-rc.1`) if disambiguation is needed.

## 18. DevOps & CI/CD Pipeline

### 18.1 Overview

A single workflow at `.github/workflows/ci-cd.yml` covers both CI (on every PR) and continuous deployment to the dev environment (on push to `main`). It is organised as five jobs:

| Job | Triggers | Purpose |
| --- | --- | --- |
| `changes` | PR + push | Detects whether the diff touches non-doc files, so build/deploy can be skipped on docs-only changes. |
| `test` | PR + push | Lint, typecheck, Drizzle migrations against a Postgres service, catalog seed, unit + integration tests. |
| `security` | PR + push | `pnpm audit`, Trivy filesystem scan (deps + Dockerfile misconfig + secrets), Gitleaks secret scan. |
| `build` | PR only | Builds backend + frontend container images locally as a smoke-test. No push. |
| `deploy-dev` | Push to `main` + manual dispatch | Builds & pushes images to ECR, uploads the prod compose file to S3, scales the ASG up if it was at 0 (business-hours schedule), then triggers a rolling redeploy on the dev EC2 instance via SSM `AWS-RunShellScript`. |

`concurrency` groups by ref: PR runs cancel on a new push to the same PR; main-branch runs do not cancel each other.

### 18.2 Pipeline Flow

```
Developer opens Pull Request
         ↓
┌──────────────────────────────────────────────┐
│  CI (PR)                                     │
│  · changes  (paths-filter)                   │
│  · test     (lint + typecheck + tests)       │
│  · security (audit + Trivy + Gitleaks)       │
│  · build    (image smoke-test, no push)      │
└──────────────────────────────────────────────┘
         ↓  Merge to main
┌──────────────────────────────────────────────┐
│  CI + DEPLOY TO DEV (push to main)           │
│  · changes / test / security (re-run)        │
│  · build & push images to ECR                │
│      tags: <git-sha> + dev-latest            │
│  · upload docker-compose.prod.yml to S3      │
│  · scale ASG up if scheduled-down            │
│  · SSM RunShellScript on the dev instance:   │
│      docker compose pull && up -d            │
└──────────────────────────────────────────────┘
```

Image tags follow `cromo-{backend,frontend}:<git-sha>` for traceability plus a mutable `cromo-{backend,frontend}:dev-latest` alias for the dev instance to pull. `APP_VERSION` is computed at build time from `git describe --tags --always --dirty` and baked into both images as a build-arg — see [§15](#15-application-versioning) for the full versioning model.

### 18.3 Production Pipeline (Future)

Production does not exist yet. When it is added, the planned shape is:

- **Trigger:** push of an annotated `vX.Y.Z` tag (produced by `scripts/release.sh`), not every commit to `main`. This decouples "code in `main`" from "code in prod" and lets prod be a deliberate cut rather than a continuous stream.
- **Layout:** a second job (or workflow) gated by `environment: prod`. GitHub Environments scope `AWS_DEPLOY_ROLE_ARN` and other secrets separately from `dev`, and the required-reviewer rule on the environment supplies the manual approval gate without a separate workflow file.
- **Mechanics:** same ECR push + SSM redeploy pattern as dev, against a separate ASG and S3 deploy bucket.

A separate top-level workflow file becomes worthwhile only if prod needs to be re-runnable independently of CI (e.g. "redeploy the same tag without re-running tests"); until that requirement is concrete, prod will live as a second job in `ci-cd.yml`.

