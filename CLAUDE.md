# Cromo

## Project Rules

### Docker-First Development Environment
The app always runs inside Docker via `infrastructure/docker/docker-compose.yml`. Never suggest running services, installing deps, or executing build/seed/migration commands directly on the host — everything goes through `docker compose`.

Common patterns:
- **Exec in a service:** `docker compose -f infrastructure/docker/docker-compose.yml exec <service> <cmd>`
- **Rebuild:** `docker compose -f infrastructure/docker/docker-compose.yml up --build`
- **Logs / restart:** `docker compose -f infrastructure/docker/docker-compose.yml logs -f <service>` / `restart <service>`

### No Backward Compatibility Required
Cromo is in active development — make breaking changes freely. No migration paths, no deprecation warnings. (Exception: published release tags are immutable by convention; see versioning.)

### Sticker Catalog Cache
The frontend's localStorage cache is keyed off `GET /api/v1/stickers/version`, derived from `MAX(updated_at)` across catalog tables — any mutation auto-invalidates all browsers.

After a reseed, also flush Redis (`docker compose ... exec cache redis-cli FLUSHALL`) — the backend caches sticker lists for 1h and the version probe for 5min. Admin edits via `PATCH /api/v1/admin/stickers/:id` bust `cromo:catalog_version` automatically.

### API Response Casing — Always Use the Global Serializer
Backend services emit Postgres `snake_case`; a global serializer in `apps/backend/src/app.ts` runs `camelizeKeys` (from `apps/backend/src/utils/casing.ts`) on every JSON response. Wire format is always `camelCase`. Frontend types in `@cromo/shared` and `apps/frontend/src/lib/api.ts` describe that.

Rules:
- **Don't** add per-endpoint snake→camel mappers in the frontend. If a response looks snake_case, fix the backend.
- **Don't** rename SQL aliases to camelCase. Keep SQL idiomatic.
- New Fastify routes do **not** need a `response:` schema for casing — `setSerializerCompiler` + `setReplySerializer` cover both schema'd and non-schema'd routes. Existing `response:` schemas are doc-only.
- **Exception: raw socket writes.** SSE handlers using `reply.raw.write(...)` bypass both serializers; explicitly call `camelizeKeys(payload)` before `JSON.stringify`. Canonical pattern in `apps/backend/src/routes/v1/trade.ts`.

If changing casing strategy, update **both** `setSerializerCompiler` and `setReplySerializer` — losing one silently regresses every route on the wrong side of the schema/no-schema split.

### Drizzle Migrations — Single Migrations Folder
Schema in `apps/backend/src/db/schema.ts`; SQL files in `apps/backend/src/db/migrations/` (plus `meta/_journal.json` + per-migration snapshots). Backend auto-applies pending migrations at startup via `runMigrations()` in `apps/backend/src/db/migrate.ts`; bookkeeping lives in `drizzle.__drizzle_migrations`.

To change the schema:
1. Edit `schema.ts`.
2. `pnpm db:generate` (routes through `docker compose exec api`).
3. Review the generated SQL. For things Drizzle can't infer (PL/pgSQL functions, triggers, views), hand-write a separate `NNNN_*.sql` and add a matching `meta/_journal.json` entry + placeholder snapshot (copy previous, refresh `id`/`prevId`).
4. `pnpm db:migrate` (or wait for the next API startup).

Catalog seed data (album types, editions, formats, scan prompts) lives in `scripts/seeds/00_album_catalog.sql` and loads via `pnpm db:seed`, not the migration system.

### Application Versioning — Hybrid SemVer + `git describe`

Two version surfaces with different roles:

1. **Runtime `APP_VERSION`** — what the app reports (`/api/v1/health`, Sentry `release` tags, future log lines). Computed at build time by `scripts/app-version.sh` (= `git describe --tags --always --dirty`) and baked into images:
   - Backend: `ARG APP_VERSION` → `ENV APP_VERSION` in `apps/backend/Dockerfile.cloud`, read by `apps/backend/src/env.ts`.
   - Frontend: `ARG NEXT_PUBLIC_APP_VERSION` in `apps/frontend/Dockerfile.cloud`, baked into the Next.js client bundle and re-exported in the runtime stage so server-side Sentry sees it.

   CI sets both build-args from `./scripts/app-version.sh` in `.github/workflows/ci-cd.yml`. Locally, `./scripts/dev-up.sh` exports `APP_VERSION` before `docker compose`; plain compose falls back to `0.0.0-local`.

2. **`package.json` `version`** — base SemVer the runtime extends. Lives in 4 lockstep files: root, `apps/backend`, `apps/frontend`, `packages/shared`. **No runtime consumer** — runtime code must use `process.env.APP_VERSION`. Base SemVer exists to (a) name the release line without git, (b) keep tooling happy.

Convergence:

| State                         | `package.json.version` | Runtime `APP_VERSION`        |
| ----------------------------- | ---------------------- | ---------------------------- |
| At tag `v0.2.0`               | `0.2.0`                | `v0.2.0`                     |
| 3 commits past `v0.2.0`       | `0.2.0`                | `v0.2.0-3-gabcd123`          |
| Dirty working tree            | `0.2.0`                | `v0.2.0-3-gabcd123-dirty`    |
| Before any tag exists         | `0.1.0`                | `<short-sha>` or `<…>-dirty` |

**Cut a release:**

```bash
git checkout main && git pull
./scripts/release.sh 0.2.0          # validates semver, refuses dirty/reused tag, bumps 4 files, commits "Release v0.2.0", annotated tag
git push origin main --tags         # CI deploys; `git describe` reports v0.2.0
```

Patch / pre-release follow the same shape (`0.2.1`, `0.3.0-rc.1`). The tag must be **annotated** — `git describe` only honours those by default.

**GitHub Releases** are optional metadata on top of the tag (`gh release create v0.2.0 --generate-notes`). Skip is fine — the git tag is the contract.

**Rollback.** Unpushed: `git tag -d v0.2.0 && git reset --hard HEAD~1`. Already pushed: **roll forward** with a patch (`0.2.1`); never delete a published tag — it rewrites history for anyone who fetched and breaks images built from it. The "No Backward Compatibility" rule applies to schema/API, not released tags.

**Rules:**
- **Never edit a workspace `package.json` `version` by hand** — always `scripts/release.sh`.
- **Never read `package.json.version` from runtime code** — use `process.env.APP_VERSION`. Reading `package.json` reports the *release line* instead of the *commit*, misleading incident debuggers.
- **New workspace package?** Update `FILES=` in `scripts/release.sh` and the table above in lockstep, or its version drifts forever.
- **Build metadata (`+sha…`) is rejected** — `+` isn't valid in git tag names. Use pre-release suffixes (`0.2.0-rc.1`).
- **First-time setup is done** — root/backend/shared bumped from `0.0.0-local` → `0.1.0` to match frontend. First real release: `./scripts/release.sh 0.2.0` (or `0.1.1`).

### In-App Changelog — User-Facing Release Notes

Lives at `/changelog`. Static SSR page, hand-curated data, not derived from git.

- **Page:** `apps/frontend/src/app/changelog/page.tsx` — renders entries newest-first, with category tags and an "Unreleased" badge when `date === null`.
- **Data:** `apps/frontend/src/app/changelog/entries.ts` — the only file you edit. Each entry has `version`, `date` (`'YYYY-MM-DD'` or `null`), `changes` keyed by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) categories: `Added`, `Changed`, `Fixed`, `Removed`, `Security`.
- **No nav links** point to `/changelog`. Reachable only by URL — intentional.

**Workflow — between releases (manual):**
Append bullets to the single `Unreleased` entry at index 0 as work ships.
- Write for collectors, not committers — describe user-visible effect, not implementation ("Player search matches accented names" > "Normalize NFD in name lookup").
- Skip changes with no user-visible effect (refactors, infra, internal renames) — but make that call explicitly.
- One clause per bullet, no nested qualifiers. If a bullet needs a comma-spliced "instead of…" tail, the verb is wrong.
- When `Unreleased` grows long or repeats a prefix, rewrite/reorder before appending — combine bullets on the same surface, group related items.

**Workflow — at release time (automated):**
`scripts/release.sh X.Y.Z` invokes `scripts/rotate-changelog.mjs` twice:
1. **`check`** (pre-flight) — fails the release if `Unreleased` isn't at index 0, has wrong `date`, or has zero bullets.
2. **`rotate`** (post-bump) — renames `Unreleased` → `vX.Y.Z`, stamps today's UTC date, prepends a fresh empty `Unreleased`. The mutated `entries.ts` ships in the same release commit.

You never edit `version` or `date` in `entries.ts` by hand — `release.sh` owns them.

**Rules:**
- **Update `Unreleased` in the same change that ships a user-visible fix/feature.** Appending the bullet is part of the work.
- **Don't link `/changelog` from any nav/footer/menu/banner.** Discoverability is a deliberate product decision.
- **Don't auto-generate entries from git log.** Commit subjects are written for reviewers.
- **Don't parse the root `CHANGELOG.md` at build time.** The two files are independent: `CHANGELOG.md` (if maintained) serves git tooling/GitHub Releases; `entries.ts` is the in-app SoT.
- **Don't hand-edit `version`/`date`** — the rotator owns them.
- **Preserve `entries.ts` shape.** `rotate-changelog.mjs` matches with regexes against `CHANGELOG: ChangelogEntry[] = [`, `version: 'Unreleased'`, `date: null`. Switching to double quotes, renaming the export, or splitting the type annotation breaks the script — update it in the same commit if you must.
- **Dates are UTC** in both the page and the rotator, so SSR matches the browser.

### AWS Account Access — Two Profiles, MFA-Gated

Two-tier IAM model, Terraform-managed:

- **`cromo` profile** → `cromo-admin` IAM user (`AdministratorAccess`). **Break-glass / bootstrap only** (initial account setup, recovering a broken state lock, etc.). Normal `terraform plan`/`apply` runs through GitHub Actions OIDC via `cromo-tf-runner` (see below). The Terraform backend/provider blocks no longer pin `profile = "cromo"` — they use the standard AWS chain, so `eval "$(./scripts/aws-mfa-session.sh --profile cromo)"` is the gate that satisfies `cromo-shared-require-mfa`.
- **`cromo-dev` profile** → operator user (e.g. `luisa`) from `modules/dev-access`. Scoped to `ec2:DescribeInstances`, `ssm:StartSession` on `cromo-dev-app`, `secretsmanager:GetSecretValue` on `cromo/dev/app`, self-MFA. Use for everything else (SSM port-forward, secrets, ad-hoc psql).

Both users carry `cromo-{shared,dev}-require-mfa` (`modules/iam-mfa-enforcement`), which **denies sensitive actions unless `aws:MultiFactorAuthPresent = true`** (condition is `BoolIfExists`, not `Bool`). Long-lived keys are useless without first calling `sts:GetSessionToken` with an MFA token. The policy is customer-managed (not inline) because the canonical AWS document exceeds the 2,048-byte inline cap.

Operator workflow (mint creds, port-forward to private dev RDS, reseed) is in `docs/runbooks/aws-access.md`. Design rationale (incl. why not IAM Identity Center) in `docs/architecture/auth-security.md` §9.9.

**Rules:**
- **Never write access keys into Terraform** (`aws_iam_access_key`) — keys land in state and leak via `terraform show`. Mint in console post-apply; the IAM user resources themselves are fine to manage.
- **Never set `custom:username` on `aws_cognito_user` in `modules/auth`.** The AWS provider has a read/write asymmetry on custom attributes that collide with built-in field names — surfaces as permanent plan drift. `deriveUsername()` in `apps/backend/src/services/cognito-auth.service.ts` synthesises the same value from the email local part on first login.
- **Don't propose AWS IAM Identity Center** unless asked. Intentionally deferred — MFA-required policy closes the same threat at lower complexity for a one-person team.
- **Dev RDS is `publicly_accessible = false`.** Laptop commands must go through SSM port-forward (`docs/runbooks/aws-access.md` §5) — direct connections time out (or fall back to `/tmp/.s.PGSQL.5432` on malformed `DATABASE_URL`).

### Terraform — GitHub Actions OIDC

`terraform plan`/`apply` run from `.github/workflows/terraform.yml`, not laptops. The workflow assumes `cromo-tf-runner` (`modules/terraform-runner`, instantiated once in `env/shared`) via GitHub OIDC with `AdministratorAccess`. Trust is constrained by OIDC `sub` patterns gated by GitHub Environment:

| Environment | Scope         | Gate                                          |
| ----------- | ------------- | --------------------------------------------- |
| `tf-shared` | `env/shared/` | Auto-applies on push to `main`                |
| `tf-dev`    | `env/dev/`    | Auto-applies on push to `main`                |
| `tf-prod`   | `env/prod/`   | Applies only on `v*` tag push (release tag)   |

The role is **not** subject to `cromo-shared-require-mfa` — that policy attaches to users, not roles. Short-lived OIDC sessions don't need the MFA gate; the trust policy already restricts to specific GitHub Environments in this repo.

**Workflow behaviour:**
- **PR** → parallel `terraform plan` for all three stacks; posts diffs as PR comments.
- **Push to `main`** → applies `shared` + `dev`. Prod is **not** applied — push a `v*` tag.
- **Push of `v*` tag** → applies `prod`. Releases via `./scripts/release.sh X.Y.Z && git push origin main --tags`. The release script's clean-tree + semver + unique-tag checks ARE the prod-deploy gate.
- **`workflow_dispatch`** → manual single-stack apply for one-off recoveries. Prod via dispatch still requires an underlying `v*` tag (OIDC trust enforces it).

**One-time repo config** (not in Terraform):
- Repo **secret** `AWS_TF_RUNNER_ROLE_ARN` = `module.terraform_runner.role_arn` from `env/shared`.
- Repo **variable** `AWS_REGION` = `ca-central-1`. (Workflow reads `vars.AWS_REGION`, not `secrets.AWS_REGION` — different namespaces.)
- GitHub Environments `tf-shared`, `tf-dev`, `tf-prod` created in settings. No protection rules required on Free — prod is gated at the OIDC-trust + workflow-condition layer.

**Rules:**
- **Never run `terraform apply` from a laptop for routine changes** — bypasses PR review, plan comment, and prod gate. Local apply stays for genuine emergencies via the `cromo` profile + MFA.
- **Never widen the `tf-prod` sub-pattern** to drop `:ref:refs/tags/v*`. That suffix is what stops a workflow misconfig from applying prod without a release tag.
- **The role intentionally has `AdministratorAccess`.** Defence is trust policy + Environment protection, not narrow permissions — scoping further means a new IAM error every time you add a service.
- **Local `terraform state` operations** (`mv`/`rm`/`push`/`force-unlock`) still happen from the laptop via the `cromo` profile — recovery ops, not routine flow.

### SES Bounce/Complaint Pipeline — SES → SNS → SQS → Poller

Bounces/complaints are routed to an in-process poller, not a webhook:

1. **SES** → events emitted to the `cromo-default` SESv2 configuration set's event destinations (`modules/ses`).
2. **SNS topics** `cromo-ses-bounces` and `cromo-ses-complaints` in `env/shared` — one publisher per event type, account-scoped.
3. **SQS queue** `cromo-{env}-ses-events` per env (`modules/ses-consumer`). Subscribes to both shared SNS topics with `raw_message_delivery = true` → plain SES JSON, not SNS envelopes.
4. **Backend poller** at `apps/backend/src/services/ses-poller.service.ts` — long-polls from `app.ts` alongside the Redis worker; parses events via `services/ses-event-handler.ts`; writes to `email_suppressions`.

**Why not a webhook?** The previous SNS HTTPS subscription to `/api/v1/internal/ses/notifications` created a chicken-and-egg: every fresh apply needed the backend live with the route deployed before `terraform apply` could finish the `SubscriptionConfirmation` handshake. SQS removes the ordering constraint — Terraform creates the queue/subscriptions independent of backend state, and bounces queue for up to 14 days if the backend is rolling.

**Why per-env queues** (vs one shared): IAM scoping is cleaner — each env's EC2 role only sees its own queue, so a dev bug can't drain prod. Cost is negligible.

**Why no per-message signature verification:** the queue policy only allows the two specific SES topics to publish, and the EC2 role only allows `sqs:ReceiveMessage` on this specific queue. IAM/queue policy does what the SNS signature check did.

**Rules:**
- **Don't reintroduce the HTTPS webhook** unless you need sub-second bounce latency. SES tolerates polling fine; the webhook's sharp edges (chicken-and-egg, subscription drift on hostname change, manual confirmation re-sends on dropped containers) cost real time.
- **Transient and permanent bounces both flow through the queue**, but only permanent are suppressed. Transient is SES's retry signal; suppressing it costs real users their mail. Filter lives in `ses-event-handler.ts`.
- **DLQ after 5 receive attempts.** Anything in the DLQ is a code bug — debug, fix, replay or drop. Don't quiet it with `maxReceiveCount`.
- **For new envs, the only env var the backend needs is `SES_QUEUE_URL`.** Unset = poller no-op (correct for local/test). The poller treats this as a feature flag.

### AI Scan Provider — Env-Driven, Multi-Backend

`identifySticker` in `apps/backend/src/services/scan.service.ts` dispatches to one of two providers based on env. Both consume the same `buildIdentifyPrompt` and emit the same `ScanResult[]` — only the wire call differs.

| Env var          | Values                                                            | Notes |
| ---------------- | ----------------------------------------------------------------- | ----- |
| `SCAN_PROVIDER`  | `gemini` (default), `groq`                                        | Picks the provider. |
| `SCAN_MODEL`     | provider-specific model id (optional)                             | Overrides default. E.g. `gemini-2.5-pro`. |
| `GEMINI_API_KEY` | `mock` (default) or real key from https://aistudio.google.com/apikey | Used when `SCAN_PROVIDER=gemini`. |
| `GROQ_API_KEY`   | `mock` (default) or real key from https://console.groq.com/keys   | Used when `SCAN_PROVIDER=groq`. |

**Default models** (constants in `scan.service.ts`):
- `gemini` → `gemini-2.5-flash`
- `groq`   → `meta-llama/llama-4-scout-17b-16e-instruct`

**Mock pathway.** `identifySticker` short-circuits to canned `MOCK_RESULTS` (BRA5 / Vinicius Jr.) when the **active** provider's key equals `'mock'`. Flipping `SCAN_PROVIDER` without also setting the new provider's key silently enters mock mode — symptom: every scan returns BRA5. Always set both together.

**Why a switch.** Free-tier trade-offs:
- Gemini Flash + thinking: best quality on variant detection, ~10–20s per scan.
- Gemini Pro + thinking: stronger reasoning; tight quotas (~5 RPM), 30–60s+ latency.
- Groq Llama 4 Scout: fast (~1–3s), generous free tier, weaker on fine visual discriminations (borders, foils, backgrounds). Commit `150be50` originally migrated away to Maverick, but Groq removed Maverick — Scout is again the only Llama option.

No free option is simultaneously fast, high-quality, and unmetered — that's a paid-API decision (GPT-4o, Claude Sonnet vision).

**Rate-limit behaviour.** `MAX_RETRIES = 0` for both. Free-tier 429s used to stack into multi-minute hangs (60s timeout × 4 attempts + 10s back-off ≈ 4–5 min); failing fast surfaces 503 in ~1–2s so the user can back off. Raise only on a paid tier.

**Rules:**
- **Don't read `env.GEMINI_API_KEY`/`env.GROQ_API_KEY` elsewhere** — provider selection and key consumption is centralised in `scan.service.ts`. New provider = third branch alongside `callGemini`/`callGroq`, not a parallel call site.
- **Both providers must accept the same prompt and emit the same `ScanResult[]`.** If a future provider needs a different prompt, branch *inside* the helper, not at the call site.
- **When changing a default model**, update both the constant and the description in `.env.example`.
- **Production deploys.** All four env vars exist as Terraform variables in `infrastructure/terraform/env/{dev,prod}/`. Edit `terraform.tfvars` and re-apply to flip provider/model without a code change; values land in Secrets Manager and EC2 user-data re-renders `/etc/cromo/cromo.env` on the next ASG recycle.
- **`SCAN_MODEL` is conditionally merged into secrets** (`var.scan_model != "" ? { SCAN_MODEL = var.scan_model } : {}`). Reason: code uses `env.SCAN_MODEL ?? DEFAULT_<PROVIDER>_MODEL` — an empty string would *override* the default to `""` and force `model=""` in the API call. Keep this pattern; never make it unconditional.

### Sticker Types & Rarities — Source of Truth

This section is the **canonical model** of every variant Cromo recognises. Every code change — prompts, types, seeds, services, UI labels, docs, tests — MUST be consistent with this section. If reality (Panini's product) diverges, update this section first and propagate.

Hard rules:
- `base_borderless` is shared by **two** sticker types: international core Base AND Coca-Cola. Distinguished by `sticker_type` (`null` vs `'coca_cola_special'`), never by variant token.
- **No smooth (non-crumple) gold border variant exists** in the main set. The only core "gold" is `gold_crumple` (iCollect online base). The only smooth gold anywhere is `extra_gold`, which is the **background** of an Extra — its outer border is still white.
- Extras' outer border is **always white**. Rarity = background colour, never the rim. No Crumple variants, no album slot.
- Coca-Cola stickers have **no parallels and no Crumple variants** — every physical CC looks identical except for the player. Digital "Fan Sticker" / "Cosmic" variants are out of scope (physical-only).
- **Coca-Cola is the only subset where `album_code` is not unique.** Slots CC3, CC5, CC6, CC8, CC9, CC12, CC13 print different players regionally; each alternate is its own `stickers` row sharing one `album_code`. **Identity is `sticker_id` (UUID) everywhere.** Any code-keyed map (`Map<albumCode,…>`, `Set<albumCode>`) silently loses CC alternates via last-write-wins and is a bug. Frontend `ownedMap`, favourites, selection, wanted sets are all keyed by `sticker_id`; only display labels and cross-album completion (per-slot, see §5) use `album_code`. The `stickers_album_type_id_album_code_unique` constraint was dropped in `0008_coca_cola_regional_variants.sql` — do not reintroduce.
- `swiss_green` is the Switzerland **sticker border variant** (light/mint/sage green). `swiss_gold` is the **album edition key** for the Swiss gold-foiled premium album cover. Don't conflate.
- The AI scan prompt must return **canonical `variant_type` tokens** in `variantToken` (e.g. `"base_border"`, `"base_borderless"`, `"blue"`, `"black"`, `"orange_amazon"`, `"gold_crumple"`, `"swiss_green"`, `"extra_gold"`). Frontend `pickVariantId` does exact match first, `startsWith` fallback second.
- Canonical lists live in `packages/shared/src/types/index.ts` (`VariantType` union) and `packages/shared/src/constants/index.ts` (`VARIANT_RARITY`). Display labels in `apps/frontend/src/app/album/components/variantMeta.ts`. **Update all three in lockstep.**

#### 1. Base Stickers & Standard Parallels (Border Variants)

Two regional base layouts: in regions with colored parallels the base uses a **white border** to match; in purist international regions it's **borderless**.

| Border Colour | Avg Pack Odds | Rarity & Notes | Variant token |
| --- | --- | --- | --- |
| **Base (No Border)** | every pack (Intl) | **Common** — Mexico, Europe, South America. | `base_borderless` |
| **Base (White Border)** | every pack (NA) | **Common** — NA packs, 3mm white rim. | `base_border` |
| **Blue** | 1 in 2 packs | **Uncommon** | `blue` |
| **Red** | 1 in 25 packs | **Rare** | `red` |
| **Purple** | 1 in 200 packs | **Very Rare** | `purple` |
| **Green** | 1 in 1,400 packs | **Ultra Rare** — vivid emerald. | `green` |
| **Black** | 1-of-1 | **Unique** — one per player. | `black` |

#### 2. "Crumple" Parallels (Panini iCollect online-exclusive boxes)

Wrinkled/crinkled metallic foil background. Only in iCollect online boxes, parallel to the standard set. Every parallel has a Crumple counterpart:

| Variant | Online Pack Odds | Notes | Token |
| --- | --- | --- | --- |
| **Gold Flood Crumple** | 6 per online pack | Replaces white-bordered base entirely in iCollect. No smooth Gold border exists. | `gold_crumple` |
| **Blue Crumple** | 1 in 2 | | `blue_crumple` |
| **Red Crumple** | 1 in 26 | | `red_crumple` |
| **Purple Crumple** | 1 in 204 | | `purple_crumple` |
| **Green Crumple** | 1 in 1,529 | | `green_crumple` |
| **Black Crumple** | 1-of-1 | Textured unique print. | `black_crumple` |

#### 3. Regional & Retailer Exclusives

- **NA vs Intl base split** — `base_border` (white) in NA, `base_borderless` in Intl. Same internal layout.
- **Switzerland "United Edition"** — country-specific album. Swiss packs contain regional **Light Green border** (`swiss_green`). The Swiss gold-foiled premium album cover is a separate `swiss_gold` *album edition*, not a sticker variant.
- **Amazon Exclusive** — starter kits/boxes from Amazon contain **Orange Border** parallels (`orange_amazon`).
- **Hardcover Albums** — premium hardcover/metallised editions in select markets (Amazon Collector's Tins, European bundles). Album formats, not sticker variants.

#### 4. "Extra Stickers" Subset

Short-printed, unnumbered action shots of 20 global superstars. Land as the 8th bonus on average **1 in 100 packs**. **No album slot. No Crumple variants.**

**Visual rule:** outer border is **always white**. Rarity = background colour behind the action shot, never the rim.

| Background | Rarity | Token |
| --- | --- | --- |
| **Purple / Burgundy** | Base "Extra" — most common. | `extra_purple` |
| **Bronze** | Uncommon — copper/bronze metallic. | `extra_bronze` |
| **Silver** | Rare — metallic silver. | `extra_silver` |
| **Gold** | Ultra Rare — brilliant gold. Pinnacle of the pack hunt. | `extra_gold` |

#### 5. Coca-Cola Partnership Subset

13 slots (CC1–CC13) covering up to 20 stars across regional printings. Six slots (CC1, CC2, CC4, CC7, CC10, CC11) print the same player everywhere; the other seven have **regional alternates** depending on where the bottle was sold (NA / LatAm / Europe / RoW).

Examples:
- **CC9** — Alphonso Davies (NA), William Saliba (Europe), Jordan Ayew (RoW).
- **CC3** — Harry Kane (NA), Eduardo Camavinga (Europe).
- **CC13** (Raúl Jiménez) — LatAm + Europe only; NA and RoW bottles never see this slot.

Each regional alternate is its own `stickers` row; multiple sticker IDs can share one `album_code`. **The only subset where that's true.**

- **Physical stickers** — peeled from specially-marked Coca-Cola / Zero bottles. **No border variants, no Crumple.** Live in a dedicated bonus section at the back of the album. Variant token: `base_borderless` (distinguished from core Intl base via `sticker_type = 'coca_cola_special'`).
- **No back-of-sticker scan path** — the back is bottle-label adhesive. CC stickers are identified only by the front. Any back-of-sticker flow can ignore CC.
- **Digital Album App** — bottle-label scans unlock app-only "Fan Stickers" / "Cosmic" variants. **Out of scope.**

**Album completion treats CC slots by `album_code`, not sticker row** — owning *any one* regional alternate fills the slot. Enforced server-side in `_sync_user_album_counts` (`0009_album_count_by_album_code.sql`) via `COUNT(DISTINCT album_code)` for `total`/`owned`. Non-CC subsets are unaffected (album code → exactly one sticker).

#### 6. Visual Identification — Front of Sticker

| Characteristic | Core | Extra | Coca-Cola |
| --- | --- | --- | --- |
| **Photo type** | Posed studio portrait | Action shot | Action shot |
| **FIFA 2026 logo** | Upper-right | Upper-left | Upper-left |
| **Variants available** | No border (Intl base), white border (NA base), blue/red/purple/green/black (border or crumple), light green border (CH only), orange border (Amazon only) | Purple / bronze / silver / gold background | None — all look identical |
| **Specific text** | None | "Extra sticker" upper-right | None |
| **Player name** | Lower middle; below: DOB, height, weight, club (background colour varies) | Lower middle on black | Lower-left edge, **vertical** |
| **Country flag** | Lower-right + 3-letter code | Lower-left + flag as background behind player | None |

#### 7. Visual Identification — Back of Sticker

The back prints the **album code** (e.g. `COL4`, `BRA19`, `FWC4`) PLUS three constant branding markers: `FIFA WORLD CUP 2026`, `OFFICIAL LICENSED PRODUCT`, and the Panini wordmark. These three markers distinguish a real sticker back from an **empty album slot** — slots inside the album also print a code (so the collector knows what belongs there) but lack the branding. Any back-of-sticker handler must check for these markers; treating a code-bearing slot as a sticker is the failure mode this rule prevents.

Operationally, the scan returns **only the album code** from a back-of-sticker image — the FIFA/Panini text exists to disambiguate sticker-vs-slot, not to be re-OCR'd. Player name, country, type, slot are all derived from the code via the catalog. A scan that returns more than the album code from a back image is hallucinating — trust the lookup, not the OCR'd surrounding text.
