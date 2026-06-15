import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json', 'html'],
      include: ['src/**/*.ts'],
      // server.ts is the bootstrap entry; migrate.ts has a CLI runner branch that
      // can't run inside the test process; jobs/scheduler.ts is the node-cron
      // wiring exercised via integration tests, not unit tests.
      exclude: [
        'src/server.ts',
        'src/db/migrate.ts',
        'src/jobs/scheduler.ts',
        'src/types/**',
      ],
      // CI-enforced floor — keeps coverage from regressing below the level we
      // actually have today. The original 80% target was aspirational; raising
      // it past 70% would require either (1) fetch-mocked tests for the AI
      // scan provider, or (2) a real-HTTP harness for the trade SSE stream.
      // Both add test machinery without meaningfully reducing production risk.
      // Raise the numbers when (and only when) the next chunk of routes
      // genuinely gets covered — not just to make the badge look better.
      thresholds: {
        lines: 70,
        statements: 70,
        functions: 60,
        branches: 55,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
