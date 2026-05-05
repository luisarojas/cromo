# Email & Notifications

> **Parent document:** [`overview.md`](overview.md#document-map) — this file is the detailed expansion. `overview.md` covers cross-cutting context (product, architecture, phases, cost, glossary); this file is the canonical reference for its subsystem.

## 12.1 Local: Mailpit

All emails sent by the application in local mode are captured by Mailpit at `http://localhost:8025`. No real emails are sent. You can see all verification emails, trade notifications, and password resets in the Mailpit inbox.

## 12.2 Cloud: AWS SES

All outbound email in cloud environments routes through AWS SES. Setup: verify sending domain with DKIM + SPF in Route 53; request SES production access before launch.

## 12.3 CASL Compliance

Marketing emails require explicit opt-in. Transactional emails (verification, password reset, trade notifications) do not. Consent records stored in the database. Every marketing email includes a one-click unsubscribe. Violations carry fines up to $10 million CAD.

## 12.4 SES Bounce & Complaint Handling

SES disables sending if bounce rate exceeds 5% or complaint rate exceeds 0.1%. Both events are forwarded via SNS topic to a small Lambda (cloud) or in-API webhook (local mock) which:

1. Updates a new `users.email_status` column (`active` | `bounced_soft` | `bounced_hard` | `complaint`)
2. Suppresses future sends to the address (the API checks `email_status` before queueing email)
3. Adds the address to a SES suppression list automatically (hard bounces only)
4. For `complaint`: also unsets `user_settings.email_marketing` and writes a `consent_records` revocation row

`email_status` is exposed in the Settings UI ("Your email is bouncing — please update your address").

## 12.5 Email Authentication: SPF / DKIM / DMARC

All three are configured at launch:
- **SPF**: `v=spf1 include:amazonses.com -all` in Route 53
- **DKIM**: SES-managed CNAMEs added to Route 53 during domain verification
- **DMARC**: starts at `v=DMARC1; p=quarantine; rua=mailto:dmarc@stickerswap2026.ca; pct=100`. After 30 days of clean reports, tightened to `p=reject`.

DMARC reports are aggregated via a free service (e.g., dmarcian) and reviewed monthly.

## 12.6 Web Push Notifications

For the installed PWA experience, transactional notifications (new trade message, trade accepted, trade marked complete) are delivered via the Web Push API. SSE handles real-time push for active sessions; web push handles "user closed the app" cases.

| Element | Choice |
|---|---|
| Standard | W3C Web Push + VAPID |
| Server library | `web-push` (Node) |
| Subscription storage | New table `push_subscriptions` (user_id, endpoint, keys (p256dh, auth), created_at) |
| Trigger points | New trade request, trade accepted, new trade message, trade auto-expiring within 24h |
| User control | `user_settings.push_*` boolean per notification type; opt-in only |
| Privacy | Subscription endpoint URLs are PII (browser-derived); deleted on account deletion |

Web push is feature-flagged behind `FEATURE_WEB_PUSH` (default false). Scheduled to roll out in Phase A6 (weeks 20–22) after the core trade flow is stable.

