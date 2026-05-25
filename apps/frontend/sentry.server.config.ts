// Sentry server-side init for the Next.js server runtime.
// See sentry.client.config.ts for the opt-in pattern.

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_ENV ?? 'development',
    release: process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0-local',
    tracesSampleRate: 0.1,
  });
}
