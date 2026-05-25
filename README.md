# Cromo

> _**Cromo** (n., Spanish) — a trading sticker or collector's card. From Greek **chroma**, "color."_

A multi-user web application for tracking, managing, and trading stickers from the 2026 FIFA World Cup Panini sticker collection. See [`BRAND.md`](BRAND.md) for the visual identity spec.

The repository name and internal workspace package names (`@stickfolio/*`) still reflect the project's original codename and are intentionally untouched — renaming them requires a coordinated lockfile + import sweep best done as a separate change.

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

5. **Apply schema and seed data**
   ```bash
   pnpm db:migrate && pnpm db:seed
   ```
   In Phase A the database schema lives in a single `apps/backend/src/db/schema.sql` file
   that is applied at API startup (and by `pnpm db:migrate` for manual runs). Phase B will
   migrate to Drizzle ORM migrations once the schema stabilises.

6. **Open the app**

   | Service | URL |
   |---|---|
   | Frontend | http://localhost:3000 |
   | API | http://localhost:3001/health |
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

See [`docs/architecture/overview.md`](docs/architecture/overview.md) for the full technical specification.

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 + TypeScript + Tailwind CSS |
| Backend | Node.js + Fastify + TypeScript |
| Database | PostgreSQL 16 (Docker) → Aurora PostgreSQL (cloud) |
| Cache | Redis 7 (Docker) → ElastiCache (cloud) |
| Auth | Local mock → AWS Cognito (cloud) |
| Email | Mailpit (local) → AWS SES (cloud) |
| Schema (Phase A) | Single `schema.sql` applied at startup → Drizzle ORM migrations in Phase B |
| Monorepo | Turborepo |
