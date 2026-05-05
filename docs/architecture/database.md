# Database Layer

> **Parent document:** [`overview.md`](overview.md#document-map) — this file is the detailed expansion. `overview.md` covers cross-cutting context (product, architecture, phases, cost, glossary); this file is the canonical reference for its subsystem.

## 7.1 Primary Database

| Environment | Database | Notes |
|---|---|---|
| Local | PostgreSQL 16 in Docker | Identical schema to cloud |
| Cloud | AWS Aurora PostgreSQL Serverless v2 | Scales to zero overnight |

The schema, migrations, and seed scripts are **identical** in both environments. This guarantees that what works locally will work in the cloud.

## 7.2 Full Database Schema

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

## 7.3 Migrations: Drizzle ORM

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

## 7.4 Redis Cache

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

