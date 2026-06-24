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
      exclude: [
        // Bootstrap / CLI entry points — never imported by tests.
        'src/server.ts',
        'src/jobs/run-once.ts',
        // Module-level skip in app.ts when NODE_ENV === 'test', which is
        // how CI runs the suite. Including these inflates the denominator
        // with code we deliberately don't load in test mode.
        'src/plugins/swagger.ts',
        // Owns its own CLI runner branch + integration tests cover the
        // happy path; the runner branch can't execute inside vitest.
        'src/db/migrate.ts',
        // Catalog seed runner — skipped under NODE_ENV === 'test' (CI calls
        // scripts/seed-database.sh up front), and exercising it would require
        // shipping the SQL fixtures into the test denominator for no signal.
        'src/db/seed.ts',
        // node-cron wiring — exercised via integration tests, not unit
        // tests, and skipped under NODE_ENV === 'test' anyway.
        'src/jobs/scheduler.ts',
        'src/types/**',
      ],
      // Aggregate floor across the whole suite. We tried `perFile: true`
      // with per-glob overrides as a second tier, but vitest's per-glob
      // entries layer an ADDITIONAL constraint on top of the global rather
      // than overriding it — a "scan.ts: 15%" entry can't loosen a
      // "global: 50%" floor, so per-file gating requires every file to
      // meet the same number. That isn't realistic for a few hard-to-
      // unit-test surfaces (SSE handlers, AI integration, multi-CTE
      // matchmaking queries) and would block PRs on files that need
      // browser- or streaming-HTTP-level test infra to cover.
      //
      // The aggregate gate is sensitive enough on its own: adding a
      // 500-line zero-coverage file to a ~5,000-line codebase drops the
      // average by ~10%, which trips a 70% floor. The threshold also
      // tolerates the few files that legitimately sit below 50% because
      // their weight is small relative to the well-covered majority.
      //
      // Raise the numbers when (and only when) the next chunk of routes
      // genuinely gets covered — not just to make the badge look better.
      // Numbers reflect today's measured coverage minus a small buffer:
      // lines 73.08 → 70, stmts 69.73 → 65, funcs 63.01 → 60, branches
      // 59.7 → 55. Stmts trails lines because the codebase has multi-
      // statement lines in service code (ternaries, short chains); the
      // ~3% gap isn't worth closing with more tests.
      thresholds: {
        lines: 70,
        statements: 65,
        functions: 60,
        branches: 55,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
