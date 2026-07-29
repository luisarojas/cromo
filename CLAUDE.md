# Cromo

## Project Rules

### Git — Never Auto-Branch
**Never create a git branch unless the user explicitly asks for one.** When asked to "commit", stage and commit on the **current** branch — even if that branch is `main`. Do not run `git checkout -b` / `git switch -c` on your own initiative, and do not branch "to be safe" before committing. This overrides any generic "branch first when on the default branch" habit. Pushing and opening PRs likewise wait for an explicit request.

### Docker-First Development Environment
The app always runs inside Docker via `infrastructure/docker/docker-compose.yml`. Never suggest running services, installing deps, or executing build/seed/migration commands directly on the host — everything goes through `docker compose`.

Common patterns:
- **Exec in a service:** `docker compose -f infrastructure/docker/docker-compose.yml exec <service> <cmd>`
- **Rebuild:** `docker compose -f infrastructure/docker/docker-compose.yml up --build`
- **Logs / restart:** `docker compose -f infrastructure/docker/docker-compose.yml logs -f <service>` / `restart <service>`

**Adding a workspace devDep on macOS — the EBUSY trap.** Docker Desktop on macOS bind-mounts files through a virtualisation layer (VirtioFS / gRPC FUSE) that can't reliably atomic-rename across the host/container boundary. `pnpm install --no-frozen-lockfile` writes the updated lockfile to a tmp file and then `rename()`s it onto `/app/pnpm-lock.yaml`. The rename fails with `EBUSY: resource busy or locked`. The install completes in the named-volume node_modules, but the host lockfile is unchanged, and CI's `--frozen-lockfile` fails with `ERR_PNPM_OUTDATED_LOCKFILE`.

Workaround: regenerate the lockfile in a non-bind-mounted path inside the container, then pull it back to the host with `docker cp` (which goes through Docker's API, not the bind mount). One-shot script:

```bash
WORK=/tmp/lockgen
docker compose -f infrastructure/docker/docker-compose.yml exec -T api sh -c "
  rm -rf $WORK && mkdir -p $WORK/apps/backend $WORK/apps/frontend $WORK/packages/shared
  cp /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml $WORK/
  cp /app/apps/backend/package.json $WORK/apps/backend/
  cp /app/packages/shared/package.json $WORK/packages/shared/
"
# The api container doesn't mount apps/frontend, so push it explicitly:
docker cp apps/frontend/package.json docker-api-1:$WORK/apps/frontend/package.json
docker compose -f infrastructure/docker/docker-compose.yml exec -T api \
  sh -c "cd $WORK && pnpm install --lockfile-only --no-frozen-lockfile"
docker cp docker-api-1:$WORK/pnpm-lock.yaml ./pnpm-lock.yaml
```

Verify before committing: `docker compose exec -T api sh -c 'cp /app/pnpm-lock.yaml /tmp/lc.yaml && cd /tmp && pnpm install --frozen-lockfile'` should exit 0. This is the same command CI runs.

**Bind-mount file edits and stale container reads.** When the host edits a small bind-mounted file (e.g. `vitest.config.ts`, `package.json`), Docker Desktop's bind-mount cache can serve the container a truncated view of the previous content for tens of seconds, sometimes longer. Symptom: tests pass with thresholds that should fail, or `pnpm install` reports "Invalid package.json" with a parse error pointing at a line number that's past the EOF the host sees. Fix: `docker compose restart <service>` for the affected container. Don't try to debug application logic until the container's `wc -c <file>` matches the host's.

### No Backward Compatibility Required
Cromo is in active development — make breaking changes freely. No migration paths, no deprecation warnings. (Exception: published release tags are immutable by convention; see versioning.)

### Sticker Catalog Cache
The frontend's localStorage cache is keyed off `GET /api/v1/stickers/version`, derived from `MAX(updated_at)` across catalog tables — any mutation auto-invalidates all browsers.

After a reseed, also flush Redis (`docker compose ... exec cache redis-cli FLUSHALL`) — the backend caches sticker lists for 1h and the version probe for 5min. Admin edits via `PATCH /api/v1/admin/stickers/:id` bust `cromo:catalog_version` automatically.

### Admin Sticker Edits — Round-Trip Back To The Seed Files

The catalog seed SQL files in `scripts/seeds/0{2,3,8}_*.sql` and `10_extra_stickers.sql` are the source of truth for `player_name` / `position`. Their `ON CONFLICT (album_type_id, number) DO UPDATE SET …` clauses include both columns, so a reseed-on-boot (which runs every time `runCatalogSeed` fires — i.e. every container start) overwrites whatever's in the DB with whatever's in the SQL file. **That's intentional.** An admin UI edit that lived only in the DB would be wiped on the next deploy.

`PATCH /api/v1/admin/stickers/:id`:

1. Updates the live DB (`stickers.player_name`, `position`, `notes`) so the admin sees the edit immediately.
2. Records `sticker_updated` in `audit_log`.
3. Hands off to `services/seed-writer.service.ts → planSeedEdit`, which locates the matching VALUES tuple in the right seed file (by `sticker_type` → file map) and produces a rewritten file. Pure; no I/O.
4. Hands off to `services/github-pr.service.ts → pushSeedEdit`, which either:
   - **GitHub mode** (`GITHUB_TOKEN` + `GITHUB_REPO` set) — creates a per-edit branch off `GITHUB_BASE_BRANCH`, commits the file via the Contents API, opens a PR.
   - **Local mode** (`GITHUB_TOKEN` unset) — writes the rewritten file under `SEEDS_DIR` (bind-mounted at `/app/scripts/seeds` in dev). The operator commits manually.
5. Returns the outcome on the PATCH response as `seedPush`, which the admin UI renders as a banner (PR link / local path / failure message).

**The window between PATCH and PR merge is the structural cost** of "seed file = SoT": a backend restart in that window will reseed the live row back to its pre-edit value (the SQL file still has the old text). In prod, mitigate by either merging the PR before the next ASG recycle or accepting that the admin will re-apply the edit. There is no transient buffer table — adding one would silently make the DB the SoT, which is exactly what we're avoiding.

**Notes-only edits skip the seed push** (`seedPush.mode === 'skipped'`, `reason: 'NO_CHANGES'`). `notes` is not in any seed file's `ON CONFLICT DO UPDATE SET` clause, so it lives only in the DB; no round-trip is required.

**Tests skip the seed push entirely** (`NODE_ENV=test` short-circuits in the route). Integration tests share the dev DB (per the "Tests — Integration Tests Share The Dev DB" section); writing to bind-mounted seed files as a side effect would dirty the working tree on every PATCH test. The response still surfaces `seedPush.mode === 'skipped'` so callers can assert on the contract.

**Rules:**
- **Don't change the seeds' `ON CONFLICT DO UPDATE SET` to skip `player_name` / `position`.** That breaks the SoT model — admin edits would persist through reboots without the seed file ever reflecting them.
- **Don't bypass `seed-writer.service.ts` to hand-edit the SQL.** The parser handles SQL string literals (including embedded `''`), preserves whitespace and untouched fields verbatim, and updates the dead `player_name_col` mirror in `03_team_stickers.sql` only when it matches. Hand-edits will eventually break the AS-clause column alignment.
- **Don't add new seed files without registering them in `TARGET_BY_STICKER_TYPE`** (in `seed-writer.service.ts`). The map is the *only* place that knows which file owns which sticker; an unmapped `sticker_type` returns `NO_TARGET_FILE` and the PATCH succeeds in the DB but never reaches git.
- **Don't reference `stickers.id` (UUID) in any seed-file edit.** Greenfield reseeds regenerate UUIDs; the natural key is `(album_type_id, number)` and the parser locates tuples by `number` alone.
- **Don't commit `GITHUB_TOKEN` to the repo.** It's a PAT with `repo` scope (or fine-grained Contents + PR write on this one repo). In prod it lives in Secrets Manager and is injected via EC2 user-data → `/etc/cromo/cromo.env`, matching the other secret env vars.

### API Response Casing — Always Use the Global Serializer
Backend services emit Postgres `snake_case`; a global serializer in `apps/backend/src/app.ts` runs `camelizeKeys` (from `apps/backend/src/utils/casing.ts`) on every JSON response. Wire format is always `camelCase`. Frontend types in `@cromo/shared` and `apps/frontend/src/lib/api/types.ts` describe that; `apps/frontend/src/lib/api.ts` is the per-domain barrel that re-exports them.

Rules:
- **Don't** add per-endpoint snake→camel mappers in the frontend. If a response looks snake_case, fix the backend.
- **Don't** rename SQL aliases to camelCase. Keep SQL idiomatic.
- New Fastify routes do **not** need a `response:` schema for casing — `setSerializerCompiler` + `setReplySerializer` cover both schema'd and non-schema'd routes. Existing `response:` schemas are doc-only.
- **Exception: raw socket writes.** SSE handlers using `reply.raw.write(...)` bypass both serializers; explicitly call `camelizeKeys(payload)` before `JSON.stringify`. Canonical pattern in `apps/backend/src/routes/v1/trade.ts`.

If changing casing strategy, update **both** `setSerializerCompiler` and `setReplySerializer` — losing one silently regresses every route on the wrong side of the schema/no-schema split.

### Album Visibility & Slugs — Three Tiers, Slug-as-Capability

Per-album trade-inventory visibility is a 3-tier enum on `user_albums.trade_inventory_visibility`, replacing the old `is_trade_inventory_public` boolean (migration 0022):

| Value      | Public profile listing? | Per-album URL `/profile/<u>/<slug>`? | Trade matchmaker? |
| ---------- | ----------------------- | ------------------------------------ | ----------------- |
| `private`  | No                      | 404 → fallback banner                | No                |
| `unlisted` | No                      | Yes — slug acts as the access token  | No                |
| `public`   | Yes (in `tradingInventory[]`) | Yes                            | Yes               |

Slug = `{album_type_key}-{edition_key}-{format_key}` (with `-N` on collision), stored on `user_albums.slug`, unique per `(user_id, slug)`, format-checked in SQL (`^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$`). UUIDs remain the API identity — the slug is **only** for human-friendly URLs and unlisted access.

**Architectural rules:**

- **`GET /profiles/:username` returns `public` albums only.** To include an `unlisted` album, the caller passes its slug via `?album=<slug>` — that slug is the capability token. The cache key includes the slug suffix so a request for one unlisted album can't poison the bare-profile cache. Don't bypass this: never expose all `unlisted` albums in a listing endpoint, and don't add a "list my unlisted albums" public surface — that defeats the model.
- **`GET /profiles/:username/albums/:albumId/{wanted,offered}` accepts `public` + `unlisted`** — the caller already presented the slug at the profile endpoint to resolve `albumId`, so the second hop trusts the capability. Private albums always 404 here. Pattern lives in `sharing.service.ts` (`trade_inventory_visibility != 'private'`).
- **Matchmaker is `public`-only.** `candidate_albums` in `trade-matching.service.ts` filters `trade_inventory_visibility = 'public'`. Unlisted exists for sharing, not discovery — surfacing it via matchmaking would leak the album to people the owner never linked.
- **Frontend URLs are slug-based**, never UUID-based. The route is `apps/frontend/src/app/profile/[username]/[slug]/` (renamed from `[albumId]` — UUID URLs were never published). The client resolves `slug → albumId` from `tradingInventory` and uses the UUID for wanted/offered API calls.
- **Slug generation is one-shot at album create.** `generateAlbumSlug` in `albums.service.ts` queries existing user slugs and picks the lowest unused `-N`. Don't let users edit slugs — link rot in unlisted-share scenarios is exactly the failure mode the column was added to prevent. (If editable slugs ever happen, add a `slug_history` table first; never mutate the live row.)
- **Bootstrap row in `user-provisioning.ts`** computes its slug inline (`fifa-world-cup-2026-north-america-softcover-standard`) — a fresh user always has zero existing slugs, so the uniqueness probe is wasted. Don't refactor this to call `generateAlbumSlug` "for consistency"; it adds a round-trip to every signup.
- **Seed data must include a `slug`** — the column is NOT NULL and `scripts/seeds/07_test_users.sql` writes it explicitly. New seed rows: derive from the catalog keys with `_ → -` and unique-per-user-by-construction.
- **`is_trade_inventory_public` is gone everywhere.** API request bodies use `tradeInventoryVisibility: 'private' | 'unlisted' | 'public'` (camelCase). Tests that toggle visibility must use the new field; the legacy boolean will fail Fastify schema validation and PostgreSQL column existence.

### Drizzle Migrations — Single Migrations Folder
Schema in `apps/backend/src/db/schema.ts`; SQL files in `apps/backend/src/db/migrations/` (plus `meta/_journal.json` + per-migration snapshots). Backend auto-applies pending migrations at startup via `runMigrations()` in `apps/backend/src/db/migrate.ts`; bookkeeping lives in `drizzle.__drizzle_migrations`.

**Drizzle ORM is migration-only.** Services use raw SQL via the pg `Pool` directly (see CLAUDE.md "API Response Casing"). There is no `fastify.drizzle` decoration, no `getDrizzle()` runtime, and no Drizzle ORM type in services — function signatures take `db: Pool` or `client: PoolClient` (inside `withTx`). The trade-matching CTE, the SSE replay query, and most service code reads as straight SQL because that's what they are; introducing the ORM surface gave us no type-safety win and broke uniformity. New services follow the raw-SQL pattern; the only consumer of `drizzle-orm/node-postgres/migrator` is `migrate.ts`.

**Transactions go through `withTx`.** `apps/backend/src/db/transaction.ts` exposes `withTx(db, async (client) => …)`, which runs the body inside a single Postgres transaction, COMMITs on success, ROLLBACKs on any thrown error, and always releases the client. Reach for it instead of issuing your own `BEGIN`/`COMMIT` — error-handling and client-release semantics stay uniform across the codebase, and services that need to call sibling helpers can pass the `PoolClient` straight through. Helpers that accept either form (e.g. `provisionUserProfile`) type the argument as `Executor = Pool | PoolClient` so callers can decide whether to open a fresh transaction or join an existing one.

To change the schema:
1. Edit `schema.ts`.
2. `pnpm db:generate` (routes through `docker compose exec api`).
3. Review the generated SQL. For things Drizzle can't infer (PL/pgSQL functions, triggers, views), hand-write a separate `NNNN_*.sql` and add a matching `meta/_journal.json` entry.
4. `pnpm db:migrate` (or wait for the next API startup).

**The head snapshot must stay canonical.** The runtime migrator only reads `_journal.json` + the `.sql` files — it ignores the per-migration `meta/*_snapshot.json`. But `db:generate` diffs `schema.ts` against the **latest** snapshot, so if that snapshot drifts from `schema.ts`, generate either prompts interactively (rename ambiguity) or emits a spurious churn migration. Two rules keep it healthy:
- **Never hand-write a snapshot by copying the previous one.** The old "copy previous, refresh `id`/`prevId`" trick silently drifts the baseline — it's what left the chain unable to `generate`. For a hand-written `NNNN_*.sql`, regenerate the matching snapshot canonically instead of copying (see below).
- **Regenerating the canonical head snapshot** (after a hand-written migration, or to recover from drift): produce it with `generate` itself so the serializer matches — `npx drizzle-kit generate --dialect=postgresql --schema=./src/db/schema.ts --out=/tmp/canon` on an empty dir writes `/tmp/canon/meta/0000_snapshot.json` = the canonical full-schema snapshot; copy it over the real `meta/NNNN_snapshot.json` (the latest idx), set its `id`/`prevId` to the real chain, and confirm `pnpm db:generate` reports **"No schema changes"**. Do **not** use `drizzle-kit introspect`/`pull` for this — its index/check/FK serialization differs from `generate`'s and produces a 100+ statement no-op churn. The historical snapshots (idx < head) can stay as-is; generate only reads the head.

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
- GitHub Environments `tf-shared`, `tf-dev` created in settings (their apply jobs declare `environment:`, so OIDC issues `environment:tf-{shared,dev}` subjects). **`apply-prod` declares NO environment on purpose** — an environment subject drops the git ref, which can't match the ref-gated prod trust pattern (`repo:…:ref:refs/tags/v*`); declaring `environment: tf-prod` is what broke the first prod apply (STS `Not authorized`). With no environment, GitHub issues a `ref:refs/tags/v*` subject that matches and enforces the tag gate. No protection rules required on Free (they're unavailable on private repos anyway) — prod is gated at the OIDC-trust + workflow-condition layer.

**Rules:**
- **Never run `terraform apply` from a laptop for routine changes** — bypasses PR review, plan comment, and prod gate. Local apply stays for genuine emergencies via the `cromo` profile + MFA.
- **Never widen the `tf-prod` sub-pattern** to drop `:ref:refs/tags/v*`. That suffix is what stops a workflow misconfig from applying prod without a release tag.
- **The role intentionally has `AdministratorAccess`.** Defence is the OIDC trust policy + the workflow/tag gate, not narrow permissions — scoping further means a new IAM error every time you add a service.
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

### WC 2026 Standings — Live Feed, Mock-By-Default, Feed-Driven Structure

The `/guide/wc-2026/standings` page (Bracket / Groups / Team tabs) shows live World Cup 2026 standings. Domain logic lives in `apps/backend/src/wc2026/` (pure data + math), orchestrated by `services/wc2026.service.ts`, exposed publicly at `GET /api/v1/wc2026/{overview,teams/:code}`. Frontend is a client-tab page under `apps/frontend/src/app/guide/wc-2026/standings/` with pure display helpers in `standings/format.ts`.

**Provider selection mirrors `SCAN_PROVIDER` exactly.** `WC_API_KEY === 'mock'` (the default) short-circuits to the deterministic mock dataset (`wc2026/mock-data.ts`) — zero external calls in dev/test/CI. A real [football-data.org](https://www.football-data.org/client/register) key routes through `wc2026/live-provider.ts`; **any provider error transparently falls back to mock**, so the page never 500s. The active source is surfaced honestly as `dataSource: 'live' | 'sample'`, and the frontend shows a ⚠ banner whenever it's `sample`.

**Sample data is illustrative, not real.** In mock mode scores are *simulated* (deterministic per match id), the schedule is *plausible-but-fake*, and group assignments come from the repo seed (`scripts/seeds/01_teams.sql`). It will be inaccurate by construction. The only path to real results/rosters/groups is a live key. **Never hand-edit `wc2026/` data to "correct" standings from memory** — that fabricates facts and the live feed overwrites it anyway.

**One derivation path, fed by a team registry.** Both providers emit `{ matches, teams }` (+ live also `squads`). Standings, bracket, and the forecast are *always* recomputed from that `RawMatch[]` via `standings.ts` / `bracket.ts` / `forecast.ts` — the provider's own standings (if any) are never trusted directly. Group membership and team names come from the `TeamMeta[]` registry through `structure.ts` (`deriveStructure`), **never** from the static `teams.ts` roster. In live mode the registry is built from the real fixtures (`teamsFromMatches`), so a stale seed can't put a team in the wrong group. `teams.ts` is only the mock registry + a name fallback.

**The knockout bracket comes from ESPN, never fabricated.** football-data lags on the post-group-stage draw (returns `null` knockout teams), so the knockout fixtures are sourced from ESPN's free hidden API (`espn-knockout-provider.ts`, `site.api.espn.com/.../fifa.world/scoreboard`) — the OFFICIAL bracket: real teams as FIFA-code abbreviations once known, and official slot descriptors before then (group winner/runner `1F`/`2E`, the third-place combination `Third Place Group A/B/C/D/F` → flattened to `3ABCDF`, and `Winner`/`Loser` of a match). Stages are assigned by chronological position (fixed 16/8/4/2/1/1 layout). The service uses ESPN for knockout, football-data for groups/standings/squads; ESPN failure degrades to football-data's TBD knockout. `resolveBracket` renders these VERBATIM — NEVER derive matchups from a template (`buildKnockoutSkeleton`), which isn't the official bracket and put wrong teams in wrong matches. `format.ts → shortPlaceholder`/`placeholderCandidates` decode slots for the hover: group slots (`1F`/`2E`/`3ABCDF`) list teams that can still finish that rank (via `minRank`/`maxRank`); later-round slots carry a `W:R32:0`/`L:SF:1` feed and `placeholderCandidates` RECURSES through the wire bracket (each `WcMatchSide` carries its `feed`, each `WcMatch` its `slot`) to union everyone who could reach that match — so a R16 slot shows its two R32 winners' candidates, the final shows its whole half (capped in the popover with "+N more"). The forecast feeds are the SAME `homeFeed`/`awayFeed` strings; don't fork the format.

**The forecast simulates the REAL bracket, via structured feeds.** Every `RawMatch` carries `homeFeed`/`awayFeed` — the structured provenance of each knockout side: `1F`/`2E` (group winner/runner), `3ABCDF` (a best-third from one of those groups), `W:R32:0`/`L:SF:1` (winner/loser of an earlier match by stage+slot). The ESPN provider emits these from the official tree (the number lives in the competitor's `abbreviation` like `QFW1`, not just `shortDisplayName`); the mock schedule emits the canonical wiring. `forecast.ts` walks the real knockout matches stage by stage, resolving each side from its feed against the current sim's qualifiers, so champion / reach-final / projected-opponent odds reflect the ACTUAL draw (e.g. South Africa's R32 opponent is Canada because the feed says so). **Third-place assignment is a bipartite matching, not greedy:** the 8 qualifying thirds must fill the `3<groups>` slots respecting each slot's eligible groups — a greedy pass leaves a slot empty ~80% of the time, breaking the tree so the final never resolves (champion odds summed to ~0.13 instead of ~1.0). `assignThirds` uses Kuhn's augmenting-path algorithm; any valid matching is a sound estimate since FIFA's exact combination table isn't published pre-draw. The DISPLAY bracket (`resolveBracket`) is still feed-only and shows slot descriptors until real teams land — only the forecast simulates through them.

**Group qualification is goal-difference aware.** `standings.ts → computePositions` enumerates remaining-match outcomes AND reasons about GD (a team with a win still to play can inflate GD arbitrarily; one done is fixed) to bound each team's best/worst final position. `maxPos ≤ 2` → CLINCHED (clinches a team that's 2nd on GD, not just points), `minPos = 4` → ELIMINATED, `minPos == maxPos` → that rank is GUARANTEED (`guaranteedRank`, surfaced as the `RankLock` badge). Don't revert to points-only enumeration — it under-claims both clinching and elimination.

**Strength = a results-only fit (NO FIFA anchor).** `strength.ts → buildStrength` derives each team's rating purely from ACTUAL results: the last ~12 months of internationals (`recent-results.data.ts`, a static ESPN snapshot — see the recent-results rule below) plus this tournament's finished matches, the latter weighted ~6× so the WC's own results dominate as it plays out. It does NOT consult the FIFA ranking — that ranking blends years of matches and rewards pedigree, so it doesn't represent the current squad; anchoring on it produced the contradiction this model exists to kill (a team carrying high title odds while finishing mid-table in its own group). Each team's number IS its recent form. Opponent strength is handled WITHOUT any external rating: all teams are fit **simultaneously** to the result graph — ratings are the regularised maximum-likelihood solution of a weighted Bradley-Terry (logistic) model, found by gradient descent whose per-match step is exactly the Elo update `step = ETA·weight·(actual − expected)`, plus an L2 pull toward `MEAN` (1500) that regularises sparse teams and fixes the scale. Because non-WC opponents get their OWN rating from their OWN results, beating a side that loses everywhere is worth little and beating one that wins everywhere is worth a lot — this is what kills the weak-schedule inflation a single online Elo pass (flat-seeding unknown opponents) suffers. `weight = importance · recency · margin`: `IMPORTANCE` makes tournament ≫ friendly; recency (half-life 270d, measured against the latest result so there's no wall-clock → deterministic) keeps it about the current squad; `marginMultiplier` gives blowouts more signal. The fit is iterated to convergence (`EPOCHS = 300`; identical at 200 vs 800, so order-independent and deterministic). Host advantage (USA/CAN/MEX, `+HOST_ADV`) is added to the FINAL rating, not into the fit. Tuning knobs: `IMPORTANCE`, `LAMBDA` (bigger = flatter field), `HALFLIFE_DAYS`, `ETA`/`EPOCHS`, `HOST_ADV`. The forecast and the bracket "favourite" both consume `buildStrength`.

  **Validate by internal consistency, NOT against the FIFA ranking.** The FIFA ranking is not ground truth here (that's the whole point) — don't "fix" odds to make them look like it. The right check is that the odds agree with what teams actually did: group winners should outrank the teams they beat, eliminated teams should be ~0, a team finishing 2nd/3rd shouldn't out-rate the team above it. (Use a throwaway diagnostic over `buildMockData(new Date('2026-06-28'))` — group stage complete — and eyeball per-group rank vs champion%/rating; the earlier FIFA-anchored build failed this with England rated #1 overall while finishing 2nd in its group, and eliminated Morocco rated above qualified teams. The results-only fit cut within-group rank/rating inversions to ~3/72.) **History:** two earlier designs were wrong — (a) a *compressed* FIFA anchor (`PRIOR_PULL=0.3`) + weak-opponent-inflated online Elo ranked Morocco/Mexico/Algeria above Spain/Argentina/Brazil; (b) a *full-scale* FIFA anchor made pedigree teams "favourites" while they underperformed on the pitch. Both are the same mistake — letting a pedigree ranking override results. **Don't reintroduce any FIFA-ranking term in `buildStrength`.** (`ratings.ts` survives only for mock-score generation and display-ordering fallbacks, never for odds.)

**Probabilities are a transparent heuristic, not an ML model.** Champion / reach-final / projected-opponent odds come from a **seeded** Monte Carlo (`forecast.ts`) over the *unresolved* matches, honouring any result already played, using `buildStrength`. Deterministic given a seed (so it's unit-tested). Projected opponents have an analytic fallback (`projection.ts → analyticR32Opponents`) so any non-eliminated team always shows a calculable R32 opponent set even when the sim rarely advanced it. Group clinched/eliminated flags are **deterministic combinatorics**, not probabilities.

**Live squads.** `live-provider.ts → fetchLiveSquads` reads the 26-man squad inline from `/competitions/WC/teams` (name + position + age). The free tier has **no club field** — don't render or invent one (the old stale-club bug). `players.ts` (curated, no club) is mock-only fallback. Team detail also carries the team's own `results` + `upcoming` fixtures, sliced from the bundle's `allMatches`.

**Caching:** the whole bundle (standings + bracket + forecast + allMatches + squads) is computed once and cached under `wc2026:bundle:v1` (10-min TTL) via `singleflight`, so the Monte Carlo never stampedes. The `warm-wc2026` job (`JOB_WARM_WC2026`, every 9 min) refreshes it out-of-band; the request path lazily fills it too, so it works with jobs disabled (dev default). **Tests are hermetic:** `loadRawMatches` forces mock when `NODE_ENV==='test'`, so the suite never calls the live API regardless of an ambient `WC_API_KEY`. After editing root `.env.local`, **recreate** the api container (`docker compose up -d api`) — `restart` does not reload env files — and `redis-cli DEL wc2026:bundle:v1 wc2026:raw:v1`.

**Rules:**
- **Don't trust a provider's pre-computed standings/bracket.** Recompute from `RawMatch[]` so there's one tested code path. A new provider = a new normalizer that emits `{ matches, teams }`, nothing more.
- **Group membership flows from the registry, never `teams.ts`.** Don't reintroduce `teamsInGroup()`/`GROUPS` into standings/forecast/bracket — that re-couples the feature to the (possibly-stale) seed.
- **Keep `dataSource` honest.** Mock/fallback must report `'sample'`; the banner depends on it. Never label sample data as live.
- **Both providers must accept nothing and emit the same `{ matches, teams }` shape.** Bracket slot resolution fills per *completed group* (winner/runner) and best-thirds only when all groups end — don't gate it back to all-or-nothing.
- **`WC_API_KEY` is wired as a Terraform var** (`wc_api_key` → Secrets Manager) in `env/{dev,prod}`. Flip to a real key via `terraform.tfvars` + re-apply; no code change. `WC_DATA_PROVIDER` is hard-set to `football-data` in the secrets block.
- **Player clubs come from a static ESPN snapshot, never model memory or Wikidata.** football-data has no club field, so `scripts/wc2026-build-player-clubs.mjs` reads each nation's ESPN roster and the player's `defaultTeam` → club, writing the generated `wc2026/player-clubs.data.ts`; `clubFor(name, code)` attaches it in the providers. **We moved off Wikidata: its citizenship-based disambiguation grabbed same-named foreigners (France's Lucas Hernández → a Brazilian at Atlético Mineiro) and shipped stale rows.** ESPN's roster IS the actual squad, so every athlete is unambiguously the right person. Three load-bearing details: (1) when the roster's `defaultTeam` is the NATIONAL team (ESPN's "no club" fallback), the per-athlete *core* record (`sports.core.api.espn.com/.../athletes/{id}`) still carries the real club — fetch it for those; (2) the map is keyed by `${fifaCode}|${normName}`, NOT name alone — two "Emiliano Martínez" (Argentina/Aston Villa vs another/Palmeiras) collide under last-write-wins otherwise; ESPN abbreviations equal the FIFA codes the providers pass; (3) coverage is ~97% with these; the rest stay blank (honest, never a guess — the whole point of leaving Wikidata). `WcPlayer` is `{ name, position, age, club }`. Regenerate the data file with the script (no key needed — ESPN is public); don't hand-edit it; never hardcode a club from memory (the stale-club bug). ESPN has no player rating; age is live from football-data.
- **Don't overlay knockout slots in the mock path** — only the live feed lacks them. The DISPLAY bracket renders the feed verbatim and never fabricates matchups from a template. The FORECAST, by contrast, deliberately simulates *through* the real feed (`homeFeed`/`awayFeed` propagation in `forecast.ts`) so odds reflect the actual draw — don't revert it to an internal `buildKnockoutSkeleton`-based simulation.
- **Keep third-place slot assignment a real bipartite matching (`assignThirds`, Kuhn's), never greedy.** Greedy leaves a `3<groups>` slot unfillable ~80% of the time and the final stops resolving (champion odds collapse to ~0.13). The `wc2026-logic.test.ts` "resolves the bracket from ESPN-style `3<groups>` third slots" test guards this — it must keep summing champion odds to ~1.
- **Knockout feed numbers come from the ESPN `abbreviation`, not only `shortDisplayName`.** `QFW1`/`QW4`/`SFW1`/`RD16 W1` carry the match number in the compact abbreviation; `shortDisplayName` may spell it with spaces that break the regex. `parseSide` tries both. Don't drop the abbreviation candidate — SF (fed by QF winners) silently loses its feed and the bracket stops propagating past the QF.
- **`BracketView` renders rounds in FEED-DERIVED tree order, not slot order.** ESPN's slot order is chronological, so positionally-adjacent matches aren't the ones that feed the next round (R16 #0 is fed by R32 #0 and #2, not #0 and #1). The connector gutter and the hover path-to-final pair display rows `2i,2i+1 → i`, so the view first reorders each round by walking FINAL→R32 along the `W:STAGE:n` feeds (falling back to slot order if the feeds don't form a full tree). Don't revert to slot order — the connectors will then join matches that don't actually feed each other, contradicting the hover candidates.
- **Keep the forecast/bracket on `buildStrength`, never `ratingFor`, for odds.** `ratingFor` (FIFA ranking) is deliberately NOT in the odds path — using it would reintroduce the pedigree bias `buildStrength` was rebuilt to remove. `ratingFor` is fine ONLY for mock-score generation (`mock-data.ts`) and display-ordering of analytic fallback candidates (`projection.ts`), never for champion/reach-final odds or the bracket favourite.
- **Recent results are a static ESPN snapshot, regenerated never-at-runtime.** `recent-results.data.ts` (generated by `scripts/wc2026-build-recent-results.mjs`, no key — ESPN scoreboards per competition: friendlies, confederation qualifiers, Nations Leagues, continental cups) is the dominant input to `buildStrength`. It's a flat list `{ d, h, a, hs, as, k }` of finished matches touching a WC nation over the last ~12 months; opponents that aren't WC teams are kept (seeded at `COMMON_BASE`). Regenerate the file to refresh recent form; don't hand-edit it, and don't fetch it live (the snapshot keeps `buildStrength` pure/deterministic and the tests hermetic). Codes are ESPN abbreviations = FIFA codes.
- **Don't let tests hit the live provider.** The `NODE_ENV==='test'` guard in `loadRawMatches` is load-bearing — removing it makes the suite flaky and rate-limited against football-data.
- **Flags reuse `@/lib/flags` (`flagUrl` → flagcdn.com `<img>`), the same source the album sticker tiles use** — keep the two surfaces consistent; don't reintroduce a separate emoji map. The standings `Flag` component wraps it.
- **Eliminated teams have EXACTLY 0 odds.** `buildBundle` force-zeros `championOdds`/`reachFinalOdds` and clears `projectedOpponents` for any `ELIMINATED` team after the sim. `pct(0)` renders "0%" (only a small positive is "<1%") and `ProbBar` shows an empty bar at 0. Don't reintroduce a min-width sliver or the `<1%`-at-zero behaviour.
- **Team names are translated client-side.** The provider returns names in its own language ("Czechia", "Korea Republic"); the UI renders `<TeamName code fallback />` (parts.tsx) which prefers the `teamNames` i18n namespace (all 48 codes, en+es) and falls back to the provider name. Add new teams to `teamNames` in both locales; never hard-code a display name in a component.
- **A second provider exists: `WC_DATA_PROVIDER=api-football`** (`api-football-provider.ts`, api-sports.io v3). It carries the real bracket, group letters (from `/standings`), and queryable match history — the path to genuine accuracy and correct R32 pairings. UNVERIFIED without a key: the name→code resolver and round→stage labels are the likely tuning points. Squads aren't fetched (free-tier budget); football-data stays the default.

### Tests — Integration Tests Share The Dev DB

`apps/backend/tests/integration/*.test.ts` connect to the same Postgres (and Redis) the dev backend serves: `cromo_dev` on the local compose stack, the dev RDS instance in CI. There is no dedicated test database. That choice keeps the setup simple but creates two hazards every new test must navigate.

**Hazard 1: State leak.** A test that mutates `feature_flags`, `users`, `user_settings`, `user_albums`, `user_bans`, or any shared row can corrupt the dev environment for the next person if it doesn't clean up. The canonical symptom: `FEATURE_AI_SCANNING` silently flipped to `false` so the dev frontend's `/scan` page returns 404 — that happened because four integration suites forced the flag off in `afterAll` instead of snapshotting it first.

**The rule:** never blanket-set shared state in `afterAll`. Snapshot the prior value in `beforeAll`, restore it in `afterAll`. Pattern:

```ts
let initialFlagState: boolean;

beforeAll(async () => {
  const { rows } = await app.db.query<{ enabled: boolean }>(
    `SELECT enabled FROM feature_flags WHERE key = 'FEATURE_X'`,
  );
  initialFlagState = rows[0]?.enabled ?? true;
  // …force the state this suite needs…
});

afterAll(async () => {
  await app.db.query(
    `UPDATE feature_flags SET enabled = $1 WHERE key = 'FEATURE_X'`,
    [initialFlagState],
  );
});
```

**Hazard 2: Inter-suite mutation.** `trade.test.ts` decrements Alice's inventory via `completeTrade`. By the time `collection.test.ts` runs, the rows it asserts on are gone. The fix is **not** to reorder the suites or carve out fixture users per file. It is to **re-assert the required fixture state in `beforeAll`** — see `collection.test.ts` for the canonical pattern (it INSERT … ON CONFLICT DO UPDATE re-pins Alice's `#7` and `#14` to `quantity = 2, trade_hidden = true` and `redis.flushdb()`s before any test runs).

**Rules to follow:**
- **Save before you mutate, restore after.** If a test changes a row in a shared table, the same `beforeAll`/`afterAll` pair must put it back. Hard-coding the "default" value in `afterAll` is the trap — it diverges from the seed and from any local override the operator made.
- **Re-pin fixture state, don't depend on it.** Tests that read from seeded users (alice, bob, charlie, diana, evan) must `INSERT … ON CONFLICT DO UPDATE` (or `UPDATE … WHERE`) to restore the exact rows they care about. Assume *some other suite* has mutated them.
- **Flush Redis when relevant.** Cached responses (e.g. `getPublicProfile`, `getDuplicates`, `trust-score`) survive between tests. If your test mutates the underlying data, call `app.redis.flushdb()` before asserting on a cached endpoint — otherwise the read returns the previous test's snapshot.
- **Use Evan for destructive identity changes.** Alice/Bob/Charlie/Diana have heavy fixture commitments across collection, trade, and trust-safety tests; mutating their `username`, `email`, or `display_name` corrupts those suites. Evan is the throwaway — seeded with no albums, no trades, no ratings, intentionally available for `PATCH /users/me/*` tests.
- **Never write to `users.id` for seeded users.** UUIDs `…000000{1,…,6}` are referenced as foreign keys from every test fixture; changing them cascades destructively. New ephemeral users get `…000000-aaaa…` or similar reserved ranges and are deleted in `afterAll`.

If you find yourself wanting to wipe a whole table in `afterAll`, that's a signal you're testing the wrong unit — extract the logic into a service-level test with a mocked DB, or scope your changes to a single ephemeral row you own end-to-end.

### Tests — Coverage Thresholds Are Aggregate (Not Per-File)

`apps/backend/vitest.config.ts` and `apps/frontend/vitest.config.ts` both gate on the **aggregate** coverage across `include[]`, not per-file. The backend floor is `lines: 70 / statements: 65 / functions: 60 / branches: 55`; the frontend's `include[]` is narrow enough that aggregate ≈ per-file.

We tried `perFile: true` with per-glob "overrides" first. It doesn't work the way the vitest docs imply: per-glob entries layer an **additional** constraint on top of the global floor instead of overriding it. So a `'src/routes/v1/scan.ts': { lines: 15 }` entry can't loosen a `lines: 50` global — the global keeps firing first. That makes per-file gating impractical for our codebase: a few files (SSE handler in `trade.ts`, AI integration in `scan.ts`, multi-CTE matchmaking in `trade-matching.service.ts`) genuinely sit below 50% and need real streaming-HTTP / browser test infra to climb. Forcing every file to clear the same number would block PRs on legitimately hard-to-test surfaces.

The aggregate gate is sensitive enough on its own: a 500-line zero-coverage file added to a ~5,000-line codebase drops the average ~10%, which trips a 70% floor.

**The CI env diverges from the dev docker stack.** CI runs the test job with `NODE_ENV=test`; the docker stack runs with `NODE_ENV=development`. `app.ts` has multiple `if (env.NODE_ENV !== 'test') { … }` guards (swagger plugin, jobs worker, SES poller). Code behind those guards is **not loaded** under CI's test mode — including it in `coverage.include[]` would inflate the denominator with code that's deliberately dormant. That's why the relevant entry-points are in `coverage.exclude[]`: `src/plugins/swagger.ts`, `src/jobs/scheduler.ts`, `src/jobs/run-once.ts`, `src/db/migrate.ts`, `src/server.ts`.

The local docker stack only mounts `apps/backend/vitest.config.ts` after this revision. Any change to that file requires bouncing the api container (or restarting compose) for the change to take effect inside the container — the image-baked copy is stale.

**Rules to follow:**
- **Validate threshold changes locally with `NODE_ENV=test`.** The dev stack's default `NODE_ENV=development` runs more code than CI's `NODE_ENV=test`, so coverage measured in dev mode is inflated. The verification command is `docker compose exec -e NODE_ENV=test api pnpm --filter @cromo/backend test:coverage` — anything less will mislead you about whether CI will pass.
- **Don't add per-glob entries to the `thresholds` object.** They don't override the global; they add a second constraint that's almost always stricter. If a file genuinely needs a different gate, the answer is either (a) write the missing tests, or (b) add the file to `coverage.exclude[]` with a comment explaining why it can't be unit-tested.
- **Exclude, don't override.** Files that can't be unit-tested without real infra (Playwright-level browser tests, paid API keys, multi-day fixture builds) belong in `coverage.exclude[]`, not in `include[]` with a lowered threshold. The tests for those files still run — exclude only affects coverage measurement.
- **The frontend's `include[]` is intentionally narrow.** It tracks pure-logic modules (`lib/*`, `app/scan/pickVariantId.ts`, `variantMeta.ts`, `draftStorage.ts`). React components and pages are Playwright's domain. Adding a file to the frontend `include[]` is a commitment to keep it ≥ 70% — don't add a file just to inflate the headline number.

### Frontend Lint — `next lint` Deprecation Pending Migration

`apps/frontend` still uses the legacy `.eslintrc.json` (`extends: ["next/core-web-vitals", "next/typescript"]`) and invokes it via the `next lint` script. Both surfaces are deprecated in Next 15 and will be removed in Next 16. The migration is one of the next maintenance items, deliberately deferred out of the lib/api split:

- The flat-config bridge needs `@eslint/eslintrc`'s `FlatCompat` added as a dev dep, which on macOS Docker triggers the EBUSY-on-`rename` lockfile problem documented above. That's a multi-step operation, not a one-line edit, and rolling it into a refactor PR is a recipe for a "why is the lockfile in this diff" review back-and-forth.
- `next lint` still functions today — it prints the deprecation warning and exits 0. CI is not blocked.
- When you do the migration: install `@eslint/eslintrc` via the dev-container `pnpm-lock.yaml` workaround, replace `.eslintrc.json` with an `eslint.config.mjs` that uses `FlatCompat` to import `eslint-config-next`, and swap the `lint` script from `next lint` to `eslint .` so the package script survives the Next 16 cut. Don't fall back to `next lint --no-deprecation` or similar workarounds — they'll silently break on the upgrade.

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
