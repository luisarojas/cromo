import { test, expect, type Page } from '@playwright/test';

/**
 * Mobile UI audit — drives Playwright at an iPhone-class viewport (390×844)
 * and asserts that every top-level surface fits without a horizontal scroll
 * bar. Horizontal overflow at small widths is the canonical "this layout is
 * broken on mobile" signal: most other issues (touch targets, font scale,
 * spacing) are tolerable, but content that escapes the viewport is not.
 *
 * Run: pnpm --filter @stickfolio/frontend exec playwright test mobile-audit
 */

const ALICE = { email: 'alice@test.local', password: 'any' };
const ADMIN = { email: 'admin@test.local', password: 'any' };

// Emulate iPhone 13 with Chromium — avoids needing a separate WebKit install
// while still producing a true mobile viewport (touch events, isMobile UA hint).
test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});

async function loginAs(page: Page, user: { email: string; password: string }) {
  await page.goto('/login');
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  // Some pages (trade/messaging) keep an SSE connection open and never reach
  // networkidle — domcontentloaded + a short render tick is sufficient for
  // layout to settle.
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(800);
  const delta = await page.evaluate(() => {
    const d = document.documentElement;
    return d.scrollWidth - d.clientWidth;
  });
  expect(delta, `${label} overflows horizontally by ${delta}px`).toBeLessThanOrEqual(1);
}

test.describe('mobile layout (iPhone 13)', () => {
  test.setTimeout(90_000);

  test('public pages fit the viewport', async ({ page }) => {
    await page.goto('/');
    await expectNoHorizontalOverflow(page, '/');

    await page.goto('/login');
    await expectNoHorizontalOverflow(page, '/login');

    await page.goto('/register');
    await expectNoHorizontalOverflow(page, '/register');

    await page.goto('/guide');
    await expectNoHorizontalOverflow(page, '/guide');

    await page.goto('/guide/wc-2026');
    await expectNoHorizontalOverflow(page, '/guide/wc-2026');
  });

  test('authenticated pages fit the viewport', async ({ page }) => {
    await loginAs(page, ALICE);

    await page.goto('/dashboard');
    await expectNoHorizontalOverflow(page, '/dashboard');

    await page.goto('/album');
    await expectNoHorizontalOverflow(page, '/album');

    await page.goto('/trade');
    await expectNoHorizontalOverflow(page, '/trade');

    await page.goto('/scan');
    await expectNoHorizontalOverflow(page, '/scan');

    await page.goto('/profile/alice');
    await expectNoHorizontalOverflow(page, '/profile/alice');

    await page.goto('/settings');
    await expectNoHorizontalOverflow(page, '/settings');
  });

  test('admin page fits the viewport', async ({ page }) => {
    await loginAs(page, ADMIN);

    await page.goto('/admin');
    await expectNoHorizontalOverflow(page, '/admin');
  });
});
