# StickerSwap 2026 — Complete Production Implementation Plan
### A Full-Stack Web Application for the 2026 FIFA World Cup Panini Sticker Collection

> **Plan Version:** 5.1 — Internal-consistency pass: removes residual Flyway references, fixes the Phase A 20–22 week gap, deduplicates section 11.3, completes the V1 schema (`email_verification_tokens`, `trade_items.quantity`, `trade_requests.counter_count`). Adds: scheduled-jobs section, web push, idempotency keys, security headers, cookie/password/lockout policy, file-upload validation, frontend error tracking, cache-stampede + Aurora cold-start handling, SES bounce/DMARC handling, age-gate, account-deletion grace window, audit-log IP truncation, ADR seeds, glossary.
> **Last Updated:** May 3, 2026
> **Target Audience:** Non-developer owner + contracted development team

---

## TABLE OF CONTENTS

1. [Understanding What You're Building](#1-understanding-what-youre-building)
2. [Development Approach: Local First, Cloud Second](#2-development-approach-local-first-cloud-second)
3. [System Architecture Overview](#3-system-architecture-overview)
4. [Local Development Environment](#4-local-development-environment)
5. [Frontend](#5-frontend)
6. [Backend / API](#6-backend--api)
7. [Database Layer](#7-database-layer)
8. [Database Seed Data — 2026 FIFA World Cup](#8-database-seed-data--2026-fifa-world-cup)
9. [Authentication & Security](#9-authentication--security)
10. [AI Image Processing](#10-ai-image-processing)
11. [Trading & Sharing Features](#11-trading--sharing-features)
12. [Email & Notifications](#12-email--notifications)
13. [Analytics](#13-analytics)
14. [Repository Structure & Branch Strategy](#14-repository-structure--branch-strategy)
15. [Application Versioning](#15-application-versioning)
16. [Health Checks](#16-health-checks)
17. [Environment Strategy](#17-environment-strategy)
18. [DevOps & CI/CD Pipeline](#18-devops--cicd-pipeline)
19. [Cloud Infrastructure (AWS)](#19-cloud-infrastructure-aws)
20. [Monitoring, Alerting & Observability](#20-monitoring-alerting--observability)
21. [Testing Strategy](#21-testing-strategy)
22. [Disaster Recovery](#22-disaster-recovery)
23. [Canadian Privacy Compliance (PIPEDA / CPPA / CASL)](#23-canadian-privacy-compliance-pipeda--cppa--casl)
24. [Legal & Intellectual Property](#24-legal--intellectual-property)
25. [Multi-User System Design](#25-multi-user-system-design)
26. [Error Handling & Graceful Degradation](#26-error-handling--graceful-degradation)
27. [Support & Feedback](#27-support--feedback)
28. [Operational Runbook](#28-operational-runbook)
29. [Security Testing & Disclosure Policy](#29-security-testing--disclosure-policy)
30. [Complete Technology Stack Summary](#30-complete-technology-stack-summary)
31. [Development Phases](#31-development-phases)
32. [Cost Estimate](#32-cost-estimate)
33. [Trust & Safety](#33-trust--safety)
34. [Scheduled Jobs](#34-scheduled-jobs)
35. [Glossary](#35-glossary)
36. [Next Steps](#36-next-steps)

---

## 1. Understanding What You're Building

### 1.1 Product Summary

StickerSwap 2026 is a multi-user web application for tracking, managing, and trading stickers from the 2026 FIFA World Cup Panini sticker collection. It is accessible from any device, designed for Canadian users, and built to production standards from day one — starting locally on your machine.

### 1.2 The Album

The 2026 FIFA World Cup Panini sticker collection officially launched on April 29/30, 2026. It contains **980 stickers** in total and covers all 48 teams in the expanded tournament, offering 20 stickers per team. The set also includes nine Introduction stickers and 11 FIFA Museum stickers featuring past World Cup Champions. Each team has 20 stickers: 1 team crest (shiny foil), 1 team photo, and 18 player stickers. Packs contain 7 stickers each — the first time since 2014 that packs have held more than 5 stickers.

### 1.3 The 48 Teams & Groups

The complete group stage draw is as follows:

- **Group A:** Mexico, Czech Republic, South Africa, South Korea
- **Group B:** Canada, Bosnia and Herzegovina, Qatar, Switzerland
- **Group C:** Spain, Algeria, Japan, New Zealand
- **Group D:** USA, Paraguay, Australia, Türkiye
- **Group E:** Argentina, Ecuador, Sweden, Ivory Coast
- **Group F:** Germany, Scotland, Curaçao, Iran
- **Group G:** Belgium, Egypt, Jordan, Haiti
- **Group H:** Portugal, Colombia, Uzbekistan, Congo DR
- **Group I:** France, Norway, Senegal, Iraq
- **Group J:** England, Netherlands, Ghana, Tunisia
- **Group K:** Brazil, Morocco, Croatia, Saudi Arabia
- **Group L:** Uruguay, Austria, Panama, Cape Verde

### 1.4 Sticker Variant / Rarity System

The North American edition includes exclusive parallels in six border colours found in retail packs, plus exclusive Crumple variants only available in Panini's online iCollect format:

**US Retail Parallels:**
- Blue — 1:2 packs
- Red — 1:25 packs
- Purple — 1:200 packs
- Green — 1:1,400 packs
- Black — 1/1 (unique)
- Orange — Amazon exclusive boxes only

**iCollect Online Exclusive Crumple Parallels:**
- Gold Flood Crumple — 6 per pack
- Blue Crumple — 1:2 packs
- Red Crumple — 1:26 packs
- Purple Crumple — 1:204 packs
- Green Crumple — 1:1,529 packs
- Black Crumple — 1/1 (unique)

Fans can also find exclusive sticker editions on specially marked Coca-Cola and Coca-Cola Zero Sugar 20-oz bottles, peeled directly from the label. Panini has made room in the official album to store them.

Each variant of a base sticker is a **separate collectible** in the database. A user who owns sticker #247 as a Base and as a Red Parallel owns two distinct items.

---

## 2. Development Approach: Local First, Cloud Second

### 2.1 Is This a Good Approach?

**Yes — absolutely.** Building and running the application locally first is not just acceptable, it is the recommended professional approach. Every experienced development team does this. It is cheaper, faster to iterate, easier to debug, and lets you validate the entire application before spending a single dollar on cloud infrastructure.

The local-first approach means:

- You can see the application working on your own machine before any cloud account is needed
- Every feature can be built, tested, and corrected in seconds rather than minutes
- Cloud infrastructure mistakes don't cost money during the learning and building phase
- The transition to cloud is clean because local and cloud are identical in their use of Docker containers

### 2.2 The Two-Phase Plan

**Phase A — Local Development (build everything, validate it works)**

The entire application runs on your laptop using Docker Compose. No AWS account needed. No domain. No SSL certificates. Just a `docker compose up` command and you have a fully working application at `http://localhost:3000`.

During this phase:
- All application features are built and tested
- The database is seeded with the full 2026 World Cup data
- The complete test suite is written and passes
- The AI scanning feature is tested with a local mock
- Performance is validated with a local load test

**Phase B — Cloud Migration (move what works to AWS)**

Once the application is working fully and all tests pass locally, the exact same Docker containers are deployed to AWS. Because Docker packages the application identically regardless of where it runs, the cloud deployment is reliable. You are not rewriting anything — you are moving a proven, tested system to a more powerful and reliable home.

### 2.3 What Changes Between Local and Cloud

| Concern | Local | Cloud (AWS) |
|---|---|---|
| Database | PostgreSQL in Docker | Aurora PostgreSQL Serverless v2 |
| Cache | Redis in Docker | ElastiCache Redis |
| Auth | Local mock (any email/password works) | AWS Cognito |
| Email | Mailpit (local inbox at localhost:8025) | AWS SES |
| File storage | Local filesystem directory | AWS S3 |
| AI scanning | Returns hardcoded mock result | Anthropic Claude Vision API |
| Frontend hosting | `localhost:3000` | Vercel |
| API hosting | `localhost:3001` | AWS ECS Fargate |
| SSL/TLS | None (HTTP only) | AWS Certificate Manager (HTTPS) |
| Domain | None | Route 53 + your registered domain |
| Monitoring | Console logs | CloudWatch + Grafana |
| Cost | $0 | ~$110–253 USD/month |

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
git clone https://github.com/your-org/stickerswap2026.git
cd stickerswap2026

# Copy the example environment file
cp .env.example .env.local
# (no changes needed — defaults work for local)

# Start everything: PostgreSQL, Redis, API, Frontend
docker compose up

# In a separate terminal, seed the database
npm run db:seed
```

After about 30 seconds, the application is available at:
- **Frontend:** http://localhost:3000
- **API:** http://localhost:3001
- **Email inbox (Mailpit):** http://localhost:8025
- **Redis Commander (cache viewer):** http://localhost:8081
- **pgAdmin (database viewer):** http://localhost:5050

A developer does not need to understand AWS, Terraform, or cloud concepts to start contributing on day one.

---

## 3. System Architecture Overview

### 3.1 What "Production-Ready" Means

A production-ready system: never loses data, recovers automatically from failures, scales with demand, costs proportionally to usage, and protects user privacy under Canadian law. Crucially, it starts as a working, tested local application — not as a cloud design on paper.

### 3.2 Three-Tier Architecture

```
┌──────────────────────────────────────────────────────────┐
│  USERS  (browser · mobile · PWA)                         │
└─────────────────────┬────────────────────────────────────┘
                      │ HTTP (local) / HTTPS (cloud)
┌─────────────────────▼────────────────────────────────────┐
│  FRONTEND  ·  Next.js 15  ·  localhost:3000 / Vercel     │
└─────────────────────┬────────────────────────────────────┘
                      │ API calls
┌─────────────────────▼────────────────────────────────────┐
│  BACKEND / API  ·  Fastify  ·  localhost:3001 / Fargate  │
└──────┬──────────────────────────────────┬────────────────┘
       │                                  │
┌──────▼───────┐                 ┌────────▼────────┐
│  PostgreSQL  │                 │  Redis Cache    │
│  Docker /    │                 │  Docker /       │
│  Aurora      │                 │  ElastiCache    │
└──────────────┘                 └─────────────────┘
```

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
      POSTGRES_USER: stickerswap
      POSTGRES_PASSWORD: localpassword
      POSTGRES_DB: stickerswap_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ../../data/migrations:/docker-entrypoint-initdb.d  # auto-runs on first start
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U stickerswap"]
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
      dockerfile: Dockerfile.dev          # uses ts-node for live reload
    restart: unless-stopped
    ports:
      - "3001:3001"
    environment:
      NODE_ENV: development
      DATABASE_URL: postgres://stickerswap:localpassword@db:5432/stickerswap_dev
      REDIS_URL: redis://cache:6379
      JWT_SECRET: local-dev-secret-not-for-production
      AUTH_MODE: local                    # bypasses Cognito locally
      CLAUDE_API_KEY: mock               # returns mock scan results locally
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
      dockerfile: Dockerfile.dev
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
DATABASE_URL=postgres://stickerswap:localpassword@localhost:5432/stickerswap_dev

# Redis
REDIS_URL=redis://localhost:6379

# Auth (set to 'local' to bypass Cognito locally)
AUTH_MODE=local
JWT_SECRET=local-dev-secret-change-this-in-all-real-environments

# AWS Cognito (not needed in local mode)
COGNITO_USER_POOL_ID=
COGNITO_CLIENT_ID=
COGNITO_REGION=ca-central-1

# AI Scanning (set to 'mock' locally to skip Claude API calls)
CLAUDE_API_KEY=mock
CLAUDE_API_MODE=mock

# File Storage (set to 'local' to save files to disk)
S3_MODE=local
S3_BUCKET_NAME=
AWS_REGION=ca-central-1

# Email (points to Mailpit locally — no real emails sent)
EMAIL_PROVIDER=mailpit
SMTP_HOST=localhost
SMTP_PORT=1025
EMAIL_FROM=noreply@stickerswap.local

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_ENV=development
```

### 4.3 Database Migrations & First-Run Setup

Drizzle ORM migration files in `apps/backend/src/db/migrations/` are applied by running `npm run db:migrate`. The API server applies pending migrations automatically on startup in all environments. The migration files are committed to git — every developer and every cloud environment runs the same numbered migrations in order.

```bash
# After docker compose up, seed the database with World Cup data:
npm run db:seed

# To reset the local database entirely (wipes all data):
npm run db:reset && npm run db:seed

# To generate a migration after changing the schema:
npm run db:generate

# To run pending migrations manually:
npm run db:migrate
```

### 4.4 Development Workflow

```bash
# Start all services
docker compose up

# In a second terminal — run tests in watch mode (re-runs on file save)
npm run test:watch

# In a third terminal — optional: run the type checker in watch mode
npm run typecheck:watch

# Stop everything
docker compose down

# Stop and wipe all data (fresh start)
docker compose down -v
```

Live reload is configured for both the frontend (Next.js fast refresh) and the backend (ts-node-dev). Saving a file reflects the change in the browser within 1–2 seconds.

---

## 5. Frontend

### 5.1 Technology: Next.js 15 + TypeScript

Next.js renders pages both server-side (fast initial load, SEO) and client-side (fast navigation). TypeScript adds compile-time type safety. Works identically locally and on Vercel.

### 5.2 Styling: Tailwind CSS

Utility-first CSS. Consistent, responsive designs without managing separate stylesheet files.

### 5.3 State Management

- **Zustand** — lightweight global state (session, collection filters, UI state)
- **React Query (TanStack Query)** — server state, API caching, automatic retry

### 5.4 Progressive Web App (PWA)

Configured as a PWA. Users can install it on their phone's home screen without an App Store. Collectors can open it while sorting a pack.

### 5.5 Internationalisation (i18n)

Built with i18n routing from day one using Next.js's built-in support. Launch order:

| Phase | Language | Locale | Rationale |
|---|---|---|---|
| Launch | English | `en` | Default |
| Fast follow | Spanish | `es` | Large user base across participating Latin American countries (Mexico, Argentina, Colombia, Ecuador, Uruguay, Panama, Paraguay) |
| Later | French | `fr` | Quebec users and Canadian bilingualism requirements |

### 5.6 Key Screens

| Route | Description |
|---|---|
| `/` | Landing page, login / sign-up |
| `/dashboard` | Collection overview — completion %, recent activity |
| `/album` | Visual grid of all 980 sticker slots, filterable |
| `/have` | Stickers owned |
| `/missing` | Stickers needed |
| `/duplicates` | Stickers available to trade |
| `/scan` | Camera / image upload for AI identification |
| `/trade` | Find users with complementary needs |
| `/trade/[id]` | Individual trade conversation |
| `/profile/[username]` | Public profile page |
| `/share/[token]` | Public shareable list (no login required) |
| `/settings` | Account, privacy, data export, deletion |
| `/admin` | Sticker database management (admin only) |
| `/security` | Responsible disclosure policy |
| `/legal/[doc]` | Privacy policy, terms, cookies |

### 5.7 Static Image Assets

The 48 team flags (referenced by `teams.flag_url`) and any sticker-position diagrams are bundled as static assets in `apps/frontend/public/images/flags/{fifa_code}.svg`. Bundling is preferred over S3 hosting because:
- The set is fixed and small (~48 SVGs, < 200 KB total)
- No additional infrastructure to provision
- Vercel's CDN serves them with edge caching automatically
- Bundling avoids cross-origin headaches with `<img src>` and `Content-Security-Policy`

User-generated images (avatars, scan uploads) remain on S3 / local filesystem (§6.3). Sticker artwork itself is **not** stored or rendered by this application — Panini owns the artwork and the album experience reproduces only the metadata (number, name, team, variant). The album grid uses placeholder cards with sticker numbers rather than artwork.

### 5.8 Local Hosting vs Cloud Hosting

| Environment | Hosting | URL |
|---|---|---|
| Local | Next.js dev server | `http://localhost:3000` |
| Dev / Staging / Production | Vercel | `https://stickerswap2026.ca` |

---

## 6. Backend / API

### 6.1 Technology: Node.js + TypeScript + Fastify

TypeScript catches bugs at compile time. Fastify handles thousands of requests per second on modest hardware. Identical code runs locally in Docker and in ECS Fargate.

### 6.1.1 CORS Configuration

The frontend and API run on different origins (different ports locally, different domains in cloud), so Cross-Origin Resource Sharing (CORS) must be explicitly configured. Without it, the browser blocks every API call.

Install the `@fastify/cors` plugin and configure it:

```typescript
// apps/backend/src/plugins/cors.ts
import cors from '@fastify/cors'

await fastify.register(cors, {
  origin:
    process.env.NODE_ENV === 'production'
      ? ['https://stickerswap2026.ca', /\.vercel\.app$/]  // Vercel preview URLs
      : 'http://localhost:3000',
  credentials: true,   // required for cookies / auth headers
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
})
```

### 6.1.2 Database Connection Pooling

Node.js must reuse database connections rather than creating a new one per request. Without pooling, the database runs out of connections under light load.

Use the `pg` package's built-in pool:

```typescript
// apps/backend/src/plugins/database.ts
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,         // maximum concurrent connections (match Aurora's RDS Proxy config in cloud)
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
})
```

In cloud, RDS Proxy sits in front of Aurora and handles connection multiplexing at the infrastructure level. Locally, the `pg` pool is sufficient.

### 6.1.3 Auto-Generated API Documentation

Install `@fastify/swagger` and `@fastify/swagger-ui`. These plugins read your route schemas and generate a live, browsable API reference automatically — no manual documentation needed.

```
Local: http://localhost:3001/docs
```

Add JSON schemas to every route definition and the docs stay current without any extra work.

### 6.2 API Versioning

All routes are prefixed from day one:

```
/api/v1/users/:id/collection
/api/v1/stickers
/api/v1/trade/matches/:userId
```

Non-breaking changes (new optional fields) are added within the same version. Breaking changes (removing or renaming fields) require a `/api/v2/` route, with the old version running for a minimum 90-day deprecation window.

### 6.3 Key API Endpoints

```
Authentication
  POST   /api/v1/auth/register
  POST   /api/v1/auth/verify-email          # confirm email from link
  POST   /api/v1/auth/resend-verification   # re-send verification email
  POST   /api/v1/auth/login
  POST   /api/v1/auth/logout
  POST   /api/v1/auth/refresh
  POST   /api/v1/auth/forgot-password
  POST   /api/v1/auth/reset-password

Sticker Master List
  GET    /api/v1/stickers                   # ?team=MEX&group=A&type=player&search=pulisic&cursor=...
  GET    /api/v1/stickers/:albumCode        # look up by album code (e.g. MEX1, FWC3)
  GET    /api/v1/stickers/:albumCode/variants

User Collection
  GET    /api/v1/users/:id/collection       # ?team=BRA&type=player&variant=base&cursor=...
  GET    /api/v1/users/:id/missing          # ?team=BRA&group=K&cursor=...
  GET    /api/v1/users/:id/duplicates       # ?cursor=...
  POST   /api/v1/users/:id/stickers
  PATCH  /api/v1/users/:id/stickers/:variantId
  DELETE /api/v1/users/:id/stickers/:variantId

Trading
  GET    /api/v1/trade/matches/:userId
  POST   /api/v1/trade/requests                    # start a trade
  PATCH  /api/v1/trade/requests/:id                # accept | decline | counter
  GET    /api/v1/trade/requests/:id/messages       # message history (paginated)
  POST   /api/v1/trade/requests/:id/messages       # send a message
  GET    /api/v1/trade/requests/:id/stream         # SSE — push new messages & status changes

Trust & Safety (see Section 33)
  POST   /api/v1/trade/requests/:id/ratings        # submit a post-trade rating
  GET    /api/v1/users/:id/ratings                 # get user's ratings (profile view)
  POST   /api/v1/users/:id/reports                 # file a report
  GET    /api/v1/users/me/reports/submitted        # user's own submitted reports
  GET    /api/v1/admin/reports                     # admin: list all reports
  GET    /api/v1/admin/reports/:reportId           # admin: report detail
  PATCH  /api/v1/admin/reports/:reportId           # admin: update report status
  POST   /api/v1/admin/users/:id/bans              # admin: issue a ban
  GET    /api/v1/admin/users/:id/bans              # admin: view user's ban history
  POST   /api/v1/admin/users/:id/bans/:banId/lift  # admin: lift a ban
  GET    /api/v1/users/me/ban-status               # check personal ban status

Sharing
  POST   /api/v1/users/:id/share
  GET    /api/v1/share/:token

Profile & Settings
  GET    /api/v1/users/:id/public
  PATCH  /api/v1/users/:id/profile
  POST   /api/v1/users/:id/avatar           # multipart upload; stores to /avatars/ in S3
  GET    /api/v1/users/:id/settings
  PATCH  /api/v1/users/:id/settings

AI Scanning
  POST   /api/v1/scan/identify              # multipart upload; temp file stored to /scans/ in S3, deleted within 24h
  POST   /api/v1/scan/batch

Admin
  POST   /api/v1/admin/stickers
  PATCH  /api/v1/admin/stickers/:id

System
  GET    /health
  GET    /health/ready
  GET    /api/v1/version
```

**Pagination:** All list endpoints use cursor-based pagination. Pass `?cursor=<opaque_token>` to get the next page. Responses include a `nextCursor` field (null when no more pages exist) and a `total` count. Default page size is 100 items.

**File storage prefixes (S3 / local filesystem):**
- `/avatars/{userId}` — user profile photos, permanent
- `/scans/{uuid}` — AI scan uploads, auto-deleted after 24 hours via S3 lifecycle rule

**Search:** `GET /api/v1/stickers?search=<term>` performs fuzzy player-name and team-name matching using PostgreSQL `pg_trgm` (trigram) extension. Index: `CREATE INDEX idx_stickers_player_name_trgm ON stickers USING gin (player_name gin_trgm_ops);`. Results are ranked by similarity and capped at 50 per page. Cached in Redis (`stickers:search:{normalized_term}`, TTL 1 hour) since the master list is read-only.

**File upload validation:** All `multipart/form-data` endpoints (`/scan/identify`, `/scan/batch`, `/users/:id/avatar`) enforce: max 10 MB per file; allowed MIME types `image/jpeg`, `image/png`, `image/webp`; magic-byte validation via the `file-type` package (defends against MIME-spoofed uploads). Avatar uploads are additionally resized server-side to a 512×512 max and stripped of EXIF before storage. ClamAV scanning is added at the 1,000-user threshold (deferred for cost; see §29.3).

### 6.4 Granular Rate Limiting

| Endpoint | Limit | Reason |
|---|---|---|
| `POST /auth/login` | 5 per 15 min per IP | Brute force protection |
| `POST /auth/register` | 3 per hour per IP | Spam account prevention |
| `POST /scan/identify` | 20 per hour per user | Claude API cost control |
| `POST /scan/batch` | 5 per hour per user | High-cost AI operation |
| `GET /trade/matches` | 60 per hour per user | Prevents data scraping |
| `GET /stickers` | 200 per hour per user | Burst protection (cached anyway) |
| `POST /trade/requests/:id/messages` | 30 per hour per user | Prevent message spam |
| `POST /trade/requests/:id/ratings` | 2 per trade per user | Natural limit (one per direction) |
| `POST /users/:id/reports` | 5 per hour per user | Prevent report-bombing |
| `PATCH /admin/reports/:id` | 60 per hour per admin | Normal moderation pace |
| All other endpoints | 100 per minute per user | General abuse prevention |

Rate limiting is implemented in Fastify middleware locally, and additionally enforced at the WAF layer in cloud.

---

## 7. Database Layer

### 7.1 Primary Database

| Environment | Database | Notes |
|---|---|---|
| Local | PostgreSQL 16 in Docker | Identical schema to cloud |
| Cloud | AWS Aurora PostgreSQL Serverless v2 | Scales to zero overnight |

The schema, migrations, and seed scripts are **identical** in both environments. This guarantees that what works locally will work in the cloud.

### 7.2 Full Database Schema

```sql
-- ─────────────────────────────────────────────────────────
-- V1: INITIAL SCHEMA
-- data/migrations/V1__initial_schema.sql
-- ─────────────────────────────────────────────────────────

-- USERS ───────────────────────────────────────────────────
CREATE TABLE users (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email              TEXT UNIQUE NOT NULL,
  username           TEXT UNIQUE NOT NULL,
  display_name       TEXT,
  avatar_url         TEXT,
  role               TEXT NOT NULL DEFAULT 'user'
                     CHECK (role IN ('user', 'admin')),
  locale             TEXT NOT NULL DEFAULT 'en',
  email_verified_at  TIMESTAMPTZ,  -- NULL = not yet verified
  hashed_email       TEXT,  -- SHA-256(lowercase(email)); retained after soft-delete for ban-evasion prevention (Section 33)
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ  -- soft delete; NULL = active
);

CREATE TABLE user_settings (
  user_id                    UUID PRIMARY KEY REFERENCES users(id),
  collection_visibility      TEXT DEFAULT 'private',
  profile_visibility         TEXT DEFAULT 'public',
  trade_matching_enabled     BOOLEAN DEFAULT true,
  email_trade_requests       BOOLEAN DEFAULT true,
  email_trade_messages       BOOLEAN DEFAULT true,
  email_marketing            BOOLEAN DEFAULT false,
  marketing_consent_at       TIMESTAMPTZ,
  marketing_consent_version  TEXT,
  show_trust_score_public    BOOLEAN DEFAULT true  -- Show trust score badge on public profile (Section 33)
);

CREATE TABLE consent_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  consent_type    TEXT NOT NULL,
  granted         BOOLEAN NOT NULL,
  policy_version  TEXT NOT NULL,
  ip_address      INET,
  user_agent      TEXT,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE email_verification_tokens (
  token       TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(32), 'hex'),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '24 hours',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_verification_tokens_user_id
  ON email_verification_tokens(user_id);

-- STICKER MASTER DATA ────────────────────────────────────
CREATE TABLE teams (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fifa_code   TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  group_name  TEXT NOT NULL,  -- 'A' through 'L'
  flag_url    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE stickers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number        INT UNIQUE NOT NULL CHECK (number BETWEEN 0 AND 9999),
  album_code    TEXT UNIQUE NOT NULL,  -- e.g. 'MEX1', 'FWC3', '00'
  team_id       UUID REFERENCES teams(id),
  player_name   TEXT,
  position      TEXT,  -- 'GK'|'DEF'|'MID'|'FWD'|null
  sticker_type  TEXT NOT NULL,
  -- 'intro'|'badge'|'team_photo'|'player'|'museum'|'coca_cola_special'
  is_foil       BOOLEAN NOT NULL DEFAULT false,
  album_page    INT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sticker_variants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sticker_id    UUID NOT NULL REFERENCES stickers(id),
  variant_type  TEXT NOT NULL,
  -- 'base'|'blue'|'red'|'purple'|'green'|'black_1of1'|
  -- 'orange_amazon'|'gold_crumple'|'blue_crumple'|'red_crumple'|
  -- 'purple_crumple'|'green_crumple'|'black_crumple_1of1'|'coca_cola'
  rarity_rank   INT NOT NULL,  -- 1=most common, 14=rarest
  availability  TEXT NOT NULL,
  -- 'retail'|'amazon_exclusive'|'panini_online'|'coca_cola'
  UNIQUE (sticker_id, variant_type)
);

-- USER COLLECTION ────────────────────────────────────────
CREATE TABLE user_stickers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id),
  sticker_variant_id  UUID NOT NULL REFERENCES sticker_variants(id),
  quantity            INT NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  acquired_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, sticker_variant_id)
);

CREATE INDEX idx_user_stickers_duplicates
  ON user_stickers(user_id)
  WHERE quantity > 1;

-- TRADING ────────────────────────────────────────────────
CREATE TABLE trade_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id   UUID NOT NULL REFERENCES users(id),
  recipient_id   UUID NOT NULL REFERENCES users(id),
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'completed', 'expired')),
  counter_count  INT NOT NULL DEFAULT 0 CHECK (counter_count BETWEEN 0 AND 5),
  accepted_at    TIMESTAMPTZ,   -- digital agreement timestamp
  completed_at   TIMESTAMPTZ,   -- physical exchange confirmed timestamp
  cancelled_at   TIMESTAMPTZ,
  expires_at     TIMESTAMPTZ,   -- auto-expiry deadline for accepted-but-not-completed trades
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE trade_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id            UUID NOT NULL REFERENCES trade_requests(id),
  sticker_variant_id  UUID NOT NULL REFERENCES sticker_variants(id),
  direction           TEXT NOT NULL,  -- 'offer' | 'want'
  quantity            INT NOT NULL DEFAULT 1 CHECK (quantity > 0)
);

CREATE TABLE trade_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id    UUID NOT NULL REFERENCES trade_requests(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trade_messages_trade_id ON trade_messages(trade_id, sent_at);

-- SHARING ────────────────────────────────────────────────
CREATE TABLE public_lists (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id),
  list_type    TEXT NOT NULL,  -- 'missing'|'duplicates'|'full_collection'
  share_token  TEXT UNIQUE NOT NULL
               DEFAULT encode(gen_random_bytes(16), 'hex'),
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FEATURE FLAGS ──────────────────────────────────────────
CREATE TABLE feature_flags (
  key          TEXT PRIMARY KEY,
  enabled      BOOLEAN NOT NULL DEFAULT false,
  rollout_pct  INT NOT NULL DEFAULT 0 CHECK (rollout_pct BETWEEN 0 AND 100),
  description  TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AUDIT LOG ──────────────────────────────────────────────
CREATE TABLE audit_log (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID REFERENCES users(id),
  action       TEXT NOT NULL,
  ip_address   INET,
  user_agent   TEXT,
  metadata     JSONB,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TRUST & SAFETY ─────────────────────────────────────────
-- (See Section 33 for full design)
CREATE TABLE trade_ratings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id       UUID NOT NULL REFERENCES trade_requests(id),
  rater_id       UUID NOT NULL REFERENCES users(id),
  rated_user_id  UUID NOT NULL REFERENCES users(id),
  is_positive    BOOLEAN NOT NULL,
  comment        TEXT CHECK (char_length(comment) <= 500),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trade_id, rater_id),
  CHECK (rater_id <> rated_user_id)
);

CREATE TABLE user_reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      UUID NOT NULL REFERENCES users(id),
  reported_user_id UUID NOT NULL REFERENCES users(id),
  trade_id         UUID REFERENCES trade_requests(id),
  category         TEXT NOT NULL CHECK (category IN ('harassment', 'cancelled_after_accept', 'no_show', 'fake_stickers', 'damaged_stickers', 'spam', 'underage', 'other')),
  description      TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved', 'dismissed')),
  resolved_by      UUID REFERENCES users(id),
  resolved_at      TIMESTAMPTZ,
  resolution_note  TEXT CHECK (char_length(resolution_note) <= 1000),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (reporter_id <> reported_user_id)
);

CREATE TABLE user_bans (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  ban_type    TEXT NOT NULL CHECK (ban_type IN ('soft', 'hard')),
  reason      TEXT NOT NULL CHECK (char_length(reason) BETWEEN 5 AND 1000),
  report_id   UUID REFERENCES user_reports(id),
  banned_by   UUID NOT NULL REFERENCES users(id),
  expires_at  TIMESTAMPTZ,
  lifted_at   TIMESTAMPTZ,
  lifted_by   UUID REFERENCES users(id),
  lift_reason TEXT CHECK (char_length(lift_reason) <= 500),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 7.3 Migrations: Drizzle ORM

The original plan referenced Flyway, which is a Java-based tool requiring a Java runtime — an unnecessary dependency in a Node.js project. **Use Drizzle ORM instead.**

Drizzle is a TypeScript-first database library that:
- Defines the schema in TypeScript (so your types and your database stay in sync automatically)
- Generates SQL migration files you can inspect and run
- Works with PostgreSQL, including Aurora
- Has no Java dependency

```
apps/backend/src/db/
  schema.ts          # TypeScript definitions of every table — single source of truth
  migrations/        # auto-generated SQL files, committed to git
    0001_initial.sql
    0002_email_verified_at.sql
```

Commands:
```bash
npm run db:generate   # generate a new migration from schema changes
npm run db:migrate    # apply pending migrations to the local database
npm run db:studio     # open Drizzle Studio (visual database browser, replaces pgAdmin for schema browsing)
```

The schema in `schema.ts` mirrors every table in Section 7.2. When you add a column to `schema.ts`, run `npm run db:generate` and a new migration file appears automatically. The same migration files run in every environment — no schema mismatch between local and cloud.

### 7.4 Redis Cache

| Cache Key | Content | TTL |
|---|---|---|
| `stickers:all` | Full 980-sticker master list | 1 hour |
| `stickers:{number}` | Individual sticker detail | 1 hour |
| `user:{id}:summary` | Completion %, total counts | 5 minutes |
| `user:{id}:duplicates` | Tradeable stickers | 5 minutes |
| `trade:matches:{id}` | Trade match results | 2 minutes |
| `trade:channel:{tradeId}` | Redis pub/sub channel — broadcasts new messages to all API instances | N/A (pub/sub, not a stored key) |
| `share:{token}` | Public list data | 10 minutes |
| `rate_limit:{ip}:{endpoint}` | Rate limit counters | Per window |

Redis Commander at `localhost:8081` lets you browse, inspect, and delete cache keys interactively while learning how caching works.

---

## 8. Database Seed Data — 2026 FIFA World Cup

### 8.1 Overview

Seeding is the process of loading the database with real, accurate data before any user signs up. Without correct seed data, the application has nothing to display. This section defines exactly what gets seeded and how.

The seed data covers:
1. All 48 teams with their groups
2. All 980 sticker records (full album checklist)
3. All sticker variants (13 variant types per applicable sticker)
4. Initial feature flags
5. Development test users (local/dev only — never in production)

### 8.2 Seed Script Architecture

```
scripts/
  seed-database.sh          # master script — runs all seeds in order
  seeds/
    01_teams.sql            # 48 teams with FIFA codes and group assignments
    02_intro_stickers.sql   # stickers 00, FWC1–FWC8 (intro/emblem pages)
    03_team_stickers.sql    # all 960 team stickers (MEX1–MEX20, etc.)
    04_museum_stickers.sql  # FIFA Museum stickers (past champions)
    05_variants.sql         # generates all variant records per sticker
    06_feature_flags.sql    # initial feature flag state
    07_test_users.sql       # DEV/LOCAL ONLY — test accounts
```

The master script checks the `NODE_ENV` environment variable. If it is `production`, it refuses to run seed file 07 (test users). Feature flags (file 06) are required in every environment, so they are not gated. This is a safety guard.

```bash
#!/bin/bash
# scripts/seed-database.sh

set -e  # exit on any error

echo "▶ Running database seeds..."

psql "$DATABASE_URL" -f scripts/seeds/01_teams.sql
echo "✓ Teams seeded (48 teams)"

psql "$DATABASE_URL" -f scripts/seeds/02_intro_stickers.sql
echo "✓ Introduction stickers seeded"

psql "$DATABASE_URL" -f scripts/seeds/03_team_stickers.sql
echo "✓ Team stickers seeded (960 stickers)"

psql "$DATABASE_URL" -f scripts/seeds/04_museum_stickers.sql
echo "✓ FIFA Museum stickers seeded"

psql "$DATABASE_URL" -f scripts/seeds/05_variants.sql
echo "✓ Sticker variants generated"

psql "$DATABASE_URL" -f scripts/seeds/06_feature_flags.sql
echo "✓ Feature flags seeded"

if [ "$NODE_ENV" != "production" ]; then
  psql "$DATABASE_URL" -f scripts/seeds/07_test_users.sql
  echo "✓ Test users seeded (non-production only)"
fi

echo "✅ All seeds complete."
```

All seed scripts use `INSERT ... ON CONFLICT DO UPDATE` (upsert), making them safe to re-run. Running the seed twice produces the same result.

### 8.3 Seed File 01: Teams

All 48 qualified teams with their FIFA codes, full names, and group assignments based on the confirmed draw.

```sql
-- scripts/seeds/01_teams.sql
-- 48 qualified teams for FIFA World Cup 2026
-- Groups confirmed from the December 5, 2025 draw at the Kennedy Center

INSERT INTO teams (fifa_code, name, group_name) VALUES
-- Group A
('MEX', 'Mexico',              'A'),
('CZE', 'Czech Republic',      'A'),
('RSA', 'South Africa',        'A'),
('KOR', 'South Korea',         'A'),

-- Group B
('CAN', 'Canada',              'B'),
('BIH', 'Bosnia & Herzegovina','B'),
('QAT', 'Qatar',               'B'),
('SUI', 'Switzerland',         'B'),

-- Group C
('ESP', 'Spain',               'C'),
('ALG', 'Algeria',             'C'),
('JPN', 'Japan',               'C'),
('NZL', 'New Zealand',         'C'),

-- Group D
('USA', 'USA',                 'D'),
('PAR', 'Paraguay',            'D'),
('AUS', 'Australia',           'D'),
('TUR', 'Türkiye',             'D'),

-- Group E
('ARG', 'Argentina',           'E'),
('ECU', 'Ecuador',             'E'),
('SWE', 'Sweden',              'E'),
('CIV', 'Ivory Coast',         'E'),

-- Group F
('GER', 'Germany',             'F'),
('SCO', 'Scotland',            'F'),
('CUW', 'Curaçao',             'F'),
('IRN', 'Iran',                'F'),

-- Group G
('BEL', 'Belgium',             'G'),
('EGY', 'Egypt',               'G'),
('JOR', 'Jordan',              'G'),
('HAI', 'Haiti',               'G'),

-- Group H
('POR', 'Portugal',            'H'),
('COL', 'Colombia',            'H'),
('UZB', 'Uzbekistan',          'H'),
('CGO', 'Congo DR',            'H'),

-- Group I
('FRA', 'France',              'I'),
('NOR', 'Norway',              'I'),
('SEN', 'Senegal',             'I'),
('IRQ', 'Iraq',                'I'),

-- Group J
('ENG', 'England',             'J'),
('NED', 'Netherlands',         'J'),
('GHA', 'Ghana',               'J'),
('TUN', 'Tunisia',             'J'),

-- Group K
('BRA', 'Brazil',              'K'),
('MAR', 'Morocco',             'K'),
('CRO', 'Croatia',             'K'),
('KSA', 'Saudi Arabia',        'K'),

-- Group L
('URU', 'Uruguay',             'L'),
('AUT', 'Austria',             'L'),
('PAN', 'Panama',              'L'),
('CPV', 'Cape Verde',          'L')

ON CONFLICT (fifa_code) DO UPDATE SET
  name       = EXCLUDED.name,
  group_name = EXCLUDED.group_name;
```

### 8.4 Seed File 02: Introduction Stickers

The opening pages of the album before team sections begin.

```sql
-- scripts/seeds/02_intro_stickers.sql
-- Stickers 00 and FWC1-FWC8 (introduction / emblem pages)
-- These have no team association

INSERT INTO stickers
  (number, album_code, team_id, player_name, sticker_type, is_foil, album_page)
VALUES
  -- Panini logo sticker (album position 00)
  (0,   '00',   NULL, NULL, 'intro', true,  1),

  -- FWC series: official emblem, mascots, slogan, ball, host nation pages
  (1,   'FWC1', NULL, 'Official Emblem',                  'intro', true,  2),
  (2,   'FWC2', NULL, 'Official Emblem',                  'intro', true,  2),
  (3,   'FWC3', NULL, 'Official Mascots',                 'intro', true,  3),
  (4,   'FWC4', NULL, 'Official Slogan',                  'intro', true,  3),
  (5,   'FWC5', NULL, 'Official Ball',                    'intro', true,  4),
  (6,   'FWC6', NULL, 'Canada - Host Countries & Cities', 'intro', true,  5),
  (7,   'FWC7', NULL, 'Mexico - Host Countries & Cities', 'intro', true,  5),
  (8,   'FWC8', NULL, 'USA - Host Countries & Cities',    'intro', true,  6)

ON CONFLICT (album_code) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  sticker_type = EXCLUDED.sticker_type,
  is_foil      = EXCLUDED.is_foil;
```

### 8.5 Seed File 03: Team Stickers (Excerpt — Full File)

> **⚠️ CRITICAL NOTE FOR DEVELOPER:** This section shows only 2 of 48 teams as examples. The complete `03_team_stickers.sql` file with all 960 records (48 teams × 20 stickers each) **must be compiled before any database work begins**. This is a data task, not a coding task.
>
> **How to compile the full checklist:**
> 1. Visit https://www.checklistinsider.com/2026-panini-fifa-world-cup-sticker for the complete numbered list
> 2. Cross-reference with https://fandom.com/wiki/2026_FIFA_World_Cup_(Panini) for player details
> 3. Sticker `number` values (0–980) must be assigned sequentially in album order — do not use `NULL`
> 4. The `album_code` (e.g., `MEX1`, `CAN3`) is the stable identifier used by the AI scan feature
>
> The album launched April 29/30, 2026. The complete checklist is available from the sources above.

This is the largest seed file. Each team contributes 20 stickers. Below is the complete structure shown for two teams (Mexico and South Africa) to demonstrate the pattern. The full file in the repository covers all 48 teams × 20 stickers = 960 records.

**Sticker numbering convention:** Stickers are numbered sequentially in album order. The album code (e.g., `MEX1`, `CAN3`) maps to the team FIFA code + position within the team's 20-sticker block.

```sql
-- scripts/seeds/03_team_stickers.sql
-- 960 team stickers — all 48 teams × 20 stickers each
-- Ordered by album order (Group A → Group L)
-- Source: checklistinsider.com/2026-panini-fifa-world-cup-sticker
--         verified against fandom.com/wiki/2026_FIFA_World_Cup_(Panini)
-- SUBJECT TO CHANGE as Panini may issue corrections post-release.

-- ─────────────────────────────────────────────────────────
-- GROUP A — MEXICO (stickers 9–28, album codes MEX1–MEX20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'MEX'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  ( 9,  'MEX1',  NULL,                'Team Logo - Mexico',    NULL,  'badge',      true),
  (10,  'MEX2',  'Luis Malagón',      'Luis Malagón',          'GK',  'player',     false),
  (11,  'MEX3',  'Johan Vasquez',     'Johan Vasquez',         'DEF', 'player',     false),
  (12,  'MEX4',  'Jorge Sánchez',     'Jorge Sánchez',         'DEF', 'player',     false),
  (13,  'MEX5',  'Cesar Montes',      'Cesar Montes',          'DEF', 'player',     false),
  (14,  'MEX6',  'Jesus Gallardo',    'Jesus Gallardo',        'DEF', 'player',     false),
  (15,  'MEX7',  'Israel Reyes',      'Israel Reyes',          'DEF', 'player',     false),
  (16,  'MEX8',  'Diego Lainez',      'Diego Lainez',          'MID', 'player',     false),
  (17,  'MEX9',  'Carlos Rodriguez',  'Carlos Rodriguez',      'MID', 'player',     false),
  (18,  'MEX10', 'Edson Alvarez',     'Edson Alvarez',         'MID', 'player',     false),
  (19,  'MEX11', 'Orbelin Pineda',    'Orbelin Pineda',        'MID', 'player',     false),
  (20,  'MEX12', 'Marcel Ruiz',       'Marcel Ruiz',           'MID', 'player',     false),
  (21,  'MEX13', NULL,                'Team Photo - Mexico',   NULL,  'team_photo', false),
  (22,  'MEX14', 'Érick Sánchez',     'Érick Sánchez',         'MID', 'player',     false),
  (23,  'MEX15', 'Hirving Lozano',    'Hirving Lozano',        'FWD', 'player',     false),
  (24,  'MEX16', 'Santiago Giménez',  'Santiago Giménez',      'FWD', 'player',     false),
  (25,  'MEX17', 'Raúl Jiménez',      'Raúl Jiménez',          'FWD', 'player',     false),
  (26,  'MEX18', 'Alexis Vega',       'Alexis Vega',           'FWD', 'player',     false),
  (27,  'MEX19', 'Roberto Alvarado',  'Roberto Alvarado',      'FWD', 'player',     false),
  (28,  'MEX20', 'Cesar Huerta',      'Cesar Huerta',          'FWD', 'player',     false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_code) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position,
  is_foil      = EXCLUDED.is_foil;

-- ─────────────────────────────────────────────────────────
-- GROUP A — SOUTH AFRICA (stickers 29–48, RSA1–RSA20)
-- ─────────────────────────────────────────────────────────
INSERT INTO stickers
  (number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'RSA'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  (29,  'RSA1',  NULL,                   'Team Logo - South Africa',  NULL,  'badge',      true),
  (30,  'RSA2',  'Ronwen Williams',       'Ronwen Williams',           'GK',  'player',     false),
  (31,  'RSA3',  'Sipho Chaine',          'Sipho Chaine',              'GK',  'player',     false),
  (32,  'RSA4',  'Aubrey Modiba',         'Aubrey Modiba',             'DEF', 'player',     false),
  (33,  'RSA5',  'Samukele Kabini',       'Samukele Kabini',           'DEF', 'player',     false),
  (34,  'RSA6',  'Mbekezeli Mbokazi',     'Mbekezeli Mbokazi',         'DEF', 'player',     false),
  (35,  'RSA7',  'Khulumani Ndamane',     'Khulumani Ndamane',         'DEF', 'player',     false),
  (36,  'RSA8',  'Siyabonga Ngezana',     'Siyabonga Ngezana',         'DEF', 'player',     false),
  (37,  'RSA9',  'Khuliso Mudau',         'Khuliso Mudau',             'MID', 'player',     false),
  (38,  'RSA10', 'Nkosinathi Sibisi',     'Nkosinathi Sibisi',         'MID', 'player',     false),
  (39,  'RSA11', 'Teboho Mokoena',        'Teboho Mokoena',            'MID', 'player',     false),
  (40,  'RSA12', 'Thalente Mbatha',       'Thalente Mbatha',           'MID', 'player',     false),
  (41,  'RSA13', NULL,                   'Team Photo - South Africa',  NULL,  'team_photo', false),
  (42,  'RSA14', 'Bathasi Aubaas',        'Bathasi Aubaas',            'MID', 'player',     false),
  (43,  'RSA15', 'Yaya Sithole',          'Yaya Sithole',              'FWD', 'player',     false),
  (44,  'RSA16', 'Sipho Mbule',           'Sipho Mbule',               'FWD', 'player',     false),
  (45,  'RSA17', 'Lyle Foster',           'Lyle Foster',               'FWD', 'player',     false),
  (46,  'RSA18', 'Iqraam Rayners',        'Iqraam Rayners',            'FWD', 'player',     false),
  (47,  'RSA19', 'Mohau Nkota',           'Mohau Nkota',               'FWD', 'player',     false),
  (48,  'RSA20', 'Oswin Appollis',        'Oswin Appollis',            'FWD', 'player',     false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_code) DO UPDATE SET
  player_name  = EXCLUDED.player_name,
  position     = EXCLUDED.position;

-- [... South Korea, Canada, Bosnia & Herzegovina, Qatar, Switzerland,
--      Spain, Algeria, Japan, New Zealand, USA, Paraguay, Australia,
--      Türkiye, Argentina, Ecuador, Sweden, Ivory Coast, Germany,
--      Scotland, Curaçao, Iran, Belgium, Egypt, Jordan, Haiti,
--      Portugal, Colombia, Uzbekistan, Congo DR, France, Norway,
--      Senegal, Iraq, England, Netherlands, Ghana, Tunisia, Brazil,
--      Morocco, Croatia, Saudi Arabia, Uruguay, Austria, Panama,
--      Cape Verde — all follow the same pattern above]
--
-- NOTE TO DEVELOPER: The complete list of all 960 team sticker records
-- with verified player names is available at:
-- https://www.checklistinsider.com/2026-panini-fifa-world-cup-sticker
-- Cross-reference with fandom.com/wiki/2026_FIFA_World_Cup_(Panini)
-- The USA checklist (USA1–USA20) is already confirmed in full from the
-- source data and is included in the repository's complete seed file.
```

**USA Team (confirmed from source, shown as an additional example):**

```sql
-- USA (stickers in Group D section, codes USA1–USA20)
INSERT INTO stickers
  (number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'USA'),
  s.player_name, s.position, s.sticker_type, s.is_foil
FROM (VALUES
  -- Numbers assigned based on album order position in Group D section
  (NULL, 'USA1',  NULL,                 'Team Logo - USA',       NULL,  'badge',      true),
  (NULL, 'USA2',  'Matt Freese',        'Matt Freese',           'GK',  'player',     false),
  (NULL, 'USA3',  'Chris Richards',     'Chris Richards',        'DEF', 'player',     false),
  (NULL, 'USA4',  'Tim Ream',           'Tim Ream',              'DEF', 'player',     false),
  (NULL, 'USA5',  'Mark McKenzie',      'Mark McKenzie',         'DEF', 'player',     false),
  (NULL, 'USA6',  'Alex Freeman',       'Alex Freeman',          'DEF', 'player',     false),
  (NULL, 'USA7',  'Antonee Robinson',   'Antonee Robinson',      'DEF', 'player',     false),
  (NULL, 'USA8',  'Tyler Adams',        'Tyler Adams',           'MID', 'player',     false),
  (NULL, 'USA9',  'Tanner Tessmann',    'Tanner Tessmann',       'MID', 'player',     false),
  (NULL, 'USA10', 'Weston McKennie',    'Weston McKennie',       'MID', 'player',     false),
  (NULL, 'USA11', 'Christian Roldan',   'Christian Roldan',      'MID', 'player',     false),
  (NULL, 'USA12', 'Timothy Weah',       'Timothy Weah',          'MID', 'player',     false),
  (NULL, 'USA13', NULL,                 'Team Photo - USA',      NULL,  'team_photo', false),
  (NULL, 'USA14', 'Diego Luna',         'Diego Luna',            'MID', 'player',     false),
  (NULL, 'USA15', 'Malik Tillman',      'Malik Tillman',         'FWD', 'player',     false),
  (NULL, 'USA16', 'Christian Pulisic',  'Christian Pulisic',     'FWD', 'player',     false),
  (NULL, 'USA17', 'Brenden Aaronson',   'Brenden Aaronson',      'FWD', 'player',     false),
  (NULL, 'USA18', 'Ricardo Pepi',       'Ricardo Pepi',          'FWD', 'player',     false),
  (NULL, 'USA19', 'Haji Wright',        'Haji Wright',           'FWD', 'player',     false),
  (NULL, 'USA20', 'Folarin Balogun',    'Folarin Balogun',       'FWD', 'player',     false)
) AS s(number, album_code, player_name_col, player_name, position, sticker_type, is_foil)
ON CONFLICT (album_code) DO UPDATE SET
  player_name = EXCLUDED.player_name,
  position    = EXCLUDED.position;
```

> **Important note on sequential numbers:** The exact sequential integer numbers (1–980) for stickers beyond the confirmed checklist entries are derived from album page order. The developer should assign these sequentially when loading the complete data. The `album_code` (e.g., `MEX1`) is the stable identifier; the `number` is just a display convenience. The `album_code` is what the AI scan uses for identification.

### 8.6 Seed File 04: FIFA Museum Stickers

```sql
-- scripts/seeds/04_museum_stickers.sql
-- 11 FIFA Museum stickers — past World Cup champions
-- These appear at the back of the album

INSERT INTO stickers (number, album_code, team_id, player_name, sticker_type, is_foil)
VALUES
  (970, 'MUS1',  NULL, 'Uruguay 1930',      'museum', true),
  (971, 'MUS2',  NULL, 'Italy 1934',        'museum', true),
  (972, 'MUS3',  NULL, 'Italy 1938',        'museum', true),
  (973, 'MUS4',  NULL, 'West Germany 1954', 'museum', true),
  (974, 'MUS5',  NULL, 'Brazil 1958',       'museum', true),
  (975, 'MUS6',  NULL, 'Brazil 1962',       'museum', true),
  (976, 'MUS7',  NULL, 'England 1966',      'museum', true),
  (977, 'MUS8',  NULL, 'Brazil 1970',       'museum', true),
  (978, 'MUS9',  NULL, '1974–1994 Champions', 'museum', true),
  (979, 'MUS10', NULL, '1998–2014 Champions', 'museum', true),
  (980, 'MUS11', NULL, '2018–2022 Champions', 'museum', true)
ON CONFLICT (album_code) DO UPDATE SET
  player_name = EXCLUDED.player_name;
```

### 8.7 Seed File 05: Sticker Variants

This file generates a `sticker_variants` record for every valid variant type. Not every variant applies to every sticker — foil/badge stickers do not have parallels (parallels only apply to non-foil base stickers, consistent with the Panini statement that Crumple parallels apply to non-foil stickers).

```sql
-- scripts/seeds/05_variants.sql
-- Generates variant records for all applicable stickers
-- Parallel variants apply to non-foil stickers only
-- Coca-Cola variant applies to a specific subset (tracked separately)

-- Step 1: Base variant for ALL stickers (foil and non-foil)
INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id, 'base', 1, 'retail'
FROM stickers
ON CONFLICT (sticker_id, variant_type) DO NOTHING;

-- Step 2: Retail parallel variants — non-foil stickers only
INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id, unnest(ARRAY[
  'blue', 'red', 'purple', 'green', 'black_1of1'
]), unnest(ARRAY[2, 3, 4, 5, 6]), 'retail'
FROM stickers
WHERE is_foil = false
ON CONFLICT (sticker_id, variant_type) DO NOTHING;

-- Step 3: Amazon exclusive — non-foil only
INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id, 'orange_amazon', 7, 'amazon_exclusive'
FROM stickers WHERE is_foil = false
ON CONFLICT (sticker_id, variant_type) DO NOTHING;

-- Step 4: Panini iCollect Crumple variants — non-foil only
INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id, unnest(ARRAY[
  'gold_crumple', 'blue_crumple', 'red_crumple',
  'purple_crumple', 'green_crumple', 'black_crumple_1of1'
]), unnest(ARRAY[8, 9, 10, 11, 12, 13]), 'panini_online'
FROM stickers WHERE is_foil = false
ON CONFLICT (sticker_id, variant_type) DO NOTHING;

-- Step 5: Coca-Cola stickers are NOT variants of existing stickers.
-- They are entirely separate sticker records with sticker_type = 'coca_cola'.
-- Each Coca-Cola sticker gets only a single 'base' variant (no parallels).
-- They are seeded in a separate file once the official list is confirmed.
-- DO NOT add a 'coca_cola' entry to the variant_type list above.
-- See docs/runbooks/update-sticker-database.md for how to add them.
```

### 8.8 Seed File 06: Feature Flags

```sql
-- scripts/seeds/06_feature_flags.sql

INSERT INTO feature_flags (key, enabled, rollout_pct, description)
VALUES
  ('FEATURE_AI_SCANNING',        false, 0,   'AI sticker identification via camera/image upload'),
  ('FEATURE_BATCH_SCANNING',     false, 0,   'Scan multiple stickers from one photo'),
  ('FEATURE_TRADE_MESSAGING',    false, 0,   'In-app messaging within trade requests (SSE-backed)'),
  ('FEATURE_PUBLIC_LEADERBOARD', false, 0,   'Public leaderboard of top collectors'),
  ('FEATURE_COCA_COLA_STICKERS', false, 0,   'Coca-Cola bottle sticker section in album'),
  ('MAINTENANCE_MODE',           false, 0,   'Redirect all users to maintenance page')
ON CONFLICT (key) DO NOTHING;
```

### 8.9 Seed File 07: Test Users (Non-Production Only)

```sql
-- scripts/seeds/07_test_users.sql
-- DEV AND LOCAL ONLY — never runs in production
-- Provides ready-to-use accounts for testing all features

-- Note: In local mode, auth is bypassed. These passwords are
-- irrelevant locally. In dev cloud, Cognito accounts are
-- created separately with these UUIDs mapped.

INSERT INTO users (id, email, username, display_name, role) VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin@test.local',   'admin_user',   'Admin User',    'admin'),
  ('00000000-0000-0000-0000-000000000002', 'alice@test.local',   'alice',        'Alice',         'user'),
  ('00000000-0000-0000-0000-000000000003', 'bob@test.local',     'bob',          'Bob',           'user'),
  ('00000000-0000-0000-0000-000000000004', 'charlie@test.local', 'charlie',      'Charlie',       'user'),
  ('00000000-0000-0000-0000-000000000005', 'diana@test.local',   'diana',        'Diana',         'user')
ON CONFLICT (email) DO NOTHING;

INSERT INTO user_settings (user_id) VALUES
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-000000000004'),
  ('00000000-0000-0000-0000-000000000005')
ON CONFLICT (user_id) DO NOTHING;

-- Give Alice a partial collection (useful for UI testing)
INSERT INTO user_stickers (user_id, sticker_variant_id, quantity)
SELECT
  '00000000-0000-0000-0000-000000000002',
  sv.id,
  CASE WHEN ROW_NUMBER() OVER () % 7 = 0 THEN 2 ELSE 1 END  -- every 7th = duplicate
FROM sticker_variants sv
JOIN stickers s ON sv.sticker_id = s.id
WHERE sv.variant_type = 'base'
  AND s.number BETWEEN 1 AND 200   -- Alice has first 200 base stickers
ON CONFLICT (user_id, sticker_variant_id) DO NOTHING;

-- Give Bob a different partial collection (enables trade match testing)
INSERT INTO user_stickers (user_id, sticker_variant_id, quantity)
SELECT
  '00000000-0000-0000-0000-000000000003',
  sv.id,
  CASE WHEN ROW_NUMBER() OVER () % 5 = 0 THEN 2 ELSE 1 END
FROM sticker_variants sv
JOIN stickers s ON sv.sticker_id = s.id
WHERE sv.variant_type = 'base'
  AND s.number BETWEEN 150 AND 400  -- Bob has stickers 150–400 (overlaps with Alice)
ON CONFLICT (user_id, sticker_variant_id) DO NOTHING;
```

### 8.10 Data Maintenance: Handling Panini Corrections

Panini occasionally corrects player names or sticker details after release. When this happens:

1. Update the relevant row in the seed file (`03_team_stickers.sql`)
2. Create a new migration file: `V{N}__correct_sticker_{album_code}.sql`
3. The migration applies the specific correction to production
4. Re-running the full seed (safe due to upserts) also applies it to local/dev

```sql
-- Example: data/migrations/V3__correct_sticker_USA10.sql
UPDATE stickers
SET player_name = 'Weston McKennie',  -- corrected spelling
    updated_at  = now()
WHERE album_code = 'USA10';
```

The admin interface allows the same correction without a migration for urgent fixes in production.

### 8.11 How to Verify the Seed Ran Correctly

After running `npm run db:seed`, verify with these queries in pgAdmin (`localhost:5050`) or any SQL client:

```sql
-- Should return 48
SELECT COUNT(*) FROM teams;

-- Should return 12 distinct groups: A through L
SELECT DISTINCT group_name FROM teams ORDER BY group_name;

-- Should return approximately 980
SELECT COUNT(*) FROM stickers;

-- Should return counts per team (all should be 20)
SELECT t.fifa_code, t.name, COUNT(s.id) AS sticker_count
FROM teams t
LEFT JOIN stickers s ON s.team_id = t.id
GROUP BY t.fifa_code, t.name
ORDER BY t.group_name, t.name;

-- Should return variant counts (non-foil stickers × 14 variants each)
SELECT variant_type, COUNT(*) FROM sticker_variants
GROUP BY variant_type ORDER BY COUNT(*) DESC;

-- Should show 5 test users (local/dev only)
SELECT username, role FROM users ORDER BY role, username;
```

---

## 9. Authentication & Security

### 9.1 Email Verification Flow

After a user registers, their account exists but `email_verified_at` is NULL. They receive a verification email (via Mailpit locally, SES in cloud) with a secure one-time link.

```
User registers → API creates account (email_verified_at = NULL)
             → Verification email sent with token link
             → User clicks link → POST /auth/verify-email
             → API sets email_verified_at = now()
             → User is redirected to /dashboard
```

**Before verification:** Users can log in but see a banner prompting them to verify. They cannot initiate trade requests until verified (reduces spam). They can freely add stickers to their collection.

**Token:** A cryptographically random token stored in the `email_verification_tokens` table (see §7.2 schema) with a 24-hour expiry. After clicking the link, the token is consumed (deleted).

**Re-send flow:** `POST /auth/resend-verification` deletes any existing tokens for the user, generates a new one, and emails the new link. Rate-limited to 3 requests per hour per user to prevent email-bombing. If the previous token has not expired, the user can still use either link until first use; the new token simply provides another chance.

**Expired tokens:** If a user clicks an expired link, the API returns `410 Gone` with a "Verification link expired" page that includes a one-click re-send button.

### 9.2 Local Authentication Mode

Locally, authentication is handled by a lightweight mock middleware. Any email/password combination is accepted. The API reads `AUTH_MODE=local` from the environment and skips Cognito entirely. This means developers never need AWS credentials to work on features.

Test users are pre-seeded with `email_verified_at` set to a past timestamp — no verification step needed locally.

Predefined test user sessions are accessible via:
```bash
# Login as Alice (test collector)
POST http://localhost:3001/api/v1/auth/login
{ "email": "alice@test.local", "password": "anything" }

# Login as admin
POST http://localhost:3001/api/v1/auth/login
{ "email": "admin@test.local", "password": "anything" }
```

### 9.3 Cloud Authentication: AWS Cognito

In staging and production, Cognito handles registration, login, MFA, JWT tokens, and password resets. The API reads `AUTH_MODE=cognito` and validates JWTs against the Cognito user pool.

The transition from local mock to Cognito is a single environment variable change — no code changes required.

### 9.4 Security Controls

| Control | Local | Cloud |
|---|---|---|
| HTTPS | No (HTTP only) | Yes — TLS 1.3 via ACM |
| Input validation | Yes (Zod) | Yes (Zod) |
| Rate limiting | Yes (Fastify) | Yes (Fastify + WAF) |
| SQL injection | Yes (parameterised queries) | Yes |
| Auth enforcement | Mock — any credentials | Cognito JWT validation |
| Secrets | `.env.local` file | AWS Secrets Manager |
| DDoS protection | None | AWS Shield Standard |

### 9.5 Security Headers

The API and frontend send the following headers on every response. Implemented via `@fastify/helmet` on the API and `next.config.js` headers on the frontend:

| Header | Value |
|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` (cloud only) |
| `Content-Security-Policy` | `default-src 'self'; img-src 'self' data: https:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.stickerswap2026.ca; frame-ancestors 'none'` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(self), microphone=(), geolocation=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |

CSP is initially set in report-only mode (`Content-Security-Policy-Report-Only`) and tightened to enforcing once observed violations are zero.

### 9.6 Cookie Configuration

Auth cookies (refresh-token cookie issued by the API) are configured as:
- `HttpOnly` — not accessible to JavaScript
- `Secure` — sent only over HTTPS (cloud only)
- `SameSite=Lax` — sent on top-level GET navigation, not on cross-site POSTs
- `Max-Age=2592000` — 30 days; matches refresh-token TTL
- `Path=/api/v1/auth`
- `Domain=stickerswap2026.ca` (omitted locally)

Access tokens are short-lived JWTs (15 min TTL) stored in memory by the frontend (Zustand) — never in `localStorage`.

### 9.7 Password Policy & Account Lockout

When `AUTH_MODE=cognito`:

| Policy | Setting |
|---|---|
| Minimum length | 12 characters |
| Required character classes | At least 1 lowercase, 1 uppercase, 1 number |
| Breached-password check | Cognito advanced security: blocks passwords found in haveibeenpwned breach corpus |
| MFA | Optional at launch (TOTP); required for admin role |
| Lockout | 5 failed login attempts on the same account → 15-minute lock (separate from per-IP rate limit in §6.4) |
| Password reset | Email-only flow; tokens 1-hour TTL, single-use |

Account lockout is keyed on `user_id`, not IP, to prevent password-spray attacks across many IPs. Implemented via Redis (`lockout:{user_id}`, TTL 900s).

### 9.8 Logging PII Policy

Structured logs (§20) **never** contain: full passwords, JWT tokens or refresh tokens, full email addresses (only the masked form `a***@example.com`), `user_reports.description` content, `trade_messages.body` content, or full `audit_log.ip_address` values for entries older than 90 days. A pre-commit hook runs `gitleaks` to catch accidental commits of secrets.

---

## 10. AI Image Processing

### 10.1 Local Mock Mode

When `CLAUDE_API_KEY=mock`, the scan endpoint returns a hardcoded realistic response without calling the Claude API:

```json
{
  "sticker_number": 247,
  "album_code": "BRA5",
  "player_name": "Vinicius Jr.",
  "team_fifa_code": "BRA",
  "confidence": 0.94,
  "reasoning": "Mock response — AI scanning disabled in local mode"
}
```

This lets the entire scan UI be built and tested locally at zero cost.

### 10.2 Cloud Pipeline (Identical Logic, Real API)

When `CLAUDE_API_KEY` is a real Anthropic API key:

1. **AWS Lambda** preprocesses the image (EXIF strip, resize, type validation)
2. **Border colour detection** identifies the rarity variant
3. **Claude Vision API** identifies the player and sticker number
4. Confidence routing — auto-populate (≥0.85), selection UI (0.60–0.84), manual (< 0.60)
5. Image deleted from S3 within 24 hours

### 10.3 Graceful Degradation

If the Claude API is unavailable (in any environment), the scan endpoint returns a `503` with a user-friendly message. The rest of the application continues working fully.

---

## 11. Trading & Sharing Features

### 11.1 Trade Matching Algorithm

1. Fetch requesting user's missing variant IDs
2. Fetch their duplicate variant IDs (quantity > 1)
3. Find users with mutual overlap (they have what you need AND need what you have)
4. Score and rank by mutual overlap count
5. Exclude users with trade matching disabled

Results cached in Redis for 2 minutes.

### 11.2 Trade Request Flow

```
User A views matches → sends trade request (specifying offered and wanted stickers)
User B receives email notification + sees badge in-app
User B chooses one of:
  ├── Accept  → status → accepted; both notified in-app + email
  │             *** no inventory change yet ***
  │             both users coordinate physical exchange via in-app messages
  │             either party clicks "Mark as Complete" once stickers are in hand
  │                → status → completed; both inventories update; both notified
  ├── Decline → trade closes; User A notified in-app + email
  └── Counter → propose different stickers; User A notified in-app + email
                and can Accept / Decline / Counter

Either party may cancel an accepted trade before it is marked complete.

Throughout: both users can send messages inside the trade
            to coordinate logistics (e.g. address, meetup, shipping)
```

**Counter-proposal:** When countering, the user edits the offered/wanted sticker lists and submits; the API increments `trade_requests.counter_count` (CHECK constraint enforces ≤ 5). The trade stays in `pending` status until one party accepts or declines. The 6th counter-attempt returns `409 Conflict`; a scheduled job (§34) transitions the trade to `expired` after 30 days of no activity in `pending` status.

**Multi-quantity:** Each `trade_items` row carries an explicit `quantity` (default 1). A user offering "2× MEX5 base + 1× BRA10 base" results in three `trade_items` rows (or two — one per variant — with appropriate quantities).

**Accepted-trade timeout:** When a trade transitions to `accepted`, `expires_at` is set to `accepted_at + INTERVAL '30 days'`. A daily scheduled job (§34) sweeps `accepted` trades whose `expires_at` has passed and transitions them to `expired`, notifying both parties. Either party may extend by sending a message (resets `expires_at` to `now() + 30 days`, max 3 extensions).

**Race condition on Mark Complete:** Either party may click "Mark complete." If both click simultaneously, the API wraps the inventory update in a single transaction that begins with `SELECT ... FOR UPDATE` on the `trade_requests` row, then re-checks the status. If the status is no longer `accepted`, the second click is a no-op (returns the already-completed response). This prevents double inventory mutation.

**Inventory update on completion:** When either party marks the trade complete (`status → completed`), the API runs a single database transaction:

1. `SELECT … FROM trade_requests WHERE id = $1 FOR UPDATE`; abort if status is not `accepted`
2. `UPDATE trade_requests SET status = 'completed', completed_at = now()`
3. For each `trade_item` with `direction = 'offer'`: decrement requester's `user_stickers.quantity` by `trade_items.quantity`
4. For each `trade_item` with `direction = 'want'`: decrement recipient's `user_stickers.quantity` by `trade_items.quantity`
5. Upsert `user_stickers` rows on the receiving side, incrementing `quantity` by the traded amount
6. Delete any `user_stickers` rows where `quantity` has reached `0`

If the transaction fails (e.g., insufficient quantity due to concurrent modification), the status remains `accepted` and no collections are changed; the user sees an error toast prompting them to refresh.

### 11.3 In-App Messaging: Implementation

#### Why SSE (Server-Sent Events), not WebSockets

Messages are *sent* via a normal `POST /messages` API call. Only the *notification* of a new message needs to be pushed to the other user in real-time. SSE is a one-way server-to-browser push over plain HTTP — simpler than WebSockets, no special protocol, works through firewalls and corporate proxies, and Fastify supports it natively. WebSockets provide bidirectional communication which isn't needed here.

Managed real-time services (Pusher, Ably, Firebase) are explicitly rejected because they would store user messages on servers outside Canada, violating PIPEDA data residency requirements. Redis — already in the stack — provides all the pub/sub capability needed.

#### The Multi-Server Problem and How Redis Solves It

In cloud, multiple API instances run in parallel (ECS Fargate tasks). A naive implementation breaks: User A connects to Server 1 for their SSE stream; User B sends a message that lands on Server 2; Server 1 never hears about it and User A sees nothing.

Redis Pub/Sub solves this cleanly:

```
User B sends message (POST)
         │
         ▼
  Server 2 writes message to PostgreSQL
         │
         ▼
  Server 2 publishes to Redis channel: trade:channel:{tradeId}
         │
         ▼ (Redis broadcasts to all subscribed servers)
         │
  Server 1 receives the Redis message
         │
         ▼
  Server 1 pushes SSE event to User A's open stream  ✓
```

Every API instance subscribes to the Redis channel for each active trade with an open SSE connection. When a message arrives on any server, Redis delivers it to all subscribed servers, which each push it to their connected clients.

#### SSE Event Types

The SSE stream at `GET /trade/requests/:id/stream` emits these event types:

```
event: new_message
data: {"id":"...","senderId":"...","body":"Hello!","sentAt":"2026-05-03T..."}

event: status_changed
data: {"status":"accepted","updatedAt":"2026-05-03T..."}

event: status_changed
data: {"status":"completed","updatedAt":"2026-05-03T..."}

event: heartbeat
data: {}
```

The heartbeat is sent every 30 seconds to keep the connection alive through proxies and load balancers that close idle connections.

#### Frontend Behaviour

```typescript
// Open the stream when the trade page loads
const eventSource = new EventSource(`/api/v1/trade/requests/${tradeId}/stream`, {
  withCredentials: true,
})

eventSource.addEventListener('new_message', (e) => {
  const message = JSON.parse(e.data)
  appendMessageToUI(message)
})

eventSource.addEventListener('status_changed', (e) => {
  const { status } = JSON.parse(e.data)
  updateTradeStatusUI(status)
})

// Close when the user navigates away
return () => eventSource.close()
```

If the connection drops (network blip), the browser automatically reconnects using the `Last-Event-ID` header. The server re-sends any messages missed during the gap. This makes the stream resilient to brief disconnections.

#### Message Persistence and Deletion

- Messages are stored in PostgreSQL (`trade_messages` table) — durable, queryable, exportable
- `GET /trade/requests/:id/messages` returns the full message history with cursor-based pagination
- **Retention:** Messages are deleted 90 days after the trade closes (accepted, declined, or expired)
- **Right to erasure:** Deleting a user account (`DELETE /users/:id`) cascades to their messages
- Body length is capped at 2,000 characters per message (`CHECK (char_length(body) BETWEEN 1 AND 2000)`)
- **XSS prevention:** Messages are stored as plain text and rendered with HTML escaping. No HTML, Markdown, or rich text is permitted; URLs are detected client-side and rendered as `<a rel="noopener noreferrer nofollow" target="_blank">`. The `Content-Security-Policy` header (§9.4) provides defence-in-depth.
- **Idempotency:** `POST /api/v1/trade/requests/:id/messages` accepts an optional `Idempotency-Key` header (UUID). The server stores `(key, sender_id) → response` in Redis for 24 hours and replays the cached response on duplicate requests, preventing duplicate messages from mobile retry loops.

#### Local Development

Locally, a single API instance runs with Redis in Docker — no multi-server coordination needed. The pub/sub path still executes (Server 1 publishes and receives its own message), making the local experience identical to cloud behaviour. No mocking required.

### 11.4 Post-Trade Ratings (Trust & Safety)

After a trade is marked `completed`, both parties enter a **14-day rating window** where they can rate each other on a binary scale (thumbs up / thumbs down). This rating system builds trust and helps identify users with problematic behaviour. Full details on the rating system, user reporting, and moderation capabilities are in **Section 33: Trust & Safety**.

### 11.5 Disputes

If a trade is marked `completed` but one party never received their stickers (or received fakes/damaged stickers), the formal recourse is the user-reporting flow described in §33.2. Categories `no_show`, `fake_stickers`, and `damaged_stickers` exist specifically to capture these cases. Reports filed within the 14-day rating window are weighted more heavily during admin review (linked-trade context is preserved on the report).

There is no "rollback" of a completed trade — once both inventories have been updated, the inventory cannot be unwound automatically (the physical stickers may already have been re-traded). Disputes therefore lead to ratings and reports, not inventory changes. Admins may issue partial refunds of trust-score impact in egregious cases via the moderation tools described in §33.3.

### 11.6 Shareable Public Lists

Unique expiring share links generated with cryptographically random tokens:
`https://stickerswap2026.ca/share/abc123xyz`

Privacy options per list: Private (default) | Link-only | Public.

Share links can be revoked manually by their owner via `DELETE /api/v1/users/:id/share/:token`. Revoked tokens return `410 Gone`.

---

## 12. Email & Notifications

### 12.1 Local: Mailpit

All emails sent by the application in local mode are captured by Mailpit at `http://localhost:8025`. No real emails are sent. You can see all verification emails, trade notifications, and password resets in the Mailpit inbox.

### 12.2 Cloud: AWS SES

All outbound email in cloud environments routes through AWS SES. Setup: verify sending domain with DKIM + SPF in Route 53; request SES production access before launch.

### 12.3 CASL Compliance

Marketing emails require explicit opt-in. Transactional emails (verification, password reset, trade notifications) do not. Consent records stored in the database. Every marketing email includes a one-click unsubscribe. Violations carry fines up to $10 million CAD.

### 12.4 SES Bounce & Complaint Handling

SES disables sending if bounce rate exceeds 5% or complaint rate exceeds 0.1%. Both events are forwarded via SNS topic to a small Lambda (cloud) or in-API webhook (local mock) which:

1. Updates a new `users.email_status` column (`active` | `bounced_soft` | `bounced_hard` | `complaint`)
2. Suppresses future sends to the address (the API checks `email_status` before queueing email)
3. Adds the address to a SES suppression list automatically (hard bounces only)
4. For `complaint`: also unsets `user_settings.email_marketing` and writes a `consent_records` revocation row

`email_status` is exposed in the Settings UI ("Your email is bouncing — please update your address").

### 12.5 Email Authentication: SPF / DKIM / DMARC

All three are configured at launch:
- **SPF**: `v=spf1 include:amazonses.com -all` in Route 53
- **DKIM**: SES-managed CNAMEs added to Route 53 during domain verification
- **DMARC**: starts at `v=DMARC1; p=quarantine; rua=mailto:dmarc@stickerswap2026.ca; pct=100`. After 30 days of clean reports, tightened to `p=reject`.

DMARC reports are aggregated via a free service (e.g., dmarcian) and reviewed monthly.

### 12.6 Web Push Notifications

For the installed PWA experience, transactional notifications (new trade message, trade accepted, trade marked complete) are delivered via the Web Push API. SSE handles real-time push for active sessions; web push handles "user closed the app" cases.

| Element | Choice |
|---|---|
| Standard | W3C Web Push + VAPID |
| Server library | `web-push` (Node) |
| Subscription storage | New table `push_subscriptions` (user_id, endpoint, keys (p256dh, auth), created_at) |
| Trigger points | New trade request, trade accepted, new trade message, trade auto-expiring within 24h |
| User control | `user_settings.push_*` boolean per notification type; opt-in only |
| Privacy | Subscription endpoint URLs are PII (browser-derived); deleted on account deletion |

Web push is feature-flagged behind `FEATURE_WEB_PUSH` (default false). Scheduled to roll out in Phase A6 (weeks 20–22) after the core trade flow is stable.

---

## 13. Analytics

### 13.1 Local: None

Analytics are not active in local development. No analytics service is included in docker-compose.

### 13.2 Cloud: Plausible Analytics (Self-Hosted)

Privacy-respecting, cookieless analytics hosted on a small EC2 instance in `ca-central-1`. Data stays in Canada. No consent banner required. ~$3–5 USD/month.

---

## 14. Repository Structure & Branch Strategy

### 14.1 Monorepo Structure

```
stickerswap2026/
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
│       │   ├── repositories/         # Database queries
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
│   ├── schema.ts                     # Drizzle schema (single source of truth)
│   └── migrations/                   # Drizzle-generated SQL migration files
│       └── 0001_initial.sql
│
├── data/
│   └── seeds/                        # Seed data scripts
│       ├── 01_teams.sql
│       ├── 02_intro_stickers.sql
│       ├── 03_team_stickers.sql      # Complete 960-record file
│       ├── 04_museum_stickers.sql
│       ├── 05_variants.sql
│       ├── 06_feature_flags.sql
│       └── 07_test_users.sql
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
├── scripts/
│   ├── seed-database.sh
│   ├── anonymise-dump.sh
│   └── load-test.sh
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
   git clone https://github.com/your-org/stickerswap2026.git
   cd stickerswap2026

2. Install dependencies
   npm install

3. Set up environment
   cp .env.example .env.local

4. Start all services
   docker compose -f infrastructure/docker/docker-compose.yml up -d

5. Run migrations and seed data
   npm run db:migrate && npm run db:seed

6. Open the app
   Frontend:        http://localhost:3000
   API:             http://localhost:3001/health
   Email inbox:     http://localhost:8025
   Cache browser:   http://localhost:8081
   Database viewer: http://localhost:5050

### Test accounts
  Admin:   admin@test.local  / any password
  Alice:   alice@test.local  / any password  (has a partial collection)
  Bob:     bob@test.local    / any password  (overlapping collection for trade testing)
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

---

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
Docker image tag:    stickerswap2026-api:1.2.4
ENV variable:        APP_VERSION=1.2.4
/health response:    { "version": "1.2.4" }
CloudWatch logs:     [version=1.2.4]
GitHub Release:      v1.2.4
```

### 15.3 Docker Image Tagging

```bash
stickerswap2026-api:1.2.4       # exact version — permanent
stickerswap2026-api:sha-a1b2c3  # git SHA — traceable
stickerswap2026-api:production  # mutable alias — updated after healthy deploy
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

---

## 16. Health Checks

### 16.1 Two Endpoints

**`GET /health` — Liveness (lightweight, local and cloud)**

Called every 10 seconds by Docker (locally) and ECS (cloud). Confirms the Node.js process is alive. Does not check dependencies.

```json
HTTP 200 { "status": "ok", "version": "1.2.4", "uptime_seconds": 86423 }
```

**`GET /health/ready` — Readiness (comprehensive)**

Called before routing any traffic to a new container. Checks all dependencies.

```json
HTTP 200 {
  "status": "ok",
  "checks": {
    "database": { "status": "ok", "latency_ms": 4 },
    "redis":    { "status": "ok", "latency_ms": 1 },
    "storage":  { "status": "ok" }
  }
}
```

Returns HTTP 503 if any dependency is unhealthy.

### 16.2 Local Health Check

In local development, `storage` check verifies the local upload directory is writable (instead of checking S3). The health check behaviour is otherwise identical to cloud.

### 16.3 Dependency Check Timeouts

| Dependency | Method | Timeout |
|---|---|---|
| PostgreSQL | `SELECT 1` | 2 seconds |
| Redis | `PING` | 1 second |
| Storage | Local write / S3 HeadObject | 3 seconds |

Total endpoint timeout: 5 seconds.

---

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

---

## 18. DevOps & CI/CD Pipeline

### 18.1 Local-First, Then CI/CD

During Phase A (local development), there is no CI/CD pipeline. Developers run tests locally:

```bash
npm run test           # run all tests once
npm run test:watch     # run tests on file change
npm run lint           # check code style
npm run typecheck      # TypeScript validation
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

---

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

---

## 20. Monitoring, Alerting & Observability

### 20.1 Local Monitoring

In local development, all logs appear in the Docker Compose terminal output in structured JSON. Redis Commander at `localhost:8081` shows cache state in real time. pgAdmin at `localhost:5050` allows direct database inspection.

### 20.2 Cloud: Three Pillars

**Logs — CloudWatch Logs**

Structured JSON with `version`, `environment`, and `requestId` on every line. Retention: 7d (dev), 30d (staging), 365d (production).

**Metrics + Dashboards — CloudWatch + Grafana**

Grafana connects to CloudWatch as a data source. Dashboards are JSON-defined and version-controlled in the repository. `docs/runbooks/grafana-guide.md` explains how to read them and add panels.

**Traces — AWS X-Ray**

Slow request debugging — shows which specific query or API call caused a delay.

### 20.3 Alerts (Cloud)

| Alert | Threshold |
|---|---|
| API error rate | > 1% over 5 min |
| API p99 response | > 2 seconds |
| ECS CPU | > 80% for 10 min |
| Aurora CPU | > 80% for 5 min |
| Redis memory | > 80% |
| Health check failures | 3 consecutive |
| AWS spend | > $400 USD/month |
| SES bounce rate | > 4% (warns before SES auto-suspend at 5%) |
| SES complaint rate | > 0.05% (warns before suspend at 0.1%) |
| Frontend error rate | > 1% of sessions over 30 min (Sentry) |
| Background job failure | Any scheduled job fails 3× consecutively |

### 20.4 Frontend Error Tracking

Backend logs do not catch errors that happen in the user's browser (component crashes, failed fetches, JS exceptions). To close that gap, the frontend integrates **Sentry** (or **GlitchTip** if data residency is a concern — GlitchTip can be self-hosted in `ca-central-1`).

| Aspect | Choice |
|---|---|
| Service | Sentry SaaS (default) or self-hosted GlitchTip in `ca-central-1` (if PIPEDA review prefers) |
| Captured | Unhandled exceptions, React error-boundary errors, slow transactions, failed `fetch` requests with status ≥ 500 |
| Not captured | URLs containing `share/<token>`, request bodies, anything matching email regex |
| User context | Anonymous user-ID hash only; no email or username |
| Sample rate | 100% errors, 10% performance traces |
| Release tag | `APP_VERSION` from §15 |

Errors are correlated to backend logs via the `requestId` header (sent on every API response, captured by the frontend client and attached to Sentry events).

### 20.5 Cache Stampede Prevention

Hot keys (`stickers:all`, `user:{id}:summary` for popular users) expiring during peak load (the pack-opening spike in §21.7) cause "thundering herd" — many concurrent requests recompute the value and pile onto PostgreSQL.

Mitigation (singleflight pattern):
1. On cache miss, the request acquires a short-TTL Redis lock: `SET cache:lock:{key} 1 NX PX 5000`
2. The winner computes the value and writes it to cache; losers wait briefly (200 ms) and re-read
3. After write, the lock is released
4. If a loser still misses after the wait, it computes anyway (lock-failure escape hatch)

Implemented as a wrapper helper (`cachedOrCompute(key, ttl, fn)`) and applied to all GET endpoints that hit cached read-mostly data.

### 20.6 Aurora Serverless v2 Cold Start

Aurora Serverless v2 with `min_capacity = 0` saves money at night but adds 10–30 s latency on the first request after a scale-to-zero. Our mitigations:

1. **Production min_capacity = 0.5 ACU** — never scales to zero. The ~$15/month cost is worth the consistent UX.
2. **Dev/staging min_capacity = 0** — saves money, accepts cold-start during dev work.
3. **CloudWatch Synthetics canary** — an external GET to `/health/ready` every 4 minutes keeps the connection pool warm even outside business hours (defence in depth).
4. **Frontend UX during cold start** — the `/health/ready` endpoint is checked from the landing page; if it returns 503, the UI shows a "Waking up — this takes about 20 seconds" notice rather than a generic error.

---

## 21. Testing Strategy

### 21.1 Local Testing First

All testing during Phase A runs locally. The full test suite must pass before any code is deployed to cloud environments.

### 21.2 The Testing Pyramid

```
     /  E2E  \         7 critical flows · Playwright · runs on Staging
    /──────────\
   / Integration\      Every API endpoint · Supertest + Testcontainers
  /──────────────\
 /  Unit Tests   \     Business logic · Vitest · fast · many
/──────────────────\
/ Static Analysis  \   TypeScript · ESLint · instant
```

### 21.3 Layer 1: Static Analysis

- **TypeScript `strict: true`** — compile-time safety
- **ESLint + Prettier** — code quality and formatting
- **GitLeaks** — catches accidentally committed secrets
- **Snyk** — dependency vulnerability scanning

### 21.4 Layer 2: Unit Tests — Vitest

Coverage target: 80% minimum, enforced in CI. Trade algorithm and auth code at 100%.

Key test areas:
- Trade matching algorithm (all edge cases)
- Collection completion percentage calculation
- Sticker number validation (0–980 range)
- Border colour → variant type mapping (AI scan)
- Confidence routing logic (AI scan)

### 21.5 Layer 3: Integration Tests — Supertest + Testcontainers

Testcontainers spins up real PostgreSQL and Redis Docker containers for each test run. Clean database every time. Tests every API endpoint for happy path and error cases.

Critical: test that `POST /api/v1/users/:id/stickers` correctly handles all 14 variant types, and that Redis cache is invalidated on collection change.

### 21.6 Layer 4: E2E Tests — Playwright

Runs against Staging environment (not local, not mocks). 7 critical user flows:

1. Registration & Login
2. Adding stickers to collection
3. Marking duplicates
4. Trade matching
5. Shareable list generation
6. AI scan (happy path)
7. Account deletion (CPPA erasure)

Failed tests produce screenshots and video recordings as GitHub Actions artefacts.

### 21.7 Layer 5: Performance — k6

Run before every production deployment. Two scenarios: steady state (500 users) and pack-opening spike (5,000 users). All DB queries profiled — any query over 100ms requires optimisation before merge.

### 21.8 Layer 6: Security

- OWASP ZAP automated scan in CI on each staging deploy
- OWASP Top 10 developer review documented before launch
- Responsible disclosure policy published pre-launch
- Professional penetration test at 1,000 users

### 21.9 Layer 7: AI Feature Testing

Fixed dataset of 50 labelled test images in S3. Accuracy targets: Top-1 ≥ 85%, Top-3 ≥ 95%, border detection ≥ 92%. Contract test verifies Claude API response schema is unchanged.

### 21.10 Layer 8: Accessibility

Automated axe-core checks on every E2E run (WCAG 2.1 AA). Manual screen reader test before launch.

---

## 22. Disaster Recovery

### 22.1 Recovery Objectives

- **RTO:** ≤ 30 minutes
- **RPO:** ≤ 5 minutes of data loss

### 22.2 Backup Strategy (3-2-1)

- Aurora continuous backup: 35-day point-in-time recovery
- Aurora Global Database: replication to ca-west-1 (~1 second lag)
- S3 cross-region replication: assets mirrored to ca-west-1

Failover to Calgary in under 1 minute if Montréal region fails.

### 22.3 Quarterly DR Exercise

Recovery procedure is tested every quarter. Results documented in `docs/runbooks/dr-exercise-log.md`.

---

## 23. Canadian Privacy Compliance (PIPEDA / CPPA / CASL)

### 23.1 Applicable Laws

- **PIPEDA / CPPA** — federal private-sector privacy law
- **CASL** — governs commercial electronic messages (fines up to $10M CAD)
- **Quebec Law 25** — stricter provincial law for Quebec users

### 23.2 Technical Controls Required

- **Meaningful consent** at registration — separate unchecked checkboxes for analytics and marketing email
- **Consent for AI processing** — separate prompt before first sticker scan
- **Data minimisation** — collect only email, username, collection data
- **Right to access (30-day SLA)** — "Download my data" in Settings
- **Right to erasure (30-day SLA)** — "Delete my account" in Settings
- **Data residency** — all data in AWS ca-central-1 or ca-west-1
- **Breach notification** — notification workflow in the runbook
- **Children's privacy** — age gate; users under 13 require parental consent
- **CASL** — marketing emails require explicit opt-in; unsubscribe honoured within 10 days

### 23.3 Trust & Safety Compliance (Section 33)

The Trust & Safety system (user ratings, reporting, moderation) has additional privacy requirements:

- **Rating erasure:** On account deletion, rating comments are cleared and rater ID is anonymised, but aggregate trust counts are retained (operational necessity)
- **Report retention:** Report descriptions are retained for 2 years after resolution (moderation record), then redacted
- **Ban records:** Ban reasons and moderation notes are retained indefinitely for audit purposes; excluded from user data exports
- **Data export:** Ratings given/received and submitted reports are included in the user data export; resolved reports, resolution notes, and ban records are excluded
- **Report categories:** The `underage` category receives priority review and mandatory human escalation

Full details in Section 33: Trust & Safety.

### 23.4 Age Gate Implementation

Registration collects `birth_year` only (data minimisation — full DOB is not needed). The frontend displays a year picker. The backend rejects any year that would make the user under 13 at registration time with `403 Forbidden` and a generic message ("You must be at least 13 to use this service"). `birth_year` is stored on `users` and is included in data exports but never displayed publicly.

Quebec users (Law 25) under 14 cannot consent on their own behalf for non-essential data processing; the consent UI is gated to 14+ for the analytics/marketing checkboxes. (Functional account creation is allowed at 13+ federally.)

### 23.5 Account Deletion: Soft-Delete + Grace Window

The 30-day SLA from §23.2 is implemented as a two-stage process:

1. **Day 0 — User clicks "Delete my account":** `users.deleted_at = now()` (soft delete). The user is logged out. The account is hidden from search, trade matching, profiles, and shareable lists. The user can restore by logging in within 14 days (a "Your account is scheduled for deletion — restore?" banner appears).
2. **Day 14 — Grace window expires:** A daily scheduled job (§34) hard-deletes / anonymises:
   - Email, username, display_name → cleared / replaced with `[Deleted User]`
   - `birth_year`, `avatar_url` → NULL
   - `hashed_email` → retained for ban-evasion prevention (§33.3)
   - `trade_ratings` they gave/received → comments cleared, IDs anonymised at API layer (§33.9)
   - `trade_messages` → deleted (CASCADE)
   - Active trades → cancelled with status `'cancelled'` and a system-generated message
3. **Day 30 — Backups age out:** Aurora point-in-time recovery rolls past the deletion event. The account is now unrecoverable everywhere.

### 23.6 IP Address Retention in `audit_log`

IP addresses are PII under PIPEDA. To minimise retention while preserving abuse-investigation utility, a daily scheduled job (§34) truncates IPs in `audit_log` rows older than 90 days:
- IPv4 → `/24` (e.g., `203.0.113.42` → `203.0.113.0/24`)
- IPv6 → `/48`

Truncated IPs remain useful for spotting patterns (same /24 ban-evading) without identifying individuals.

### 23.7 Legal Documents Required Before Launch

- Privacy Policy
- Terms of Service
- Cookie Policy
- Responsible Disclosure Policy

Have a Canadian privacy lawyer review all four. Budget: $500–1,000 CAD.

---

## 24. Legal & Intellectual Property

### 24.1 Panini IP

The application tracks sticker metadata (numbers, names) — it does not reproduce Panini's artwork. Sticker images are processed and deleted within 24 hours. One-time legal review recommended. Budget $200–400 CAD.

### 24.2 Terms of Service Key Points

- No affiliation with or endorsement by Panini or FIFA
- Users own their collection data
- Prohibited: scraping, automated imports, commercial resale of platform access

---

## 25. Multi-User System Design

### 25.1 Roles

| Role | Permissions |
|---|---|
| Standard User | Own collection, trade, share |
| Admin | All above + sticker database management + Trust & Safety moderation (§33) |
| `_system` (pseudo-user) | Internal-only account (UUID `00000000-0000-0000-0000-000000000099`) used as the actor for automated moderation actions (e.g., auto-soft-bans). Cannot log in. Created by seed file `07_test_users.sql`. |

### 25.2 Privacy Controls

Users control: profile visibility, collection visibility, trade matching opt-in, leaderboard inclusion.

---

## 26. Error Handling & Graceful Degradation

### 26.1 Custom Error Pages

- **404** — friendly, links back to album
- **500** — "Something went wrong" with report option; no stack traces exposed
- **503 Maintenance** — shown when maintenance flag is active

### 26.2 API Error Format

```json
{
  "error": {
    "code": "STICKER_NOT_FOUND",
    "message": "Sticker number 981 does not exist.",
    "requestId": "req-abc-123"
  }
}
```

### 26.3 Degradation Rules

| Service Down | Impact | Core Functions |
|---|---|---|
| Claude Vision API | Scan temporarily unavailable | All other features work |
| Redis | Slightly slower responses | No feature loss |
| S3 | Avatars show placeholder | No data loss |
| SES (email) | Notification delay | No feature loss |

Core collection management requires only the API and PostgreSQL.

---

## 27. Support & Feedback

- `support@stickerswap2026.ca` — forwarded via SES
- In-app feedback button on every page
- Public status page on Upptime (GitHub Pages, free)
- GitHub Issues with templates for bug reports and feature requests

---

## 28. Operational Runbook

Stored in `docs/runbooks/`. Required before public launch.

| Runbook | Contents |
|---|---|
| `local-setup.md` | How to get the application running locally from scratch |
| `deploy-hotfix.md` | Deploy a critical fix bypassing normal pipeline |
| `rollback-deployment.md` | Revert to previous Docker image |
| `restore-database.md` | Restore from Aurora point-in-time backup |
| `disaster-recovery.md` | Full regional failover to ca-west-1 |
| `data-breach-response.md` | CPPA breach notification workflow |
| `process-data-request.md` | Handle export / delete account requests |
| `rotate-secrets.md` | Rotate secrets without downtime |
| `update-sticker-database.md` | Add or correct stickers (including admin UI) |
| `scale-infrastructure.md` | Increase capacity under high load |
| `grafana-guide.md` | Read dashboards, add panels, query CloudWatch |
| `redis-guide.md` | Cache key patterns, Redis CLI inspection |
| `scheduled-jobs.md` | List of all cron jobs, how to pause/resume, what to do if a job fails (see §34) |
| `dr-exercise-log.md` | Quarterly DR exercise results |

---

## 29. Security Testing & Disclosure Policy

### 29.1 At Launch

- OWASP ZAP automated scanning in CI
- OWASP Top 10 developer review documented
- Responsible disclosure policy at `stickerswap2026.ca/security`
- GitLeaks, Snyk, Trivy active in CI

### 29.2 Responsible Disclosure Policy

- Contact: `security@stickerswap2026.ca`
- Safe harbour for good-faith researchers
- Acknowledge within 5 business days
- Hall of Fame with reporter's permission

### 29.3 At 1,000 Users

Professional penetration test scheduled ($3,000–8,000 CAD).

---

## 30. Complete Technology Stack Summary

| Layer | Technology | Used Locally? |
|---|---|---|
| Frontend | Next.js 15 + TypeScript | Yes (Docker) |
| Styling | Tailwind CSS | Yes |
| State | Zustand + React Query | Yes |
| Backend | Node.js + Fastify + TypeScript | Yes (Docker) |
| Auth (local) | Mock middleware | Yes |
| Auth (cloud) | AWS Cognito | Cloud only |
| Database (local) | PostgreSQL 16 in Docker | Yes |
| Database (cloud) | Aurora PostgreSQL Serverless v2 | Cloud only |
| Migrations | Drizzle ORM | Yes |
| Connection pooling | `pg` pool (local) / RDS Proxy (cloud) | Yes |
| Cache (local) | Redis 7 in Docker | Yes |
| Cache (cloud) | AWS ElastiCache Redis | Cloud only |
| Cache browser | Redis Commander | Yes (localhost:8081) |
| Database browser | pgAdmin | Yes (localhost:5050) |
| File storage (local) | Local filesystem | Yes |
| File storage (cloud) | AWS S3 | Cloud only |
| AI scanning (local) | Mock response | Yes |
| AI scanning (cloud) | Anthropic Claude Vision API | Cloud only |
| Email (local) | Mailpit | Yes (localhost:8025) |
| Email (cloud) | AWS SES | Cloud only |
| Analytics | Plausible self-hosted | Cloud only |
| Feature flags | DB table (all environments) | Yes |
| IaC | Terraform | Cloud only |
| Monorepo | Turborepo | Yes |
| CI/CD | GitHub Actions | Cloud only |
| Versioning | semantic-release | Yes (for tagging) |
| Container runtime | Docker | Yes |
| Container orchestration | AWS ECS Fargate | Cloud only |
| Frontend hosting | Vercel | Cloud only |
| CDN | AWS CloudFront + ALB | Cloud only |
| DNS | AWS Route 53 | Cloud only |
| TLS | AWS Certificate Manager | Cloud only |
| Monitoring | CloudWatch + Grafana | Cloud only |
| Tracing | AWS X-Ray | Cloud only |
| WAF | AWS WAF | Cloud only |
| DDoS | AWS Shield Standard | Cloud only |
| Threat detection | AWS GuardDuty | Cloud only |
| Secrets (local) | `.env.local` file | Yes |
| Secrets (cloud) | AWS Secrets Manager | Cloud only |
| Unit tests | Vitest | Yes |
| Integration tests | Supertest + Testcontainers | Yes |
| E2E tests | Playwright | Yes (local) + Staging (CI) |
| Load tests | k6 | Yes + Cloud |
| Dep scanning | Snyk + Dependabot | CI |
| Container scanning | Trivy | CI |
| Security scanning | OWASP ZAP | CI (Staging) |
| Uptime monitoring | Upptime | Cloud only |
| Status page | Upptime (GitHub Pages) | Cloud only |

---

## 31. Development Phases

### Phase A: Local Development

> **Timeline note:** The 25-week Phase A estimate below is a target, not a guarantee. A full-stack application of this scope (AI scanning, trading, SSE messaging, PWA, i18n, trust & safety moderation, scheduled jobs, web push, 80% test coverage) realistically takes 25–32 weeks for a single developer starting from scratch. Phase A6 is an explicit buffer/hardening block; if implementation runs ahead of schedule, A6 work may begin earlier and A7 polish work can expand into the freed weeks. Use the milestone checkpoints to track progress objectively.

**A1 — Foundation (Weeks 1–4)**
- **Prerequisite (before coding begins):** Complete `03_team_stickers.sql` with all 960 records and sequential sticker numbers sourced from checklistinsider.com
- Monorepo scaffolded with Turborepo
- `docker-compose.yml` working — `docker compose up` starts all services
- README "Getting Started" tested by a second person from scratch
- Database schema deployed via Drizzle ORM migrations
- CORS and connection pooling configured in the API
- All seed data loaded and verified (48 teams, 980 stickers, all variants)
- `/health` and `/health/ready` endpoints live
- OpenAPI docs available at `http://localhost:3001/docs`
- Local auth mock working — all 5 test users can log in (pre-verified, no email step)
- Email verification flow working end-to-end via Mailpit
- `npm run test` runs and passes (with minimal initial test coverage)

**A2 — Core Collection Features (Weeks 5–8)**
- All collection API endpoints working with filtering and pagination
- Album view UI (all 980 sticker slots, filterable by team/group/type/status)
- Virtual scrolling on the album grid (renders 980 items without performance issues)
- Have / missing / duplicates views
- Collection completion percentage
- Avatar upload working
- Admin interface for sticker corrections
- React Error Boundary implemented
- Unit and integration tests for all collection operations

**A3 — Trading & Sharing (Weeks 9–12)**
- Trade matching algorithm
- Trade request / accept / decline / counter
- In-app messaging: PostgreSQL persistence + Redis pub/sub + SSE delivery
- SSE stream reconnection with `Last-Event-ID` for missed-message recovery
- Shareable public list generation
- Public profile pages
- E2E tests for all trade, messaging, and sharing flows

**A4 — AI Scanning (Weeks 13–16)**
- Image upload pipeline (local filesystem mock)
- Border colour detection
- Claude Vision API integration (with local mock mode)
- Confidence scoring + confirmation UI
- Batch scanning mode

**A5 — Trust & Safety (Weeks 17–19)**
- Post-trade rating system: binary ratings (thumbs up/down), 14-day window, trust score tiers
- User reporting: 8 categories, duplicate prevention, auto-flag threshold (3 reports = 48h soft ban)
- Ban enforcement: soft bans (trade/message restrictions) and hard bans (full suspension)
- Admin moderation interface: reports queue, ban management, user lookup
- Frontend: rating prompt post-trade, report modal, ban status banner, trust score badges
- Feature flag `FEATURE_TRUST_SAFETY` gating the entire system (disabled by default)
- Integration tests for rating window logic, duplicate report prevention, auto-flag threshold
- See Section 33 for full design

**A6 — Buffer & Integration Hardening (Weeks 20–22)**
- End-to-end smoke tests across all features built so far (collection → trading → AI scan → trust & safety)
- Bug-fix and stabilisation buffer (catches regressions before final polish)
- Background-jobs harness operational with all scheduled jobs from §34
- Idempotency-key middleware deployed and verified on all `POST` create endpoints
- Web push notification subscription flow working in PWA mode
- Redis cache stampede / singleflight pattern in place on hot keys
- Image-upload validation hardened (size, MIME, magic bytes — see §10)

**A7 — Polish & Pre-Cloud Hardening (Weeks 23–25)**
- Custom error pages (404, 500)
- Graceful degradation for all optional services
- Frontend retry logic
- Frontend error tracking (Sentry / GlitchTip — §20.4) wired up
- PWA offline cache for sticker master list
- i18n structure in place (English at launch; Spanish-ready for fast follow)
- Full test suite passes (≥80% coverage)
- OWASP Top 10 developer review documented
- All runbooks written (including `local-setup.md` and `scheduled-jobs.md`)
- Load test with k6 against local Docker environment

### Phase B: Cloud Migration

**B1 — Infrastructure & Dev Environment (Weeks 26–28)**
- AWS account created, MFA enabled
- Domain registered
- Terraform provisions dev environment
- GitHub Actions CI/CD pipeline operational
- Application deployed to dev, health checks pass
- Database seeded in dev cloud environment

**B2 — Staging & Production (Weeks 29–31)**
- Staging environment provisioned and verified
- Anonymised data refresh from production snapshot process tested
- Full E2E suite running against staging
- Production provisioned
- Soft launch to 100–200 beta users

**B3 — Launch**
- All Phase A polish applied
- Legal documents reviewed and published
- Responsible disclosure policy live
- AWS budget alerts configured
- Monitoring dashboards verified
- Public launch

---

## 32. Cost Estimate

### Phase A: Local Development

**$0/month** — Docker runs everything locally. No AWS costs until Phase B begins.

One-time costs during Phase A:
| Item | Cost |
|---|---|
| Domain registration | $15–20 CAD |
| Privacy / Terms legal review | $500–1,000 CAD (can defer to Phase B) |
| Panini IP legal review | $200–400 CAD (can defer to Phase B) |

### Phase B: Cloud Monthly Costs (USD, ~5,000 active users)

| Service | Monthly (USD) |
|---|---|
| AWS Aurora PostgreSQL Serverless v2 | $15–40 |
| AWS ECS Fargate (2 tasks) | $30–50 |
| AWS ElastiCache Redis | $20–30 |
| AWS Route 53 | $1–2 |
| AWS Cognito | $0 (free ≤ 50K MAU) |
| AWS WAF | $10–15 |
| AWS Certificate Manager | $0 |
| AWS CloudWatch + X-Ray | $10–20 |
| AWS Secrets Manager | $2–5 |
| AWS GuardDuty | $5–10 |
| AWS SES | $1–3 |
| AWS CloudTrail | $2–5 |
| AWS S3 + CloudFront (API) | $5–12 |
| GitHub Actions | $0–4 |
| Vercel (frontend) | $0–20 |
| Anthropic Claude Vision API | $5–30 |
| Plausible Analytics (EC2) | $3–5 |
| Domain (amortised) | $1–2 |
| **Total** | **~$110–253 USD/month** |
| **In CAD (~1.38)** | **~$152–349 CAD/month** |

### Cost at Scale

| Monthly Active Users | Estimated Monthly (USD) |
|---|---|
| Beta (< 1,000) | $50–70 |
| Launch (5,000) | $110–253 |
| World Cup peak (20,000) | $300–450 |
| 50,000 | $500–800 |

### Cost Controls

- AWS Budget alert at $400 USD/month
- Aurora min 0 ACUs — scales to zero overnight
- Fargate auto-scaling
- Claude Vision API rate limited to 20 scans/user/hour
- Vercel free tier until traffic warrants upgrade

---

## 33. Trust & Safety

This section describes the post-trade rating system, user reporting mechanism, and admin moderation system designed to build trust, handle bad-faith behaviour (cancellations after acceptance, physical exchange no-shows, harassment, fake/damaged stickers), and empower administrators.

### 33.1 Rating System

#### Design: Binary Ratings

Users rate each other after a trade is marked `completed`. The scale is **thumbs up / thumbs down** (binary), not 1–5 stars. Rationale:
- Binary ratings avoid gaming and conflict in a casual community context (a 3-star "neutral" invites hurt feelings and gaming)
- Physical sticker exchanges have a clear binary outcome: "Did this person show up with authentic stickers?" Yes or no.
- Aggregate display (`"47 trades · 94% positive"`) is immediately legible without explanation
- Matches real-world models like Facebook Marketplace and eBay's simplified feedback

#### Rating Window

- Rating opens when `trade_requests.status` transitions to `'completed'`
- Rating closes 14 days after `completed_at` (allows time to discover fake or damaged stickers)
- Outside this window, the rating button is disabled
- One rating per user per trade (enforced via `UNIQUE (trade_id, rater_id)`)

#### Trust Score Tiers

The public profile displays a trust tier badge derived from the positive rate among **all received ratings** (or the last 50 if the user has > 50 ratings):

| Tier | Badge | Colour | Condition |
|---|---|---|---|
| New Trader | None | Grey | < 3 received ratings |
| Trusted Trader | Checkmark shield | Green | ≥ 3 ratings, ≥ 80% positive |
| Good Trader | Thumbs up | Blue | ≥ 3 ratings, 60–79% positive |
| Trade with Caution | Warning triangle | Amber | ≥ 5 ratings, < 60% positive |

Profile display: **"47 trades · 94% positive"** displayed prominently on the user's profile card and `/profile/[username]` page. Recent feedback comments (last 5, anonymised) shown below. No percentage displayed on trade match cards — only the badge and trade count.

#### Rating Comments

Optional, capped at 500 characters. Comments are public on the rated user's profile, attributed by username only.

**Privacy:** On account deletion (`users.deleted_at` set), both given and received ratings for that user are anonymised:
- `rater_id` set to `NULL`
- `comment` cleared to empty string
- Counts and `is_positive` flags retained (allows aggregate trust score to remain accurate)

### 33.2 User Reporting

#### Report Categories

Specific to sticker trading:
- `harassment` — Hostile, threatening, or abusive messages
- `cancelled_after_accept` — Accepted a trade then cancelled without reasonable cause
- `no_show` — Agreed to physical exchange and did not appear
- `fake_stickers` — Sent or attempted to trade non-authentic stickers
- `damaged_stickers` — Sent stickers in significantly worse condition than represented
- `spam` — Bulk messaging or promotional content
- `underage` — Apparent violation of the 13+ age requirement
- `other` — Catch-all; requires description (10–2,000 characters)

#### Report Submission

- **Who can report:** Any verified user (email verified)
- **Duplicate prevention:** One open/under-review report per reporter–reported user pair per category. A new report can be filed after the previous one is resolved. Enforced at API layer with a pre-insert query check; returns `409 Conflict` if a duplicate exists.
- **Description required:** 10–2,000 characters
- **Trade context:** Optional `tradeId` link for reports tied to a specific trade
- **Self-reporting prevented:** `CHECK (reporter_id <> reported_user_id)`

#### Report Lifecycle

```
open → under_review → resolved    (admin took action: warning, soft ban, hard ban)
open → dismissed                   (admin: clearly frivolous or not credible)
```

Status transitions:
- Report created with status `'open'`
- Admin can move to `'under_review'` while investigating
- Admin resolves to `'resolved'` (action taken) or `'dismissed'` (no action needed)
- Resolution requires an optional note (max 1,000 chars)

#### Reporter Notifications

When a report's status changes to `'resolved'` or `'dismissed'`, the reporter receives an in-app notification (not email, to prevent escalation):
- **Message:** "Your report has been reviewed."
- **No detail:** Reporter is not told which action was taken (if any) to preserve privacy of both parties and prevent gaming of future reports

#### Auto-flag Threshold

When a user has 3 reports against them in `status IN ('open', 'under_review')` filed within the past 30 days (counted from `user_reports.created_at`, regardless of category — except `'underage'` which is excluded; resolved/dismissed reports do not count):
1. A `'soft'` ban is automatically issued with `banned_by` set to the system account (`_system` user, UUID `00000000-0000-0000-0000-000000000099`)
2. `expires_at` is set to `now() + INTERVAL '48 hours'` (temporary hold)
3. All 3 open reports move to `status = 'under_review'`
4. An audit log entry is written: `action = 'auto_soft_ban_triggered'`, metadata includes the 3 report IDs
5. All admin users receive an internal notification

This is a **temporary hold only**, not a permanent ban. An admin must review the reports and decide on final action within the 48-hour window.

**Exception:** The `'underage'` category does not count toward the auto-flag threshold. Reports in this category always create an `'under_review'` report immediately for mandatory human review.

### 33.3 Ban System

#### Ban Types

Bans are rows in the `user_bans` table (not a column on `users`), allowing full history, lifting, expiry, and audit trail.

**Soft ban:**
- User can log in and manage their collection
- User **cannot:**
  - Initiate new trades (`POST /api/v1/trade/requests`)
  - Send trade messages (`POST /api/v1/trade/requests/:id/messages`)
  - Rate other users (`POST /api/v1/users/:id/ratings`)
  - Accept incoming trade requests (`PATCH /api/v1/trade/requests/:id` with status change)
  - Appear in other users' trade matches
- Profile remains visible but shows a "soft restricted" notice
- Good for repeat cancellers, harassers, or first-offense violators needing a cooldown

**Hard ban:**
- Full account suspension
- Login returns `403` with a message: "Your account has been suspended. Please contact support."
- Profile shows "account unavailable"
- Collection data is not destroyed (allows future reinstatement if appealed)
- Good for severe violations: sending fake stickers, threats, underage verification failure

#### Ban Properties

- `ban_type` — `'soft'` or `'hard'`
- `reason` — 5–1,000 characters; required
- `report_id` — Optional; links to the triggering report (if any)
- `banned_by` — Admin UUID who issued the ban (or system UUID for auto-bans)
- `expires_at` — `NULL` for permanent; timestamp for temporary bans
- `lifted_at` — `NULL` if active; timestamp when manually lifted by an admin
- `lifted_by` — Admin UUID who lifted the ban
- `lift_reason` — Optional note (max 500 chars) explaining the lift

#### Ban Enforcement Points

Ban state is determined by querying `user_bans` with status flags and cached in Redis (`user:{id}:ban_status`, 2-minute TTL) for performance.

**Hard ban enforcement:**
- Checked at login (`POST /auth/login`) — if an active hard ban exists, return `403` before issuing JWT

**Soft ban enforcement:**
- Checked via middleware on:
  - `POST /api/v1/trade/requests` (initiate a trade)
  - `POST /api/v1/trade/requests/:id/messages` (send a message)
  - `PATCH /api/v1/trade/requests/:id` with status change to `'accepted'` (accept a trade)
  - `POST /api/v1/users/:id/ratings` (submit a rating)
- Soft-banned users are also excluded from appearing in other users' trade match results

#### Lifting a Ban

An admin can manually lift a ban at any time via `POST /api/v1/admin/users/:id/bans/:banId/lift`, which sets:
- `lifted_at` to `now()`
- `lifted_by` to the admin's user ID
- `lift_reason` to the provided note

The ban record is retained (audit trail). An audit log entry is written: `action = 'user_ban_lifted'`.

Conversely, when `expires_at` passes, a temporary ban naturally expires. No background job is needed — the check middleware queries the active ban on each request (with Redis caching) and will see that the ban has expired.

#### Interaction with Account Deletion

- `users.deleted_at` is the GDPR/PIPEDA erasure mechanism and is independent of bans
- A hard-banned user who requests account deletion is processed normally: PII is anonymised, but the ban record is retained
- To prevent ban evasion via account re-registration, a new column `hashed_email` is added to `users` (SHA-256 of lowercase email) and retained after soft-delete
- At registration time, check if any deleted user with a matching `hashed_email` had an active hard ban — if so, reject the new registration with `403`

### 33.4 Schema Design

#### `trade_ratings` Table

```sql
CREATE TABLE trade_ratings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id       UUID NOT NULL REFERENCES trade_requests(id),
  rater_id       UUID NOT NULL REFERENCES users(id),
  rated_user_id  UUID NOT NULL REFERENCES users(id),
  is_positive    BOOLEAN NOT NULL,
  comment        TEXT CHECK (char_length(comment) <= 500),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (trade_id, rater_id),
  CHECK (rater_id <> rated_user_id)
);

CREATE INDEX idx_trade_ratings_rated_user
  ON trade_ratings(rated_user_id, created_at DESC);
CREATE INDEX idx_trade_ratings_trade_id
  ON trade_ratings(trade_id);
```

#### `user_reports` Table

```sql
CREATE TABLE user_reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      UUID NOT NULL REFERENCES users(id),
  reported_user_id UUID NOT NULL REFERENCES users(id),
  trade_id         UUID REFERENCES trade_requests(id),
  category         TEXT NOT NULL CHECK (category IN (
                     'harassment', 'cancelled_after_accept', 'no_show',
                     'fake_stickers', 'damaged_stickers', 'spam',
                     'underage', 'other'
                   )),
  description      TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  status           TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'under_review', 'resolved', 'dismissed')),
  resolved_by      UUID REFERENCES users(id),
  resolved_at      TIMESTAMPTZ,
  resolution_note  TEXT CHECK (char_length(resolution_note) <= 1000),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (reporter_id <> reported_user_id)
);

CREATE INDEX idx_user_reports_reported_user
  ON user_reports(reported_user_id, created_at DESC);
CREATE INDEX idx_user_reports_status
  ON user_reports(status, created_at ASC)
  WHERE status IN ('open', 'under_review');
CREATE INDEX idx_user_reports_reporter
  ON user_reports(reporter_id);
```

#### `user_bans` Table

```sql
CREATE TABLE user_bans (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  ban_type    TEXT NOT NULL CHECK (ban_type IN ('soft', 'hard')),
  reason      TEXT NOT NULL CHECK (char_length(reason) BETWEEN 5 AND 1000),
  report_id   UUID REFERENCES user_reports(id),
  banned_by   UUID NOT NULL REFERENCES users(id),
  expires_at  TIMESTAMPTZ,
  lifted_at   TIMESTAMPTZ,
  lifted_by   UUID REFERENCES users(id),
  lift_reason TEXT CHECK (char_length(lift_reason) <= 500),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_bans_user_id
  ON user_bans(user_id, created_at DESC);
CREATE INDEX idx_user_bans_active
  ON user_bans(user_id)
  WHERE lifted_at IS NULL AND (expires_at IS NULL OR expires_at > now());
```

#### Additions to Existing Tables

The columns required by the Trust & Safety system are already part of the V1 schema (§7.2):
- `users.hashed_email` — SHA-256(lowercase(email)); retained after soft-delete for ban-evasion prevention
- `user_settings.show_trust_score_public` — user preference to display the trust badge on their public profile

No `ALTER TABLE` migration is required when introducing this system, because the columns ship in V1. The Trust & Safety **tables** (`trade_ratings`, `user_reports`, `user_bans`) are likewise V1, but their **logic** is gated behind `FEATURE_TRUST_SAFETY` (see §33.11) so the system can launch in a disabled state and be enabled when ready.

### 33.5 API Endpoints

All endpoints require feature flag `FEATURE_TRUST_SAFETY` to be enabled; return `404` if disabled.

#### Ratings Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/trade/requests/:tradeId/ratings` | Rater (party to trade) | Submit a rating. Body: `{ isPositive: boolean, comment?: string }`. Returns `201`. Returns `403` if soft-banned, outside 14-day window, or hard-banned. Returns `409` if already rated. |
| `GET` | `/api/v1/users/:id/ratings` | Public if profile public; `user_settings.show_trust_score_public = true` | Paginated list of received ratings. Query: `?cursor=&limit=20&type=received\|given`. Returns `200` with trust score summary. Cached 10 min. |
| `GET` | `/api/v1/trade/requests/:tradeId/ratings` | Rater (party to trade) | Both ratings for a trade (or `null` if not yet submitted). Returns `200`. Used for post-trade rating prompt. |

#### Reports Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/users/:id/reports` | Any verified user | Submit a report. Body: `{ category, description, tradeId? }`. Returns `201` with report object. Returns `409` if duplicate open report exists. Triggers auto-flag check. |
| `GET` | `/api/v1/users/me/reports/submitted` | Own user | List reports the current user has submitted (own moderation history). Returns `200` paginated. |

#### Admin Reports Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/admin/reports` | Admin | List all reports. Query: `?status=open\|under_review\|resolved\|dismissed&category=&cursor=&limit=100`. Default sort: oldest first (FIFO moderation). Returns `200` paginated. |
| `GET` | `/api/v1/admin/reports/:reportId` | Admin | Full report detail: description, reporter profile, reported user profile with trust score + ban history, linked trade context (if present), all prior reports against the reported user. Returns `200`. |
| `PATCH` | `/api/v1/admin/reports/:reportId` | Admin | Change report status. Body: `{ status: 'under_review' \| 'resolved' \| 'dismissed', resolutionNote?: string }`. Returns `200`. Writes to `audit_log`. |

#### Admin Bans Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/admin/users/:id/bans` | Admin | Create a ban. Body: `{ banType: 'soft' \| 'hard', reason, reportId?, expiresAt? }`. Returns `201`. Clears Redis `user:{id}:ban_status`. Writes to `audit_log`. |
| `GET` | `/api/v1/admin/users/:id/bans` | Admin | Full ban history (active, lifted, expired). Returns `200` paginated. |
| `POST` | `/api/v1/admin/users/:id/bans/:banId/lift` | Admin | Lift a ban. Body: `{ liftReason: string }`. Returns `200`. Clears Redis `user:{id}:ban_status`. Writes to `audit_log`. |
| `GET` | `/api/v1/admin/users/:id/trust-summary` | Admin | Aggregate view: trust score, ban history, open reports count, recent ratings. Returns `200`. Used on admin user detail page. |

#### User-Facing Ban Status Endpoint

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/users/me/ban-status` | Own user | Check personal ban status. Returns `200` with `{ banned: false }` or `{ banned: true, type: 'soft' \| 'hard', expiresAt?: string, message: string }`. Used to show restriction banner. |

#### Rate Limits (Additions to Section 9)

| Endpoint | Limit | Reason |
|---|---|---|
| `POST /api/v1/trade/requests/:id/ratings` | 2 per trade per user | Natural limit (one per direction) |
| `POST /api/v1/users/:id/reports` | 5 per hour per user | Prevent report-bombing |
| `GET /api/v1/users/:id/ratings` | 100 per hour | Public endpoint; caching mitigates |
| `PATCH /api/v1/admin/reports/:id` | 60 per hour per admin | Normal moderation pace |

### 33.6 Redis Cache Keys

All keys follow the `{domain}:{key}:{id}` naming pattern established in Section 6.

| Key | Content | TTL | Invalidated when |
|---|---|---|---|
| `user:{id}:trust_score` | `{ total: int, positive: int, rate: float, tier: string, updatedAt: ISO8601 }` | 10 minutes | New rating submitted for this user |
| `user:{id}:ban_status` | `null` (no ban) or `{ type: 'soft' \| 'hard', expiresAt: ISO8601 \| null }` | 2 minutes | Ban created, lifted, or expires; soft ban with `expires_at` in past expires naturally on refresh |
| `admin:pending_reports` | Integer count of reports with status in `['open', 'under_review']` | 5 minutes | Report created or status changed |

### 33.7 Admin UI

New section added to the admin sidebar at `/admin/trust/`.

#### Reports Queue (`/admin/trust/reports`)

The primary moderation workbench. Default view: `status = 'open'`, sorted oldest-first (FIFO fairness).

**Features:**
- Filter bar: status dropdown, category chips, date range picker
- Report row card showing:
  - Category chip (colour-coded: red = `fake_stickers` / `harassment`, orange = `no_show`, yellow = `spam`)
  - `"User A reported User B"` with clickable avatar links
  - Trade context link if `trade_id` present
  - Time since submission
  - Reported user's trust score badge and ban status at a glance
- Click row to open detail panel (side panel, no navigation)

**Detail panel:**
- Full report text
- Reported user profile summary: avatar, username, trust score, total trades, active ban status, count of other open reports against this user
- Trade conversation excerpt (if linked): last 10 messages, read-only
- Action buttons (disabled if report not in `'open'` status):
  - `"Mark Under Review"` — moves to `'under_review'`, optionally add a note
  - `"Warn & Resolve"` — sets to `'resolved'`, no ban; admin provides a note
  - `"Soft Ban"` — modal with duration picker (24h, 48h, 7d, 30d, permanent), reason field pre-filled from category slug, optional link to the report
  - `"Hard Ban"` — same modal, type = hard; requires manual reason
  - `"Dismiss"` — sets to `'dismissed'` (not credible or frivolous); admin provides a note
- All actions log to `audit_log`: `action = 'report_status_changed' | 'user_banned' | 'user_ban_lifted'`, metadata includes IDs and action details

#### Banned Users (`/admin/trust/bans`)

Table of all bans (active, expired, lifted). Columns:
- Username / email (link to `/admin/trust/users/:id`)
- Ban type chip (`soft` / `hard`)
- Reason (truncated, full text on hover)
- Banned at
- Expires at (or "Permanent", or grey timestamp if already expired)
- Status: "Active", "Lifted", or "Expired"
- Banned by (admin username)
- Actions: `"Lift ban"` button (opens confirmation modal with lift reason field)

**Filter dropdown:** Active / All / Lifted / Expired. Default: Active.

#### User Lookup (`/admin/trust/users/:id`)

Accessed by clicking user links throughout the admin area or searching username/email in the admin sidebar.

**Content:**
- User profile card: avatar, username, email, account age, `deleted_at` status
- Trust summary: total trades, positive rate, trust tier badge, total ratings received/given
- Recent ratings: last 10 comments (both positive and negative) with rater username and date
- Reports section:
  - Open reports against this user (with categories and submitter)
  - Resolved/dismissed reports count
- Ban history: table of all bans (active, lifted, expired) with type, reason, dates, who issued/lifted, and lift reason
- Audit log: last 20 actions taken by this user (entries from `audit_log` where `user_id = :id`)
- Quick action buttons: `"Soft Ban"`, `"Hard Ban"`, `"Lift All Bans"` (if active bans exist)

#### Auto-flag Dashboard Banner

When the auto-flag threshold has triggered (3 reports → auto soft ban):
- Yellow banner displays at the top of all `/admin/*` pages for 24 hours
- Text: `"2 users were auto-flagged for review in the last 24h"`
- Clicking the banner filters the Reports queue to show only `status = 'under_review'` AND `banned_by = '00000000-0000-0000-0000-000000000099'` (the system user)
- Acknowledging (or closing) the banner clears it from session

### 33.8 Frontend

#### Trust Badge Component

A reusable badge component used in two places:
- User profile page `/profile/[username]` — shows full trust summary: avatar, username, trust tier badge, trade count, positive rate percentage, and recent feedback comments
- Trade match cards (on `/matches` and similar) — shows small badge + trade count only (no percentage)

Component accepts `userId` and optional `size` prop (`'small'` | `'large'`); fetches and caches trust data from `GET /api/v1/users/:id/ratings`.

#### Post-Trade Rating Prompt

Shown on the trade detail page (`/trade/[id]`) when:
- Trade `status = 'completed'`
- Current time is within 14 days of `completed_at`
- Current user hasn't yet submitted a rating

**UI:** Modal or in-page card with:
- Counterpart's avatar and username
- Explanation: "Rate this trade to help build community trust"
- Thumbs up / thumbs down buttons
- Optional comment field (500 char max)
- Submit button
- On success: confirmation message + redirect to profile or back to trade

**On completion:** Fetches the trade's ratings via `GET /api/v1/trade/requests/:tradeId/ratings` to show both parties' ratings.

#### Report User Modal

Accessible from:
- User profile page (`/profile/[username]`) — `"Report user"` link in the menu
- Trade detail page — `"Report user"` option in the trade menu
- User card hover (optional: `"..."` button)

**Modal form:**
- Dropdown: Report category (8 options)
- Text area: Description (10–2,000 chars)
- Optional: Link to a specific trade if opened from a trade detail
- Validation: Prevent submission if category not selected or description too short
- On submission:
  - POST to `POST /api/v1/users/:id/reports`
  - Show loading state
  - On `409` (duplicate open report): show error message
  - On `201`: confirmation message, close modal
- Loading states and error messages match the app's existing error handling pattern

#### Ban Status Banner

Shown to a banned user on their own pages (profile, settings, collection):
- **Soft ban:** Yellow banner: `"Your account has temporary trading restrictions. [Learn more] [Appeal]"`
- **Hard ban:** Red banner: `"Your account has been suspended. Please contact support for more information."`
- Banners show expiry time (if temporary) or "Permanent"
- `[Learn more]` link goes to `/help/account-restrictions`
- `[Appeal]` link opens a contact form (email or support ticket)

### 33.9 Privacy & PIPEDA Compliance

#### Rating Erasure

When a user requests account deletion:
- All ratings given by that user: `rater_id` set to `NULL`, `comment` cleared to empty string
- All ratings received by that user: `rated_user_id` becomes NULL (invalid per FK, so anonymise: keep the `is_positive` bit for aggregate counts, but the rater is anonymised)
- Actually: instead of setting `rated_user_id = NULL` (which violates the FK), anonymise by creating a special system record or keeping the rating but nullifying `rater_id` for ratings given. Best approach: when a user is deleted, any ratings **received** by them are anonymised by clearing comment and rater name (via a view or computed column), not via NULL FK.

**Implementation:** In the account deletion handler, after setting `deleted_at`:
```sql
-- Comments on ratings given by this user
UPDATE trade_ratings SET comment = '' WHERE rater_id = $userId;
UPDATE trade_ratings SET comment = '' WHERE rated_user_id = $userId;
-- Do NOT set rater_id or rated_user_id to NULL; instead, the API layer
-- returns anonymised data when the user is deleted (rater/rated shown as "[Deleted User]")
```

#### Report Description Retention

- Reports are retained for 2 years after `resolved_at` (operational necessity: moderation record)
- After 2 years, a background job or runbook step redacts the description to `'[redacted]'`
- `resolved_by`, `resolution_note`, and metadata remain (audit trail)

#### Ban Reason Retention

- Ban reasons are retained indefinitely (moderation records; operational necessity)
- Not exposed via the user data export endpoint (`GET /api/v1/users/:id/settings/export`)

#### Data Export

When a user exports their data via `GET /api/v1/users/:id/settings/export` (Section 23):
- **Include:** Ratings given (with comment, recipient, date) and ratings received (with comment, giver, date)
- **Include:** Reports submitted (category, description, date, status) — but NOT admin resolutions or notes
- **Exclude:** Reports filed against the user (privacy of reporters)
- **Exclude:** Ban records and moderation notes

#### Special Case: `underage` Reports

Reports in the `'underage'` category are always prioritised:
- Create a report with status `'under_review'` immediately (do not wait for auto-flag)
- Trigger urgent admin notification (email to all admins)
- Do not count toward the auto-flag threshold

### 33.10 Audit Log Integration

All moderation actions write to the existing `audit_log` table. The `metadata` JSONB field carries structured context:

| Action | Metadata Keys | Example |
|---|---|---|
| `user_report_submitted` | `reportId`, `category`, `reportedUserId` | User Alice reports Bob for `fake_stickers` |
| `report_status_changed` | `reportId`, `fromStatus`, `toStatus`, `adminId`, `resolutionNote` | Admin marks report as resolved |
| `user_banned` | `banId`, `banType`, `userId`, `reportId`, `reason`, `expiresAt` | Admin bans user Alice (soft, 7 days) |
| `auto_soft_ban_triggered` | `banId`, `userId`, `reportIds` (array), `triggerCount` | System auto-bans Bob after 3 reports |
| `user_ban_lifted` | `banId`, `userId`, `liftedBy`, `liftReason` | Admin lifts Alice's ban |
| `trade_rating_submitted` | `ratingId`, `tradeId`, `fromUserId`, `toUserId`, `isPositive` | Alice rates Bob's trade positively |

### 33.11 Feature Flag

In `data/seeds/06_feature_flags.sql`, add:
```sql
INSERT INTO feature_flags (key, enabled, rollout_pct, description) VALUES
  ('FEATURE_TRUST_SAFETY', false, 0, 'Post-trade ratings, user reporting, and moderation system')
ON CONFLICT (key) DO NOTHING;
```

Disabled by default. All Trust & Safety API routes check this flag at the start of the handler:
```typescript
if (!isFeatureFlagEnabled('FEATURE_TRUST_SAFETY')) {
  return reply.notFound();
}
```

### 33.12 Seed Data Additions

In `data/seeds/07_test_users.sql`, add the system account for automated ban issuance:
```sql
INSERT INTO users (id, email, username, display_name, role, email_verified_at) VALUES
  ('00000000-0000-0000-0000-000000000099',
   'system@stickerswap.internal',
   '_system',
   'System',
   'admin',
   now())
ON CONFLICT (email) DO NOTHING;
```

In a new `data/seeds/09_trust_safety.sql` (non-production only), add sample completed trades with ratings and reports between test users (e.g., alice → bob rated positively, charlie → bob reported for `fake_stickers`) so the admin UI has realistic data during development.

---

## 34. Scheduled Jobs

The system depends on several time-based behaviours (auto-expire, retention, sweeps). All are implemented as **scheduled jobs**:

| Local | Cloud |
|---|---|
| `node-cron` running inside the API container | AWS ECS Scheduled Tasks (cheaper than Lambda + EventBridge for cron, identical container) |

Jobs are defined in `apps/backend/src/jobs/` and discovered at startup. Each job logs to `audit_log` with `action = 'scheduled_job_run'` on success and an error metric on failure.

### 34.1 Job Catalog

| Job | Cadence | Description | Owner table(s) |
|---|---|---|---|
| `expire-pending-trades` | Daily 02:00 UTC | Marks `pending` trades with no activity for 30 days as `expired` | `trade_requests` |
| `expire-accepted-trades` | Daily 02:15 UTC | Marks `accepted` trades whose `expires_at` has passed as `expired`; notifies both parties | `trade_requests` |
| `purge-trade-messages` | Weekly Sun 03:00 | Deletes `trade_messages` 90 days after the trade closed | `trade_messages` |
| `redact-old-reports` | Weekly Sun 03:30 | Sets `user_reports.description = '[redacted]'` for reports `resolved_at < now() - 2 years` | `user_reports` |
| `expire-soft-bans` | No-op (lazy expiry) | Soft bans with `expires_at` in the past are skipped at lookup time; no scheduled work needed | `user_bans` |
| `auto-flag-sweep` | Hourly | Re-evaluates the 3-reports-in-30-days threshold for users with new reports since the last run | `user_reports`, `user_bans` |
| `rating-reminder-email` | Daily 16:00 local | Sends a reminder 24h after a trade `completed` if the user has not yet rated their counterpart | `trade_requests`, `trade_ratings` |
| `truncate-audit-log-ips` | Daily 04:00 UTC | Truncates IPv4 → /24 and IPv6 → /48 for `audit_log` rows older than 90 days (§23.6) | `audit_log` |
| `hard-delete-soft-deleted-users` | Daily 04:30 UTC | Anonymises and deletes user data 14 days after `deleted_at` (§23.5) | `users` and dependents |
| `purge-email-verification-tokens` | Daily 05:00 UTC | Removes expired tokens older than 7 days (orphans from abandoned signups) | `email_verification_tokens` |
| `purge-old-share-tokens` | Daily 05:15 UTC | Deletes `public_lists` with `expires_at < now()` | `public_lists` |
| `cache-warm-stickers` | Every 50 minutes | Re-populates `stickers:all` before its 1h TTL expires (defends against stampede on world-cup-event spikes) | Redis only |
| `dmarc-report-aggregation` | Weekly | Pulls DMARC aggregate reports from S3 inbox and emails the summary to admins | (off-app) |
| `synthetic-canary-warm-aurora` | Every 4 minutes | Hits `/health/ready` to keep Aurora connection pool warm (§20.6) | (off-app) |

### 34.2 Failure Handling

- Each job runs inside a try/catch with structured error logs (`level=error`, `job_name`, `error_class`, `error_message`).
- Three consecutive failures of the same job triggers the alert in §20.3.
- The `scheduled-jobs.md` runbook (§28) describes how to pause a misbehaving job: `UPDATE feature_flags SET enabled = false WHERE key = 'JOB_<name>'` (jobs check this flag before running). This is the primary safety valve — no need to redeploy.

### 34.3 Local Behaviour

Locally, `node-cron` runs in the same Node.js process as the API. Setting `JOBS_MODE=disabled` in `.env.local` (default for `docker compose` to keep dev iteration fast) skips job registration entirely. To test a specific job locally, run `npm run job -- <job_name>` which invokes the job once and exits.

---

## 35. Glossary

For non-technical readers and developers new to the stack:

| Term | Meaning |
|---|---|
| **ACU** | Aurora Capacity Unit — the unit of compute Aurora Serverless v2 bills by; ~2 GiB memory + proportional CPU |
| **ADR** | Architecture Decision Record — a short Markdown doc capturing why a specific technical choice was made |
| **CASL** | Canada's Anti-Spam Legislation — governs commercial electronic messages, fines up to $10M CAD |
| **CORS** | Cross-Origin Resource Sharing — browser security model that requires servers to opt-in to cross-origin requests |
| **CSP** | Content Security Policy — HTTP header that restricts which scripts/styles/images the browser will load |
| **DKIM** | DomainKeys Identified Mail — cryptographic email signature; proves the message wasn't altered in transit |
| **DMARC** | Domain-based Message Authentication, Reporting & Conformance — policy that tells receivers what to do if SPF/DKIM fail |
| **ECR** | Elastic Container Registry — AWS-hosted Docker image registry |
| **ECS Fargate** | AWS service that runs Docker containers without you managing servers |
| **JWT** | JSON Web Token — signed, self-contained auth token used for stateless API authentication |
| **MFA** | Multi-Factor Authentication — usually app-based TOTP codes in addition to password |
| **PIPEDA** | Personal Information Protection and Electronic Documents Act — Canadian federal privacy law |
| **PWA** | Progressive Web App — a website installable to a phone home screen with native-like UX |
| **RDS Proxy** | AWS service that pools database connections to protect Aurora from too many concurrent clients |
| **RPO / RTO** | Recovery Point Objective (max acceptable data loss) / Recovery Time Objective (max acceptable downtime) |
| **SES** | Simple Email Service — AWS's transactional email sender |
| **SPF** | Sender Policy Framework — DNS record listing which servers are allowed to send mail for a domain |
| **SSE** | Server-Sent Events — one-way HTTP push from server to browser; simpler than WebSockets |
| **TOTP** | Time-based One-Time Password — the 6-digit codes from Google Authenticator / 1Password |
| **VAPID** | Voluntary Application Server Identification — keypair-based authentication for Web Push |
| **WAF** | Web Application Firewall — filters HTTP requests before they reach your application; AWS WAF is the cloud version |

---

## 36. Next Steps

### Start Today (Before Hiring a Developer)

1. **Compile the complete sticker checklist** — visit https://www.checklistinsider.com/2026-panini-fifa-world-cup-sticker and capture all 960 team sticker records (album codes + sequential numbers + player names + positions). This is the most important pre-development task.
2. Install Docker Desktop on your machine
3. Register your domain (Route 53 or Namecheap)
4. Create a free GitHub account and a private repository
5. Create an AWS account (required for Phase B, not Phase A) and enable MFA on the root account immediately

### When Hiring a Developer

Provide this document as the technical specification. The developer should be able to read it, run `docker compose up`, and have a working local environment within 30 minutes.

**Key skills to look for:** TypeScript/Node.js, Drizzle ORM, PostgreSQL, Docker, React/Next.js, AWS (for Phase B), Terraform (for Phase B).

**First milestone to ask for:** "Show me the application running locally with the 48 teams and 980 stickers seeded in the database, and show me the trade matching algorithm returning correct results between two test users."

### Milestone Checkpoints

| Milestone | Success Criteria |
|---|---|
| Pre-development | All 960 team sticker records compiled with sequential numbers — `03_team_stickers.sql` is complete |
| End of Phase A1 | `docker compose up && npm run db:seed` works. 48 teams and 980 stickers in database. Health check passes. Email verification flow works in Mailpit. API docs visible at `localhost:3001/docs`. |
| End of Phase A2 | All 980 stickers visible in album UI with filtering. Can add/remove/mark duplicates. Avatar upload working. Test suite ≥ 60% coverage. |
| End of Phase A3 | Share link visible without login. Email not exposed on public list. Trade matching returns correct results for Alice and Bob test users. SSE trade messages delivered in real-time. |
| End of Phase A4 | Mock AI scan adds a sticker to Alice's collection. Real Claude API works in dev cloud. |
| End of Phase A5 | Full test suite ≥ 80% coverage. k6 load test passes. All runbooks written. PWA installable on mobile. |
| End of Phase B1 | CI/CD deploys to dev on every merge. Health check passes in AWS. |
| End of Phase B2 | Full E2E suite passes on staging. Legal documents published. |
| Soft Launch | 100 beta users. Zero data loss in first 7 days. |
| Public Launch | All checkpoints met. Responsible disclosure policy live. |

---

*End of StickerSwap 2026 — Production Implementation Plan v5.1*

*This is the single source of truth for the system design. Store as `docs/architecture/overview.md` in the repository. Version this document alongside the codebase.*
