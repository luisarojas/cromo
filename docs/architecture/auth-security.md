# Authentication & Security

> **Parent document:** [`overview.md`](overview.md#document-map) — this file is the detailed expansion. `overview.md` covers cross-cutting context (product, architecture, phases, cost, glossary); this file is the canonical reference for its subsystem.

## 9.1 Email Verification Flow

After a user registers, their account exists but `email_verified_at` is NULL. They receive a verification email containing a **6-digit code**. The frontend `/verify-email` page collects the user's email + code and posts both.

```
User registers → account created (email_verified_at = NULL)
             → Verification email sent with a 6-digit code
             → User enters email + code → POST /auth/verify-email { email, code }
             → email_verified_at = now()
             → User signs in
```

Both auth modes share this `{ email, code }` API contract so the single frontend build works everywhere — only the backend differs:

- **`AUTH_MODE=local`:** the API generates a 6-digit code, stores its SHA-256 hash in `email_verification_tokens` (24-hour expiry), and emails it via Mailpit. `POST /auth/verify-email` looks up the row by email + code hash, sets `email_verified_at`, and deletes the user's tokens.
- **`AUTH_MODE=cognito`:** Cognito generates and emails the code (via the pool's SES sender) on `SignUp`; the API simply calls `ConfirmSignUp`. The `email_verification_tokens` table is unused in this mode.

**Before verification:** Users can log in but see a banner prompting them to verify. They cannot initiate trade requests until verified (reduces spam). They can freely add stickers to their collection.

**Re-send flow:** `POST /auth/resend-verification { email }` issues a fresh code (local: regenerates + re-emails; cognito: `ResendConfirmationCode`). Rate-limited to 3 requests per hour per user to prevent email-bombing.

**Expired/invalid codes:** the API returns `410 Gone` for an expired code and `400` for a mismatched one; the page shows the error inline with a "Resend code" button.

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

## 9.3 Cloud Authentication: AWS Cognito (backend token-broker)

In dev and prod (`AUTH_MODE=cognito`) Cognito is the identity provider, but the **frontend never talks to Cognito directly**. It keeps calling the same `/api/v1/auth/*` endpoints; the backend acts as a token-broker (backend-for-frontend) in front of the Cognito user pool. This keeps the httpOnly refresh-cookie model (§9.6) — no tokens in browser-accessible storage — and reuses the existing auth pages.

**Request flow:**

```
Frontend → POST /auth/login → API → Cognito InitiateAuth (USER_PASSWORD_AUTH)
                                  ← Cognito access + id + refresh tokens
        API: JIT-provision DB user, set httpOnly refresh cookie, return access token
Protected routes: middleware verifies the Cognito access token via JWKS
                  (apps/backend/src/middleware/cognito.ts)
```

**Service surface** (`apps/backend/src/services/cognito-auth.service.ts`, dispatched from `routes/v1/auth.ts` by `AUTH_MODE`): `register`→`SignUp`, `login`/`refresh`→`InitiateAuth`, `verifyEmail`→`ConfirmSignUp`, `resendVerification`→`ResendConfirmationCode`, `forgotPassword`→`ForgotPassword`, `resetPassword`→`ConfirmForgotPassword`. These are public client APIs (the app client has no secret), so they need no IAM.

**Identity & roles:**

- The DB `users.id` **is** the Cognito `sub`. Self-registered users get their DB row at register time: after `SignUp` returns the `sub`, `createUser` inserts the row + default profile (settings + album) with `email_verified_at = NULL`. This is a plain insert, so the **username is reserved atomically by the unique constraint** — a duplicate that slips past the pre-check trips `23505`, and the broker rolls back the just-created Cognito user (`AdminDeleteUser`) and returns `409`. On the first post-confirmation login, `ensureUser` (`apps/backend/src/services/user-provisioning.ts`) flips `email_verified_at` from the id token's `email_verified` claim. The Terraform-bootstrapped admin never registers, so `ensureUser` also upserts a row on its first login. Cognito access tokens carry `sub` and `cognito:groups` but **not** `email`, so routes read profile fields (email/username) from the DB by id, never from the token.
- **Role is authoritative from the `admin` Cognito group**, mapped to `role: 'admin'` by the JWKS middleware. The DB `role` column is kept in sync for display. Changing a role from the admin UI calls `AdminAddUserToGroup`/`AdminRemoveUserFromGroup`; admin-initiated account removal calls `AdminDisableUser` (soft-delete) then `AdminDeleteUser` (hard-delete cleanup job). These privileged `Admin*` ops require `cognito-idp:Admin*` on the EC2 instance role (granted in `modules/compute`, scoped to the pool ARN).

**Bootstrapped admin:** admin accounts are created by Terraform from `admin_emails` (added to the `admin` group, with a `custom:username` attribute for JIT). On first use the admin runs the **forgot-password** flow to set a password — this clears the `FORCE_CHANGE_PASSWORD` state without needing a NEW_PASSWORD_REQUIRED challenge UI. See `docs/runbooks/cloud-bootstrap.md` §3.

**Local Docker dev stays `AUTH_MODE=local`** (§9.2) so contributors never need AWS. The two modes are not a drop-in swap — the broker, JIT provisioning, and `Admin*` IAM only exist for the cloud path.

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
| Password reset | Cognito-managed: emailed 6-digit code → `POST /auth/reset-password { email, code, password }` → `ConfirmForgotPassword`. (Local mode mirrors the same `{ email, code }` contract with a 1-hour, single-use code.) |

Account lockout is keyed on `user_id`, not IP, to prevent password-spray attacks across many IPs. Implemented via Redis (`lockout:{user_id}`, TTL 900s).

## 9.8 Logging PII Policy

Structured logs (§20) **never** contain: full passwords, JWT tokens or refresh tokens, full email addresses (only the masked form `a***@example.com`), `user_reports.description` content, `trade_messages.body` content, or full `audit_log.ip_address` values for entries older than 90 days. A pre-commit hook runs `gitleaks` to catch accidental commits of secrets.

## 9.9 Infrastructure IAM (AWS Account Access)

Application auth (§9.1–§9.8) covers end users. This section covers the *operators*
— how a human authenticates to the AWS account to run Terraform, port-forward
into RDS, etc.

**Two-tier identity model**, both Terraform-managed where possible:

| IAM user | Permissions | Created by | Purpose |
|---|---|---|---|
| `cromo-admin` | `AdministratorAccess` | Manual (predates Terraform; the user resource itself is unmanaged, but its inline policy is attached via `modules/iam-mfa-enforcement` from `env/shared`) | Bootstrap admin; runs `terraform apply`; break-glass |
| `luisa` (and any other names listed in `developer_iam_users`) | `ec2:DescribeInstances`, `ssm:StartSession` to the `cromo-dev-app` instance, `secretsmanager:GetSecretValue` on `cromo/dev/app`, plus self-MFA management | `modules/dev-access` (instantiated from `env/dev/main.tf`) | Day-to-day dev ops |

**MFA is enforced on every operator user** via a customer-managed policy
(`modules/iam-mfa-enforcement`) that denies all sensitive actions unless the
request was signed with MFA-protected temp credentials. Long-lived access keys
exist but are useless without first calling `sts:GetSessionToken` with an MFA
token. The deny gate uses `BoolIfExists` so service-to-service calls that omit
`aws:MultiFactorAuthPresent` are treated as no-MFA rather than bypassing the
deny.

The policy is customer-managed rather than inline because the canonical
"deny-unless-MFA, allow self-MFA-management" document exceeds the 2,048-byte
inline cap. Customer-managed has a 6,144-byte cap and is also reusable across
users. `env/shared` creates `cromo-shared-require-mfa` for `cromo-admin`;
`env/dev` (via `dev-access`) creates `cromo-dev-require-mfa` for each operator.
Two policies, one per Terraform state — duplication is the cost of avoiding
cross-state output coupling (same pattern as the SES ARN, computed by
deterministic format string in `env/dev/main.tf` rather than read across states).

**No access keys in Terraform state.** Both `cromo-admin` and the dev-access
users have their access keys created via the AWS console (or `aws iam
create-access-key`) post-apply. This is a deliberate choice — provisioning keys
through `aws_iam_access_key` would land the secret material in the Terraform
state file.

**Why not AWS IAM Identity Center?** Considered and deferred. Identity Center is
the AWS-recommended endgame (no long-lived keys at all; federated browser
login), but it requires a one-time manual console bootstrap that Terraform
can't perform, and migrating ratchets up complexity for a solo-dev account.
The MFA-required policy on long-lived keys closes the same threat (compromised
laptop key) with a smaller change. Revisit when the team grows past one person.

The operator playbook — profile selection, MFA helper, SSM port-forward, seeding
through the tunnel — is in
[`docs/runbooks/aws-access.md`](../runbooks/aws-access.md).

