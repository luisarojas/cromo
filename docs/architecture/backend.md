# Backend / API

> **Parent document:** [`overview.md`](overview.md#document-map) — this file is the detailed expansion of the backend service (parent §6) and AI image processing (parent §10), which is implemented as a backend endpoint.

## 6. Backend / API

### 6.1 Technology: Node.js + TypeScript + Fastify

TypeScript catches bugs at compile time. Fastify handles thousands of requests per second on modest hardware. Identical code runs locally in Docker and in ECS Fargate.

### 6.1.1 CORS Configuration

The frontend and API run on different origins (different ports locally, different domains in cloud), so Cross-Origin Resource Sharing (CORS) must be explicitly configured. Without it, the browser blocks every API call.

Install the `@fastify/cors` plugin and configure it:

```typescript
// apps/backend/src/plugins/cors.ts
import cors from '@fastify/cors'

await fastify.register(cors, {
  origin:
    process.env.NODE_ENV === 'production'
      ? ['https://stickfolio.ca', /\.vercel\.app$/]  // Vercel preview URLs
      : 'http://localhost:3000',
  credentials: true,   // required for cookies / auth headers
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
})
```

### 6.1.2 Database Connection Pooling

Node.js must reuse database connections rather than creating a new one per request. Without pooling, the database runs out of connections under light load.

Use the `pg` package's built-in pool:

```typescript
// apps/backend/src/plugins/database.ts
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,         // maximum concurrent connections (match Aurora's RDS Proxy config in cloud)
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
})
```

In cloud, RDS Proxy sits in front of Aurora and handles connection multiplexing at the infrastructure level. Locally, the `pg` pool is sufficient.

### 6.1.3 Auto-Generated API Documentation

Install `@fastify/swagger` and `@fastify/swagger-ui`. These plugins read your route schemas and generate a live, browsable API reference automatically — no manual documentation needed.

```
Local: http://localhost:3001/docs
```

Add JSON schemas to every route definition and the docs stay current without any extra work.

### 6.2 API Versioning

All routes are prefixed from day one:

```
/api/v1/users/:id/collection
/api/v1/stickers
/api/v1/trade/matches/:userId
```

Non-breaking changes (new optional fields) are added within the same version. Breaking changes (removing or renaming fields) require a `/api/v2/` route, with the old version running for a minimum 90-day deprecation window.

### 6.3 Key API Endpoints

```
Authentication
  POST   /api/v1/auth/register
  POST   /api/v1/auth/verify-email          # confirm email from link
  POST   /api/v1/auth/resend-verification   # re-send verification email
  POST   /api/v1/auth/login
  POST   /api/v1/auth/logout
  POST   /api/v1/auth/refresh
  POST   /api/v1/auth/forgot-password
  POST   /api/v1/auth/reset-password

Sticker Master List
  GET    /api/v1/stickers                   # ?team=MEX&group=A&type=player&search=pulisic&cursor=...
  GET    /api/v1/stickers/:albumCode        # look up by album code (e.g. MEX1, FWC3)
  GET    /api/v1/stickers/:albumCode/variants

User Collection
  GET    /api/v1/users/:id/collection       # ?team=BRA&type=player&variant=base&cursor=...
  GET    /api/v1/users/:id/missing          # ?team=BRA&group=K&cursor=...
  GET    /api/v1/users/:id/duplicates       # ?cursor=...
  POST   /api/v1/users/:id/stickers
  PATCH  /api/v1/users/:id/stickers/:variantId
  DELETE /api/v1/users/:id/stickers/:variantId

Trading
  GET    /api/v1/trade/matches/:userId
  POST   /api/v1/trade/requests                    # start a trade
  PATCH  /api/v1/trade/requests/:id                # accept | decline | counter
  GET    /api/v1/trade/requests/:id/messages       # message history (paginated)
  POST   /api/v1/trade/requests/:id/messages       # send a message
  GET    /api/v1/trade/requests/:id/stream         # SSE — push new messages & status changes

Trust & Safety (see Section 33)
  POST   /api/v1/trade/requests/:id/ratings        # submit a post-trade rating
  GET    /api/v1/users/:id/ratings                 # get user's ratings (profile view)
  POST   /api/v1/users/:id/reports                 # file a report
  GET    /api/v1/users/me/reports/submitted        # user's own submitted reports
  GET    /api/v1/admin/reports                     # admin: list all reports
  GET    /api/v1/admin/reports/:reportId           # admin: report detail
  PATCH  /api/v1/admin/reports/:reportId           # admin: update report status
  POST   /api/v1/admin/users/:id/bans              # admin: issue a ban
  GET    /api/v1/admin/users/:id/bans              # admin: view user's ban history
  POST   /api/v1/admin/users/:id/bans/:banId/lift  # admin: lift a ban
  GET    /api/v1/users/me/ban-status               # check personal ban status

Sharing
  POST   /api/v1/users/:id/share
  GET    /api/v1/share/:token

Profile & Settings
  GET    /api/v1/users/:id/public
  PATCH  /api/v1/users/:id/profile
  POST   /api/v1/users/:id/avatar           # multipart upload; stores to /avatars/ in S3
  GET    /api/v1/users/:id/settings
  PATCH  /api/v1/users/:id/settings

AI Scanning
  POST   /api/v1/scan/identify              # multipart upload; temp file stored to /scans/ in S3, deleted within 24h
  POST   /api/v1/scan/batch

Admin
  POST   /api/v1/admin/stickers
  PATCH  /api/v1/admin/stickers/:id

System
  GET    /health
  GET    /health/ready
  GET    /api/v1/version
```

**Pagination:** All list endpoints use cursor-based pagination. Pass `?cursor=<opaque_token>` to get the next page. Responses include a `nextCursor` field (null when no more pages exist) and a `total` count. Default page size is 100 items.

**File storage prefixes (S3 / local filesystem):**
- `/avatars/{userId}` — user profile photos, permanent
- `/scans/{uuid}` — AI scan uploads, auto-deleted after 24 hours via S3 lifecycle rule

**Search:** `GET /api/v1/stickers?search=<term>` performs fuzzy player-name and team-name matching using PostgreSQL `pg_trgm` (trigram) extension. Index: `CREATE INDEX idx_stickers_player_name_trgm ON stickers USING gin (player_name gin_trgm_ops);`. Results are ranked by similarity and capped at 50 per page. Cached in Redis (`stickers:search:{normalized_term}`, TTL 1 hour) since the master list is read-only.

**File upload validation:** All `multipart/form-data` endpoints (`/scan/identify`, `/scan/batch`, `/users/:id/avatar`) enforce: max 10 MB per file; allowed MIME types `image/jpeg`, `image/png`, `image/webp`; magic-byte validation via the `file-type` package (defends against MIME-spoofed uploads). Avatar uploads are additionally resized server-side to a 512×512 max and stripped of EXIF before storage. ClamAV scanning is added at the 1,000-user threshold (deferred for cost; see §29.3).

### 6.4 Granular Rate Limiting

| Endpoint | Limit | Reason |
|---|---|---|
| `POST /auth/login` | 5 per 15 min per IP | Brute force protection |
| `POST /auth/register` | 3 per hour per IP | Spam account prevention |
| `POST /scan/identify` | 20 per hour per user | Claude API cost control |
| `POST /scan/batch` | 5 per hour per user | High-cost AI operation |
| `GET /trade/matches` | 60 per hour per user | Prevents data scraping |
| `GET /stickers` | 200 per hour per user | Burst protection (cached anyway) |
| `POST /trade/requests/:id/messages` | 30 per hour per user | Prevent message spam |
| `POST /trade/requests/:id/ratings` | 2 per trade per user | Natural limit (one per direction) |
| `POST /users/:id/reports` | 5 per hour per user | Prevent report-bombing |
| `PATCH /admin/reports/:id` | 60 per hour per admin | Normal moderation pace |
| All other endpoints | 100 per minute per user | General abuse prevention |

Rate limiting is implemented in Fastify middleware locally, and additionally enforced at the WAF layer in cloud.

## 10. AI Image Processing

### 10.1 Local Mock Mode

When `CLAUDE_API_KEY=mock`, the scan endpoint returns a hardcoded realistic response without calling the Claude API:

```json
{
  "sticker_number": 247,
  "album_code": "BRA5",
  "player_name": "Vinicius Jr.",
  "team_fifa_code": "BRA",
  "confidence": 0.94,
  "reasoning": "Mock response — AI scanning disabled in local mode"
}
```

This lets the entire scan UI be built and tested locally at zero cost.

### 10.2 Cloud Pipeline (Identical Logic, Real API)

When `CLAUDE_API_KEY` is a real Anthropic API key:

1. **AWS Lambda** preprocesses the image (EXIF strip, resize, type validation)
2. **Border colour detection** identifies the rarity variant
3. **Claude Vision API** identifies the player and sticker number
4. Confidence routing — auto-populate (≥0.85), selection UI (0.60–0.84), manual (`< 0.60`)
5. Image deleted from S3 within 24 hours

### 10.3 Graceful Degradation

If the Claude API is unavailable (in any environment), the scan endpoint returns a `503` with a user-friendly message. The rest of the application continues working fully.

