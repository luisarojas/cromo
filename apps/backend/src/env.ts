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
    .default('postgres://cromo:localpassword@localhost:5432/cromo_dev'),

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
  // Cognito JWT `token_use` claim to accept. "access" for API auth (default);
  // "id" if the frontend sends ID tokens instead.
  COGNITO_TOKEN_USE: z.enum(['access', 'id']).default('access'),

  // Email / Nodemailer
  // When SMTP_HOST is unset (production), the SES transport is used instead.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(1025),
  EMAIL_FROM: z.string().min(1).default('noreply@cromo.local'),

  // SES bounce/complaint SQS queue URL. The poller in
  // services/ses-poller.service.ts long-polls this queue and writes events
  // into email_suppressions. Unset = poller is disabled (local dev,
  // tests, environments where SES isn't wired up yet).
  SES_QUEUE_URL: z.string().url().optional(),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // Frontend URL (used in email links)
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),

  // Rate limiting
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),

  // AI scanning. SCAN_PROVIDER picks which backend runs identifySticker:
  //   - 'gemini' → Google AI Studio (gemini-2.5-flash by default)
  //   - 'groq'   → Groq Cloud (meta-llama/llama-4-scout-17b-16e-instruct
  //                by default; OpenAI-compatible API).
  // SCAN_MODEL optionally overrides the provider's default model id without
  // a redeploy. The provider's own
  // API key must be set to a non-'mock' value for live calls; the mock
  // pathway short-circuits when the ACTIVE provider's key is 'mock'.
  SCAN_PROVIDER: z.enum(['gemini', 'groq']).default('gemini'),
  SCAN_MODEL: z.string().optional(),
  GEMINI_API_KEY: z.string().default('mock'),
  GROQ_API_KEY: z.string().default('mock'),

  // Scheduled jobs. 'enabled' registers the §34 cron catalog at API startup;
  // 'disabled' skips all registration (default for tests + iteration speed in
  // local dev — flip to 'enabled' to exercise the catalog locally).
  JOBS_MODE: z.enum(['enabled', 'disabled']).default('disabled'),

  // Web push (FEATURE_WEB_PUSH). VAPID keys are required for the web-push
  // library to sign push payloads. Generate locally with:
  //   npx web-push generate-vapid-keys
  // The PUBLIC key is also exposed to the frontend via NEXT_PUBLIC_VAPID_PUBLIC_KEY.
  VAPID_PUBLIC_KEY:  z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT:     z.string().default('mailto:noreply@cromo.local'),

  // Uploads — when UPLOADS_DRIVER=s3 the upload service writes to S3 and
  // returns the public URL (CloudFront in front in prod). Local dev defaults
  // to 'local' which keeps the previous /app/uploads behaviour.
  UPLOADS_DRIVER:    z.enum(['local', 's3']).default('local'),
  UPLOADS_BUCKET:    z.string().optional(),
  UPLOADS_REGION:    z.string().default('ca-central-1'),
  // Public base URL the frontend resolves avatar paths against. CloudFront
  // domain in prod (e.g. https://cdn.cromotrade.ca); raw S3 URL in dev.
  UPLOADS_PUBLIC_URL: z.string().url().optional(),

  // Admin sticker edits round-trip back to the seed files in git.
  // GITHUB_TOKEN: PAT with `repo` scope (or fine-grained Contents+PR write).
  //   Unset → seed-writer falls back to direct local file writes (dev only),
  //   so the operator commits manually.
  // GITHUB_REPO: `<owner>/<name>` (e.g. `luisarojas/cromo`). Required when
  //   GITHUB_TOKEN is set.
  // GITHUB_BASE_BRANCH: branch the PR targets. Defaults to `main`.
  GITHUB_TOKEN:       z.string().optional(),
  GITHUB_REPO:        z.string().optional(),
  GITHUB_BASE_BRANCH: z.string().default('main'),
  // Absolute path to the repo's `scripts/seeds/` dir on disk. In dev this is
  // bind-mounted at /app/scripts/seeds. Used by the local-file fallback.
  SEEDS_DIR:          z.string().default('/app/scripts/seeds'),
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
