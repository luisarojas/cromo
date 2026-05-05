# Compliance

> **Parent document:** [`overview.md`](overview.md#document-map) — this file is the detailed expansion of Canadian privacy compliance (parent §23), legal & intellectual property (parent §24), and the multi-user system design (parent §25).

## 23. Canadian Privacy Compliance (PIPEDA / CPPA / CASL)

### 23.1 Applicable Laws

- **PIPEDA / CPPA** — federal private-sector privacy law
- **CASL** — governs commercial electronic messages (fines up to $10M CAD)
- **Quebec Law 25** — stricter provincial law for Quebec users

### 23.2 Technical Controls Required

- **Meaningful consent** at registration — separate unchecked checkboxes for analytics and marketing email
- **Consent for AI processing** — separate prompt before first sticker scan
- **Data minimisation** — collect only email, username, collection data
- **Right to access (30-day SLA)** — "Download my data" in Settings
- **Right to erasure (30-day SLA)** — "Delete my account" in Settings
- **Data residency** — all data in AWS ca-central-1 or ca-west-1
- **Breach notification** — notification workflow in the runbook
- **Children's privacy** — age gate; users under 13 require parental consent
- **CASL** — marketing emails require explicit opt-in; unsubscribe honoured within 10 days

### 23.3 Trust & Safety Compliance (Section 33)

The Trust & Safety system (user ratings, reporting, moderation) has additional privacy requirements:

- **Rating erasure:** On account deletion, rating comments are cleared and rater ID is anonymised, but aggregate trust counts are retained (operational necessity)
- **Report retention:** Report descriptions are retained for 2 years after resolution (moderation record), then redacted
- **Ban records:** Ban reasons and moderation notes are retained indefinitely for audit purposes; excluded from user data exports
- **Data export:** Ratings given/received and submitted reports are included in the user data export; resolved reports, resolution notes, and ban records are excluded
- **Report categories:** The `underage` category receives priority review and mandatory human escalation

Full details in Section 33: Trust & Safety.

### 23.4 Age Gate Implementation

Registration collects `birth_year` only (data minimisation — full DOB is not needed). The frontend displays a year picker. The backend rejects any year that would make the user under 13 at registration time with `403 Forbidden` and a generic message ("You must be at least 13 to use this service"). `birth_year` is stored on `users` and is included in data exports but never displayed publicly.

Quebec users (Law 25) under 14 cannot consent on their own behalf for non-essential data processing; the consent UI is gated to 14+ for the analytics/marketing checkboxes. (Functional account creation is allowed at 13+ federally.)

### 23.5 Account Deletion: Soft-Delete + Grace Window

The 30-day SLA from §23.2 is implemented as a two-stage process:

1. **Day 0 — User clicks "Delete my account":** `users.deleted_at = now()` (soft delete). The user is logged out. The account is hidden from search, trade matching, profiles, and shareable lists. The user can restore by logging in within 14 days (a "Your account is scheduled for deletion — restore?" banner appears).
2. **Day 14 — Grace window expires:** A daily scheduled job (§34) hard-deletes / anonymises:
   - Email, username, display_name → cleared / replaced with `[Deleted User]`
   - `birth_year`, `avatar_url` → NULL
   - `hashed_email` → retained for ban-evasion prevention (§33.3)
   - `trade_ratings` they gave/received → comments cleared, IDs anonymised at API layer (§33.9)
   - `trade_messages` → deleted (CASCADE)
   - Active trades → cancelled with status `'cancelled'` and a system-generated message
3. **Day 30 — Backups age out:** Aurora point-in-time recovery rolls past the deletion event. The account is now unrecoverable everywhere.

### 23.6 IP Address Retention in `audit_log`

IP addresses are PII under PIPEDA. To minimise retention while preserving abuse-investigation utility, a daily scheduled job (§34) truncates IPs in `audit_log` rows older than 90 days:
- IPv4 → `/24` (e.g., `203.0.113.42` → `203.0.113.0/24`)
- IPv6 → `/48`

Truncated IPs remain useful for spotting patterns (same /24 ban-evading) without identifying individuals.

### 23.7 Legal Documents Required Before Launch

- Privacy Policy
- Terms of Service
- Cookie Policy
- Responsible Disclosure Policy

Have a Canadian privacy lawyer review all four. Budget: $500–1,000 CAD.

## 24. Legal & Intellectual Property

### 24.1 Panini IP

The application tracks sticker metadata (numbers, names) — it does not reproduce Panini's artwork. Sticker images are processed and deleted within 24 hours. One-time legal review recommended. Budget $200–400 CAD.

### 24.2 Terms of Service Key Points

- No affiliation with or endorsement by Panini or FIFA
- Users own their collection data
- Prohibited: scraping, automated imports, commercial resale of platform access

## 25. Multi-User System Design

### 25.1 Roles

| Role | Permissions |
|---|---|
| Standard User | Own collection, trade, share |
| Admin | All above + sticker database management + Trust & Safety moderation (§33) |
| `_system` (pseudo-user) | Internal-only account (UUID `00000000-0000-0000-0000-000000000099`) used as the actor for automated moderation actions (e.g., auto-soft-bans). Cannot log in. Created by seed file `07_test_users.sql`. |

### 25.2 Privacy Controls

Users control: profile visibility, collection visibility, trade matching opt-in, leaderboard inclusion.

