# Cromo — Complete Production Implementation Plan
### A Full-Stack Web Application for the 2026 FIFA World Cup Panini Sticker Collection

> **Plan Version:** 5.2 — Reorganization pass: split monolithic spec into focused domain files for token-efficient access. `overview.md` now retains only cross-cutting context (product, system architecture, phases, cost, tech stack, glossary, next steps); subsystem detail lives in sibling files in this directory.
> **Last Updated:** May 4, 2026
> **Target Audience:** Non-developer owner + contracted development team

---

## Table of Contents

This document covers cross-cutting context. Each subsystem is documented in its own file in this directory (see Document Map below).

1. [Understanding What You're Building](#1-understanding-what-youre-building)
2. [System Architecture Overview](#3-system-architecture-overview)
3. [Complete Technology Stack](#30-complete-technology-stack-summary)
4. [Development Phases](#31-development-phases)
5. [Cost Estimate](#32-cost-estimate)
6. [Glossary](#37-glossary)
7. [Next Steps](#38-next-steps)

> Section numbers are preserved (§1, §3, §30, §31, §32, §37, §38) to keep external references stable; the gaps correspond to content moved to the files below.

---

## Document Map

Detailed subsystem documentation lives in sibling files. Read this map first; load only the file you need.

| File | When to read | Source sections (in earlier monolithic spec) |
|---|---|---|
| [`local-development.md`](./local-development.md) | Setting up the local Docker environment, dev workflow | §2, §4 |
| [`frontend.md`](./frontend.md) | Working on the Next.js UI, PWA, i18n, screens | §5 |
| [`backend.md`](./backend.md) | Fastify routes, CORS, pooling, AI scan endpoint | §6, §10 |
| [`database.md`](./database.md) | Drizzle ORM schema & migrations, Redis cache keys | §7 |
| [`seed-data.md`](./seed-data.md) | Compiling and loading 2026 World Cup seed data | §8 |
| [`auth-security.md`](./auth-security.md) | Email verification, Cognito, headers, cookies, lockout | §9 |
| [`trading.md`](./trading.md) | Trade-flow rules, SSE messaging, disputes, public lists | §11 |
| [`trust-safety.md`](./trust-safety.md) | Ratings, reports, bans, moderation UI, PIPEDA handling | §33 |
| [`notifications.md`](./notifications.md) | Email (SES, DKIM/DMARC, bounces), Web Push | §12 |
| [`observability.md`](./observability.md) | Analytics, health checks, monitoring, alerting | §13, §16, §20 |
| [`infrastructure.md`](./infrastructure.md) | Environment strategy, AWS architecture | §17, §19 |
| [`devops.md`](./devops.md) | Repo structure, branch strategy, versioning, CI/CD | §14, §15, §18 |
| [`testing.md`](./testing.md) | Unit, integration, E2E, load tests | §21 |
| [`compliance.md`](./compliance.md) | PIPEDA / CASL, legal IP, multi-user roles | §23, §24, §25 |
| [`operations.md`](./operations.md) | DR, error handling, support, runbook, sec-disclosure | §22, §26, §27, §28, §29 |
| [`jobs.md`](./jobs.md) | Scheduled cron jobs, BullMQ async queue | §34, §35 |
| [`performance.md`](./performance.md) | Web Vitals budgets, bundle limits, RUM | §36 |

---

## 1. Understanding What You're Building

### 1.1 Product Summary

Cromo is a multi-user web application for tracking, managing, and trading stickers from the 2026 FIFA World Cup Panini sticker collection. It is accessible from any device, designed for Canadian users, and built to production standards from day one — starting locally on your machine.

### 1.2 The Album

The 2026 FIFA World Cup Panini sticker collection officially launched on April 29/30, 2026. The **core album contains 980 stickers**: 20 intro/FWC stickers (Panini logo, FWC1–FWC8 emblem/mascot/host-country spreads at the front, and FWC9–FWC19 past-champion spreads at the back) plus 960 team stickers (48 teams × 20). Each team has 1 team crest (shiny foil), 1 team photo, and 18 player stickers. Beyond the core 980, the set also includes **12 Coca-Cola partnership stickers** (bottle-label exclusives, CC1–CC12) and **20 Extra stickers** (EX1–EX20, four rarities each). Packs contain 7 stickers each — the first time since 2014 that packs have held more than 5 stickers.

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

Every variant of a base sticker is a **separate collectible** in the database. A user who owns sticker #247 as a Base and as a Red Parallel owns two distinct items.

#### Base Stickers & Standard Parallels (border colour denotes rarity)

Panini ships the base sticker in two regional layouts. Both are Common (rarity 1); they differ only in the presence of an outer rim:

| Border Colour | Pack Odds | Rarity Tier | Notes |
| --- | --- | --- | --- |
| Base (No Border) | every pack (Intl) | Common | International edition (Mexico, Europe, South America, etc.) — borderless, purist layout. Variant token: `base_borderless`. |
| Base (White Border) | every pack (NA) | Common | North American edition — 3mm white outer rim so the layout matches the colored parallels. Variant token: `base_border`. |
| Blue | 1 in 2 packs | Uncommon | Standard parallel. |
| Red | 1 in 25 packs | Rare | Standard parallel. |
| Purple | 1 in 200 packs | Very Rare | Standard parallel. |
| Green | 1 in 1,400 packs | Ultra Rare | Standard parallel — vivid emerald/grass green. |
| Black | 1-of-1 | Masterpiece | Only one unique copy exists per player. |

#### Crumple Parallels — Panini iCollect online-exclusive boxes only

Every standard border parallel has a textured Crumple counterpart in iCollect online boxes. **Gold Flood Crumple replaces the standard base sticker entirely** in iCollect packs (6 per pack) — there is no smooth, non-crumple gold border in the main set.

| Crumple Variant | Online Pack Odds |
| --- | --- |
| Gold Flood Crumple | 6 per online pack (base) |
| Blue Crumple | 1 in 2 packs |
| Red Crumple | 1 in 26 packs |
| Purple Crumple | 1 in 204 packs |
| Green Crumple | 1 in 1,529 packs |
| Black Crumple | 1-of-1 |

#### Regional & Retailer Exclusives

- **NA vs. International base split** — North American packs use the **white-bordered** base sticker (`base_border`) to match the layout of the colored parallels; international purist formats (Mexico, Europe, South America, etc.) use the **borderless** base sticker (`base_borderless`). Same photo/name layout in both — only the rim differs.
- **Switzerland "United Edition"** — Light Green border parallels (`swiss_green`) in Swiss packs, with a country-specific album.
- **Amazon Exclusive** — Orange border parallels (`orange_amazon`) in Amazon starter kits and boxes.
- **Album formats** — Standard retail leans softcover; select markets (often via Amazon Collector's Tins or European bundles) get premium hardcover or metallised editions. The Swiss premium album cover is gold-foiled and is tracked as a separate `swiss_gold` *album edition* (not to be confused with the green `swiss_green` sticker variant).

#### "Extra Stickers" Subset

Twenty short-printed live-action stickers of global superstars (Messi, Ronaldo, Mbappé, Yamal, …) appear as an 8th bonus slot on average 1 in 100 international packs. They do not occupy a numbered album slot.

**Visual rule:** the outer border of every Extra sticker is **always white**. Rarity is determined by the **background colour behind the action photo**, not by the rim. Extras have NO Crumple variants.

| Background Colour | Rarity Tier |
| --- | --- |
| Purple / Burgundy | Base Extra (most common) |
| Bronze | Uncommon |
| Silver | Rare |
| Gold | Ultra Rare |

#### Coca-Cola Partnership Subset

Twelve specific international stars (weighted toward North American talent — e.g. Lamine Yamal, Harry Kane, Weston McKennie, Alphonso Davies) appear on specially-marked 20-oz Coca-Cola and Coca-Cola Zero Sugar bottles in the USA. Peeling the label yields the physical sticker, which lives in a dedicated bonus section at the back of the album.

Physical Coca-Cola stickers have **no border parallels and no Crumple variants** — every physical Coca-Cola sticker looks identical (`base_borderless`, the same variant token used by international core base stickers; the two are distinguished by `sticker_type`). Scanning the bottle labels unlocks digital-only "Fan Stickers" and "Cosmic" variants in the FIFA Panini Collection App; these app-only digital variants are out of scope for Cromo's physical-sticker tracking.


---

## 3. System Architecture Overview

### 3.1 What "Production-Ready" Means

A production-ready system: never loses data, recovers automatically from failures, scales with demand, costs proportionally to usage, and protects user privacy under Canadian law. Crucially, it starts as a working, tested local application — not as a cloud design on paper.

### 3.2 Three-Tier Architecture

```
┌──────────────────────────────────────────────────────────┐
│  USERS  (browser · mobile · PWA)                         │
└─────────────────────┬────────────────────────────────────┘
                      │ HTTP (local) / HTTPS via ALB (cloud)
┌─────────────────────▼────────────────────────────────────┐
│  FRONTEND  ·  Next.js 15  ·  localhost:3000 / EC2        │
└─────────────────────┬────────────────────────────────────┘
                      │ API calls
┌─────────────────────▼────────────────────────────────────┐
│  BACKEND / API  ·  Fastify  ·  localhost:3001 / EC2      │
└──────┬──────────────────────────────────┬────────────────┘
       │                                  │
┌──────▼───────┐                 ┌────────▼────────┐
│  PostgreSQL  │                 │  Redis Cache    │
│  Docker /    │                 │  Docker /       │
│  RDS         │                 │  ElastiCache    │
└──────────────┘                 └─────────────────┘
```

> The cloud deployment uses a single EC2 instance for both frontend and backend. See [ADR-0001](decisions/0001-ec2-docker-compose-over-ecs-fargate.md) for the migration path to ECS Fargate.


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
| Database (cloud) | RDS PostgreSQL db.t3.micro | Cloud only |
| Schema & migrations | Drizzle ORM (`apps/backend/src/db/schema.ts` + `migrations/`) applied at API startup | Yes |
| Connection pooling | `pg` pool (local + cloud) | Yes |
| Cache (local) | Redis 7 in Docker | Yes |
| Cache (cloud) | AWS ElastiCache Redis | Cloud only |
| Cache browser | Redis Commander | Yes (localhost:8081) |
| Database browser | pgAdmin | Yes (localhost:5050) |
| File storage (local) | Local filesystem | Yes |
| File storage (cloud) | AWS S3 | Cloud only |
| AI scanning (local) | Mock response | Yes |
| AI scanning (cloud) | Groq (Llama-4 Scout vision) | Cloud only |
| Email (local) | Mailpit | Yes (localhost:8025) |
| Email (cloud) | AWS SES | Cloud only |
| Analytics | Plausible self-hosted | Cloud only |
| Feature flags | DB table (all environments) | Yes |
| IaC | Terraform | Cloud only |
| Monorepo | Turborepo | Yes |
| CI/CD | GitHub Actions | Cloud only |
| Versioning | Hybrid SemVer + `git describe` (manual `scripts/release.sh` for tags; runtime `APP_VERSION` baked from `git describe`) | Yes (for tagging) |
| Container runtime | Docker | Yes |
| Container orchestration | EC2 + Docker Compose; ECS Fargate when traffic warrants — see ADR-0001 | Cloud only |
| Frontend hosting | EC2 + Docker Compose (co-hosted with API) | Cloud only |
| CDN | ALB; CloudFront when static asset caching is needed | Cloud only |
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
| Dep scanning | `pnpm audit` | CI |
| Filesystem + container scanning | Trivy (deps + Dockerfile misconfig + secrets) | CI |
| Secret scanning | Gitleaks (full git history) | CI |
| DAST | OWASP ZAP against dev — planned, not yet wired | Future |
| Uptime monitoring | Upptime | Cloud only |
| Status page | Upptime (GitHub Pages) | Cloud only |


---

## 31. Development Milestones

The milestone identifiers below (A1–A7, B1–B3) are internal project markers used for tracking progress against the initial roadmap. They are not architectural concepts — they exist so the team has a shared shorthand for "we're roughly here." Once a milestone is complete and shipped, the relevant capabilities are documented in their topic-specific files (e.g. trading, trust-safety, devops), and the milestone ID becomes a historical reference.

### Build Phase (Local Development)

> **Timeline note:** The 25-week estimate below is a target, not a guarantee. A full-stack application of this scope (AI scanning, trading, SSE messaging, PWA, i18n, trust & safety moderation, scheduled jobs, web push, 80% test coverage) realistically takes 25–32 weeks for a single developer starting from scratch. A6 is an explicit buffer/hardening block; if implementation runs ahead of schedule, A6 work may begin earlier and A7 polish work can expand into the freed weeks. Use the milestone checkpoints to track progress objectively.

**A1 — Foundation (Weeks 1–4)**
- **Prerequisite (before coding begins):** Complete `03_team_stickers.sql` with all 960 records and sequential sticker numbers sourced from checklistinsider.com
- Monorepo scaffolded with Turborepo
- `docker-compose.yml` working — `docker compose up` starts all services
- README "Getting Started" tested by a second person from scratch
- Database schema managed by Drizzle ORM: tables defined in `apps/backend/src/db/schema.ts`, migrations generated into `apps/backend/src/db/migrations/`, and applied automatically at API startup via `runMigrations()` in `apps/backend/src/db/migrate.ts`.
- CORS and connection pooling configured in the API
- All seed data loaded and verified: 48 teams · **980 core stickers (20 intro/FWC + 960 team)** · plus 12 Coca-Cola and 20 Extra stickers · all variants
- `/health` and `/health/ready` endpoints live
- OpenAPI docs available at `http://localhost:3001/docs`
- Local auth mock working — all 6 test users can log in (pre-verified, no email step)
- Email verification flow working end-to-end via Mailpit
- `pnpm test` runs and passes (with minimal initial test coverage)

**A2 — Core Collection Features (Weeks 5–8)**
- All collection API endpoints working with filtering and pagination
- Multiple albums per user with gallery UI, per-album routes, and edition selection
- Album view UI (all sticker slots, filterable by team/group/type/variant/status/page range)
- Per-album sticker visibility settings (Coca-Cola, Extra sticker toggles)
- Have / missing / duplicates views
- Collection stats and completion percentage
- Avatar upload working
- Admin interface for user management and sticker corrections
- Coca-Cola and Extra Sticker series added (Host City and Swiss Legends subsets are not part of the official 2026 album — host nations are represented by FWC6/FWC7/FWC8 in the intro section; Switzerland did not qualify)
- Team album page data stored in database
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
- Vision-model integration via Groq (Llama-4 Scout) with local mock mode — returns canonical `variantToken` directly, so no separate border-colour detection step is needed
- Confidence scoring + confirmation UI
- Batch scanning mode (SSE-streamed per-image results)

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

### Cloud Phase (AWS Deployment)

**B1 — Infrastructure & Dev Environment (Weeks 26–28)** — *in progress*
- AWS account created, MFA enabled ✓
- Domain registered (`cromotrade.ca`) ✓
- Terraform provisions dev environment ✓
- GitHub Actions CI/CD pipeline operational ✓
- Application deployed to dev, health checks pass ✓
- Database seeded in dev cloud environment ✓

**B2 — Production (Weeks 29–31)** — *not started*
- Production environment provisioned via the same Terraform modules with prod inputs
- Anonymised data refresh from production snapshot process tested
- Release-tag-driven deploy flow to prod (see [`devops.md` §18.3](./devops.md#183-production-pipeline-future))
- Soft launch to 100–200 beta users

> **Note on staging.** A dedicated staging environment is intentionally deferred for now; the dev environment carries the pre-prod verification role until traffic and risk warrant a third tier.

**B3 — Launch**
- All A7 polish applied in production
- Legal documents reviewed and published
- Responsible disclosure policy live
- AWS budget alerts configured (already in place for dev — $75 USD/month cap)
- Monitoring dashboards verified
- Public launch


---

## 32. Cost Estimate

### Local Development

**$0/month** — Docker runs everything locally.

One-time setup costs:
| Item | Cost |
|---|---|
| Domain registration | $15–20 CAD |
| Privacy / Terms legal review | $500–1,000 CAD (can defer until prod) |
| Panini IP legal review | $200–400 CAD (can defer until prod) |

### Cloud Monthly Costs

**Initial launch (< 100 users) — EC2 + Docker Compose:**

| Service | Monthly (USD) |
|---|---|
| EC2 t3.small | ~$15 |
| RDS PostgreSQL db.t3.micro | ~$15 |
| ElastiCache Redis cache.t3.micro | ~$12 |
| ALB | ~$8 |
| AWS SES | ~$1 |
| AWS Route 53 | ~$1–2 |
| AWS Secrets Manager | ~$1 |
| AWS S3 | ~$1–2 |
| AWS Certificate Manager | $0 |
| Groq vision API (Llama-4 Scout) | $1–5 |
| **Total** | **~$55–61 USD/month** |

**At scale (5,000+ MAU) — after migration to ECS Fargate (see ADR-0001):**

| Service | Monthly (USD) |
|---|---|
| ECS Fargate (2 tasks) | $30–50 |
| RDS PostgreSQL (db.t3.medium) | $25–40 |
| ElastiCache Redis | $20–30 |
| ALB + ACM | $8–15 |
| SES, S3, Route 53, Secrets Manager | $5–10 |
| Groq vision API | $5–30 |
| **Total** | **~$93–175 USD/month** |

### Cost at Scale

| Monthly Active Users | Architecture | Estimated Monthly (USD) |
|---|---|---|
| < 100 (launch) | EC2 + Docker Compose | $55–61 |
| 100–1,000 | EC2 + Docker Compose (scale vertically) | $70–90 |
| 1,000–5,000 | Migrate to ECS Fargate | $93–140 |
| World Cup peak (20,000) | ECS Fargate + larger RDS | $250–400 |

### Cost Controls

- AWS Budget alert at $150 USD/month
- EC2 can be resized vertically before migrating to Fargate
- Groq vision API rate limited to 20 scans/user/hour


---

## 37. Glossary

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

## 38. Next Steps

### Start Today (Before Hiring a Developer)

1. **Compile the complete sticker checklist** — visit https://www.checklistinsider.com/2026-panini-fifa-world-cup-sticker and capture all 960 team sticker records (album codes + sequential numbers + player names + positions). This is the most important pre-development task.
2. Install Docker Desktop on your machine
3. Register your domain (Route 53 or Namecheap)
4. Create a free GitHub account and a private repository
5. Create an AWS account (required once the cloud deployment starts) and enable MFA on the root account immediately

### When Hiring a Developer

Provide this document as the technical specification. The developer should be able to read it, run `docker compose up`, and have a working local environment within 30 minutes.

**Key skills to look for:** TypeScript/Node.js, Drizzle ORM, PostgreSQL, Docker, React/Next.js, AWS, Terraform.

**First milestone to ask for:** "Show me the application running locally with the 48 teams and 980 stickers seeded in the database, and show me the trade matching algorithm returning correct results between two test users."

### Milestone Checkpoints

| Milestone | Success Criteria |
|---|---|
| Pre-development | All 960 team sticker records compiled with sequential numbers — `03_team_stickers.sql` is complete |
| End of A1 | `docker compose up && pnpm db:seed` works. 48 teams, 980 core stickers (20 intro + 960 team), plus 12 Coca-Cola + 20 Extra in database. Health check passes. Email verification flow works in Mailpit. API docs visible at `localhost:3001/docs`. |
| End of A2 | All stickers visible in album UI with filtering. Can add/remove/mark duplicates. Multiple albums per user. Avatar upload working. Test suite ≥ 60% coverage. |
| End of A3 | Share link visible without login. Email not exposed on public list. Trade matching returns correct results for Alice and Bob test users. SSE trade messages delivered in real-time. |
| End of A4 | Mock AI scan adds a sticker to Alice's collection. Real Groq vision API works in dev cloud. |
| End of A5 | Full test suite ≥ 80% coverage. k6 load test passes. All runbooks written. PWA installable on mobile. |
| End of B1 | CI/CD deploys to dev on every merge. Health check passes in AWS. |
| End of B2 | Production environment provisioned. Release-tag deploy to prod tested. Legal documents published. |
| Soft Launch | 100 beta users. Zero data loss in first 7 days. |
| Public Launch | All checkpoints met. Responsible disclosure policy live. |

---

*End of Cromo — Production Implementation Plan v5.2*

*This is the cross-cutting overview. Subsystem detail lives in sibling files. Store as `docs/architecture/overview.md` in the repository.*
