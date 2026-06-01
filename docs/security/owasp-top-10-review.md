# OWASP Top 10 (2021) — Developer Review

> Required by `docs/architecture/overview.md §31 A7` and
> `docs/architecture/operations.md §29`. This document is the developer-side
> review. An automated DAST scan (e.g. OWASP ZAP) against the dev environment
> is planned as the cloud-side complement; it is not yet wired into CI.

Last reviewed: 2026-05-25.

## A01 · Broken Access Control

**Threat.** A user reads or modifies another user's data by manipulating IDs.

**Controls in place.**
- Every authenticated route resolves the caller via `verifyToken` middleware
  (`apps/backend/src/middleware/auth.ts`) and attaches `request.userId`.
- Resource handlers reject when the path `userId`/`tradeId` does not match the
  caller, with one explicit exception: admin routes gate on
  `request.userRole === 'admin'` (`assertAccess`).
- Shareable public lists are accessed by **unguessable token**, not by
  collection ID, so enumeration is not possible.
- `routes/v1/profiles.ts` deliberately strips `email`, `last_login`, `ip` from
  public payloads — public profiles never expose PII beyond `username` +
  `display_name` + opt-in fields.

**Open risks.** None known. The admin sticker-correction endpoint
(`PATCH /admin/stickers/:id`) is the only mutate-the-catalog surface and is
admin-only.

## A02 · Cryptographic Failures

**Threat.** Secrets logged, weak password storage, traffic over plain HTTP.

**Controls in place.**
- Passwords hashed with `argon2id` (`services/auth.service.ts`), not bcrypt or
  SHA.
- JWTs signed with `JWT_SECRET` from env, not committed; refresh tokens are
  HTTP-only cookies signed with the same secret.
- Sentry / pino loggers redact `password`, `token`, `cookie`, `authorization`
  fields (configured in `app.ts`).
- In cloud environments, TLS 1.2+ terminates at the ALB; ACM certificates
  auto-rotate.

**Open risks.** Local development is HTTP-only on `localhost` — acceptable for
a dev environment but must not be deployed without TLS.

## A03 · Injection

**Threat.** SQL injection, command injection, prompt injection.

**Controls in place.**
- All SQL uses parameterised queries via `pg.Pool#query(text, values)`. No
  string concatenation in handlers — verified by grep for `${` inside `SELECT`
  statements.
- The AI scan prompt to Gemini does not interpolate user data; the image is
  attached as a multimodal content item and the prompt itself is a static
  template.
- No `child_process.exec` calls in app code.

**Open risks.** Frontend URLs and search params are URL-decoded by `fastify`
before reaching handlers; handlers must still validate `enum`/`maxLength`/
`format` schemas (verified in `routes/v1/*.ts`).

## A04 · Insecure Design

**Threat.** Missing rate limits, no idempotency on create endpoints, race
conditions in trade acceptance.

**Controls in place.**
- `@fastify/rate-limit` global limit + per-route stricter limits on auth.
- Idempotency-key middleware (`services/idempotency.service.ts`) caches
  successful POSTs for `trade:create`, `collection:add`, `scan:identify`,
  `sharing:create-token`, `admin:bans`.
- Trade acceptance uses `SELECT ... FOR UPDATE` on the trade row to prevent
  double-accept races.
- Soft bans are checked on every authenticated request via `checkSoftBan`
  preHandler.

## A05 · Security Misconfiguration

**Controls in place.**
- `@fastify/helmet` sets CSP, X-Frame-Options, Referrer-Policy
  (`plugins/helmet.ts`).
- CORS allowlist comes from env (`FRONTEND_URL`), not `*`.
- Stack traces redacted in production responses (see `app.ts` error handler:
  `env.NODE_ENV === 'production' && statusCode === 500 → generic message`).
- Mailpit + pgAdmin + Redis Commander are never enabled in production
  compose files.

## A06 · Vulnerable & Outdated Components

**Controls in place.**
- `pnpm audit --audit-level=high` runs as a CI gate on every PR + push
  (`.github/workflows/ci-cd.yml` → `security` job).
- Trivy filesystem scan on every PR + push (deps + Dockerfile misconfig +
  secrets; `severity: HIGH,CRITICAL`, `ignore-unfixed: true`).
- Gitleaks secret scan on every PR + push, with full history.
- `engines.node = ">=22.0.0"` pins to current LTS.

**Open risks.** No active container-image vulnerability scanning of built
images (Trivy currently scans the filesystem, not pushed image layers). ECR
image-scan-on-push is the natural next step.

## A07 · Identification & Authentication Failures

**Controls in place.**
- Email verification gate before any state-changing API call.
- Lockout after 5 failed login attempts within 15 min (`auth.service.ts`).
- Refresh-token rotation: each refresh issues a new token and invalidates
  the previous one.
- No password complexity prompts in copy; instead we measure entropy and
  reject obvious garbage.

## A08 · Software & Data Integrity Failures

**Controls in place.**
- Image uploads validated by magic-byte sniffing (`services/upload.service.ts`,
  `fileTypeFromBuffer`), not just `Content-Type`.
- Multipart upload limit 10 MB (`@fastify/multipart`).
- Public list snapshots include a `generatedAt` timestamp so consumers can tell
  if they're viewing stale data.

## A09 · Security Logging & Monitoring Failures

**Controls in place.**
- Every authenticated mutation writes an `audit_log` row via `recordAudit`.
- Failed logins logged with truncated IP (/24 IPv4, /48 IPv6) after 90 days via
  the `truncate-audit-log-ips` scheduled job.
- In cloud environments: CloudWatch metric alarms on RDS CPU and ALB unhealthy
  hosts (`infrastructure/terraform/modules/monitoring`). Application-level
  dashboards on 4xx/5xx, auth failures, and queue depth are planned but not
  yet wired.

## A10 · Server-Side Request Forgery (SSRF)

**Threat.** An attacker tricks the API into fetching internal URLs (e.g.,
`http://169.254.169.254/...` cloud metadata).

**Controls in place.**
- The only outbound HTTP from the API is to Gemini (vision) and SES (email),
  both with hardcoded base URLs. No user-supplied URL is fetched server-side.
- Image uploads are read from the multipart body, not from a remote URL.

---

## Per-release checklist

When adding a feature that touches any of the surfaces below, re-run the
matching review item:

- [ ] **A01:** Does every new route enforce ownership/admin role?
- [ ] **A03:** Are all DB calls parameterised? Any new outbound calls?
- [ ] **A04:** Does any new POST-create accept an `Idempotency-Key` header?
- [ ] **A05:** Does any new endpoint leak stack traces or internal IDs in 5xx?
- [ ] **A08:** Does any new file/image upload validate magic bytes?
- [ ] **A09:** Is the new action recorded in `audit_log`?

The planned cloud DAST scan is the safety net — it is not a substitute for
this review.
