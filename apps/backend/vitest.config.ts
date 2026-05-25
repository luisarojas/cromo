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
      // Phase A7 milestone: full test suite ≥ 80% coverage.
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 75,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
