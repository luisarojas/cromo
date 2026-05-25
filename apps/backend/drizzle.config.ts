import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgres://cromo:localpassword@localhost:5432/cromo_dev',
  },
  verbose: true,
  strict: true,
} satisfies Config;
