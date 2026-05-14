# Stickfolio

## Project Rules

### No Backward Compatibility Required
There is no need to support any kind of backward compatibility. Stickfolio is in active development and can be rebuilt and redeployed when significant changes are made. Feel free to make breaking changes, refactor, and deploy without worrying about migration paths or deprecation warnings.

### Sticker Catalog Cache Key
Whenever the sticker catalog changes (new stickers added, sticker data updated, variants added or removed), bump the version suffix of `STICKER_CACHE_KEY` in `apps/frontend/src/lib/api.ts`. The key follows the pattern `stickfolio:sticker_catalog:vN`. Incrementing it instantly invalidates every browser's 24h localStorage cache on next page load. Also flush Redis after any reseed (`docker compose -f infrastructure/docker/docker-compose.yml exec cache redis-cli FLUSHALL`) since the backend caches sticker list responses for 1 hour.
