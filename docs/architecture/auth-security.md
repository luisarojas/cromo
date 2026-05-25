# Authentication & Security

> **Parent document:** [`overview.md`](overview.md#document-map) — this file is the detailed expansion. `overview.md` covers cross-cutting context (product, architecture, phases, cost, glossary); this file is the canonical reference for its subsystem.

## 9.1 Email Verification Flow

After a user registers, their account exists but `email_verified_at` is NULL. They receive a verification email (via Mailpit locally, SES in cloud) with a secure one-time link.

```
User registers → API creates account (email_verified_at = NULL)
             → Verification email sent with token link
             → User clicks link → POST /auth/verify-email
             → API sets email_verified_at = now()
             → User is redirected to /dashboard
```

**Before verification:** Users can log in but see a banner prompting them to verify. They cannot initiate trade requests until verified (reduces spam). They can freely add stickers to their collection.

**Token:** A cryptographically random token stored in the `email_verification_tokens` table (see §7.2 schema) with a 24-hour expiry. After clicking the link, the token is consumed (deleted).

**Re-send flow:** `POST /auth/resend-verification` deletes any existing tokens for the user, generates a new one, and emails the new link. Rate-limited to 3 requests per hour per user to prevent email-bombing. If the previous token has not expired, the user can still use either link until first use; the new token simply provides another chance.

**Expired tokens:** If a user clicks an expired link, the API returns `410 Gone` with a "Verification link expired" page that includes a one-click re-send button.

## 9.2 Local Authentication Mode

Locally, authentication is handled by a lightweight mock middleware. Any email/password combination is accepted. The API reads `AUTH_MODE=local` from the environment and skips Cognito entirely. This means developers never need AWS credentials to work on features.

Test users are pre-seeded with `email_verified_at` set to a past timestamp — no verification step needed locally.

Predefined test user sessions are accessible via:
```bash
# Login as Alice (test collector)
POST http://localhost:3001/api/v1/auth/login
{ "email": "alice@test.local", "password": "anything" }

# Login as admin
POST http://localhost:3001/api/v1/auth/login
{ "email": "admin@test.local", "password": "anything" }
```

## 9.3 Cloud Authentication: AWS Cognito

In staging and production, Cognito handles registration, login, MFA, JWT tokens, and password resets. The API reads `AUTH_MODE=cognito` and validates JWTs against the Cognito user pool.

The transition from local mock to Cognito is a single environment variable change — no code changes required.

## 9.4 Security Controls

| Control | Local | Cloud |
|---|---|---|
| HTTPS | No (HTTP only) | Yes — TLS 1.3 via ACM |
| Input validation | Yes (Zod) | Yes (Zod) |
| Rate limiting | Yes (Fastify) | Yes (Fastify + WAF) |
| SQL injection | Yes (parameterised queries) | Yes |
| Auth enforcement | Mock — any credentials | Cognito JWT validation |
| Secrets | `.env.local` file | AWS Secrets Manager |
| DDoS protection | None | AWS Shield Standard |

## 9.5 Security Headers

The API and frontend send the following headers on every response. Implemented via `@fastify/helmet` on the API and `next.config.js` headers on the frontend:

| Header | Value |
|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` (cloud only) |
| `Content-Security-Policy` | `default-src 'self'; img-src 'self' data: https:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.cromo.ca; frame-ancestors 'none'` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(self), microphone=(), geolocation=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |

CSP is initially set in report-only mode (`Content-Security-Policy-Report-Only`) and tightened to enforcing once observed violations are zero.

## 9.6 Cookie Configuration

Auth cookies (refresh-token cookie issued by the API) are configured as:
- `HttpOnly` — not accessible to JavaScript
- `Secure` — sent only over HTTPS (cloud only)
- `SameSite=Lax` — sent on top-level GET navigation, not on cross-site POSTs
- `Max-Age=2592000` — 30 days; matches refresh-token TTL
- `Path=/api/v1/auth`
- `Domain=cromo.ca` (omitted locally)

Access tokens are short-lived JWTs (15 min TTL) stored in memory by the frontend (Zustand) — never in `localStorage`.

## 9.7 Password Policy & Account Lockout

When `AUTH_MODE=cognito`:

| Policy | Setting |
|---|---|
| Minimum length | 12 characters |
| Required character classes | At least 1 lowercase, 1 uppercase, 1 number |
| Breached-password check | Cognito advanced security: blocks passwords found in haveibeenpwned breach corpus |
| MFA | Optional at launch (TOTP); required for admin role |
| Lockout | 5 failed login attempts on the same account → 15-minute lock (separate from per-IP rate limit in §6.4) |
| Password reset | Email-only flow; tokens 1-hour TTL, single-use |

Account lockout is keyed on `user_id`, not IP, to prevent password-spray attacks across many IPs. Implemented via Redis (`lockout:{user_id}`, TTL 900s).

## 9.8 Logging PII Policy

Structured logs (§20) **never** contain: full passwords, JWT tokens or refresh tokens, full email addresses (only the masked form `a***@example.com`), `user_reports.description` content, `trade_messages.body` content, or full `audit_log.ip_address` values for entries older than 90 days. A pre-commit hook runs `gitleaks` to catch accidental commits of secrets.

