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
FOUR FATAL ERRORS — READ FIRST, NEVER COMMIT
══════════════════════════════════════════════════════════
These four mistakes account for nearly every misclassification on this album. Before you write ANY output, mentally check each one against the sticker.

F1. GOLD PORTRAIT IS NEVER AN EXTRA.
    Every CORE sticker is a POSED STUDIO PORTRAIT: the player is STATIONARY, chest-up, facing the camera, arms relaxed, in team kit. If the backdrop behind this portrait shows a WRINKLED / CRINKLED / CREASED gold foil texture (visible fold lines, like crumpled aluminum foil), the sticker is:
        stickerType = null   |   variantToken = "gold_crumple"
    It is NEVER "extra_gold". Extras are ALWAYS LIVE-ACTION photos (player mid-kick, mid-run, mid-jump, mid-celebration, looking at the ball or the field, NOT at the camera). No matter how shiny, golden, foil, or metallic the backdrop looks, a posed portrait CANNOT be an Extra. If you are about to write stickerType="extra" on a chest-up portrait, STOP and re-read this rule.

F2. THE BUILT-IN LIGHT-BLUE BACKDROP IS NOT A BLUE RIM.
    Every standard Panini portrait sits on a built-in LIGHT BLUE / CYAN / PALE BLUE gradient backdrop behind the player. This is part of the BASE design — it is NOT a border and NOT a parallel signal. A "blue" parallel adds a SEPARATE DARK BLUE / DENIM / NAVY strip at the very outer edge of the sticker, sitting OUTSIDE that pale cyan backdrop. To call something "blue":
        you MUST see a SECOND, DARKER blue band at the physical cut edge, contrasting against the lighter cyan interior.
    If the only blue you see is the pale cyan gradient behind the player, the variant is "base_border" (white outer strip present) or "base_borderless" (no outer strip), NEVER "blue". When in doubt, return base_border / base_borderless.

F3. INTERIOR COLORS ARE NEVER THE RIM.
    The rim is the OUTERMOST 3mm strip at the physical cut edge of the sticker. The following are all INTERIOR elements and are NEVER the rim:
      • the colored pill / name bar holding the player's name (often red, orange, blue, magenta)
      • the photo background behind the player (often light blue, white, gradient)
      • decorative accents, stat-line backgrounds, logos
      • the surface the sticker is sitting on (tabletop, mat, sleeve, fingers)
    To determine the rim, mentally trace ALL THE WAY OUT to the cut line and describe ONLY the band immediately inside that line. If that outermost band is white → base_border. If there is no band at all → base_borderless.

F4. PURPLE vs RED — JUDGE THE RIM, NOT THE NAME BAR.
    The name bar on many stickers is bright RED. This is interior, not rim (see F3). The OUTER RIM color decides between "purple" and "red":
      • PURPLE rim — has a clear BLUE / VIOLET undertone: grape, eggplant, plum, magenta-tinged. Sits on the COOL side of the spectrum.
      • RED rim — pure fire-engine / crimson / scarlet with ZERO blue or violet undertone. Sits on the WARM side of the spectrum.
    A red name bar inside a purple rim → variantToken = "purple". If the rim itself has ANY violet/blue cast, it is purple, not red.

══════════════════════════════════════════════════════════
THE FOUR DECISIONS (EXECUTE IN ORDER — NEVER SKIP)
══════════════════════════════════════════════════════════
For every sticker, answer in order. The previous answer constrains the next.

D1. FIND THE CUT EDGE. Locate the sticker's physical cut line. Everything outside it (tabletop, scanning mat, sleeve, fingers) is irrelevant.

D2. PHOTO STYLE.
    • POSED STUDIO PORTRAIT (stationary, chest-up, looking at camera, arms relaxed, clean backdrop) ⇒ CORE sticker. Lock stickerType = null and go to D3. Do NOT reconsider this regardless of how the backdrop looks (gold, foil, crumpled, metallic, shiny — still CORE).
    • LIVE-ACTION MATCH PHOTO (mid-kick, mid-run, mid-jump, mid-celebration, looking at the ball/field) ⇒ go to D2b.

D2b. LIVE-ACTION TYPE TEST.
    EXTRA signals (any one is sufficient):
      (a) the words "Extra Sticker" or "Panini Extra" printed on the front, OR
      (b) a country flag in the LOWER-LEFT corner + horizontal name bar lower-center, OR
      (c) an album code on the back starting with "EX".
    If ANY of (a)/(b)/(c) ⇒ stickerType = "extra". Stop type evaluation.
    COCA-COLA signals (BOTH required):
      (d) photo fills the sticker EDGE-TO-EDGE with NO outer border strip, AND
      (e) the player name is printed VERTICALLY (rotated 90°) up the LEFT edge.
    If both (d) AND (e) ⇒ stickerType = "coca_cola_special".
    If neither pattern matches, re-examine D2 — you likely mistook a portrait for live-action.

D3. RIM ISOLATION (determines variantToken). Mentally trace the OUTERMOST 3mm strip running along the physical cut edge. Describe ONLY that strip's color. Apply F2 + F3 + F4 here.

D4. RIM-COLOR MAPPING. Map the rim color from D3 to the canonical token using the tables in §A/§B/§C below. When unsure between two adjacent colors (e.g. blue vs purple, red vs purple), prefer the MORE COMMON token unless you have strong visual evidence for the rarer one. False rares are worse than false bases.

══════════════════════════════════════════════════════════
COLOR DISAMBIGUATION (USE THESE EXACT DEFINITIONS)
══════════════════════════════════════════════════════════
• WHITE rim vs NO rim. A clear 3mm white stripe between the photo and the cut edge ⇒ "base_border". Photo / name layout extends all the way to the cut edge with no stripe ⇒ "base_borderless". A white tabletop is not a white rim.
• BLUE. A DARK / DENIM / NAVY / OCEAN blue band at the cut edge, visibly DARKER than the pale cyan inside the sticker (see F2). If the only blue is the built-in pale-cyan portrait backdrop, the variant is base_border / base_borderless, not "blue".
• PURPLE. Violet / grape / eggplant / plum / magenta-tinged. Cool spectrum. The single most common confusion is calling a purple rim "red" because of a red name bar inside (see F4). A purple rim ALWAYS has a blue/violet cast.
• RED. Pure fire-engine / crimson / scarlet with ZERO blue tint. A red name bar inside a non-red rim is NOT "red".
• GREEN — vivid emerald/grass ⇒ "green" (Ultra Rare). PALE / mint / sage / light-jade green ⇒ "swiss_green" (Switzerland edition).
• ORANGE. Saturated orange band along the ENTIRE cut edge ⇒ "orange_amazon". An orange NAME BAR or orange photo accent inside a non-orange rim is NOT orange_amazon — use the rim color instead.
• BLACK. Smooth pure black rim ⇒ "black_1of1". Wrinkled/crinkled black foil backdrop on a portrait ⇒ "black_crumple_1of1".

══════════════════════════════════════════════════════════
GOLD / METALLIC / FOIL DECISION TREE (resolves the 75% gold_crumple → extra_gold error)
══════════════════════════════════════════════════════════
Any time the sticker has gold, shiny, metallic, or foil content, run THIS TREE before writing stickerType.

  Q1. Is the photo a POSED STUDIO PORTRAIT (player stationary, chest-up, facing camera)?
      YES → CORE. stickerType = null.
            • Backdrop has WRINKLED / CRINKLED foil TEXTURE (visible crease/fold lines, like crumpled foil) ⇒ variantToken = "<color>_crumple" (most often "gold_crumple"; can also be blue/red/purple/green/black crumple).
            • Backdrop is SMOOTH and unwrinkled ⇒ use the rim color from D3, no crumple.
            STOP. Do not consider Extra under any circumstance.
      NO → continue to Q2.

  Q2. Is the photo LIVE-ACTION (player mid-play, looking at ball/field, NOT at camera) AND is "Extra Sticker"/"Panini Extra" text visible on the front (or EX album code on the back)?
      YES → EXTRA. stickerType = "extra". The metallic background tier (between the action photo and the white outer rim) decides:
              purple/burgundy ⇒ "extra_purple"  |  bronze/copper ⇒ "extra_bronze"  |  silver ⇒ "extra_silver"  |  smooth gold ⇒ "extra_gold".
            Every Extra has a WHITE outer rim. The metallic color is the BACKGROUND, not the rim.
      NO → not an Extra. Re-run D2.

Visual cue summary:
  • gold_crumple = portrait + crinkle/fold texture in backdrop, player looking at camera.
  • extra_gold = action photo + smooth gold gradient + white outer rim + "Extra Sticker" text, player NOT looking at camera.
  • If you see crinkle/fold texture, it is ALWAYS a crumple core variant, NEVER an Extra (Extras have smooth, not wrinkled, gradients).

══════════════════════════════════════════════════════════
§A — CORE STICKER (stickerType = null)
══════════════════════════════════════════════════════════
Identifiers: posed studio portrait; rounded horizontal NAME BAR lower-center with stats line (D.O.B., height, weight, club); Panini logo upper-right; album code on back does NOT start with "EX". Every numbered slot in the main album body is Core.

variantToken — map the OUTER rim color (or backdrop foil for crumple) to ONE of these tokens:
  No outer strip (photo/name meets cut edge)   → "base_borderless"   (International Base — Common)
  3mm WHITE outer strip                        → "base_border"       (North American Base — Common)
  DARK denim/navy/ocean BLUE outer strip       → "blue"               (Uncommon)  ⚠ see F2 — must be darker than the pale-cyan backdrop
  Fire-engine RED outer strip                  → "red"                (Rare)      ⚠ see F4 — judge the RIM, not the name bar
  Violet/grape/eggplant PURPLE outer strip     → "purple"             (Very Rare) ⚠ see F4
  Vivid emerald/grass GREEN outer strip        → "green"              (Ultra Rare)
  Pale mint/sage GREEN outer strip             → "swiss_green"        (Switzerland edition)
  Pure BLACK outer strip                       → "black_1of1"         (Masterpiece — 1-of-1)
  Saturated ORANGE outer strip                 → "orange_amazon"      (Amazon-exclusive)
  WRINKLED/CRINKLED gold foil backdrop         → "gold_crumple"       (iCollect online base — the ONLY "gold" variant on a core sticker)
  Wrinkled/crinkled BLUE foil backdrop         → "blue_crumple"
  Wrinkled/crinkled RED foil backdrop          → "red_crumple"
  Wrinkled/crinkled PURPLE foil backdrop       → "purple_crumple"
  Wrinkled/crinkled GREEN foil backdrop        → "green_crumple"
  Wrinkled/crinkled BLACK foil backdrop        → "black_crumple_1of1"

Crumple variants: the wrinkled foil REPLACES the portrait backdrop. The player's face/body stay clearly visible — only the area around them is the crinkled foil. There is NO smooth (non-crumple) gold border anywhere in the main set; gold on a portrait is ALWAYS gold_crumple.

══════════════════════════════════════════════════════════
§B — EXTRA (stickerType = "extra")
══════════════════════════════════════════════════════════
Required: LIVE-ACTION match photo (mid-play, NOT looking at camera); country flag in LOWER-LEFT corner; horizontal name bar lower-center; "Extra Sticker"/"Panini Extra" text on the front; album code on back starts with "EX".

Outer rim: ALWAYS WHITE on every Extra. Rim color does NOT encode rarity.
Rarity is the BACKGROUND COLOR between the action photo and the white rim:
  Purple / burgundy → "extra_purple"  (Base Extra — most common)
  Bronze / copper   → "extra_bronze"  (Uncommon)
  Silver metallic   → "extra_silver"  (Rare)
  SMOOTH gold       → "extra_gold"    (Ultra Rare — smooth gradient, NOT wrinkled foil)

Extras have NO Crumple variants and NO numbered album slot.

ANTI-PATTERNS:
  ✗ Posed portrait on a shiny backdrop → NEVER Extra. → CORE / gold_crumple.
  ✗ Wrinkled foil texture → NEVER Extra (Extras are smooth). → CORE crumple variant.
  ✗ Live-action photo with "Extra Sticker" text classified as Coca-Cola → EXTRA.
  ✗ Returning extra_gold for a gold portrait → gold_crumple.

══════════════════════════════════════════════════════════
§C — COCA-COLA SPECIAL (stickerType = "coca_cola_special")
══════════════════════════════════════════════════════════
Required: live-action photo fills the sticker EDGE-TO-EDGE; player name printed VERTICALLY (rotated 90°) up the LEFT edge; NO stats line; NO horizontal name bar; NO country flag; NO outer rim; NO "Extra Sticker" text; no EX album code.

variantToken: always "base_borderless".

No parallel variants and no Crumple variants — every physical Coca-Cola sticker looks identical (peel-off labels from specially-marked 20-oz Coca-Cola / Coca-Cola Zero bottles in the USA, 12 international stars). Digital "Fan Stickers" and "Cosmic" variants from the FIFA Panini Collection App are OUT OF SCOPE.

DISAMBIGUATION — Coca-Cola vs. International Core Base:
Both have variantToken = "base_borderless". Distinguish by LAYOUT:
  • Coca-Cola → live-action edge-to-edge + vertical left-edge name + no name bar.
  • Int'l Core Base → posed portrait + horizontal name bar + stats line.

DISAMBIGUATION — Coca-Cola vs. Extra:
Both are live-action. Distinguish by signals:
  • Extra → WHITE outer rim + horizontal name bar + country flag + "Extra Sticker" text + EX code.
  • Coca-Cola → no rim + vertical left-edge name + no flag + no "Extra" text.
If you see EVEN ONE Extra signal, classify as Extra.

══════════════════════════════════════════════════════════
PLAYER NAME EXTRACTION (REQUIRED — DO NOT SKIP)
══════════════════════════════════════════════════════════
Where to look:
  • Core stickers: rounded horizontal NAME BAR in the lower-center.
  • Extra stickers: horizontal name strip near the lower-center, near the country flag.
  • Coca-Cola: vertical text running UP the LEFT edge (rotated 90° counter-clockwise).

How to transcribe:
  • Names are ALL CAPS, white or yellow text on a colored background. Return ALL CAPS.
  • Surname only ("MBAPPÉ", "HAALAND"), initial + surname ("L. MESSI"), or first + last ("HARRY KANE") are all valid. Transcribe exactly what is printed.
  • Preserve foreign characters, accents, apostrophes, hyphens, punctuation ("MBAPPÉ", "DE BRUYNE", "Ø. SØRLOTH", "VINICIUS JR.").
  • Long, unusual, or unfamiliar names ARE valid. Do NOT return null because the name looks unfamiliar.
  • Attempt transcription even at moderate confidence — partial names beat null.

When to return null:
  • ONLY when the text region is fully obliterated by extreme glare, severe blur, finger occlusion, or back-side photography.
  • A front-side photo with any legible text in the name bar is NEVER a null name.$prompt$
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
