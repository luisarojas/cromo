# Frontend

> **Parent document:** [`overview.md`](overview.md#document-map) — this file is the detailed expansion. `overview.md` covers cross-cutting context (product, architecture, phases, cost, glossary); this file is the canonical reference for its subsystem.

## 5.1 Technology: Next.js 15 + TypeScript

Next.js renders pages both server-side (fast initial load, SEO) and client-side (fast navigation). TypeScript adds compile-time type safety. Works identically locally and on the cloud EC2 instance, co-hosted with the API behind the ALB (see [ADR-0001](decisions/0001-ec2-docker-compose-over-ecs-fargate.md)).

## 5.2 Styling: Tailwind CSS

Utility-first CSS. Consistent, responsive designs without managing separate stylesheet files.

## 5.3 State Management

- **Zustand** — lightweight global state (session, collection filters, UI state)
- **React Query (TanStack Query)** — server state, API caching, automatic retry

## 5.4 Progressive Web App (PWA)

Configured as a PWA. Users can install it on their phone's home screen without an App Store. Collectors can open it while sorting a pack.

## 5.5 Internationalisation (i18n)

Built with i18n routing from day one using Next.js's built-in support. Launch order:

| Phase | Language | Locale | Rationale |
|---|---|---|---|
| Launch | English | `en` | Default |
| Fast follow | Spanish | `es` | Large user base across participating Latin American countries (Mexico, Argentina, Colombia, Ecuador, Uruguay, Panama, Paraguay) |
| Later | French | `fr` | Quebec users and Canadian bilingualism requirements |

## 5.6 Key Screens

| Route | Description |
|---|---|
| `/` | Landing page, login / sign-up |
| `/login` | Login page |
| `/register` | Registration page |
| `/verify-email` | Email verification confirmation |
| `/dashboard` | Collection overview — completion %, recent activity |
| `/album` | User's album list |
| `/album/[albumId]` | Visual grid of all sticker slots for a specific album, filterable by team/group/type/variant/status |
| `/have` | Stickers owned |
| `/missing` | Stickers needed |
| `/duplicates` | Stickers available to trade |
| `/scan` | Camera / image upload for AI identification |
| `/trade` | Find users with complementary needs |
| `/trade/[id]` | Individual trade conversation |
| `/profile/[username]` | Public profile page |
| `/share/[token]` | Public shareable list (no login required) |
| `/settings` | Account, privacy, data export, deletion |
| `/admin` | Sticker database management (admin only) |
| `/security` | Responsible disclosure policy |
| `/legal/[doc]` | Privacy policy, terms, cookies |

## 5.7 Static Image Assets

The 48 team flags (referenced by `teams.flag_url`) and any sticker-position diagrams are bundled as static assets in `apps/frontend/public/images/flags/{fifa_code}.svg`. Bundling is preferred over S3 hosting because:
- The set is fixed and small (~48 SVGs, `< 200 KB` total)
- No additional infrastructure to provision
- Served by Next.js with standard cache headers; the ALB / CloudFront front can layer additional edge caching later
- Bundling avoids cross-origin headaches with `<img src>` and `Content-Security-Policy`

User-generated images (avatars, scan uploads) remain on S3 / local filesystem (§6.3). Sticker artwork itself is **not** stored or rendered by this application — Panini owns the artwork and the album experience reproduces only the metadata (number, name, team, variant). The album grid uses placeholder cards with sticker numbers rather than artwork.

## 5.8 Local Hosting vs Cloud Hosting

| Environment | Hosting | URL |
|---|---|---|
| Local | Next.js dev server | `http://localhost:3000` |
| Dev (cloud) | EC2 + Docker Compose, behind ALB + ACM (HTTPS) | `https://dev.cromotrade.ca` |
| Production | EC2 + Docker Compose, behind ALB + ACM (HTTPS) — planned | `https://cromotrade.ca` |

