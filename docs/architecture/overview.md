# StickerSwap 2026 — Complete Production Implementation Plan
### A Full-Stack Web Application for the 2026 FIFA World Cup Panini Sticker Collection

> **Plan Version:** 5.0 — Adds CORS/pooling config, Drizzle ORM (replaces Flyway), SSE trade messaging, pagination strategy, email verification flow, avatar upload endpoint, Coca-Cola sticker fix, schema hardening (CHECK constraints), complete seed data guidance, timeline correction (19 weeks Phase A), and feature flag simplification.
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
33. [Next Steps](#33-next-steps)

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

### 5.7 Local Hosting vs Cloud Hosting

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
  GET    /api/v1/stickers                   # ?team=MEX&group=A&type=player&cursor=...
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
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ  -- soft delete; NULL = active
);

CREATE TABLE user_settings (
  user_id                   UUID PRIMARY KEY REFERENCES users(id),
  collection_visibility     TEXT DEFAULT 'private',
  profile_visibility        TEXT DEFAULT 'public',
  trade_matching_enabled    BOOLEAN DEFAULT true,
  email_trade_requests      BOOLEAN DEFAULT true,
  email_trade_messages      BOOLEAN DEFAULT true,
  email_marketing           BOOLEAN DEFAULT false,
  marketing_consent_at      TIMESTAMPTZ,
  marketing_consent_version TEXT
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
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id  UUID NOT NULL REFERENCES users(id),
  recipient_id  UUID NOT NULL REFERENCES users(id),
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'completed')),
  cancelled_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE trade_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id            UUID NOT NULL REFERENCES trade_requests(id),
  sticker_variant_id  UUID NOT NULL REFERENCES sticker_variants(id),
  direction           TEXT NOT NULL  -- 'offer' | 'want'
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

The master script checks the `NODE_ENV` environment variable. If it is `production`, it refuses to run seed files 06 and 07 (test users). This is a safety guard.

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

**Token:** A cryptographically random token stored in a `email_verification_tokens` table with a 24-hour expiry. After clicking the link, the token is consumed (deleted).

```sql
-- Add to V1 schema or V2 migration:
CREATE TABLE email_verification_tokens (
  token       TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(32), 'hex'),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '24 hours',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

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
  ├── Accept  → both collections update immediately; User A notified in-app + email
  ├── Decline → trade closes; User A notified in-app + email
  └── Counter → propose different stickers; User A notified in-app + email
                and can Accept / Decline / Counter

Throughout: both users can send messages inside the trade
            to coordinate logistics (e.g. address, meetup, shipping)
```

**Counter-proposal:** When countering, the user edits the offered/wanted sticker lists and submits. The trade stays in `pending` status until one party accepts or declines. A maximum of 5 counter-rounds is enforced before the trade auto-expires, preventing indefinite back-and-forth.

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

#### Local Development

Locally, a single API instance runs with Redis in Docker — no multi-server coordination needed. The pub/sub path still executes (Server 1 publishes and receives its own message), making the local experience identical to cloud behaviour. No mocking required.

### 11.3 Shareable Public Lists

Unique expiring share links generated with cryptographically random tokens:
`https://stickerswap2026.ca/share/abc123xyz`

Privacy options per list: Private (default) | Link-only | Public.

---

## 12. Email & Notifications

### 12.1 Local: Mailpit

All emails sent by the application in local mode are captured by Mailpit at `http://localhost:8025`. No real emails are sent. You can see all verification emails, trade notifications, and password resets in the Mailpit inbox.

### 12.2 Cloud: AWS SES

All outbound email in cloud environments routes through AWS SES. Setup: verify sending domain with DKIM + SPF in Route 53; request SES production access before launch.

### 12.3 CASL Compliance

Marketing emails require explicit opt-in. Transactional emails (verification, password reset, trade notifications) do not. Consent records stored in the database. Every marketing email includes a one-click unsubscribe. Violations carry fines up to $10 million CAD.

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
├── data/
│   ├── migrations/                   # Flyway SQL migration files
│   │   └── V1__initial_schema.sql
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
│   │   └── decisions/                # Architecture Decision Records
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
│  · Flyway migrations             │
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

### 23.3 Legal Documents Required Before Launch

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
| Admin | All above + sticker database management |

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

> **Timeline note:** The 15-week Phase A estimate below is a target, not a guarantee. A full-stack application of this scope (AI scanning, trading, SSE messaging, PWA, i18n, 80% test coverage) realistically takes 20–25 weeks for a single developer starting from scratch. Build buffer time into each phase and use the milestone checkpoints in Section 33 to track progress objectively.

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

**A5 — Polish & Pre-Cloud Hardening (Weeks 17–19)**
- Custom error pages (404, 500)
- Graceful degradation for all optional services
- Frontend retry logic
- PWA offline cache for sticker master list
- i18n structure in place (English at launch; Spanish-ready for fast follow)
- Full test suite passes (≥80% coverage)
- OWASP Top 10 developer review documented
- All runbooks written (including `local-setup.md`)
- Load test with k6 against local Docker environment

### Phase B: Cloud Migration

**B1 — Infrastructure & Dev Environment (Weeks 20–22)**
- AWS account created, MFA enabled
- Domain registered
- Terraform provisions dev environment
- GitHub Actions CI/CD pipeline operational
- Application deployed to dev, health checks pass
- Database seeded in dev cloud environment

**B2 — Staging & Production (Weeks 23–25)**
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

## 33. Next Steps

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

*End of StickerSwap 2026 — Production Implementation Plan v4.0*

*This is the single source of truth for the system design. Store as `docs/architecture/overview.md` in the repository. Version this document alongside the codebase.*
