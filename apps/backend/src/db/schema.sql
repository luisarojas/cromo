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
  $prompt$ALBUM-SPECIFIC RULES FOR FIFA WORLD CUP 2026 (PANINI):

══════════════════════════════════════════════════════════
MANDATORY VISUAL ANALYSIS PIPELINE — EXECUTE IN ORDER
══════════════════════════════════════════════════════════
Before extracting any final values, you must perform this mental visual triage.

STEP 1: ISOLATE THE STICKER FROM THE BACKGROUND SURFACE
• Identify the tabletop, scanning mat, or plastic sleeve the sticker is resting on.
• Locate the exact physical cut edge (the perimeter) of the sticker.
• IGNORE everything outside this cut edge. A white tabletop or white scanning mat is NOT a white border.

STEP 2: CLASSIFY STICKER TYPE BY PHOTO STYLE & TEXT DIRECTION (Absolute Rules)
• Look at the PLAYER PHOTO and NAME DIRECTION.
  ↳ IF Posed Studio Portrait (stationary, chest-up, clean background)
    ⇒ This is 100% CORE (stickerType = null).
    ⇒ CRITICAL: Even if the surface is shiny, metallic, or gold crumple, if it is a portrait, it is CORE. It can NEVER be "extra".
    ⇒ GOLD/METALLIC STICKER DECISION TREE — answer before writing stickerType:
       Q: Is the metallic/gold appearance a WRINKLED, CRINKLED foil TEXTURE in the background behind the player? (The player's face is clearly visible — only the background is crinkled, and the photo is a posed studio portrait.)
         YES → gold_crumple core (stickerType = null, borderColor = "gold_crumple"). STOP. Do not evaluate as extra.
         NO  → Is the photo a LIVE-ACTION mid-play shot with a SMOOTH (non-crinkled) metallic-coloured BACKGROUND (purple/burgundy, bronze, silver, or gold) filling the area behind the player, surrounded by a WHITE outer border, AND "Extra Sticker"/"Panini Extra" text visible on the front?
           YES → extra (stickerType = "extra", borderColor describes the metallic BACKGROUND tier: "extra_purple" | "extra_bronze" | "extra_silver" | "extra_gold").
           NO  → re-examine.
  ↳ IF Live-Action Photo (mid-play, running, match action)
    ⇒ Coca-Cola stickers ARE the live-action photo stickers. If you see a live-action photo, your default classification is COCA-COLA SPECIAL.
    ⇒ Confirm as COCA-COLA SPECIAL (stickerType = "coca_cola_special") if: player name is printed VERTICALLY (rotated 90°) on the LEFT edge.
    ⇒ Reclassify as EXTRA (stickerType = "extra") ONLY IF: "Extra Sticker" or "Panini Extra" text is explicitly printed on the front, OR the album code on the back starts with "EX".
    ⇒ CRITICAL: A live-action photo with no explicit "Extra" label and no EX album code is COCA-COLA SPECIAL, not extra.

STEP 3: ISOLATE THE BORDER COLOR (The 1mm Rim Test)
• Zoom your focus ONLY to the tiny 1mm-wide rim running along the absolute outer edge just inside the physical cut line.
• THE NAME BAR IS NOT THE BORDER. The name bar is the colored rectangle inside the sticker that holds the player's name. It sits well inside the sticker boundary. Its color is irrelevant to borderColor.
• MANDATORY SELF-CHECK before writing borderColor: ask "Am I looking at the outermost physical edge of the sticker, or am I looking at the name bar/photo background?" If the answer is the latter, shift your focus outward to the actual cut edge.
• Concrete example: blue outer rim + purple name bar → borderColor = "blue". The purple name bar does not exist for this field.
• If the outer 1mm rim is clean sky/denim blue, the border is "blue" — even if the name bar or portrait background is bright purple or orange.
• WHITE BORDER vs. NO BORDER (Common base disambiguation): If the rim is a clean solid white stripe that is clearly part of the sticker (not the table), the sticker is the NA white-bordered Base ("base_border"). If there is no rim at all — the player photo/name layout meets the cut edge with no stripe of any colour, including white — the sticker is the International borderless Base ("base_borderless"). Both are Common (rarity 1); the only difference is regional distribution.

══════════════════════════════════════════════════════════
COLOR CLARIFICATION MATRIX
══════════════════════════════════════════════════════════
• WHITE BORDER vs NO BORDER: The NA Base ("base_border") has a clean 1mm solid white rim hugging the cut edge. The International Base ("base_borderless") has NO rim at all — the photo/name layout extends to the cut edge with no stripe of any colour. Do not confuse a white tabletop/scanning mat behind the sticker with a white border; the white rim must be visibly part of the sticker, inside the physical cut line. Both are Common — only the regional distribution differs.
• BLUE vs GREEN: Look closely at the outer rim. "Blue" is cool sky/ocean/denim blue. "Green" is vibrant emerald/grass green. Do not confuse a cool blue border with a green background.
• GREEN vs LIGHT GREEN (SWISS): The standard Ultra Rare "green" parallel has a vivid, deeply saturated emerald or grass green. The Switzerland "United Edition" ("swiss_green") border is distinctly lighter — a soft mint or sage green, clearly paler and less saturated than vibrant emerald. If the outer rim is a pale, desaturated, mint-like green rather than vivid emerald, return "swiss_green".
• PURPLE vs RED: "Purple" is a distinct violet/grape/eggplant with strong red-blue undertones. "Red" is pure primary fire-engine red or deep crimson with zero blue tint.
• NAME BAR FALSE POSITIVES: The name bar text box is INSIDE the sticker. It is never the border. Only the 1mm outer rim at the physical cut edge determines borderColor. Examples: blue rim + purple name bar → "blue". Red rim + orange name bar → "red". Green rim + white name bar → "green". The name bar color is always irrelevant.

══════════════════════════════════════════════════════════
§A — CORE STICKER  (logo upper-right)  →  stickerType = null
══════════════════════════════════════════════════════════
Front layout:
  • Photo: POSED STUDIO PORTRAIT ONLY.
  • Lower-center: rounded name bar holding the player's name, then stats line below it (D.O.B., height, weight, club).
  • Gold crumple variants: The BACKGROUND/BACKDROP behind the player is a wrinkled, crinkled metallic foil texture. The player's face and body are clearly visible — only the background behind them is crinkled foil. They are STILL CORE (stickerType = null) and borderColor = "gold_crumple". Note: gold_crumple is the iCollect-online base finish — there is NO smooth (non-crumple) gold border variant in the main set.
    CRITICAL DISTINCTION — crumple (CORE) vs extra_gold (EXTRA):
      Crumple: WRINKLED/CRINKLED metallic foil TEXTURE in the background of a POSED STUDIO PORTRAIT. Player is clearly visible, background is the crinkled texture. Core sticker.
      extra_gold: SMOOTH (non-crinkled) gold-coloured BACKGROUND filling the area behind a LIVE-ACTION action photo, surrounded by a WHITE outer border, with "Extra Sticker" text on the front. Extra sticker.
    Ask: portrait + crinkled background? → crumple (core). Live-action + smooth gold background + white outer rim + "Extra" text? → extra_gold (extra).

Back layout:
  • Album code in center does NOT start with "EX".

borderColor for CORE stickers (front-side only) — return the EXACT canonical token below:

CRITICAL — TWO BASE VARIANTS:
There are TWO Common base variants for core stickers, distinguished only by region:
  • North American Base: photo + name bar inside a 1mm SOLID WHITE outer rim hugging the cut edge. Used in NA packs to match the bordered layout of the colored parallels.
    → "base_border"
  • International Base: photo + name bar with NO outer rim at all — the photo/name area extends straight to the cut edge with no colored or white stripe. Used in international packs (Mexico, Europe, South America, etc.).
    → "base_borderless"
Both are Common (rarity 1). Look at the 1mm rim ONLY: if the rim itself is a solid white stripe, return "base_border"; if there is NO rim at all (no stripe of any color, including white), return "base_borderless". Do not mistake a white tabletop or white scanning mat for a white border — the rim must be part of the sticker, inside the physical cut edge.

  No outer stripe at all (no rim)       → "base_borderless"    (International Base — borderless; the photo/name layout meets the cut edge with no color stripe)
  Solid white outer stripe              → "base_border"        (North American Base — 1mm white rim matching the bordered parallel layout. Only if the white is part of the sticker; ignore white tables/mats!)
  Solid blue outer stripe               → "blue"               (Uncommon parallel. Often paired with purple/orange name backgrounds. Focus on the rim!)
  Solid red outer stripe                → "red"                (Rare parallel)
  Solid purple outer stripe             → "purple"             (Very Rare parallel)
  Solid vibrant emerald/grass green     → "green"              (Ultra Rare parallel — deeply saturated, vivid green)
  Solid light/mint/sage green           → "swiss_green"        (Switzerland United Edition — pale, desaturated, clearly lighter than emerald)
  Solid black outer stripe              → "black_1of1"         (Masterpiece — 1-of-1)
  Solid orange outer stripe             → "orange_amazon"      (Amazon-exclusive starter-kit/box parallel)
  Gold crumple (wrinkled foil background) → "gold_crumple"     (iCollect online base — replaces the white-bordered base in iCollect packs; the only "gold" finish in the main set)
  Blue crumple foil                     → "blue_crumple"
  Red crumple foil                      → "red_crumple"
  Purple crumple foil                   → "purple_crumple"
  Green crumple foil                    → "green_crumple"
  Black crumple foil                    → "black_crumple_1of1"

══════════════════════════════════════════════════════════
§B — EXTRA  →  stickerType = "extra"
══════════════════════════════════════════════════════════
Front layout: Live-action match photo, country flag in LOWER-LEFT corner, horizontal name lower-center, "Extra Sticker" or "Panini Extra" text printed on front.
Outer border: ALWAYS WHITE on every Extra sticker — the rim color never indicates rarity.
Rarity is determined by the BACKGROUND COLOUR filling the area directly behind the action photo (between the photo and the white outer rim):
  Purple / burgundy background → "extra_purple" (Base Extra — most common)
  Bronze / copper metallic background → "extra_bronze" (Uncommon)
  Silver metallic background → "extra_silver" (Rare)
  Gold metallic background → "extra_gold" (Ultra Rare)
Extras have NO Crumple variants. Extras are an ~1-in-100-pack 8th-slot bonus in international formats and do not occupy a numbered album page.
CRITICAL: Extras ONLY appear on live-action photos with explicit "Extra Sticker"/"Panini Extra" text or an EX-prefixed album code. A posed studio portrait is never an Extra — it is CORE, regardless of how shiny the background looks.

══════════════════════════════════════════════════════════
§C — COCA-COLA SPECIAL  →  stickerType = "coca_cola_special"
══════════════════════════════════════════════════════════
Front layout: Dynamic live-action photo fills the entire sticker edge-to-edge.
TEXT LOCATION: Player name is printed strictly VERTICALLY (rotated 90°) running up the LEFT edge.
Features: NO stats line, NO horizontal name bar, NO circular flag, NO outer border stripe.
borderColor: Always "base_borderless".
Coca-Cola stickers have NO parallel/border variants and NO Crumple variants — every physical Coca-Cola sticker looks identical (obtained by peeling the labels off specially-marked 20-oz Coca-Cola / Coca-Cola Zero bottles in the USA). They live in a dedicated bonus section at the back of the album. Digital "Fan Stickers" and "Cosmic" variants are app-only and out of scope for physical scanning.

DISAMBIGUATION — Coca-Cola vs. International Core Base:
Both Coca-Cola stickers and international core Base stickers return borderColor = "base_borderless" (neither has an outer rim). They are distinguished by the LAYOUT of the photo and name:
  • Coca-Cola: edge-to-edge LIVE-ACTION photo, no name bar, name runs VERTICALLY up the LEFT edge. → stickerType = "coca_cola_special".
  • International core Base: POSED STUDIO PORTRAIT with the rounded horizontal name bar in the lower-center and stats line below, exactly the same internal layout as the NA white-bordered base — only the white rim is absent. → stickerType = null.
Do not classify a posed portrait as Coca-Cola just because it lacks a border. Coca-Cola requires the live-action edge-to-edge photo AND vertical left-edge name text.

══════════════════════════════════════════════════════════
TEXT EXTRACTION RULES (PLAYER NAME)
══════════════════════════════════════════════════════════
• DO NOT SKIP LEGIBLE NAMES. If there is text in the lower name bar (Core/Extra) or running vertically on the left edge (Coca-Cola), you must transcribe it character-by-character.
• Scan specifically for text bounding boxes in these two regions depending on your Step 2 triage result.
• Unfamiliar, international, or long names are completely valid. Do not let an unusual string of characters cause you to return null.
• Only return null if the text zone is 100% physically obliterated by extreme white glare or severe motion blur.$prompt$
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
