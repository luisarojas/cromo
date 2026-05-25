// Sentry client-side init. Loaded automatically by @sentry/nextjs.
//
// Sentry is opt-in: until NEXT_PUBLIC_SENTRY_DSN is set in the environment,
// the SDK initialises in no-op mode so local dev never accidentally ships
// errors to a shared project.
//
// Phase B: a Stickfolio Sentry / GlitchTip project is provisioned; the DSN is
// injected via Vercel/AWS env. Phase A leaves it unset.

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_ENV ?? 'development',
    release: process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0-local',
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.1,
    // Don't capture noisy framework events. The user-facing ErrorBoundary
    // already calls Sentry.captureException manually for caught crashes.
    ignoreErrors: ['ResizeObserver loop limit exceeded', 'NextRouter was not mounted'],
  });
}
