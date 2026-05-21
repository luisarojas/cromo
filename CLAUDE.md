# Stickfolio

## Project Rules

### No Backward Compatibility Required
There is no need to support any kind of backward compatibility. Stickfolio is in active development and can be rebuilt and redeployed when significant changes are made. Feel free to make breaking changes, refactor, and deploy without worrying about migration paths or deprecation warnings.

### Sticker Catalog Cache
The frontend's localStorage cache for the sticker catalog is keyed off a backend-provided version (`GET /api/v1/stickers/version`). The version is derived from `MAX(updated_at)` across the catalog tables, so any catalog mutation invalidates every browser on next page load automatically — no manual cache-key bump.

After a reseed, also flush Redis (`docker compose -f infrastructure/docker/docker-compose.yml exec cache redis-cli FLUSHALL`) since the backend caches sticker list responses for 1 hour and the catalog-version probe for 5 min. Admin edits via `PATCH /api/v1/admin/stickers/:id` already bust the version cache key (`stickfolio:catalog_version`) automatically.

### API Response Casing — Always Use the Global Serializer
The backend uses raw SQL and emits PostgreSQL `snake_case` row objects from its services. A global serializer in `apps/backend/src/app.ts` runs `camelizeKeys` (from `apps/backend/src/utils/casing.ts`) on every JSON response, so the wire format is always `camelCase`. Frontend types in `@stickfolio/shared` and the interfaces in `apps/frontend/src/lib/api.ts` describe that camelCase wire format.

Rules to follow:
- **Do not** add per-endpoint snake→camel mapping functions in the frontend (e.g. `mapTradeSummary`, `mapTradeDetail`). If a response looks like snake_case in the client, the fix is on the backend, not in the API layer.
- **Do not** rename SQL aliases to camelCase to "make it work." Keep SQL idiomatic; let the serializer do its job.
- When adding a new Fastify route, you do **not** need to declare a `response:` schema for casing to work — the global setup covers both schema'd and non-schema'd routes via `setSerializerCompiler` + `setReplySerializer`. Existing `response:` schemas in route definitions are documentation only; the custom serializer ignores them for actual serialization, so adding/removing fields there has no runtime effect.
- **Exception: raw socket writes.** SSE handlers use `reply.raw.write(...)` to push events directly to the socket, which bypasses both Fastify serializers. Any handler that writes raw bytes (or publishes payloads consumed by such a handler) must explicitly call `camelizeKeys(payload)` before `JSON.stringify`. See the SSE handler in `apps/backend/src/routes/v1/trade.ts` for the canonical pattern.

If both `setSerializerCompiler` and `setReplySerializer` need to be kept in sync (e.g. when changing the casing strategy), update both — losing one silently regresses every route on the wrong side of the schema/no-schema split.

### No New SQL Migration Files — Edit Existing Ones
Never create new `.sql` files under `apps/backend/src/db/migrations/`. There is nothing in production, so the database is always recreated from scratch. When schema changes are needed, edit the existing migration files directly. The migration journal (`apps/backend/src/db/migrations/meta/_journal.json`) should also never need new entries as a result.
