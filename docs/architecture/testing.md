# Testing Strategy

> **Parent document:** [`overview.md`](overview.md#document-map) — this file is the detailed expansion. `overview.md` covers cross-cutting context (product, architecture, phases, cost, glossary); this file is the canonical reference for its subsystem.

## 21.1 Local Testing First

The full test suite runs both locally (developer machine) and in CI (`.github/workflows/ci-cd.yml` → `test` job) against a Postgres + Redis service container. All tests must pass in CI before any code is deployed to cloud environments.

## 21.2 The Testing Pyramid

```
     /  E2E  \         7 critical flows · Playwright · runs on Staging
    /──────────\
   / Integration\      Every API endpoint · Supertest + Testcontainers
  /──────────────\
 /  Unit Tests   \     Business logic · Vitest · fast · many
/──────────────────\
/ Static Analysis  \   TypeScript · ESLint · instant
```

## 21.3 Layer 1: Static Analysis

- **TypeScript `strict: true`** — compile-time safety
- **ESLint + Prettier** — code quality and formatting
- **GitLeaks** — catches accidentally committed secrets
- **Snyk** — dependency vulnerability scanning

## 21.4 Layer 2: Unit Tests — Vitest

Coverage target: 80% minimum, enforced in CI. Trade algorithm and auth code at 100%.

Key test areas:
- Trade matching algorithm (all edge cases)
- Collection completion percentage calculation
- Sticker number validation (0–980 range)
- Border colour → variant type mapping (AI scan)
- Confidence routing logic (AI scan)

## 21.5 Layer 3: Integration Tests — Supertest + Testcontainers

Testcontainers spins up real PostgreSQL and Redis Docker containers for each test run. Clean database every time. Tests every API endpoint for happy path and error cases.

Critical: test that `POST /api/v1/users/:id/stickers` correctly handles all 14 variant types, and that Redis cache is invalidated on collection change.

## 21.6 Layer 4: E2E Tests — Playwright

Runs against Staging environment (not local, not mocks). 7 critical user flows:

1. Registration & Login
2. Adding stickers to collection
3. Marking duplicates
4. Trade matching
5. Shareable list generation
6. AI scan (happy path)
7. Account deletion (CPPA erasure)

Failed tests produce screenshots and video recordings as GitHub Actions artefacts.

## 21.7 Layer 5: Performance — k6

Run before every production deployment. Two scenarios: steady state (500 users) and pack-opening spike (5,000 users). All DB queries profiled — any query over 100ms requires optimisation before merge.

## 21.8 Layer 6: Security

- OWASP ZAP automated scan in CI on each staging deploy
- OWASP Top 10 developer review documented before launch
- Responsible disclosure policy published pre-launch
- Professional penetration test at 1,000 users

## 21.9 Layer 7: AI Feature Testing

Fixed dataset of 50 labelled test images in S3. Accuracy targets: Top-1 ≥ 85%, Top-3 ≥ 95%, border detection ≥ 92%. Contract test verifies Claude API response schema is unchanged.

## 21.10 Layer 8: Accessibility

Automated axe-core checks on every E2E run (WCAG 2.1 AA). Manual screen reader test before launch.

