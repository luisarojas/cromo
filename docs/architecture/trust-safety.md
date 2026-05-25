# Trust & Safety — Detailed Design

> **Parent document:** [`overview.md`](overview.md#document-map) — this file is the detailed expansion of the Trust & Safety system. `overview.md` covers cross-cutting context (product, architecture, phases, cost, glossary); this file is the canonical reference for its subsystem.
>
> **Feature flag:** `FEATURE_TRUST_SAFETY` (disabled by default — see § 11 below). The system can ship to production gated and be enabled later.

This document describes the post-trade rating system, user reporting mechanism, and admin moderation system designed to build trust, handle bad-faith behaviour (cancellations after acceptance, physical exchange no-shows, harassment, fake/damaged stickers), and empower administrators.

---

## 1. Rating System

### Design: Binary Ratings

Users rate each other after a trade is marked `completed`. The scale is **thumbs up / thumbs down** (binary), not 1–5 stars. Rationale:
- Binary ratings avoid gaming and conflict in a casual community context (a 3-star "neutral" invites hurt feelings and gaming)
- Physical sticker exchanges have a clear binary outcome: "Did this person show up with authentic stickers?" Yes or no.
- Aggregate display (`"47 trades · 94% positive"`) is immediately legible without explanation
- Matches real-world models like Facebook Marketplace and eBay's simplified feedback

### Rating Window

- Rating opens when `trade_requests.status` transitions to `'completed'`
- Rating closes 14 days after `completed_at` (allows time to discover fake or damaged stickers)
- Outside this window, the rating button is disabled
- One rating per user per trade (enforced via `UNIQUE (trade_id, rater_id)`)

### Trust Score Tiers

The public profile displays a trust tier badge derived from the positive rate among **all received ratings** (or the last 50 if the user has > 50 ratings):

| Tier | Badge | Colour | Condition |
|---|---|---|---|
| New Trader | None | Grey | `< 3` received ratings |
| Trusted Trader | Checkmark shield | Green | ≥ 3 ratings, ≥ 80% positive |
| Good Trader | Thumbs up | Blue | ≥ 3 ratings, 60–79% positive |
| Trade with Caution | Warning triangle | Amber | ≥ 5 ratings, `< 60%` positive |

Profile display: **"47 trades · 94% positive"** displayed prominently on the user's profile card and `/profile/[username]` page. Recent feedback comments (last 5, anonymised) shown below. No percentage displayed on trade match cards — only the badge and trade count.

### Rating Comments

Optional, capped at 500 characters. Comments are public on the rated user's profile, attributed by username only.

**Privacy:** On account deletion (`users.deleted_at` set), both given and received ratings for that user are anonymised:
- `rater_id` set to `NULL`
- `comment` cleared to empty string
- Counts and `is_positive` flags retained (allows aggregate trust score to remain accurate)

---

## 2. User Reporting

### Report Categories

Specific to sticker trading:
- `harassment` — Hostile, threatening, or abusive messages
- `cancelled_after_accept` — Accepted a trade then cancelled without reasonable cause
- `no_show` — Agreed to physical exchange and did not appear
- `fake_stickers` — Sent or attempted to trade non-authentic stickers
- `damaged_stickers` — Sent stickers in significantly worse condition than represented
- `spam` — Bulk messaging or promotional content
- `underage` — Apparent violation of the 13+ age requirement
- `other` — Catch-all; requires description (10–2,000 characters)

### Report Submission

- **Who can report:** Any verified user (email verified)
- **Duplicate prevention:** One open/under-review report per reporter–reported user pair per category. A new report can be filed after the previous one is resolved. Enforced at API layer with a pre-insert query check; returns `409 Conflict` if a duplicate exists.
- **Description required:** 10–2,000 characters
- **Trade context:** Optional `tradeId` link for reports tied to a specific trade
- **Self-reporting prevented:** `CHECK (reporter_id <> reported_user_id)`

### Report Lifecycle

```
open → under_review → resolved    (admin took action: warning, soft ban, hard ban)
open → dismissed                   (admin: clearly frivolous or not credible)
```

Status transitions:
- Report created with status `'open'`
- Admin can move to `'under_review'` while investigating
- Admin resolves to `'resolved'` (action taken) or `'dismissed'` (no action needed)
- Resolution requires an optional note (max 1,000 chars)

### Reporter Notifications

When a report's status changes to `'resolved'` or `'dismissed'`, the reporter receives an in-app notification (not email, to prevent escalation):
- **Message:** "Your report has been reviewed."
- **No detail:** Reporter is not told which action was taken (if any) to preserve privacy of both parties and prevent gaming of future reports

### Auto-flag Threshold

When a user has 3 reports against them in `status IN ('open', 'under_review')` filed within the past 30 days (counted from `user_reports.created_at`, regardless of category — except `'underage'` which is excluded; resolved/dismissed reports do not count):
1. A `'soft'` ban is automatically issued with `banned_by` set to the system account (`_system` user, UUID `00000000-0000-0000-0000-000000000099`)
2. `expires_at` is set to `now() + INTERVAL '48 hours'` (temporary hold)
3. All 3 open reports move to `status = 'under_review'`
4. An audit log entry is written: `action = 'auto_soft_ban_triggered'`, metadata includes the 3 report IDs
5. All admin users receive an internal notification

This is a **temporary hold only**, not a permanent ban. An admin must review the reports and decide on final action within the 48-hour window.

**Exception:** The `'underage'` category does not count toward the auto-flag threshold. Reports in this category always create an `'under_review'` report immediately for mandatory human review.

---

## 3. Ban System

### Ban Types

Bans are rows in the `user_bans` table (not a column on `users`), allowing full history, lifting, expiry, and audit trail.

**Soft ban:**
- User can log in and manage their collection
- User **cannot:**
  - Initiate new trades (`POST /api/v1/trade/requests`)
  - Send trade messages (`POST /api/v1/trade/requests/:id/messages`)
  - Rate other users (`POST /api/v1/users/:id/ratings`)
  - Accept incoming trade requests (`PATCH /api/v1/trade/requests/:id` with status change)
  - Appear in other users' trade matches
- Profile remains visible but shows a "soft restricted" notice
- Good for repeat cancellers, harassers, or first-offense violators needing a cooldown

**Hard ban:**
- Full account suspension
- Login returns `403` with a message: "Your account has been suspended. Please contact support."
- Profile shows "account unavailable"
- Collection data is not destroyed (allows future reinstatement if appealed)
- Good for severe violations: sending fake stickers, threats, underage verification failure

### Ban Properties

- `ban_type` — `'soft'` or `'hard'`
- `reason` — 5–1,000 characters; required
- `report_id` — Optional; links to the triggering report (if any)
- `banned_by` — Admin UUID who issued the ban (or system UUID for auto-bans)
- `expires_at` — `NULL` for permanent; timestamp for temporary bans
- `lifted_at` — `NULL` if active; timestamp when manually lifted by an admin
- `lifted_by` — Admin UUID who lifted the ban
- `lift_reason` — Optional note (max 500 chars) explaining the lift

### Ban Enforcement Points

Ban state is determined by querying `user_bans` with status flags and cached in Redis (`user:{id}:ban_status`, 2-minute TTL) for performance.

**Hard ban enforcement:**
- Checked at login (`POST /auth/login`) — if an active hard ban exists, return `403` before issuing JWT

**Soft ban enforcement:**
- Checked via middleware on:
  - `POST /api/v1/trade/requests` (initiate a trade)
  - `POST /api/v1/trade/requests/:id/messages` (send a message)
  - `PATCH /api/v1/trade/requests/:id` with status change to `'accepted'` (accept a trade)
  - `POST /api/v1/users/:id/ratings` (submit a rating)
- Soft-banned users are also excluded from appearing in other users' trade match results

### Lifting a Ban

An admin can manually lift a ban at any time via `POST /api/v1/admin/users/:id/bans/:banId/lift`, which sets:
- `lifted_at` to `now()`
- `lifted_by` to the admin's user ID
- `lift_reason` to the provided note

The ban record is retained (audit trail). An audit log entry is written: `action = 'user_ban_lifted'`.

Conversely, when `expires_at` passes, a temporary ban naturally expires. No background job is needed — the check middleware queries the active ban on each request (with Redis caching) and will see that the ban has expired.

### Interaction with Account Deletion

- `users.deleted_at` is the GDPR/PIPEDA erasure mechanism and is independent of bans
- A hard-banned user who requests account deletion is processed normally: PII is anonymised, but the ban record is retained
- To prevent ban evasion via account re-registration, a new column `hashed_email` is added to `users` (SHA-256 of lowercase email) and retained after soft-delete
- At registration time, check if any deleted user with a matching `hashed_email` had an active hard ban — if so, reject the new registration with `403`

---

## 4. Schema Design

### `trade_ratings` Table

```sql
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

CREATE INDEX idx_trade_ratings_rated_user
  ON trade_ratings(rated_user_id, created_at DESC);
CREATE INDEX idx_trade_ratings_trade_id
  ON trade_ratings(trade_id);
```

### `user_reports` Table

```sql
CREATE TABLE user_reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      UUID NOT NULL REFERENCES users(id),
  reported_user_id UUID NOT NULL REFERENCES users(id),
  trade_id         UUID REFERENCES trade_requests(id),
  category         TEXT NOT NULL CHECK (category IN (
                     'harassment', 'cancelled_after_accept', 'no_show',
                     'fake_stickers', 'damaged_stickers', 'spam',
                     'underage', 'other'
                   )),
  description      TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  status           TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'under_review', 'resolved', 'dismissed')),
  resolved_by      UUID REFERENCES users(id),
  resolved_at      TIMESTAMPTZ,
  resolution_note  TEXT CHECK (char_length(resolution_note) <= 1000),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (reporter_id <> reported_user_id)
);

CREATE INDEX idx_user_reports_reported_user
  ON user_reports(reported_user_id, created_at DESC);
CREATE INDEX idx_user_reports_status
  ON user_reports(status, created_at ASC)
  WHERE status IN ('open', 'under_review');
CREATE INDEX idx_user_reports_reporter
  ON user_reports(reporter_id);
```

### `user_bans` Table

```sql
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

CREATE INDEX idx_user_bans_user_id
  ON user_bans(user_id, created_at DESC);
CREATE INDEX idx_user_bans_active
  ON user_bans(user_id)
  WHERE lifted_at IS NULL AND (expires_at IS NULL OR expires_at > now());
```

### Additions to Existing Tables

The columns required by the Trust & Safety system are already part of the V1 schema (overview.md §7.2):
- `users.hashed_email` — SHA-256(lowercase(email)); retained after soft-delete for ban-evasion prevention
- `user_settings.show_trust_score_public` — user preference to display the trust badge on their public profile

No `ALTER TABLE` migration is required when introducing this system, because the columns ship in V1. The Trust & Safety **tables** (`trade_ratings`, `user_reports`, `user_bans`) are likewise V1, but their **logic** is gated behind `FEATURE_TRUST_SAFETY` (see §11 below) so the system can launch in a disabled state and be enabled when ready.

---

## 5. API Endpoints

All endpoints require feature flag `FEATURE_TRUST_SAFETY` to be enabled; return `404` if disabled.

### Ratings Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/trade/requests/:tradeId/ratings` | Rater (party to trade) | Submit a rating. Body: `{ isPositive: boolean, comment?: string }`. Returns `201`. Returns `403` if soft-banned, outside 14-day window, or hard-banned. Returns `409` if already rated. |
| `GET` | `/api/v1/users/:id/ratings` | Public if profile public; `user_settings.show_trust_score_public = true` | Paginated list of received ratings. Query: `?cursor=&limit=20&type=received\|given`. Returns `200` with trust score summary. Cached 10 min. |
| `GET` | `/api/v1/trade/requests/:tradeId/ratings` | Rater (party to trade) | Both ratings for a trade (or `null` if not yet submitted). Returns `200`. Used for post-trade rating prompt. |

### Reports Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/users/:id/reports` | Any verified user | Submit a report. Body: `{ category, description, tradeId? }`. Returns `201` with report object. Returns `409` if duplicate open report exists. Triggers auto-flag check. |
| `GET` | `/api/v1/users/me/reports/submitted` | Own user | List reports the current user has submitted (own moderation history). Returns `200` paginated. |

### Admin Reports Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/admin/reports` | Admin | List all reports. Query: `?status=open\|under_review\|resolved\|dismissed&category=&cursor=&limit=100`. Default sort: oldest first (FIFO moderation). Returns `200` paginated. |
| `GET` | `/api/v1/admin/reports/:reportId` | Admin | Full report detail: description, reporter profile, reported user profile with trust score + ban history, linked trade context (if present), all prior reports against the reported user. Returns `200`. |
| `PATCH` | `/api/v1/admin/reports/:reportId` | Admin | Change report status. Body: `{ status: 'under_review' \| 'resolved' \| 'dismissed', resolutionNote?: string }`. Returns `200`. Writes to `audit_log`. |

### Admin Bans Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/admin/users/:id/bans` | Admin | Create a ban. Body: `{ banType: 'soft' \| 'hard', reason, reportId?, expiresAt? }`. Returns `201`. Clears Redis `user:{id}:ban_status`. Writes to `audit_log`. |
| `GET` | `/api/v1/admin/users/:id/bans` | Admin | Full ban history (active, lifted, expired). Returns `200` paginated. |
| `POST` | `/api/v1/admin/users/:id/bans/:banId/lift` | Admin | Lift a ban. Body: `{ liftReason: string }`. Returns `200`. Clears Redis `user:{id}:ban_status`. Writes to `audit_log`. |
| `GET` | `/api/v1/admin/users/:id/trust-summary` | Admin | Aggregate view: trust score, ban history, open reports count, recent ratings. Returns `200`. Used on admin user detail page. |

### User-Facing Ban Status Endpoint

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/users/me/ban-status` | Own user | Check personal ban status. Returns `200` with `{ banned: false }` or `{ banned: true, type: 'soft' \| 'hard', expiresAt?: string, message: string }`. Used to show restriction banner. |

### Rate Limits (Additions to overview.md §6.4)

| Endpoint | Limit | Reason |
|---|---|---|
| `POST /api/v1/trade/requests/:id/ratings` | 2 per trade per user | Natural limit (one per direction) |
| `POST /api/v1/users/:id/reports` | 5 per hour per user | Prevent report-bombing |
| `GET /api/v1/users/:id/ratings` | 100 per hour | Public endpoint; caching mitigates |
| `PATCH /api/v1/admin/reports/:id` | 60 per hour per admin | Normal moderation pace |

---

## 6. Redis Cache Keys

All keys follow the `{domain}:{key}:{id}` naming pattern established in overview.md §6.

| Key | Content | TTL | Invalidated when |
|---|---|---|---|
| `user:{id}:trust_score` | `{ total: int, positive: int, rate: float, tier: string, updatedAt: ISO8601 }` | 10 minutes | New rating submitted for this user |
| `user:{id}:ban_status` | `null` (no ban) or `{ type: 'soft' \| 'hard', expiresAt: ISO8601 \| null }` | 2 minutes | Ban created, lifted, or expires; soft ban with `expires_at` in past expires naturally on refresh |
| `admin:pending_reports` | Integer count of reports with status in `['open', 'under_review']` | 5 minutes | Report created or status changed |

---

## 7. Admin UI

New section added to the admin sidebar at `/admin/trust/`.

### Reports Queue (`/admin/trust/reports`)

The primary moderation workbench. Default view: `status = 'open'`, sorted oldest-first (FIFO fairness).

**Features:**
- Filter bar: status dropdown, category chips, date range picker
- Report row card showing:
  - Category chip (colour-coded: red = `fake_stickers` / `harassment`, orange = `no_show`, yellow = `spam`)
  - `"User A reported User B"` with clickable avatar links
  - Trade context link if `trade_id` present
  - Time since submission
  - Reported user's trust score badge and ban status at a glance
- Click row to open detail panel (side panel, no navigation)

**Detail panel:**
- Full report text
- Reported user profile summary: avatar, username, trust score, total trades, active ban status, count of other open reports against this user
- Trade conversation excerpt (if linked): last 10 messages, read-only
- Action buttons (disabled if report not in `'open'` status):
  - `"Mark Under Review"` — moves to `'under_review'`, optionally add a note
  - `"Warn & Resolve"` — sets to `'resolved'`, no ban; admin provides a note
  - `"Soft Ban"` — modal with duration picker (24h, 48h, 7d, 30d, permanent), reason field pre-filled from category slug, optional link to the report
  - `"Hard Ban"` — same modal, type = hard; requires manual reason
  - `"Dismiss"` — sets to `'dismissed'` (not credible or frivolous); admin provides a note
- All actions log to `audit_log`: `action = 'report_status_changed' | 'user_banned' | 'user_ban_lifted'`, metadata includes IDs and action details

### Banned Users (`/admin/trust/bans`)

Table of all bans (active, expired, lifted). Columns:
- Username / email (link to `/admin/trust/users/:id`)
- Ban type chip (`soft` / `hard`)
- Reason (truncated, full text on hover)
- Banned at
- Expires at (or "Permanent", or grey timestamp if already expired)
- Status: "Active", "Lifted", or "Expired"
- Banned by (admin username)
- Actions: `"Lift ban"` button (opens confirmation modal with lift reason field)

**Filter dropdown:** Active / All / Lifted / Expired. Default: Active.

### User Lookup (`/admin/trust/users/:id`)

Accessed by clicking user links throughout the admin area or searching username/email in the admin sidebar.

**Content:**
- User profile card: avatar, username, email, account age, `deleted_at` status
- Trust summary: total trades, positive rate, trust tier badge, total ratings received/given
- Recent ratings: last 10 comments (both positive and negative) with rater username and date
- Reports section:
  - Open reports against this user (with categories and submitter)
  - Resolved/dismissed reports count
- Ban history: table of all bans (active, lifted, expired) with type, reason, dates, who issued/lifted, and lift reason
- Audit log: last 20 actions taken by this user (entries from `audit_log` where `user_id = :id`)
- Quick action buttons: `"Soft Ban"`, `"Hard Ban"`, `"Lift All Bans"` (if active bans exist)

### Auto-flag Dashboard Banner

When the auto-flag threshold has triggered (3 reports → auto soft ban):
- Yellow banner displays at the top of all `/admin/*` pages for 24 hours
- Text: `"2 users were auto-flagged for review in the last 24h"`
- Clicking the banner filters the Reports queue to show only `status = 'under_review'` AND `banned_by = '00000000-0000-0000-0000-000000000099'` (the system user)
- Acknowledging (or closing) the banner clears it from session

---

## 8. Frontend

### Trust Badge Component

A reusable badge component used in two places:
- User profile page `/profile/[username]` — shows full trust summary: avatar, username, trust tier badge, trade count, positive rate percentage, and recent feedback comments
- Trade match cards (on `/matches` and similar) — shows small badge + trade count only (no percentage)

Component accepts `userId` and optional `size` prop (`'small'` | `'large'`); fetches and caches trust data from `GET /api/v1/users/:id/ratings`.

### Post-Trade Rating Prompt

Shown on the trade detail page (`/trade/[id]`) when:
- Trade `status = 'completed'`
- Current time is within 14 days of `completed_at`
- Current user hasn't yet submitted a rating

**UI:** Modal or in-page card with:
- Counterpart's avatar and username
- Explanation: "Rate this trade to help build community trust"
- Thumbs up / thumbs down buttons
- Optional comment field (500 char max)
- Submit button
- On success: confirmation message + redirect to profile or back to trade

**On completion:** Fetches the trade's ratings via `GET /api/v1/trade/requests/:tradeId/ratings` to show both parties' ratings.

### Report User Modal

Accessible from:
- User profile page (`/profile/[username]`) — `"Report user"` link in the menu
- Trade detail page — `"Report user"` option in the trade menu
- User card hover (optional: `"..."` button)

**Modal form:**
- Dropdown: Report category (8 options)
- Text area: Description (10–2,000 chars)
- Optional: Link to a specific trade if opened from a trade detail
- Validation: Prevent submission if category not selected or description too short
- On submission:
  - POST to `POST /api/v1/users/:id/reports`
  - Show loading state
  - On `409` (duplicate open report): show error message
  - On `201`: confirmation message, close modal
- Loading states and error messages match the app's existing error handling pattern

### Ban Status Banner

Shown to a banned user on their own pages (profile, settings, collection):
- **Soft ban:** Yellow banner: `"Your account has temporary trading restrictions. [Learn more] [Appeal]"`
- **Hard ban:** Red banner: `"Your account has been suspended. Please contact support for more information."`
- Banners show expiry time (if temporary) or "Permanent"
- `[Learn more]` link goes to `/help/account-restrictions`
- `[Appeal]` link opens a contact form (email or support ticket)

---

## 9. Privacy & PIPEDA Compliance

### Rating Erasure

When a user requests account deletion (overview.md §23.5):
- All ratings given by that user have their `comment` cleared to empty string
- All ratings received by that user have their `comment` cleared to empty string
- `rater_id` and `rated_user_id` foreign keys are **not** set to NULL (would violate the FK and break aggregate queries); instead, the API layer treats any reference to a `users` row with `deleted_at IS NOT NULL` as `[Deleted User]` in responses

**Implementation:** In the account deletion handler, after setting `deleted_at`:
```sql
UPDATE trade_ratings SET comment = '' WHERE rater_id = $userId;
UPDATE trade_ratings SET comment = '' WHERE rated_user_id = $userId;
-- API layer responses replace deleted users' identities with the placeholder "[Deleted User]"
```

### Report Description Retention

- Reports are retained for 2 years after `resolved_at` (operational necessity: moderation record)
- After 2 years, the `redact-old-reports` scheduled job (overview.md §34.1) sets the description to `'[redacted]'`
- `resolved_by`, `resolution_note`, and metadata remain (audit trail)

### Ban Reason Retention

- Ban reasons are retained indefinitely (moderation records; operational necessity)
- Not exposed via the user data export endpoint (`GET /api/v1/users/:id/settings/export`)

### Data Export

When a user exports their data via `GET /api/v1/users/:id/settings/export` (overview.md §23):
- **Include:** Ratings given (with comment, recipient, date) and ratings received (with comment, giver, date)
- **Include:** Reports submitted (category, description, date, status) — but NOT admin resolutions or notes
- **Exclude:** Reports filed against the user (privacy of reporters)
- **Exclude:** Ban records and moderation notes

### Special Case: `underage` Reports

Reports in the `'underage'` category are always prioritised:
- Create a report with status `'under_review'` immediately (do not wait for auto-flag)
- Trigger urgent admin notification (email to all admins)
- Do not count toward the auto-flag threshold

---

## 10. Audit Log Integration

All moderation actions write to the existing `audit_log` table. The `metadata` JSONB field carries structured context:

| Action | Metadata Keys | Example |
|---|---|---|
| `user_report_submitted` | `reportId`, `category`, `reportedUserId` | User Alice reports Bob for `fake_stickers` |
| `report_status_changed` | `reportId`, `fromStatus`, `toStatus`, `adminId`, `resolutionNote` | Admin marks report as resolved |
| `user_banned` | `banId`, `banType`, `userId`, `reportId`, `reason`, `expiresAt` | Admin bans user Alice (soft, 7 days) |
| `auto_soft_ban_triggered` | `banId`, `userId`, `reportIds` (array), `triggerCount` | System auto-bans Bob after 3 reports |
| `user_ban_lifted` | `banId`, `userId`, `liftedBy`, `liftReason` | Admin lifts Alice's ban |
| `trade_rating_submitted` | `ratingId`, `tradeId`, `fromUserId`, `toUserId`, `isPositive` | Alice rates Bob's trade positively |

---

## 11. Feature Flag

In `data/seeds/06_feature_flags.sql`, add:
```sql
INSERT INTO feature_flags (key, enabled, rollout_pct, description) VALUES
  ('FEATURE_TRUST_SAFETY', false, 0, 'Post-trade ratings, user reporting, and moderation system')
ON CONFLICT (key) DO NOTHING;
```

Disabled by default. All Trust & Safety API routes check this flag at the start of the handler:
```typescript
if (!isFeatureFlagEnabled('FEATURE_TRUST_SAFETY')) {
  return reply.notFound();
}
```

---

## 12. Seed Data Additions

In `data/seeds/07_test_users.sql`, add the system account for automated ban issuance:
```sql
INSERT INTO users (id, email, username, display_name, role, email_verified_at) VALUES
  ('00000000-0000-0000-0000-000000000099',
   'system@cromo.internal',
   '_system',
   'System',
   'admin',
   now())
ON CONFLICT (email) DO NOTHING;
```

In a new `data/seeds/09_trust_safety.sql` (non-production only), add sample completed trades with ratings and reports between test users (e.g., alice → bob rated positively, charlie → bob reported for `fake_stickers`) so the admin UI has realistic data during development.
