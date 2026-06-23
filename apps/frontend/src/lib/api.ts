// Barrel: re-exports every per-domain endpoint module so existing
// `import { … } from '@/lib/api'` call sites keep working unchanged.
// New code is free to import the narrower domain module directly
// (`@/lib/api/trade`, `@/lib/api/admin`, …) when only one is needed.

export { retryFetch } from './apiClient';
export * from './api/types';
export * from './api/auth';
export * from './api/stickers';
export * from './api/collection';
export * from './api/albums';
export * from './api/stickerMutations';
export * from './api/preferences';
export * from './api/admin';
export * from './api/trade';
export * from './api/sharing';
export * from './api/wanted';
export * from './api/trustSafety';
export * from './api/scan';
