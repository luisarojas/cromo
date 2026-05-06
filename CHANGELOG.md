# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Phase A1 Foundation: monorepo scaffold with Turborepo
- Docker Compose environment (PostgreSQL, Redis, API, Frontend, Mailpit, Redis Commander, pgAdmin)
- Fastify v5 backend with TypeScript
- Drizzle ORM schema with all 17 tables; initial migration
- CORS, Helmet, rate-limiting, Swagger/OpenAPI plugins
- `/health` and `/health/ready` endpoints
- `/api/v1/version` endpoint
- Local auth mock middleware (AUTH_MODE=local)
- JWT access tokens (15 min) + HttpOnly refresh token cookie (30 day)
- Auth routes: register, login, logout, refresh, verify-email, resend-verification, forgot-password, reset-password
- Email verification flow via Mailpit (local) / SES (cloud)
- Seed scripts: 48 teams, 980 stickers, all variants, feature flags, test users
- Vitest test suite (unit + integration)
- Next.js 15 frontend skeleton
