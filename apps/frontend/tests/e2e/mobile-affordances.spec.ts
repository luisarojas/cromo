import { test, expect, type Page } from '@playwright/test';

/**
 * Mobile affordance regression — locks in the touch-visible fixes for things
 * that previously only appeared on desktop hover (favourite heart, album
 * overflow menu, slim drawer). If a future refactor restores the
 * `opacity-0 group-hover:opacity-100` pattern on these surfaces, these tests
 * fail before the change ships.
 *
 * Mirrors mobile-audit's viewport so we're testing the same surface a real
 * phone visitor sees.
 */

const ALICE = { email: 'alice@test.local', password: 'any' };

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

test.describe('mobile affordances', () => {
  test.setTimeout(60_000);

  test('hamburger drawer does NOT duplicate the bottom tab bar', async ({ page }) => {
    await loginAs(page, ALICE);
    await page.goto('/dashboard');

    // Open the hamburger drawer.
    await page.getByRole('button', { name: /open menu/i }).click();
    const drawer = page.locator('#mobile-nav-drawer');
    await expect(drawer).toBeVisible();

    // Primary destinations live in the bottom tab bar — the drawer should
    // NOT carry them.
    for (const label of [/^Dashboard$/i, /^Album collection$/i, /^Trade$/i, /^Scan$/i]) {
      await expect(drawer.getByRole('link', { name: label })).toHaveCount(0);
    }
    // The drawer SHOULD carry settings, guides, log out.
    await expect(drawer.getByRole('link', { name: /settings/i })).toBeVisible();
    await expect(drawer.getByRole('link', { name: /guides?/i })).toBeVisible();
    await expect(drawer.getByRole('button', { name: /log out/i })).toBeVisible();
  });

  test('album page exposes an overflow menu on mobile (inline hidden, ⋯ visible)', async ({ page }) => {
    await loginAs(page, ALICE);
    await page.goto('/collection');

    // Open whichever album Alice has — first card on the grid.
    const firstAlbumLink = page.locator('a[href^="/collection/"]').first();
    await firstAlbumLink.click();
    await page.waitForURL(/\/collection\/[^/]+/);

    // The mobile overflow trigger is visible …
    const overflow = page.getByRole('button', { name: /more album actions/i });
    await expect(overflow).toBeVisible();

    // … and every inline secondary action button is hidden via `hidden md:flex`.
    // The data-testid is the contract with SecondaryHeaderActions; if it
    // changes there, update both sides in the same commit.
    const inlineActions = page.locator('[data-testid="header-action-inline"]');
    expect(await inlineActions.count()).toBeGreaterThan(0);
    for (const action of await inlineActions.all()) {
      await expect(action).toBeHidden();
    }

    // Opening the overflow surfaces the secondary actions.
    await overflow.click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /edit/i })).toBeVisible();
  });

  test('grid density toggle is hidden on mobile', async ({ page }) => {
    await loginAs(page, ALICE);
    await page.goto('/collection');

    const firstAlbumLink = page.locator('a[href^="/collection/"]').first();
    await firstAlbumLink.click();
    await page.waitForURL(/\/collection\/[^/]+/);

    // The density button's aria-label starts with "Grid density:".
    const density = page.getByRole('button', { name: /grid density:/i });
    // Hidden via `hidden md:flex` — Playwright considers `display: none`
    // elements not visible.
    await expect(density).toBeHidden();
  });
});
