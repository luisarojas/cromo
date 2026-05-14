# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — Phase A2: Core Collection Features
- Album grid view (`/album/[albumId]`) with all sticker slots, filterable by team, group, type, variant, status, and page range
- Multiple albums per user — gallery view, per-album routes, create/delete/rename, default album selection
- Per-album sticker visibility settings (include/exclude Coca-Cola, Extra, Museum stickers)
- Collection stats derived client-side from the settings-filtered sticker pool
- Sticker tile design: team flag images, variant rarity badges, sticker page numbers, popup detail
- Per-sticker favouriting with filter support
- Have / missing / duplicates views within album
- Avatar upload (multipart, resized to 512×512, EXIF stripped)
- User settings persistence across devices (preferences API)
- Admin panel: user management table (list, role change, ban, delete), sticker data corrections
- Albums API: full CRUD + set-default + move-sticker-between-albums endpoints
- User account API: change username, email, password; soft-delete account
- Coca-Cola sticker series, Extra Sticker inserts, Host City stickers, Swiss Legends series (seed files 08–14)
- Team album page data migrated from frontend hardcode to database (migration 0002–0004)
- Per-album display settings column (migration 0005)
- Cache key versioning pattern (`STICKER_CACHE_KEY` in `apps/frontend/src/lib/api.ts`)
- Dev-only clear-cache button in NavBar

### Added — Phase A1: Foundation
- Monorepo scaffold with Turborepo
- Docker Compose environment (PostgreSQL, Redis, API, Frontend, Mailpit, Redis Commander, pgAdmin)
- Fastify v5 backend with TypeScript
- Drizzle ORM schema with all tables; initial migration
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
