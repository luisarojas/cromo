-- Compiled schema — single source of truth for a fresh database.
-- Reflects the cumulative result of migrations 0001 → 0033.
-- Do NOT run migration files alongside this file; use one or the other.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Users ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT        UNIQUE NOT NULL,
  username            TEXT        UNIQUE NOT NULL
    CHECK (char_length(username) BETWEEN 3 AND 30),
  display_name        TEXT
    CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 100),
  avatar_url          TEXT,
  role                TEXT        NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  locale              TEXT        NOT NULL DEFAULT 'en',
  email_verified_at   TIMESTAMPTZ,
  hashed_email        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id                      UUID    PRIMARY KEY REFERENCES users(id),
  profile_visibility           TEXT    NOT NULL DEFAULT 'public'
    CHECK (profile_visibility IN ('private', 'public')),
  trade_matching_enabled       BOOLEAN NOT NULL DEFAULT true,
  email_trade_requests         BOOLEAN NOT NULL DEFAULT true,
  email_trade_messages         BOOLEAN NOT NULL DEFAULT true,
  email_marketing              BOOLEAN NOT NULL DEFAULT false,
  marketing_consent_at         TIMESTAMPTZ,
  marketing_consent_version    TEXT,
  show_trust_score_public      BOOLEAN NOT NULL DEFAULT true,
  duplicates_count_all_variants BOOLEAN NOT NULL DEFAULT false,
  cities                       JSONB   NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS consent_records (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES users(id),
  consent_type   TEXT        NOT NULL,
  granted        BOOLEAN     NOT NULL,
  policy_version TEXT        NOT NULL,
  ip_address     INET,
  user_agent     TEXT,
  recorded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token      TEXT        PRIMARY KEY DEFAULT encode(gen_random_bytes(32), 'hex'),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '24 hours',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token      TEXT        PRIMARY KEY DEFAULT encode(gen_random_bytes(32), 'hex'),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '1 hour',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Album catalog ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS album_types (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT        UNIQUE NOT NULL,
  name       TEXT        NOT NULL,
  guide_path TEXT,
  scan_prompt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS album_editions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  album_type_id UUID        NOT NULL REFERENCES album_types(id) ON DELETE CASCADE,
  key           TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_album_editions_album_type_key     ON album_editions(album_type_id, key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_album_editions_id_album_type_id   ON album_editions(id, album_type_id);
CREATE        INDEX IF NOT EXISTS idx_album_editions_album_type_id      ON album_editions(album_type_id);

CREATE TABLE IF NOT EXISTS album_formats (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  album_type_id UUID        NOT NULL REFERENCES album_types(id) ON DELETE CASCADE,
  key           TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS album_formats_album_type_id_key_unique ON album_formats(album_type_id, key);
CREATE UNIQUE INDEX IF NOT EXISTS album_formats_id_album_type_id_unique  ON album_formats(id, album_type_id);
CREATE        INDEX IF NOT EXISTS idx_album_formats_album_type_id        ON album_formats(album_type_id);

-- Junction table proves both edition and format belong to the same album type.
CREATE TABLE IF NOT EXISTS album_edition_formats (
  album_type_id    UUID        NOT NULL REFERENCES album_types(id) ON DELETE CASCADE,
  album_edition_id UUID        NOT NULL,
  album_format_id  UUID        NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (album_edition_id, album_format_id),
  CONSTRAINT album_edition_formats_edition_matches_type
    FOREIGN KEY (album_edition_id, album_type_id)
    REFERENCES album_editions(id, album_type_id) ON DELETE CASCADE,
  CONSTRAINT album_edition_formats_format_matches_type
    FOREIGN KEY (album_format_id, album_type_id)
    REFERENCES album_formats(id, album_type_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_album_edition_formats_edition_id ON album_edition_formats(album_edition_id);
CREATE INDEX IF NOT EXISTS idx_album_edition_formats_format_id  ON album_edition_formats(album_format_id);
CREATE INDEX IF NOT EXISTS idx_album_edition_formats_type_id    ON album_edition_formats(album_type_id);

-- ─── Teams & stickers ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS teams (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  fifa_code  TEXT        UNIQUE NOT NULL,
  name       TEXT        NOT NULL,
  group_name TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stickers (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  album_type_id UUID    NOT NULL REFERENCES album_types(id),
  number        INT     NOT NULL CHECK (number BETWEEN 0 AND 9999),
  album_code    TEXT    NOT NULL,
  team_id       UUID    REFERENCES teams(id),
  player_name   TEXT,
  position      TEXT,
  sticker_type  TEXT    NOT NULL CHECK (sticker_type IN (
    'intro', 'badge', 'team_photo', 'player',
    'museum', 'coca_cola_special', 'extra'
  )),
  is_foil       BOOLEAN NOT NULL DEFAULT false,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (album_type_id, number),
  UNIQUE (album_type_id, album_code)
);

CREATE INDEX IF NOT EXISTS idx_stickers_album_type_id ON stickers(album_type_id);
CREATE INDEX IF NOT EXISTS idx_stickers_team_id       ON stickers(team_id);

CREATE TABLE IF NOT EXISTS sticker_variants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sticker_id   UUID NOT NULL REFERENCES stickers(id),
  variant_type TEXT NOT NULL,
  rarity_rank  INT  NOT NULL,
  availability TEXT NOT NULL,
  UNIQUE (sticker_id, variant_type)
);

CREATE INDEX IF NOT EXISTS idx_sticker_variants_sticker_id ON sticker_variants(sticker_id);

CREATE TABLE IF NOT EXISTS team_album_pages (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    UUID    NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  edition    TEXT    NOT NULL,
  page_start INTEGER NOT NULL,
  page_end   INTEGER NOT NULL,
  CONSTRAINT team_album_pages_team_id_edition_unique UNIQUE (team_id, edition)
);

CREATE INDEX IF NOT EXISTS idx_team_album_pages_team_id ON team_album_pages(team_id);

CREATE TABLE IF NOT EXISTS sticker_album_pages (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  sticker_id  UUID    NOT NULL REFERENCES stickers(id) ON DELETE CASCADE,
  edition     TEXT    NOT NULL,
  page_start  INTEGER,
  page_end    INTEGER,
  description TEXT,
  CONSTRAINT sticker_album_pages_sticker_id_edition_unique UNIQUE (sticker_id, edition)
);

CREATE INDEX IF NOT EXISTS idx_sticker_album_pages_sticker_id ON sticker_album_pages(sticker_id);

-- ─── User albums & stickers ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_albums (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  album_type_id            UUID        NOT NULL REFERENCES album_types(id),
  album_edition_id         UUID        NOT NULL,
  album_format_id          UUID        NOT NULL,
  alias                    TEXT,
  notes                    TEXT        CHECK (notes IS NULL OR char_length(notes) <= 500),
  is_default               BOOLEAN     NOT NULL DEFAULT false,
  is_trade_inventory_public BOOLEAN    NOT NULL DEFAULT false,
  settings                 JSONB       NOT NULL DEFAULT '{"includeExtras":true,"includeCocaCola":true}'::jsonb,
  owned_count              INTEGER     NOT NULL DEFAULT 0,
  duplicate_count          INTEGER     NOT NULL DEFAULT 0,
  total_count              INTEGER     NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_albums_alias_length
    CHECK (alias IS NULL OR (char_length(alias) BETWEEN 1 AND 100)),
  CONSTRAINT user_albums_edition_matches_type
    FOREIGN KEY (album_edition_id, album_type_id)
    REFERENCES album_editions(id, album_type_id),
  CONSTRAINT user_albums_format_matches_type
    FOREIGN KEY (album_format_id, album_type_id)
    REFERENCES album_formats(id, album_type_id),
  CONSTRAINT user_albums_edition_format_valid
    FOREIGN KEY (album_edition_id, album_format_id)
    REFERENCES album_edition_formats(album_edition_id, album_format_id)
);

CREATE        INDEX IF NOT EXISTS idx_user_albums_user_id              ON user_albums(user_id);
CREATE        INDEX IF NOT EXISTS idx_user_albums_album_type_id        ON user_albums(album_type_id);
CREATE        INDEX IF NOT EXISTS idx_user_albums_album_edition_id     ON user_albums(album_edition_id);
CREATE        INDEX IF NOT EXISTS idx_user_albums_album_format_id      ON user_albums(album_format_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_albums_single_default       ON user_albums(user_id) WHERE is_default = true;
CREATE        INDEX IF NOT EXISTS idx_user_albums_public_trade_inventory ON user_albums(user_id) WHERE is_trade_inventory_public;

CREATE TABLE IF NOT EXISTS user_stickers (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id           UUID        NOT NULL REFERENCES user_albums(id) ON DELETE CASCADE,
  sticker_variant_id UUID        NOT NULL REFERENCES sticker_variants(id),
  quantity           INT         NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  trade_hidden       BOOLEAN     NOT NULL DEFAULT false,
  trade_forced       BOOLEAN     NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (album_id, sticker_variant_id)
);

CREATE INDEX IF NOT EXISTS idx_user_stickers_album_id          ON user_stickers(album_id);
CREATE INDEX IF NOT EXISTS idx_user_stickers_duplicates        ON user_stickers(album_id) WHERE quantity > 1;
CREATE INDEX IF NOT EXISTS idx_user_stickers_sticker_variant_id ON user_stickers(sticker_variant_id);

CREATE TABLE IF NOT EXISTS user_sticker_favourites (
  album_id   UUID        NOT NULL REFERENCES user_albums(id) ON DELETE CASCADE,
  sticker_id UUID        NOT NULL REFERENCES stickers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (album_id, sticker_id)
);

CREATE INDEX IF NOT EXISTS idx_user_sticker_favourites_album_id ON user_sticker_favourites(album_id);

CREATE TABLE IF NOT EXISTS user_wanted_variants (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sticker_variant_id UUID        NOT NULL REFERENCES sticker_variants(id),
  album_id           UUID        NOT NULL REFERENCES user_albums(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, sticker_variant_id, album_id)
);

CREATE INDEX IF NOT EXISTS idx_user_wanted_variants_user_album ON user_wanted_variants(user_id, album_id);

-- ─── Trades ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trade_requests (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id            UUID        NOT NULL REFERENCES users(id),
  recipient_id            UUID        NOT NULL REFERENCES users(id),
  requester_album_id      UUID        NOT NULL REFERENCES user_albums(id),
  recipient_album_id      UUID        NOT NULL REFERENCES user_albums(id),
  status                  TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','declined','cancelled','completed','expired')),
  counter_count           INT         NOT NULL DEFAULT 0 CHECK (counter_count BETWEEN 0 AND 5),
  offer_cash              INTEGER     NOT NULL DEFAULT 0 CHECK (offer_cash >= 0),
  want_cash               INTEGER     NOT NULL DEFAULT 0 CHECK (want_cash >= 0),
  requester_completed_at  TIMESTAMPTZ,
  recipient_completed_at  TIMESTAMPTZ,
  accepted_at             TIMESTAMPTZ,
  completed_at            TIMESTAMPTZ,
  cancelled_at            TIMESTAMPTZ,
  expires_at              TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trade_requests_requester_id            ON trade_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_trade_requests_recipient_id            ON trade_requests(recipient_id);
CREATE INDEX IF NOT EXISTS idx_trade_requests_requester_id_status     ON trade_requests(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_trade_requests_recipient_id_status     ON trade_requests(recipient_id, status);
CREATE INDEX IF NOT EXISTS idx_trade_requests_requester_status_updated ON trade_requests(requester_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_requests_recipient_status_updated ON trade_requests(recipient_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS trade_items (
  id                 UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id           UUID    NOT NULL REFERENCES trade_requests(id),
  sticker_variant_id UUID    NOT NULL REFERENCES sticker_variants(id),
  direction          TEXT    NOT NULL,
  quantity           INT     NOT NULL DEFAULT 1 CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_trade_items_trade_id           ON trade_items(trade_id);
CREATE INDEX IF NOT EXISTS idx_trade_items_sticker_variant_id ON trade_items(sticker_variant_id);

CREATE TABLE IF NOT EXISTS trade_messages (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id  UUID        NOT NULL REFERENCES trade_requests(id) ON DELETE CASCADE,
  sender_id UUID        REFERENCES users(id),
  body      TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  is_system BOOLEAN     NOT NULL DEFAULT FALSE,
  sent_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trade_messages_trade_id ON trade_messages(trade_id, sent_at);

-- ─── Misc ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public_lists (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id),
  list_type   TEXT        NOT NULL,
  share_token TEXT        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_public_lists_user_id ON public_lists(user_id);

CREATE TABLE IF NOT EXISTS feature_flags (
  key         TEXT    PRIMARY KEY,
  enabled     BOOLEAN NOT NULL DEFAULT false,
  rollout_pct INT     NOT NULL DEFAULT 0 CHECK (rollout_pct BETWEEN 0 AND 100),
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL   PRIMARY KEY,
  user_id     UUID        REFERENCES users(id),
  action      TEXT        NOT NULL,
  ip_address  INET,
  user_agent  TEXT,
  metadata    JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id            ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id_occurred_at ON audit_log(user_id, occurred_at DESC);

-- ─── Trust & safety ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trade_ratings (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id      UUID        NOT NULL REFERENCES trade_requests(id),
  rater_id      UUID        NOT NULL REFERENCES users(id),
  rated_user_id UUID        NOT NULL REFERENCES users(id),
  is_positive   BOOLEAN     NOT NULL,
  comment       TEXT        CHECK (char_length(comment) <= 500),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trade_id, rater_id),
  CHECK (rater_id <> rated_user_id)
);

CREATE INDEX IF NOT EXISTS idx_trade_ratings_trade_id     ON trade_ratings(trade_id);
CREATE INDEX IF NOT EXISTS idx_trade_ratings_rater_id     ON trade_ratings(rater_id);
CREATE INDEX IF NOT EXISTS idx_trade_ratings_rated_user_id ON trade_ratings(rated_user_id);

CREATE TABLE IF NOT EXISTS user_reports (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      UUID        NOT NULL REFERENCES users(id),
  reported_user_id UUID        NOT NULL REFERENCES users(id),
  trade_id         UUID        REFERENCES trade_requests(id),
  category         TEXT        NOT NULL
    CHECK (category IN ('harassment','cancelled_after_accept','no_show','fake_stickers','damaged_stickers','spam','underage','other')),
  description      TEXT        NOT NULL
    CHECK (char_length(description) BETWEEN 10 AND 2000),
  status           TEXT        NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','under_review','resolved','dismissed')),
  resolved_by      UUID        REFERENCES users(id),
  resolved_at      TIMESTAMPTZ,
  resolution_note  TEXT        CHECK (char_length(resolution_note) <= 1000),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (reporter_id <> reported_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_reports_reporter_id               ON user_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_reported_user_id          ON user_reports(reported_user_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_reported_user_id_status   ON user_reports(reported_user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_reports_status                    ON user_reports(status, created_at ASC) WHERE status IN ('open','under_review');

CREATE TABLE IF NOT EXISTS user_bans (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id),
  ban_type    TEXT        NOT NULL CHECK (ban_type IN ('soft','hard')),
  reason      TEXT        NOT NULL CHECK (char_length(reason) BETWEEN 5 AND 1000),
  report_id   UUID        REFERENCES user_reports(id),
  banned_by   UUID        NOT NULL REFERENCES users(id),
  expires_at  TIMESTAMPTZ,
  lifted_at   TIMESTAMPTZ,
  lifted_by   UUID        REFERENCES users(id),
  lift_reason TEXT        CHECK (char_length(lift_reason) <= 500),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_bans_user_id ON user_bans(user_id);

CREATE INDEX IF NOT EXISTS idx_consent_records_user_id      ON consent_records(user_id);
CREATE INDEX IF NOT EXISTS idx_consent_records_user_id_type ON consent_records(user_id, consent_type);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id     ON password_reset_tokens(user_id);

-- ─── Functions ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _sync_user_album_counts(p_album_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_album_id IS NULL THEN
    RETURN;
  END IF;

  WITH album_info AS (
    SELECT ua.album_type_id,
           (ua.settings->>'includeExtras')::boolean   AS inc_extras,
           (ua.settings->>'includeCocaCola')::boolean AS inc_coca
    FROM user_albums ua
    WHERE ua.id = p_album_id
  ),
  filtered_stickers AS (
    SELECT s.id AS sticker_id
    FROM album_info ai
    JOIN stickers s ON s.album_type_id = ai.album_type_id
    WHERE
      CASE
        WHEN s.sticker_type = 'coca_cola_special' THEN ai.inc_coca
        WHEN s.sticker_type = 'extra'             THEN ai.inc_extras
        ELSE true
      END
  ),
  stats AS (
    SELECT
      COUNT(DISTINCT fs.sticker_id)::int                                    AS total,
      COUNT(DISTINCT CASE WHEN us.quantity > 0 THEN fs.sticker_id END)::int AS owned,
      COUNT(DISTINCT CASE WHEN us.quantity > 1 THEN fs.sticker_id END)::int AS duplicates
    FROM filtered_stickers fs
    LEFT JOIN sticker_variants sv ON sv.sticker_id = fs.sticker_id
    LEFT JOIN user_stickers us
      ON us.sticker_variant_id = sv.id AND us.album_id = p_album_id
  )
  UPDATE user_albums ua
  SET total_count     = COALESCE(s.total, 0),
      owned_count     = COALESCE(s.owned, 0),
      duplicate_count = COALESCE(s.duplicates, 0)
  FROM stats s
  WHERE ua.id = p_album_id;
END;
$$;

CREATE OR REPLACE FUNCTION _trg_user_stickers_sync_counts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM _sync_user_album_counts(OLD.album_id);
    RETURN OLD;
  END IF;

  PERFORM _sync_user_album_counts(NEW.album_id);
  IF TG_OP = 'UPDATE' AND OLD.album_id IS DISTINCT FROM NEW.album_id THEN
    PERFORM _sync_user_album_counts(OLD.album_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION _trg_user_albums_sync_counts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM _sync_user_album_counts(NEW.id);
    RETURN NEW;
  END IF;

  IF NEW.settings IS DISTINCT FROM OLD.settings
     OR NEW.album_type_id IS DISTINCT FROM OLD.album_type_id THEN
    PERFORM _sync_user_album_counts(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION team_pages_json(p_team_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_object_agg(
           tap.edition,
           jsonb_build_array(tap.page_start, tap.page_end)
         )
  FROM team_album_pages tap
  WHERE tap.team_id = p_team_id;
$$;

-- ─── Triggers ─────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_user_stickers_sync_counts ON user_stickers;
CREATE TRIGGER trg_user_stickers_sync_counts
  AFTER INSERT OR UPDATE OR DELETE ON user_stickers
  FOR EACH ROW EXECUTE FUNCTION _trg_user_stickers_sync_counts();

DROP TRIGGER IF EXISTS trg_user_albums_sync_counts ON user_albums;
CREATE TRIGGER trg_user_albums_sync_counts
  AFTER INSERT OR UPDATE ON user_albums
  FOR EACH ROW EXECUTE FUNCTION _trg_user_albums_sync_counts();

-- ─── Views ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW sticker_full AS
  SELECT s.id              AS sticker_id,
         s.album_type_id,
         s.number,
         s.album_code,
         s.player_name,
         s.position,
         s.sticker_type,
         s.is_foil,
         s.notes,
         s.team_id,
         t.name            AS team_name,
         t.fifa_code,
         t.group_name,
         team_pages_json(s.team_id) AS team_pages
  FROM stickers s
  LEFT JOIN teams t ON t.id = s.team_id;

-- ─── Seed: album catalog ──────────────────────────────────────────────────────

INSERT INTO album_types (key, name, guide_path, scan_prompt) VALUES (
  'fifa_world_cup_2026',
  'FIFA World Cup 2026™ Official Sticker Collection',
  '/guide/wc-2026',
  $prompt$Use these rules to classify each FIFA World Cup 2026 Panini sticker visible in the image.

The fields you must fill on each sticker are defined by the outer OUTPUT FORMAT block — these rules tell you HOW to fill `stickerType`, `variantToken`, `playerName`, and `albumCode`. Leave any field you cannot directly observe as null; the backend will resolve missing fields from the album code where possible.

══════════════════════════════════════════════════════════
MULTI-STICKER IMAGES
══════════════════════════════════════════════════════════
A single image may contain ONE or MANY stickers (e.g. a row of stickers on a desk, a sticker sheet, or a small collection). Treat each sticker as an INDEPENDENT object and emit one entry in the output `stickers` array per sticker.

For every sticker in the image, run Steps 1–4 below from scratch. Decisions for one sticker do NOT carry over to another:
  • One sticker may be face-up (FRONT) while another is face-down (BACK) — decide per sticker.
  • Two stickers may have different `stickerType` values, different `variantToken` values, and different `playerName` values — never copy from a neighbour.
  • Ignore stickers that are heavily cropped, severely out of focus, or obscured by another object such that you cannot apply Steps 1–4 to them.
  • Do NOT merge two stickers into one entry, and do NOT split one sticker into multiple entries.

══════════════════════════════════════════════════════════
STEP 1 — FRONT OR BACK OF STICKER? (per sticker)
══════════════════════════════════════════════════════════
The BACK of a sticker is a plain, unglossy paper surface that prints only the album code (e.g. "ARG7", "BRA19", "FWC4", "EX12", "CC4", "HC1", "L3"). No glossy photo, no FIFA logo, no player.

If the sticker is showing its BACK:
  → Set `albumCode` to the printed code exactly as shown (preserve the prefix — "EX12" not "12", "CC4" not "4").
  → Leave `stickerType`, `variantToken`, `playerName`, `stickerNumber`, and `teamFifaCode` as null. The backend resolves them from the album code.
  → Skip Steps 2–4 for this sticker and move on to the next.

If the sticker is showing its FRONT:
  → Leave `albumCode` null (the code is not printed on the front).
  → Continue to Step 2 for this sticker.

══════════════════════════════════════════════════════════
STEP 2 — IDENTIFY STICKER TYPE
══════════════════════════════════════════════════════════
There are exactly THREE sticker types. Use this table — the discriminators are precise and mutually exclusive.

                          │ CORE                       │ EXTRA                          │ COCA-COLA
──────────────────────────┼────────────────────────────┼────────────────────────────────┼──────────────────────────────
 Photo                    │ POSED STUDIO PORTRAIT      │ LIVE-ACTION MATCH PHOTO        │ LIVE-ACTION MATCH PHOTO
                          │ player stationary,         │ player mid-play, looking       │ player mid-play, looking
                          │ chest-up, facing camera    │ at ball/field, NOT camera      │ at ball/field, NOT camera
──────────────────────────┼────────────────────────────┼────────────────────────────────┼──────────────────────────────
 FIFA 2026 logo position  │ UPPER-RIGHT corner         │ UPPER-LEFT corner              │ UPPER-LEFT corner
──────────────────────────┼────────────────────────────┼────────────────────────────────┼──────────────────────────────
 "Extra Sticker" text     │ absent                     │ PRESENT (upper-right)          │ absent
──────────────────────────┼────────────────────────────┼────────────────────────────────┼──────────────────────────────
 Player-name layout       │ HORIZONTAL name bar        │ HORIZONTAL name bar            │ VERTICAL text running UP the
                          │ lower-center; below it     │ lower-center on BLACK          │ LEFT edge (rotated 90°).
                          │ shows D.O.B., height,      │ background; no stats line      │ No stats line; no horizontal
                          │ weight, club               │                                │ name bar.
──────────────────────────┼────────────────────────────┼────────────────────────────────┼──────────────────────────────
 Country flag             │ LOWER-RIGHT, with 3-       │ LOWER-LEFT corner, AND also    │ NONE
                          │ letter country code        │ appears large behind player    │
──────────────────────────┼────────────────────────────┼────────────────────────────────┼──────────────────────────────
 stickerType              │ null                       │ "extra"                        │ "coca_cola_special"

Quick decision (use the strongest two signals):
  • Posed portrait + FIFA logo upper-RIGHT                                 ⇒ CORE
  • Action photo + FIFA logo upper-LEFT + "Extra Sticker" text             ⇒ EXTRA
  • Action photo + FIFA logo upper-LEFT + vertical name on LEFT edge       ⇒ COCA-COLA

CRITICAL: a posed portrait is ALWAYS Core, no matter how shiny, gold, foil, or metallic the backdrop looks. A portrait can NEVER be an Extra.

══════════════════════════════════════════════════════════
STEP 3 — DETERMINE variantToken
══════════════════════════════════════════════════════════

▶ COCA-COLA (stickerType = "coca_cola_special")
    variantToken is ALWAYS "base_borderless". Coca-Cola stickers have no parallels.

▶ EXTRA (stickerType = "extra")
    Every Extra has a WHITE outer rim. Rarity is encoded in the BACKGROUND
    COLOR behind the action photo (NEVER in the rim).
    Map the background:
      Purple / burgundy           → "extra_purple"   (most common)
      Bronze / copper             → "extra_bronze"
      Silver metallic             → "extra_silver"
      Smooth gold gradient        → "extra_gold"     (rarest — smooth, never wrinkled)

▶ CORE (stickerType = null)
    Core stickers come in two finishes: BORDERED or CRUMPLE.

    Finish A — BORDERED. The photo backdrop behind the player is a smooth
    pale-cyan gradient (the standard Panini portrait backdrop — this is
    NOT itself a border). A solid-color rim runs along the cut edge.
    Mentally trace the OUTERMOST 3mm strip at the physical cut edge and
    map its color:

      No outer strip (photo meets the cut edge)         → "base_borderless"   (International Base)
      White 3mm strip                                   → "base_border"       (North American Base)
      Dark navy / denim / ocean blue                    → "blue"
      Fire-engine / crimson red                         → "red"
      Violet / grape / eggplant purple                  → "purple"
      Vivid emerald / grass green                       → "green"
      Pale mint / sage / light-jade green               → "swiss_green"       (Switzerland)
      Saturated orange                                  → "orange_amazon"     (Amazon exclusive)
      Pure black                                        → "black_1of1"        (1-of-1)

    Finish B — CRUMPLE. The photo backdrop behind the player is a
    WRINKLED / CREASED metallic foil with visible crinkle and fold lines
    (like crumpled aluminum foil). The player remains a posed studio
    portrait in front of this foil. Map the foil color:

      Gold foil   → "gold_crumple"           (iCollect online base)
      Blue foil   → "blue_crumple"
      Red foil    → "red_crumple"
      Purple foil → "purple_crumple"
      Green foil  → "green_crumple"
      Black foil  → "black_crumple_1of1"     (1-of-1)

    GOLD RULE for Core: there is NO smooth gold border in the main set.
    Any gold finish on a Core (portrait) sticker is "gold_crumple". A
    smooth gold gradient appears ONLY on action photos, and those are
    Extras → "extra_gold".

══════════════════════════════════════════════════════════
STEP 4 — EXTRACT playerName
══════════════════════════════════════════════════════════
Read from:
  Core      → horizontal name bar in the lower-center
  Extra     → horizontal name bar (black background) lower-center
  Coca-Cola → vertical text running up the LEFT edge

Transcription rules:
  • Return ALL CAPS exactly as printed.
  • Preserve accents and special characters ("MBAPPÉ", "Ø. SØRLOTH", "VINÍCIUS JR.").
  • Any printed form is valid: surname only ("HAALAND"), initial + surname
    ("L. MESSI"), or full name ("HARRY KANE"). Transcribe what you see.
  • Unfamiliar names are still valid — never return null because the name
    looks unusual. A partial transcription beats null.
  • Return null ONLY when the text is completely illegible (extreme glare,
    severe blur, full occlusion). A faint but readable name is NOT null.

══════════════════════════════════════════════════════════
COMMON MISTAKES — DO NOT MAKE THESE
══════════════════════════════════════════════════════════
1. The pale-cyan gradient backdrop behind every Core portrait is NOT a
   "blue" border. To return "blue", you must see a SEPARATE darker blue
   band at the cut edge, contrasting against the pale cyan inside.
2. The colored name bar inside the sticker is NOT the rim. The rim is the
   outermost 3mm strip at the physical cut edge. A red name bar inside a
   purple rim → variantToken = "purple". A red name bar inside no rim →
   "base_borderless".
3. Wrinkled / creased foil texture is ALWAYS a Core crumple variant,
   NEVER an Extra. Extras have smooth backgrounds.
4. A posed portrait with a gold backdrop is "gold_crumple", never
   "extra_gold". "extra_gold" only applies to action photos.
5. Coca-Cola and International Core base SHARE variantToken
   "base_borderless". Distinguish them by stickerType, decided in Step 2
   (portrait + horizontal name+stats ⇒ Core; action + vertical left-edge
   name ⇒ Coca-Cola).
6. When unsure between two adjacent border colors (blue vs purple, red vs
   purple), prefer the more common one unless the rarer color is clearly
   visible. A false rare is worse than a false base.
7. The surface the sticker is sitting on (tabletop, mat, sleeve, fingers)
   is OUTSIDE the cut edge and is never the rim.$prompt$
)
ON CONFLICT (key) DO UPDATE SET
  name        = EXCLUDED.name,
  guide_path  = EXCLUDED.guide_path,
  scan_prompt = EXCLUDED.scan_prompt;

INSERT INTO album_editions (album_type_id, key, name)
SELECT t.id, e.key, e.name
FROM album_types t
CROSS JOIN (VALUES
  ('north_america', 'North American (Host)'),
  ('international', 'International'),
  ('swiss_gold',    'Swiss Gold'),
  ('south_america', 'South American')
) AS e(key, name)
WHERE t.key = 'fifa_world_cup_2026'
ON CONFLICT (album_type_id, key) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO album_formats (album_type_id, key, name)
SELECT t.id, f.key, f.name
FROM album_types t
CROSS JOIN (VALUES
  ('softcover_standard',   'Softcover'),
  ('hardcover',            'Hardcover'),
  ('limited_hardcover',    'Limited Hardcover (Treasure Box)'),
  ('silver_hardcover',     'Silver Hardcover'),
  ('gold_hardcover',       'Gold Hardcover'),
  ('metallised_softcover', 'Metallised Softcover')
) AS f(key, name)
WHERE t.key = 'fifa_world_cup_2026'
ON CONFLICT (album_type_id, key) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO album_edition_formats (album_type_id, album_edition_id, album_format_id)
SELECT at.id, ae.id, af.id
FROM album_editions ae
JOIN album_types   at ON at.id = ae.album_type_id
JOIN album_formats af ON af.album_type_id = at.id
WHERE at.key = 'fifa_world_cup_2026'
  AND (
    af.key IN ('softcover_standard', 'hardcover')
    OR (af.key IN ('metallised_softcover', 'limited_hardcover') AND ae.key = 'swiss_gold')
    OR (af.key IN ('silver_hardcover', 'gold_hardcover')        AND ae.key = 'international')
  )
ON CONFLICT (album_edition_id, album_format_id) DO NOTHING;

-- ─── Seed: feature flags ──────────────────────────────────────────────────────

INSERT INTO feature_flags (key, enabled, rollout_pct, description) VALUES
  ('FEATURE_COCA_COLA_STICKERS', true,  100, NULL),
  ('FEATURE_EXTRA_STICKERS',     true,  100, 'Panini Extra Sticker inserts — 20-player foil set (4 rarities)')
ON CONFLICT (key) DO UPDATE SET
  enabled     = EXCLUDED.enabled,
  rollout_pct = EXCLUDED.rollout_pct,
  updated_at  = now();

-- ─── Seed: special stickers (CC, EX, HC, L) ──────────────────────────────────
-- Regular team stickers are seeded separately via scripts/seeds/.

INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = s.team_code),
  s.player_name, s.position, 'coca_cola_special', false
FROM (VALUES
  (981,  'CC1',  'ESP', 'Lamine Yamal',        'FWD'),
  (982,  'CC2',  'GER', 'Joshua Kimmich',      'MID'),
  (983,  'CC3',  'ENG', 'Harry Kane',          'FWD'),
  (984,  'CC4',  'MEX', 'Santiago Giménez',    'FWD'),
  (985,  'CC5',  'USA', 'Antonee Robinson',    'DEF'),
  (986,  'CC6',  'COL', 'Jefferson Lerma',     'MID'),
  (987,  'CC7',  'MEX', 'Edson Álvarez',       'MID'),
  (988,  'CC8',  'NED', 'Virgil van Dijk',     'DEF'),
  (989,  'CC9',  'CAN', 'Alphonso Davies',     'DEF'),
  (990,  'CC10', 'USA', 'Weston McKennie',     'MID'),
  (991,  'CC11', 'ARG', 'Lautaro Martínez',    'FWD'),
  (992,  'CC12', 'BRA', 'Gabriel Magalhães',   'DEF')
) AS s(number, album_code, team_code, player_name, position)
ON CONFLICT (album_type_id, album_code) DO UPDATE SET
  team_id     = EXCLUDED.team_id,
  player_name = EXCLUDED.player_name,
  position    = EXCLUDED.position;

INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id, 'base_borderless', 1, 'coca_cola'
FROM stickers
WHERE sticker_type = 'coca_cola_special'
ON CONFLICT (sticker_id, variant_type) DO NOTHING;

INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = s.team_code),
  s.player_name, s.position, 'extra', true
FROM (VALUES
  ( 993, 'EX1',  'ARG', 'Lionel Messi',         'FWD'),
  ( 994, 'EX2',  'POR', 'Cristiano Ronaldo',     'FWD'),
  ( 995, 'EX3',  'FRA', 'Kylian Mbappé',         'FWD'),
  ( 996, 'EX4',  'ESP', 'Lamine Yamal',          'FWD'),
  ( 997, 'EX5',  'ENG', 'Jude Bellingham',       'MID'),
  ( 998, 'EX6',  'BRA', 'Vinícius Júnior',       'FWD'),
  ( 999, 'EX7',  'BRA', 'Endrick',               'FWD'),
  (1000, 'EX8',  'GER', 'Jamal Musiala',         'MID'),
  (1001, 'EX9',  'GER', 'Florian Wirtz',         'MID'),
  (1002, 'EX10', 'ENG', 'Bukayo Saka',           'FWD'),
  (1003, 'EX11', 'ENG', 'Phil Foden',            'MID'),
  (1004, 'EX12', 'ESP', 'Rodri',                 'MID'),
  (1005, 'EX13', 'FRA', 'Antoine Griezmann',     'FWD'),
  (1006, 'EX14', 'ARG', 'Lautaro Martínez',      'FWD'),
  (1007, 'EX15', 'CAN', 'Alphonso Davies',       'DEF'),
  (1008, 'EX16', 'USA', 'Christian Pulisic',     'FWD'),
  (1009, 'EX17', 'MEX', 'Santiago Giménez',      'FWD'),
  (1010, 'EX18', 'BEL', 'Kevin De Bruyne',       'MID'),
  (1011, 'EX19', 'POR', 'Rafael Leão',           'FWD'),
  (1012, 'EX20', 'BRA', 'Neymar Jr.',            'FWD')
) AS s(number, album_code, team_code, player_name, position)
ON CONFLICT (album_type_id, album_code) DO UPDATE SET
  player_name = EXCLUDED.player_name,
  position    = EXCLUDED.position;

INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id,
       unnest(ARRAY['extra_purple', 'extra_bronze', 'extra_silver', 'extra_gold']),
       unnest(ARRAY[15, 16, 17, 18]),
       'retail'
FROM stickers
WHERE sticker_type = 'extra'
ON CONFLICT (sticker_id, variant_type) DO NOTHING;

INSERT INTO stickers
  (album_type_id, number, album_code, player_name, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code, s.city_name, 'museum', false
FROM (VALUES
  (1013, 'HC1',  'New York / New Jersey'),
  (1014, 'HC2',  'Los Angeles'),
  (1015, 'HC3',  'Dallas'),
  (1016, 'HC4',  'San Francisco Bay Area'),
  (1017, 'HC5',  'Miami'),
  (1018, 'HC6',  'Atlanta'),
  (1019, 'HC7',  'Seattle'),
  (1020, 'HC8',  'Boston'),
  (1021, 'HC9',  'Philadelphia'),
  (1022, 'HC10', 'Kansas City'),
  (1023, 'HC11', 'Houston'),
  (1024, 'HC12', 'Toronto'),
  (1025, 'HC13', 'Vancouver'),
  (1026, 'HC14', 'Mexico City'),
  (1027, 'HC15', 'Guadalajara'),
  (1028, 'HC16', 'Monterrey')
) AS s(number, album_code, city_name)
ON CONFLICT (album_type_id, album_code) DO UPDATE SET
  player_name = EXCLUDED.player_name;

INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id,
       unnest(ARRAY['base_border', 'base_borderless', 'blue', 'red', 'purple', 'green', 'black_1of1']),
       unnest(ARRAY[1, 1, 2, 3, 4, 5, 6]),
       'retail'
FROM stickers
WHERE sticker_type = 'museum' AND album_code LIKE 'HC%'
ON CONFLICT (sticker_id, variant_type) DO NOTHING;

INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id, 'orange_amazon', 7, 'amazon_exclusive'
FROM stickers
WHERE sticker_type = 'museum' AND album_code LIKE 'HC%'
ON CONFLICT (sticker_id, variant_type) DO NOTHING;

INSERT INTO stickers
  (album_type_id, number, album_code, team_id, player_name, position, sticker_type, is_foil)
SELECT
  (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026'),
  s.number, s.album_code,
  (SELECT id FROM teams WHERE fifa_code = 'SUI'),
  s.player_name, s.position, 'museum', true
FROM (VALUES
  (1029, 'L1',  'Stéphane Chapuisat', 'FWD'),
  (1030, 'L2',  'Alex Frei',          'FWD'),
  (1031, 'L3',  'Köbi Kuhn',          'MID'),
  (1032, 'L4',  'Roger Vonlanthen',   'FWD'),
  (1033, 'L5',  'Alain Geiger',       'DEF'),
  (1034, 'L6',  'Patrick Müller',     'DEF'),
  (1035, 'L7',  'Marco Streller',     'FWD'),
  (1036, 'L8',  'Hakan Yakin',        'MID'),
  (1037, 'L9',  'Xherdan Shaqiri',    'FWD'),
  (1038, 'L10', 'Granit Xhaka',       'MID')
) AS s(number, album_code, player_name, position)
ON CONFLICT (album_type_id, album_code) DO UPDATE SET
  player_name = EXCLUDED.player_name,
  position    = EXCLUDED.position;

INSERT INTO sticker_variants (sticker_id, variant_type, rarity_rank, availability)
SELECT id, 'swiss_green', 19, 'swiss_edition'
FROM stickers
WHERE album_code LIKE 'L%' AND sticker_type = 'museum' AND is_foil = true
  AND album_type_id = (SELECT id FROM album_types WHERE key = 'fifa_world_cup_2026')
ON CONFLICT (sticker_id, variant_type) DO NOTHING;
