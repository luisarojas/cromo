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
      // Per-file gate. With perFile: true, the numbers below apply to each
      // file in include[] individually, not just the aggregate — that's
      // what catches a new 500-line zero-coverage file from hiding behind
      // everyone else's well-tested code.
      //
      // The floor is deliberately moderate (50 lines / 30 funcs / 30 branches):
      // a handful of files genuinely sit lower because they wrap things that
      // can't be unit-tested without standing up real infra (SSE socket
      // handlers, the AI scan provider, multi-CTE matchmaking queries). Those
      // get per-glob overrides below. Everything else MUST meet the floor.
      //
      // To raise the floor: bring the laggards up first, then bump these
      // numbers. Don't bump the floor and add more overrides — that defeats
      // the gate.
      thresholds: {
        perFile: true,
        lines: 50,
        statements: 50,
        functions: 30,
        branches: 30,
        // Per-file overrides for surfaces with structural reasons coverage
        // is hard. Numbers match the current state minus a small buffer so
        // a regression of a few % blocks the build; rising coverage will
        // need this number lifted in the same PR.
        'src/routes/v1/scan.ts':                  { lines: 25, statements: 25, functions: 30, branches: 15 },
        'src/routes/v1/trade.ts':                 { lines: 55, statements: 55, functions: 45, branches: 30 },
        'src/routes/v1/trust-safety.ts':          { lines: 55, statements: 55, functions: 55, branches: 40 },
        'src/services/trade-matching.service.ts': { lines: 35, statements: 35, functions: 15, branches: 35 },
        'src/services/trade-requests.service.ts': { lines: 50, statements: 45, functions: 25, branches: 40 },
        'src/services/albums.service.ts':         { lines: 55, statements: 60, functions: 65, branches: 45 },
        'src/plugins/tradeBus.ts':                { lines: 40, statements: 40, functions: 30, branches: 15 },
        'src/plugins/cors.ts':                    { lines: 45, statements: 45, functions: 45, branches: 45 },
        'src/jobs/catalog.ts':                    { lines: 45, statements: 30, functions: 0,  branches: 100 },
        'src/db/migrate.ts':                      { lines: 25, statements: 25, functions: 15, branches: 30 },
        'src/db/schema.ts':                       { lines: 50, statements: 50, functions: 35, branches: 100 },
        'src/env.ts':                             { lines: 50, statements: 50, functions: 100, branches: 45 },
        'src/middleware/auth.ts':                 { lines: 60, statements: 60, functions: 85, branches: 55 },
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
