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
2. Generate a migration: `docker compose -f infrastructure/docker/docker-compose.yml exec api sh -c "cd /app/apps/backend && npx drizzle-kit generate --config=drizzle.config.ts"`.
3. Review the generated SQL in `src/db/migrations/`. For things Drizzle can't infer (PL/pgSQL functions, triggers, views), hand-write a separate `NNNN_*.sql` file and add a matching entry to `meta/_journal.json` plus a placeholder `meta/NNNN_snapshot.json` (copy the previous snapshot, refresh `id`/`prevId`).
4. Apply: `pnpm db:migrate` (via docker compose exec). On the next API startup the migration is also applied automatically.

Catalog seed data (album types, editions, formats, scan prompts) lives in `scripts/seeds/00_album_catalog.sql` and is loaded by `pnpm db:seed`, not by the migration system.

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

The back of a sticker contains **only the album code** (e.g. `COL4`, `BRA19`, `FWC4`). Everything else (player name, country, sticker type, album slot) is derived from that code via the catalog. A scan that returns more than the album code from a back-of-sticker image is hallucinating — trust the code lookup, not the OCR'd surrounding text.
