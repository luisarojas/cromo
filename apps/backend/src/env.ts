import { z } from 'zod';

const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_VERSION: z.string().default('0.0.0-local'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default('0.0.0.0'),

  // Database
  DATABASE_URL: z
    .string()
    .url()
    .default('postgres://stickfolio:localpassword@localhost:5432/stickfolio_dev'),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Auth
  AUTH_MODE: z.enum(['local', 'cognito']).default('local'),
  JWT_SECRET: z.string().min(16).default('local-dev-secret-change-this-in-all-real-environments'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),    // 15 min
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(2592000), // 30 days

  // AWS Cognito (optional — only required when AUTH_MODE=cognito)
  COGNITO_USER_POOL_ID: z.string().optional(),
  COGNITO_CLIENT_ID: z.string().optional(),
  COGNITO_REGION: z.string().default('ca-central-1'),

  // Email / Nodemailer
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  EMAIL_FROM: z.string().email().default('noreply@stickfolio.local'),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // Rate limiting
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Invalid environment variables:');
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

export const env = parseEnv();
