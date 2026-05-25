// next-intl configuration. Phase A ships English only; Spanish is wired but
// translations are stubs (every key falls back to the English copy until a
// translator fills es.json).
//
// Adding a new locale:
//   1. Drop a new JSON file in /messages/<locale>.json that mirrors en.json
//   2. Add the locale code to LOCALES below
//   3. (Optional) add a switcher in /components/LocaleSwitcher.tsx
//
// We keep the locale set tiny on purpose — every new locale forces a
// translation review on every PR that touches user-facing strings.

export const LOCALES = ['en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
