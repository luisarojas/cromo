import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgres://stickfolio:localpassword@localhost:5432/stickfolio_dev',
  },
  verbose: true,
  strict: true,
} satisfies Config;
