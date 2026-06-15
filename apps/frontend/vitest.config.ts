import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      // The frontend's coverage scope is intentionally narrow: it tracks
      // only the pure-logic modules we have unit tests for. React components,
      // pages, and stateful client code are exercised by the Playwright e2e
      // suite (tests/e2e), which is a higher-fidelity check for UI than any
      // jsdom render would be. Adding a file here is a deliberate choice to
      // assert "this module deserves a unit test" — not a way to inflate the
      // headline number.
      include: [
        'src/lib/**/*.ts',
        'src/app/scan/pickVariantId.ts',
        'src/app/collection/components/variantMeta.ts',
        'src/app/trade/draftStorage.ts',
      ],
      exclude: [
        'src/**/*.d.ts',
        // api.ts is a thin fetch-wrapper layer that's exercised by
        // integration tests on the backend side and the e2e flow.
        'src/lib/api.ts',
        'src/lib/apiClient.ts',
        // Service-worker registration + push subscription helpers run in the
        // browser only; jsdom can't meaningfully execute them.
        'src/lib/push.ts',
        'src/lib/syncBus.ts',
        'src/lib/haptics.ts',
        'src/lib/hotkeys.ts',
        'src/lib/speech.ts',
        'src/lib/lastScan.ts',
        'src/lib/flags.ts',
        'src/lib/seo.ts',
      ],
      thresholds: {
        // Matches the backend floor — protects the pure-logic surfaces
        // (lib/*, app/scan/pickVariantId, variantMeta, profileExport,
        // draftStorage) we actually unit-test from regressing.
        lines: 70,
        statements: 70,
        functions: 60,
        branches: 55,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
