# Local Setup

How to get Cromo running on a fresh machine, from "I just cloned the repo"
to "I can log in as Alice and propose a trade."

## 1. Prerequisites

| Tool | Why |
|---|---|
| Docker Desktop | Runs Postgres, Redis, Mailpit, the API, and the frontend in containers |
| Node.js 22 LTS | Runs the Turborepo build + `pnpm db:*` commands |
| pnpm 10+ | Workspace package manager (`npm install -g pnpm`) |
| Git | Version control |

Verify versions:

```bash
docker --version       # Docker version 24+ ideally
node  --version        # v22.x.x
pnpm  --version        # 10.x
```

## 2. First-time bring-up

```bash
git clone https://github.com/your-org/cromo.git
cd cromo

pnpm install

cp .env.example .env.local      # defaults work for local dev — no edits needed

# Start everything in the background
docker compose -f infrastructure/docker/docker-compose.yml up -d

# Apply schema.sql and seed all sticker / variant / user data.
# Phase A: pnpm db:migrate executes apps/backend/src/db/schema.sql once;
# the API also does this at startup.
pnpm db:migrate && pnpm db:seed
```

Open:
- Frontend: http://localhost:3000
- API health: http://localhost:3001/health
- API docs: http://localhost:3001/docs
- Mailpit (catches outbound email): http://localhost:8025
- pgAdmin: http://localhost:5050 (login: `admin@local.dev` / `admin`)
- Redis Commander: http://localhost:8081

## 3. Test accounts

In `AUTH_MODE=local`, any password works. The seed creates six pre-verified
accounts:

| Role | Email |
|---|---|
| Admin | admin@test.local |
| Alice (partial collection) | alice@test.local |
| Bob (overlapping collection) | bob@test.local |
| Charlie | charlie@test.local |
| Diana | diana@test.local |
| Evan | evan@test.local |

## 4. Smoke test

After login, you should be able to:

1. Open the album, see 980 core sticker slots + 12 Coca-Cola + 20 Extra
2. Click any sticker, mark "have" / "duplicate"
3. Switch to Bob, see overlapping inventory
4. Open `/trade`, propose a trade between Alice and Bob — matches should appear
5. Trigger AI scan (`/scan`) — in `GROQ_API_KEY=mock`, it returns a canned result
6. Open admin panel as `admin@test.local`

## 5. Reset

```bash
# Reset just the data (keeps containers running)
pnpm db:reset && pnpm db:seed

# Wipe everything including volumes
docker compose -f infrastructure/docker/docker-compose.yml down -v
```

## 6. Common failures

| Symptom | Fix |
|---|---|
| `pnpm db:migrate` fails with `connection refused` | `docker compose ps` — the `db` container may still be starting; wait 5s |
| Frontend shows stale sticker data after reseed | `docker compose exec cache redis-cli FLUSHALL` (per `CLAUDE.md`) |
| API container crash-loops on startup | Check `docker compose logs api` — usually a missing `.env.local` value |
| Mailpit shows no verification emails | Confirm `SMTP_HOST=mailpit` in `.env.local`; restart the `api` container |
| Port 3000/3001/5432 conflict | Another local process is bound; stop it or change the host port in `docker-compose.yml` |

## 7. Day-to-day workflow

```bash
# Hot reload both api + frontend
docker compose -f infrastructure/docker/docker-compose.yml up

# Backend tests
pnpm --filter @cromo/backend test
pnpm --filter @cromo/backend test:watch

# Frontend E2E
pnpm --filter @cromo/frontend test:e2e

# Type check everything
pnpm typecheck
```
