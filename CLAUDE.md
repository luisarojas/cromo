# Cromo

## Project Rules

### Docker-First Development Environment
The application always runs inside Docker containers via docker-compose. Never suggest running services, installing dependencies, or executing build/seed/migration commands directly on the host machine. All such operations must go through docker-compose.

The compose file is at `infrastructure/docker/docker-compose.yml`. Common patterns:
- **Run a command in a service:** `docker compose -f infrastructure/docker/docker-compose.yml exec <service> <command>`
- **Rebuild after code/dependency changes:** `docker compose -f infrastructure/docker/docker-compose.yml up --build`
- **View logs:** `docker compose -f infrastructure/docker/docker-compose.yml logs -f <service>`
- **Restart a service:** `docker compose -f infrastructure/docker/docker-compose.yml restart <service>`

Never suggest `npm install`, `npm run build`, or similar commands outside of a `docker compose exec` context.

### No Backward Compatibility Required
There is no need to support any kind of backward compatibility. Cromo is in active development and can be rebuilt and redeployed when significant changes are made. Feel free to make breaking changes, refactor, and deploy without worrying about migration paths or deprecation warnings.

### Sticker Catalog Cache
The frontend's localStorage cache for the sticker catalog is keyed off a backend-provided version (`GET /api/v1/stickers/version`). The version is derived from `MAX(updated_at)` across the catalog tables, so any catalog mutation invalidates every browser on next page load automatically — no manual cache-key bump.

After a reseed, also flush Redis (`docker compose -f infrastructure/docker/docker-compose.yml exec cache redis-cli FLUSHALL`) since the backend caches sticker list responses for 1 hour and the catalog-version probe for 5 min. Admin edits via `PATCH /api/v1/admin/stickers/:id` already bust the version cache key (`cromo:catalog_version`) automatically.

### API Response Casing — Always Use the Global Serializer
The backend uses raw SQL and emits PostgreSQL `snake_case` row objects from its services. A global serializer in `apps/backend/src/app.ts` runs `camelizeKeys` (from `apps/backend/src/utils/casing.ts`) on every JSON response, so the wire format is always `camelCase`. Frontend types in `@cromo/shared` and the interfaces in `apps/frontend/src/lib/api.ts` describe that camelCase wire format.

Rules to follow:
- **Do not** add per-endpoint snake→camel mapping functions in the frontend (e.g. `mapTradeSummary`, `mapTradeDetail`). If a response looks like snake_case in the client, the fix is on the backend, not in the API layer.
- **Do not** rename SQL aliases to camelCase to "make it work." Keep SQL idiomatic; let the serializer do its job.
- When adding a new Fastify route, you do **not** need to declare a `response:` schema for casing to work — the global setup covers both schema'd and non-schema'd routes via `setSerializerCompiler` + `setReplySerializer`. Existing `response:` schemas in route definitions are documentation only; the custom serializer ignores them for actual serialization, so adding/removing fields there has no runtime effect.
- **Exception: raw socket writes.** SSE handlers use `reply.raw.write(...)` to push events directly to the socket, which bypasses both Fastify serializers. Any handler that writes raw bytes (or publishes payloads consumed by such a handler) must explicitly call `camelizeKeys(payload)` before `JSON.stringify`. See the SSE handler in `apps/backend/src/routes/v1/trade.ts` for the canonical pattern.

If both `setSerializerCompiler` and `setReplySerializer` need to be kept in sync (e.g. when changing the casing strategy), update both — losing one silently regresses every route on the wrong side of the schema/no-schema split.

### Drizzle Migrations — Single Migrations Folder
The database schema is managed by Drizzle ORM. The Drizzle table definitions live in `apps/backend/src/db/schema.ts`; migration SQL files live in `apps/backend/src/db/migrations/` (alongside a `meta/_journal.json` index and per-migration snapshots). The backend applies pending migrations at startup via `runMigrations()` in `apps/backend/src/db/migrate.ts`, which delegates to Drizzle's `migrate()` and writes its bookkeeping into a `drizzle.__drizzle_migrations` table on the target DB.

To change the schema:
1. Edit `apps/backend/src/db/schema.ts`.
2. Generate a migration: `pnpm db:generate` (routes through `docker compose exec api` automatically).
3. Review the generated SQL in `src/db/migrations/`. For things Drizzle can't infer (PL/pgSQL functions, triggers, views), hand-write a separate `NNNN_*.sql` file and add a matching entry to `meta/_journal.json` plus a placeholder `meta/NNNN_snapshot.json` (copy the previous snapshot, refresh `id`/`prevId`).
4. Apply: `pnpm db:migrate` (via docker compose exec). On the next API startup the migration is also applied automatically.

Catalog seed data (album types, editions, formats, scan prompts) lives in `scripts/seeds/00_album_catalog.sql` and is loaded by `pnpm db:seed`, not by the migration system.

### Application Versioning — Hybrid SemVer + `git describe`

Cromo has two version surfaces, and they exist for different reasons:

1. **Runtime `APP_VERSION`** — what the running app reports to itself and to observability. Surfaces include `/api/v1/health`, Sentry `release` tags (client + server), and any future log line / activity entry that quotes a build identifier. The value is **computed at build time** by `scripts/app-version.sh` (which is `git describe --tags --always --dirty`) and baked into the container image via:
    - Backend: `ARG APP_VERSION` → `ENV APP_VERSION` in `apps/backend/Dockerfile.cloud`, read at runtime by `apps/backend/src/env.ts`.
    - Frontend: `ARG NEXT_PUBLIC_APP_VERSION` in `apps/frontend/Dockerfile.cloud`, baked into the Next.js client bundle (`NEXT_PUBLIC_*` is build-time) and re-exported in the runtime stage so server-side Sentry init sees it too.

   CI sets both build-args from `./scripts/app-version.sh` in `.github/workflows/ci-cd.yml`. Locally, `./scripts/dev-up.sh` exports `APP_VERSION` before `docker compose`; plain `docker compose -f infrastructure/docker/docker-compose.yml ...` still works and falls back to the static `0.0.0-local` label baked into the compose file.

2. **`package.json` `version`** — the **base SemVer** the runtime version extends. It lives in four files that must stay in lockstep: `package.json`, `apps/backend/package.json`, `apps/frontend/package.json`, `packages/shared/package.json`. It has **no runtime consumer** — runtime code must never read `package.json.version`; it must use `process.env.APP_VERSION`. The base SemVer exists purely to (a) answer "what release line are we on?" without git introspection, and (b) keep tooling that introspects `package.json` happy.

The two surfaces converge at tagged commits and diverge in between:

| State                         | `package.json.version` | Runtime `APP_VERSION`        |
| ----------------------------- | ---------------------- | ---------------------------- |
| At tag `v0.2.0`               | `0.2.0`                | `v0.2.0`                     |
| 3 commits past `v0.2.0`       | `0.2.0`                | `v0.2.0-3-gabcd123`          |
| Dirty working tree            | `0.2.0`                | `v0.2.0-3-gabcd123-dirty`    |
| Before any tag exists         | `0.1.0`                | `<short-sha>` or `<…>-dirty` |

**To cut a release:** `./scripts/release.sh 0.2.0`. The script validates SemVer, refuses on a dirty tree or a re-used tag, rewrites all four `version` fields, commits the bump as `Release v0.2.0`, and creates an annotated `v0.2.0` git tag. Then `git push origin main --tags` triggers the deploy pipeline; CI's `git describe` naturally reports `v0.2.0` for that commit and `v0.2.0-N-g<sha>` for each subsequent commit until the next tag.

**Release workflow — step by step:**

```bash
# from a clean main, with whatever you want to release already merged
git checkout main && git pull
./scripts/release.sh 0.2.0
git push origin main --tags
```

That sequence does everything the runtime versioning model needs:
1. `release.sh` rewrites the four `package.json` `version` fields to `0.2.0`, commits as `Release v0.2.0`, and creates an **annotated** git tag `v0.2.0` on that commit (annotated, not lightweight — `git describe` only honours annotated tags by default, which is the whole point of the model).
2. `git push origin main --tags` lets the bump commit and the new tag leave your machine. CI runs on the new commit; `scripts/app-version.sh` returns `v0.2.0`; the built images bake that string; `/api/v1/health` and Sentry start reporting it.

Patch and pre-release follow the same shape: `./scripts/release.sh 0.2.1`, `./scripts/release.sh 0.3.0-rc.1`, etc.

**GitHub Releases — optional polish on top of the tag.** A GitHub Release is just metadata GitHub attaches to an existing tag; it does **not** change anything the running app sees. Create one only if you want a human-readable changelog UI:

```bash
gh release create v0.2.0 --generate-notes                    # auto-notes from PRs
gh release create v0.2.0 --title "v0.2.0 — …" --notes "…"   # hand-written notes
```

Skipping this is fine — the git tag is the contract, the GitHub Release is decoration.

**Rolling back a botched release.** If `release.sh` succeeded but you have **not yet pushed**:

```bash
git tag -d v0.2.0          # remove the tag locally
git reset --hard HEAD~1    # drop the bump commit (DESTRUCTIVE — unpushed only)
```

If the tag has already been pushed, **roll forward with a new patch release** (`0.2.1`) instead of deleting the published tag. Deleting a published tag rewrites history for everyone who fetched it and breaks anyone still running an image built from it. The "No Backward Compatibility Required" project rule applies to schema and API shape — it does **not** apply to released version tags, which are immutable by convention.

**Rules to follow:**
- **Never edit a workspace `package.json` `version` field by hand.** Always go through `scripts/release.sh`, which guarantees the four files stay in sync and that the matching git tag exists.
- **Never read `package.json.version` from runtime code.** The runtime contract is `process.env.APP_VERSION` — if you reach for `package.json`, you'll silently report the *release line* instead of the *commit*, and that will mislead whoever is debugging an incident.
- **If you add a new workspace package** (a new `apps/*` or `packages/*`), update the `FILES=` array in `scripts/release.sh` and the table above in lockstep. A package whose `version` is not bumped by the release script will drift indefinitely.
- **Build metadata (`+sha…`) is disallowed in release tags** — `release.sh` rejects it because `+` isn't valid in a git tag name. Use a pre-release suffix (`0.2.0-rc.1`) if you need to disambiguate.
- **First-time setup is already done** — root, backend, and shared were bumped from `0.0.0-local` → `0.1.0` to match the frontend's existing base. The first run of `release.sh` should be `./scripts/release.sh 0.2.0` (or `0.1.1` for a patch) when cutting the first real release.

### AWS Account Access — Two Profiles, MFA-Gated

Operator authentication to the AWS account uses a two-tier IAM model, both Terraform-managed where possible:

- **`cromo` profile** → `cromo-admin` IAM user (`AdministratorAccess`). Use only for `terraform plan` / `apply` / `destroy` and one-off ops that genuinely need broad permissions. Hardcoded in `infrastructure/terraform/env/dev/main.tf` and `backend.tf` — Terraform always uses this profile regardless of `$AWS_PROFILE`.
- **`cromo-dev` profile** → an operator IAM user (e.g. `luisa`) created by `modules/dev-access`. Scoped to `ec2:DescribeInstances`, `ssm:StartSession` to the `cromo-dev-app` instance, `secretsmanager:GetSecretValue` on `cromo/dev/app`, and self-MFA management. Use for everything else (seeding through SSM port-forward, reading secrets, ad-hoc psql).

Both users carry the customer-managed policy `cromo-{shared,dev}-require-mfa` (`modules/iam-mfa-enforcement`) that **denies every sensitive action unless `aws:MultiFactorAuthPresent = true`**, so long-lived access keys are useless without first calling `sts:GetSessionToken` with an MFA token. The deny condition is `BoolIfExists` not `Bool`.

The policy is customer-managed rather than inline because the canonical AWS document exceeds the 2,048-byte inline-policy cap — `aws_iam_user_policy_attachment` of an `aws_iam_policy` is the only shape that works.

The operator workflow (mint creds via `scripts/aws-mfa-session.sh`, port-forward into the private dev RDS via SSM, reseed) is in `docs/runbooks/aws-access.md`. Design rationale (including why not AWS IAM Identity Center yet) is in `docs/architecture/auth-security.md` §9.9.

**Rules to follow:**
- **Never write access keys into Terraform** (`aws_iam_access_key`). Keys land in state and leak through `terraform show`. Create them via the AWS console post-apply; the IAM user resources themselves are fine to manage in Terraform.
- **Never set `custom:username` on a `aws_cognito_user` resource in `modules/auth`.** The AWS provider has a read/write asymmetry on custom Cognito schema attributes whose name (`username`) collides with a built-in field, which surfaces as permanent plan drift. The backend's `deriveUsername()` in `apps/backend/src/services/cognito-auth.service.ts` synthesises the same value from the email local part on first login — bootstrapping the attribute is behaviour-neutral, so don't do it.
- **Don't propose AWS IAM Identity Center** unless asked. It was considered and intentionally deferred until the team grows past one person; the MFA-required policy closes the same threat at lower complexity.
- **The dev RDS is `publicly_accessible = false`.** Any command targeting it from a laptop must go through the SSM port-forward documented in `docs/runbooks/aws-access.md` §5 — direct connections will time out (or fall back to `/tmp/.s.PGSQL.5432` if `DATABASE_URL` is malformed).

### AI Scan Provider — Env-Driven, Multi-Backend

The sticker identification call in `apps/backend/src/services/scan.service.ts` (`identifySticker`) dispatches to one of two providers based on env, so we can swap backends without touching code. Both providers consume the same prompt built by `buildIdentifyPrompt` and emit the same `ScanResult[]` shape — only the wire-level call differs.

| Env var          | Values                                                                                       | Notes |
| ---------------- | -------------------------------------------------------------------------------------------- | ----- |
| `SCAN_PROVIDER`  | `gemini` (default), `groq`                                                                   | Picks which provider `identifySticker` calls. |
| `SCAN_MODEL`     | provider-specific model id (optional)                                                         | Overrides the provider's default model. E.g. `meta-llama/llama-4-scout-17b-16e-instruct` to try Scout instead of Maverick on Groq, or `gemini-2.5-pro` to try Pro instead of Flash on Gemini. |
| `GEMINI_API_KEY` | `mock` (default) or real key from https://aistudio.google.com/apikey                          | Only consulted when `SCAN_PROVIDER=gemini`. |
| `GROQ_API_KEY`   | `mock` (default) or real key from https://console.groq.com/keys                               | Only consulted when `SCAN_PROVIDER=groq`. |

**Default models per provider** (defined as constants in `scan.service.ts`):
- `gemini` → `gemini-2.5-flash`
- `groq`   → `meta-llama/llama-4-maverick-17b-128e-instruct`

**Mock pathway.** `identifySticker` short-circuits to the canned `MOCK_RESULTS` (BRA5 / Vinicius Jr.) when the **active** provider's API key equals the literal string `'mock'`. That means flipping `SCAN_PROVIDER` without also setting the new provider's key flips you into mock mode silently — the symptom is "every scan returns BRA5". Always set both `SCAN_PROVIDER` and the matching key together.

**Why we have a switch.** Quality and latency are in tension on the free tiers:
- Gemini Flash with thinking enabled: best quality on fine variant detection, ~10–20s per scan.
- Gemini Pro with thinking enabled: stronger reasoning, but free-tier quotas are tight (~5 RPM) and latency runs 30–60s+.
- Groq Llama 4 Maverick/Scout: fast (~1–3s) and a much more generous free tier, but historically weaker on the fine visual discriminations this app needs (border colours, foil textures, background tiers). Commit `150be50` migrated *away* from Scout for exactly this reason; Maverick is the upgrade path within the Llama family.

There is no free option that is simultaneously fast, high-quality, and unmetered — that is a paid-API decision (GPT-4o, Claude Sonnet vision), not a tuning decision.

**Rate-limit behaviour.** `MAX_RETRIES = 0` for both providers. Free-tier 429s used to stack into multi-minute hangs (one 60s timeout per attempt + 10s back-off × 4 attempts ≈ 4–5 minutes); failing fast surfaces the 503 to the frontend in ~1–2s so the user knows to back off. Raise `MAX_RETRIES` only if you move to a paid tier where quotas are no longer the binding constraint.

**Rules to follow:**
- **Don't read `env.GEMINI_API_KEY` or `env.GROQ_API_KEY` directly from elsewhere** — all provider selection and key consumption is centralised in `scan.service.ts`. If you need a new provider, add a third branch alongside `callGemini` / `callGroq`, not a parallel call site.
- **Both providers must accept the same prompt and emit the same `ScanResult[]` shape.** The prompt in `buildIdentifyPrompt` is provider-agnostic; if a future provider needs a different prompt shape, branch *inside* the provider call helper, not at the call site.
- **When changing the default model**, update both the constant in `scan.service.ts` AND the description in `.env.example` so the documented default doesn't drift from reality.
- **Production deploys.** `SCAN_PROVIDER`, `SCAN_MODEL`, `GEMINI_API_KEY`, and `GROQ_API_KEY` all exist as Terraform variables in `infrastructure/terraform/env/{dev,prod}/`. Edit `terraform.tfvars` and re-apply to flip providers or models without a code change; the new values land in Secrets Manager and the EC2 user-data re-renders `/etc/cromo/cromo.env` on the next instance launch (ASG recycle).
- **`SCAN_MODEL` is conditionally merged into the secrets block** (`var.scan_model != "" ? { SCAN_MODEL = var.scan_model } : {}`) rather than always-set. The reason: in `scan.service.ts`, model selection is `env.SCAN_MODEL ?? DEFAULT_<PROVIDER>_MODEL` — an empty string would *override* the default to `""` and force `model=""` in the API call. The Terraform-side conditional keeps the env var absent when unused so the code-side default wins. Preserve this pattern; never replace it with an unconditional assignment.

### Sticker Types & Rarities — Source of Truth

This section is the **canonical model** of every sticker variant Cromo recognises. Every change to the codebase — prompts, types, seeds, services, UI labels, docs, tests — MUST be consistent with this section. If reality (Panini's actual product) and this section ever diverge, update this section first and propagate; do not let the codebase silently drift.

Hard rules that follow from this model (call these out in any PR that touches stickers):
- The variant `base_borderless` is shared by **two** sticker types: international core Base stickers AND Coca-Cola stickers. They are distinguished by `sticker_type` (`null` vs `'coca_cola_special'`), never by the variant token.
- There is **no smooth (non-crumple) gold border variant** in the main set. The only "gold" finish on a core sticker is `gold_crumple` (iCollect online base). The only smooth gold finish anywhere is `extra_gold`, which is the **background colour** of an Extra sticker — its outer border is still white.
- Extra stickers' outer border is **always white**. Rarity is encoded in the background colour behind the action photo, never in the rim. Extras have no Crumple variants and no album slot.
- Coca-Cola stickers have **no parallel variants and no Crumple variants** — every physical Coca-Cola sticker looks identical. Digital "Fan Sticker" / "Cosmic" variants from the FIFA Panini Collection App are out of scope for Cromo (physical-only).
- `swiss_green` is the Switzerland "United Edition" **sticker border variant** (light/mint/sage green). `swiss_gold` is the **album edition key** for the Swiss gold-foiled premium album cover. Do not conflate them.
- The AI scan prompt must return **canonical `variant_type` tokens** in the `variantToken` field (e.g. `"base_border"`, `"base_borderless"`, `"blue"`, `"black"`, `"orange_amazon"`, `"gold_crumple"`, `"swiss_green"`, `"extra_gold"`, …). The frontend's `pickVariantId` does exact match first, `startsWith` fallback second.
- The full canonical variant list lives in `packages/shared/src/types/index.ts` (`VariantType` union) and `packages/shared/src/constants/index.ts` (`VARIANT_RARITY`). Display labels live in `apps/frontend/src/app/album/components/variantMeta.ts`. Add new variants in all three files in lockstep.

#### 1. Base Stickers & Standard Parallels (Border Variants)

Panini ships the standard base in two regional layouts. In regions with colored parallels, the base sticker uses a **white border** so its layout matches the colored chases; in purist international regions it stays **borderless**.

| Border Colour | Average Pack Odds | Rarity Tier & Notes | Variant token |
| --- | --- | --- | --- |
| **Base (No Border)** | every pack (Intl) | **Common** — international editions (Mexico, Europe, South America). | `base_borderless` |
| **Base (White Border)** | every pack (NA) | **Common** — North American packs, white 3mm rim matching the parallel layout. | `base_border` |
| **Blue** | 1 in 2 packs | **Uncommon** | `blue` |
| **Red** | 1 in 25 packs | **Rare** | `red` |
| **Purple** | 1 in 200 packs | **Very Rare** | `purple` |
| **Green** | 1 in 1,400 packs | **Ultra Rare** — vivid emerald/grass green. | `green` |
| **Black** | 1-of-1 | **Masterpiece** — only one unique copy exists per player. | `black` |

#### 2. "Crumple" Parallels (Panini iCollect online-exclusive boxes)

Crumple stickers have a wrinkled/crinkled metallic foil background. They exist only in **Panini iCollect online exclusive boxes**, in parallel to the standard set. Every standard parallel has a Crumple counterpart:

| Variant | Online Pack Odds | Notes | Variant token |
| --- | --- | --- | --- |
| **Gold Flood Crumple** | 6 per online pack | Replaces the white-bordered base entirely in iCollect boxes. There is no smooth, non-crumple Gold border in the main set. | `gold_crumple` |
| **Blue Crumple** | 1 in 2 online packs | | `blue_crumple` |
| **Red Crumple** | 1 in 26 online packs | | `red_crumple` |
| **Purple Crumple** | 1 in 204 online packs | | `purple_crumple` |
| **Green Crumple** | 1 in 1,529 online packs | | `green_crumple` |
| **Black Crumple** | 1-of-1 | Textured unique print. | `black_crumple` |

#### 3. Regional & Retailer Exclusives

- **NA vs. International base split** — North American packs use `base_border` (white border); international purist packs use `base_borderless` (no rim). Same internal layout in both.
- **Switzerland "United Edition"** — country-specific album. Swiss packs contain regional **Light Green border** variants (`swiss_green`). The physical Swiss premium album cover is gold-foiled and tracked as a separate `swiss_gold` *album edition* key — do not confuse it with the green sticker variant.
- **Amazon Exclusive** — starter kits and boxes bought directly from Amazon contain exclusive **Orange Border** parallels (`orange_amazon`).
- **Hardcover Albums** — select markets get premium hardcover/metallised editions (often via Amazon Collector's Tins or European bundles); standard retail leans softcover. These are album formats, not sticker variants.

#### 4. "Extra Stickers" Subset

Short-printed, unnumbered action shots of 20 global superstars (Messi, Ronaldo, Mbappé, Yamal, etc.). They land as an 8th bonus item on average **1 in 100 packs** and **do not have a dedicated slot in the album**. No Crumple variants.

**Crucial visual rule:** the outer border of an Extra sticker is **always white**. Rarity is encoded in the **background colour** directly behind the player's action shot — never in the rim.

| Background Colour | Rarity Tier | Notes | Variant token |
| --- | --- | --- | --- |
| **Purple / Burgundy** | Base "Extra" | Most common Extra. | `extra_purple` |
| **Bronze** | Uncommon | Copper/bronze metallic background. | `extra_bronze` |
| **Silver** | Rare | Metallic silver background. | `extra_silver` |
| **Gold** | Ultra Rare | Brilliant gold background. The pinnacle of the pack hunt. | `extra_gold` |

#### 5. Coca-Cola Partnership Subset

A promotional subset featuring **12 specific international stars** (including Lamine Yamal, Harry Kane, Weston McKennie, Alphonso Davies) heavily weighted toward North American talent.

- **Physical stickers** — obtained by peeling labels off specially-marked 20-oz Coca-Cola and Coca-Cola Zero Sugar bottles in the USA. They have **no border variants and no Crumple versions**; every physical Coca-Cola sticker looks identical. They live in a dedicated bonus section at the back of the album. Variant token: `base_borderless` (shared with international core base; distinguished via `sticker_type = 'coca_cola_special'`).
- **Digital Album App** — scanning the bottle labels unlocks digital-only packs in the FIFA Panini Collection App with exclusive **"Fan Stickers"** and **"Cosmic" variants**. These are app-only and **out of scope** for Cromo's physical-sticker tracking.

#### 6. Visual Identification — Front of Sticker

Use this table to identify a sticker's `sticker_type` from a photo of its **front**. Every characteristic below is invariant within a type; if a scan/prompt/UI ever asserts otherwise, it is wrong.

| Characteristic | Core | Extra | Coca-Cola |
| --- | --- | --- | --- |
| **Photo pose/type** | Posed studio portrait | Action shot | Action shot |
| **FIFA 2026 logo position** | Upper-right corner | Upper-left corner | Upper-left corner |
| **Sticker variants available** | No border (base, Intl), white border (base, NA), blue (border or crumple), red (border or crumple), purple (border or crumple), green (border or crumple), black (border or crumple), light green border (Switzerland only), orange border (Amazon purchase only) | Purple background, bronze background, silver background, gold background | None — every physical Coca-Cola sticker looks identical |
| **Specific text on sticker** | None | "Extra sticker" text in upper-right corner | None |
| **Player name position** | Lower middle. Below the name: D.O.B., height, weight, and club team. Background colour of this info block varies. | Lower middle, on a black background | Along the lower-left edge, displayed **vertically** |
| **Country flag icon** | Lower-right, accompanied by the 3-letter country code | Lower-left corner AND used as the background behind the player | None |

#### 7. Visual Identification — Back of Sticker

The back of a real sticker prints the **album code** (e.g. `COL4`, `BRA19`, `FWC4`) PLUS three constant branding markers present on every sticker back: the text `FIFA WORLD CUP 2026`, the text `OFFICIAL LICENSED PRODUCT`, and the Panini wordmark. These three markers are what distinguish a real sticker back from an **empty album slot** — slots inside the physical album also print a code (so the collector knows which sticker belongs there), but they lack the FIFA/Panini branding. Any back-of-sticker scan handler must check for these markers; treating a code-bearing slot as a sticker is the failure mode this rule exists to prevent.

Operationally, the scan still returns **only** the album code from a back-of-sticker image — the FIFA/Panini text exists to disambiguate sticker-vs-slot, not to be re-OCR'd or returned. Player name, country, sticker type, and album slot are all derived from the code via the catalog. A scan that returns more than the album code from a back-of-sticker image is hallucinating — trust the code lookup, not the OCR'd surrounding text.
