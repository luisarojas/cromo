# Performance Budgets & Web Vitals

> **Parent document:** [`overview.md`](overview.md#document-map) — this file is the detailed expansion. `overview.md` covers cross-cutting context (product, architecture, phases, cost, glossary); this file is the canonical reference for its subsystem.

The frontend is mobile-first (collectors using their phone while sorting packs) and a PWA, so user-visible performance matters as much as backend latency. This section sets concrete budgets that block merges if violated.

## 36.1 Core Web Vitals Targets

Measured at p75 across all sessions on real devices via Sentry's `@sentry/nextjs` RUM (Web Vitals + browser-side transactions).

| Metric | Target | Hard fail |
|---|---|---|
| **LCP** (Largest Contentful Paint) | ≤ 2.0 s | ≥ 2.5 s |
| **INP** (Interaction to Next Paint) | ≤ 150 ms | ≥ 200 ms |
| **CLS** (Cumulative Layout Shift) | ≤ 0.05 | ≥ 0.1 |
| **TTFB** (Time to First Byte) | ≤ 600 ms | ≥ 1 s |
| **FCP** (First Contentful Paint) | ≤ 1.5 s | ≥ 2 s |

CI enforces these via Lighthouse CI on every PR. Two consecutive failing builds against `main` page the on-call (when on-call exists).

## 36.2 Bundle Size Budgets

Enforced via `size-limit` in CI. Hard limits on the gzipped main bundles:

| Bundle | Limit |
|---|---|
| Initial JS for `/` (landing) | 90 KB |
| Initial JS for `/album` (heaviest authenticated route) | 180 KB |
| Initial CSS | 20 KB |
| Per-route JS (Next.js code-split chunks) | 60 KB |

If a PR pushes a bundle past the limit, the CI fails with the diff (which packages added weight).

## 36.3 Image Optimisation Rules

- All `<img>` tags use Next.js `<Image>` (automatic responsive sizing, `srcset`, lazy loading, AVIF/WebP fallback)
- Team flag SVGs (§5.7) are inlined — no HTTP request
- Avatar uploads are resized server-side to 512×512 (§6.3) and served via `next/image`
- No raster image larger than 200 KB committed to `apps/frontend/public/`

## 36.4 Data Loading Patterns

- React Query staleTime ≥ 5 min on the sticker master list, ≥ 1 min on collection-specific data
- Album grid uses virtual scrolling — only ~30 of 980 cells in DOM at once (verified in §31 A2 milestone)
- Cursor-based pagination throughout; no `OFFSET` queries
- API responses Gzip/Brotli compressed at the ALB

## 36.5 PWA Offline Strategy

The service worker (Workbox) caches:
- App shell + all JS/CSS bundles (cache-first; revalidate in background)
- Sticker master list (`stickers:all`) for 24 hours (stale-while-revalidate)
- Team flags (cache-first, indefinite — they don't change)
- API GETs for the current user's collection (network-first, fall back to last cached on offline)

Trade-related UI is **not** cached offline (real-time correctness matters more than offline access here). The "you're offline" UI explains which features work offline.

## 36.6 Real User Monitoring

Sentry's `@sentry/nextjs` captures Web Vitals from real users and adds custom transactions for React renders and `fetch` calls. It answers: "Why is my user's experience slow right now?" — backend metrics alone can't.

A weekly `web-vitals-report` runbook step compares the trailing-7-day p75 against budget. Regressions trigger a focused investigation rather than waiting for users to complain.

