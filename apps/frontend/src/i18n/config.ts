// next-intl configuration. English and Spanish are the supported locales.
// Locale resolution lives in request.ts (cookie → Accept-Language → default).
// A user-facing switcher in /components/LocaleSwitcher.tsx writes the
// NEXT_LOCALE cookie and reloads.
//
// Adding a new locale:
//   1. Drop a new JSON file in /messages/<locale>.json that mirrors en.json
//   2. Add the locale code to LOCALES below
//   3. The switcher picks it up automatically
//
// We keep the locale set tiny on purpose — every new locale forces a
// translation review on every PR that touches user-facing strings.

export const LOCALES = ['en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
