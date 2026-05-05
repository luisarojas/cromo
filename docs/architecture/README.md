# Architecture Documentation

This directory contains the production implementation plan for StickerSwap 2026 — a multi-user web application for tracking and trading stickers from the 2026 FIFA World Cup Panini collection.

## Start here

[`overview.md`](./overview.md) is the cross-cutting entry point: product, system architecture, technology stack, development phases, cost estimate, glossary, and next steps. Read it first to orient yourself.

Each subsystem is documented in its own file. Load only the file relevant to your current task — `overview.md` plus one domain file is usually enough.

## Files

| File | Read when… |
|---|---|
| [`overview.md`](./overview.md) | You need cross-cutting context (product, architecture diagram, phases, cost). |
| [`local-development.md`](./local-development.md) | Setting up the local Docker environment, `.env` config, dev workflow. |
| [`frontend.md`](./frontend.md) | Working on the Next.js UI, PWA, i18n, or page routes. |
| [`backend.md`](./backend.md) | Fastify routes, CORS, DB pooling, rate limits, AI-scan endpoint. |
| [`database.md`](./database.md) | Schema design, Drizzle migrations, Redis cache keys. |
| [`seed-data.md`](./seed-data.md) | Compiling or loading the 2026 World Cup seed data. |
| [`auth-security.md`](./auth-security.md) | Email verification, Cognito, security headers, cookies, lockout, PII logging. |
| [`trading.md`](./trading.md) | Trade-flow rules, SSE messaging, disputes, public list sharing. |
| [`trust-safety.md`](./trust-safety.md) | Ratings, user reports, bans, moderation UI, PIPEDA handling. |
| [`notifications.md`](./notifications.md) | Email (SES, DKIM/DMARC, bounce handling), Web Push. |
| [`observability.md`](./observability.md) | Analytics, health checks, monitoring, alerting. |
| [`infrastructure.md`](./infrastructure.md) | Environment strategy and AWS architecture. |
| [`devops.md`](./devops.md) | Monorepo layout, branch strategy, versioning, CI/CD. |
| [`testing.md`](./testing.md) | Unit, integration, E2E, and load testing. |
| [`compliance.md`](./compliance.md) | PIPEDA / CASL / Quebec Law 25, legal IP, multi-user roles. |
| [`operations.md`](./operations.md) | Disaster recovery, error handling, support, runbook, security disclosure. |
| [`jobs.md`](./jobs.md) | Scheduled cron jobs and the BullMQ async queue. |
| [`performance.md`](./performance.md) | Web Vitals budgets, bundle limits, RUM. |

## Conventions

- `overview.md` is canonical for cross-cutting context.
- Each domain file is canonical for its subsystem; `overview.md` does not duplicate that detail.
- Section numbers in domain files preserve their original numbering from the historical monolithic spec (e.g., `## 7.2 Full Database Schema` in `database.md`) so existing cross-references like "see §7.2" stay valid.
- Cross-file references use the form `(see [`backend.md`](./backend.md) § 6.3)` or short prose like "see backend.md".
