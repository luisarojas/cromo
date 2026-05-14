# Database Layer

> **Parent document:** [`overview.md`](overview.md#document-map) — this file is the detailed expansion. `overview.md` covers cross-cutting context (product, architecture, phases, cost, glossary); this file is the canonical reference for its subsystem.

## 7.1 Primary Database

| Environment | Database | Notes |
|---|---|---|
| Local | PostgreSQL 16 in Docker | Identical schema to cloud |
| Cloud | AWS Aurora PostgreSQL Serverless v2 | Scales to zero overnight |

The schema, migrations, and seed scripts are **identical** in both environments. This guarantees that what works locally will work in the cloud.

## 7.2 Full Database Schema

The schema is defined in `apps/backend/src/db/schema.ts` (Drizzle ORM) and applied via migrations in `apps/backend/src/db/migrations/`.

```sql
-- USERS ───────────────────────────────────────────────────
CREATE TABLE users (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email              TEXT UNIQUE NOT NULL,
  username           TEXT UNIQUE NOT NULL,
  display_name       TEXT,
  avatar_url         TEXT,
  role               TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  locale             TEXT NOT NULL DEFAULT 'en',
  email_verified_at  TIMESTAMPTZ,  -- NULL = not yet verified
  hashed_email       TEXT,  -- SHA-256(lowercase(email)); retained after soft-delete for ban-evasion prevention
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ  -- soft delete; NULL = active
);

CREATE TABLE user_settings (
  user_id                       UUID PRIMARY KEY REFERENCES users(id),
  collection_visibility         TEXT DEFAULT 'private' CHECK (collection_visibility IN ('private', 'friends', 'public')),
  profile_visibility            TEXT DEFAULT 'public' CHECK (profile_visibility IN ('private', 'public')),
  trade_matching_enabled        BOOLEAN DEFAULT true,
  email_trade_requests          BOOLEAN DEFAULT true,
  email_trade_messages          BOOLEAN DEFAULT true,
  email_marketing               BOOLEAN DEFAULT false,
  marketing_consent_at          TIMESTAMPTZ,
  marketing_consent_version     TEXT,
  show_trust_score_public       BOOLEAN DEFAULT true,
  duplicates_count_all_variants BOOLEAN NOT NULL DEFAULT false
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

CREATE TABLE password_reset_tokens (
  token       TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(32), 'hex'),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '1 hour',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ALBUM CATALOG ──────────────────────────────────────────
-- Album types define the collection product (e.g., FIFA World Cup 2026).
-- Album editions are regional variants within a type (North America, International, etc.).
CREATE TABLE album_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT UNIQUE NOT NULL,  -- e.g. 'fifa_world_cup_2026'
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE album_editions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_type_id  UUID NOT NULL REFERENCES album_types(id) ON DELETE CASCADE,
  key            TEXT NOT NULL,  -- e.g. 'north_america', 'international'
  name           TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (album_type_id, key)
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
  album_type_id UUID NOT NULL REFERENCES album_types(id),
  number        INT NOT NULL CHECK (number BETWEEN 0 AND 9999),
  album_code    TEXT NOT NULL,  -- e.g. 'MEX1', 'FWC3', '00'
  team_id       UUID REFERENCES teams(id),
  player_name   TEXT,
  position      TEXT,  -- 'GK'|'DEF'|'MID'|'FWD'|null
  sticker_type  TEXT NOT NULL,
  -- 'intro'|'badge'|'team_photo'|'player'|'museum'|'coca_cola'
  is_foil       BOOLEAN NOT NULL DEFAULT false,
  album_page    INT,  -- NOT USED: page numbers vary by regional edition; reserved for future use
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (album_type_id, number),
  UNIQUE (album_type_id, album_code)
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

-- USER ALBUMS & COLLECTION ───────────────────────────────
-- Each user can have multiple albums (one per album type/edition combination).
CREATE TABLE user_albums (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  album_type_id    UUID NOT NULL REFERENCES album_types(id),
  album_edition_id UUID NOT NULL,
  alias            TEXT CHECK (alias IS NULL OR char_length(alias) BETWEEN 1 AND 100),
  is_default       BOOLEAN NOT NULL DEFAULT false,
  settings         JSONB NOT NULL DEFAULT '{"include_all_stickers":true,"include_coca_cola":true,"include_non_album_museum":true}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enforces at most one default album per user
CREATE UNIQUE INDEX idx_user_albums_single_default ON user_albums(user_id) WHERE is_default = true;

-- Stickers are owned per album, not per user directly.
CREATE TABLE user_stickers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id            UUID NOT NULL REFERENCES user_albums(id) ON DELETE CASCADE,
  sticker_variant_id  UUID NOT NULL REFERENCES sticker_variants(id),
  quantity            INT NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  acquired_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (album_id, sticker_variant_id)
);

CREATE INDEX idx_user_stickers_duplicates ON user_stickers(album_id) WHERE quantity > 1;

-- TRADING (tables present in schema; trading API not yet implemented) ──────────
CREATE TABLE trade_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id   UUID NOT NULL REFERENCES users(id),
  recipient_id   UUID NOT NULL REFERENCES users(id),
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'completed', 'expired')),
  counter_count  INT NOT NULL DEFAULT 0 CHECK (counter_count BETWEEN 0 AND 5),
  accepted_at    TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  cancelled_at   TIMESTAMPTZ,
  expires_at     TIMESTAMPTZ,
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

-- SHARING (table present in schema; sharing API not yet implemented) ────────────
CREATE TABLE public_lists (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id),
  list_type    TEXT NOT NULL,  -- 'missing'|'duplicates'|'full_collection'
  share_token  TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
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

-- TRUST & SAFETY (tables present; API not yet implemented — Phase A5) ──────────
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

## 7.3 Migrations: Drizzle ORM

Drizzle ORM defines the schema in TypeScript (`apps/backend/src/db/schema.ts`) and generates SQL migration files you can inspect, commit, and run.

```
apps/backend/src/db/
  schema.ts              # TypeScript definitions of every table — single source of truth
  migrations/
    0001_initial.sql           # full initial schema + album catalog seed
    0002_team_album_pages.sql  # team-level album page assignments
    0003_complete_sticker_catalog.sql
    0004_sticker_album_pages.sql
    0005_album_settings.sql    # per-album display settings JSONB column
```

Commands:
```bash
pnpm db:generate   # generate a new migration from schema changes
pnpm db:migrate    # apply pending migrations to the local database
pnpm db:studio     # open Drizzle Studio (visual database browser)
```

When you add a column to `schema.ts`, run `pnpm db:generate` and a new migration file appears automatically. The same migration files run in every environment.

## 7.4 Redis Cache

| Cache Key | Content | TTL |
|---|---|---|
| `stickfolio:sticker_catalog:vN` | Full sticker catalog (all types) | 24 hours (browser localStorage) / 1 hour (Redis) |
| `user:{id}:summary` | Completion %, total counts | 5 minutes |
| `user:{id}:duplicates` | Tradeable stickers | 5 minutes |
| `rate_limit:{ip}:{endpoint}` | Rate limit counters | Per window |

Redis Commander at `localhost:8081` lets you browse, inspect, and delete cache keys interactively.

> **Cache invalidation:** When sticker catalog data changes (new stickers, updated variants), bump the version suffix of `STICKER_CACHE_KEY` in `apps/frontend/src/lib/api.ts`. Also flush Redis: `docker compose -f infrastructure/docker/docker-compose.yml exec cache redis-cli FLUSHALL`.
