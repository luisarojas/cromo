import { test, expect } from '@playwright/test';

/**
 * E2E tests for Phase A3 — Trade flows.
 *
 * Prerequisites: the app is running locally with test users seeded.
 * Alice: email=alice@example.com, password=password123
 * Bob:   email=bob@example.com,   password=password123
 *
 * These tests run against the staging environment in CI.
 * Run locally: pnpm exec playwright test tests/e2e/trade.spec.ts
 */

const ALICE = { email: 'alice@example.com', password: 'password123' };
const BOB   = { email: 'bob@example.com',   password: 'password123' };

async function loginAs(page: import('@playwright/test').Page, user: typeof ALICE) {
  await page.goto('/login');
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/dashboard');
}

test.describe('Trade Hub', () => {
  test('trade page is accessible after login', async ({ page }) => {
    await loginAs(page, ALICE);
    await page.goto('/trade');
    await expect(page.getByRole('heading', { name: 'Trades' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Find Matches' })).toBeVisible();
  });

  test('My Trades tab shows empty state when no trades exist', async ({ page }) => {
    await loginAs(page, ALICE);
    await page.goto('/trade');
    await page.getByRole('button', { name: 'My Trades' }).click();
    await expect(page.getByText('You have no trades yet.')).toBeVisible();
  });

  test('Find Trades tab shows album dropdown and find button', async ({ page }) => {
    await loginAs(page, ALICE);
    await page.goto('/trade');
    await expect(page.getByRole('combobox')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Find Matches' })).toBeVisible();
  });

  test('clicking Find Matches triggers the match search', async ({ page }) => {
    await loginAs(page, ALICE);
    await page.goto('/trade');

    const albumSelect = page.getByRole('combobox');
    const albumCount = await albumSelect.locator('option').count();

    if (albumCount > 0) {
      await page.getByRole('button', { name: 'Find Matches' }).click();
      // Wait for either results or empty state — either is a valid response
      await expect(
        page.getByText(/potential partner|No matches found yet/)
      ).toBeVisible({ timeout: 10000 });
    }
  });
});

test.describe('Trade creation and lifecycle', () => {
  test('trade detail page requires authentication', async ({ page }) => {
    await page.goto('/trade/non-existent-id');
    await page.waitForURL('/login');
  });

  test('accessing a non-existent trade shows error', async ({ page }) => {
    await loginAs(page, ALICE);
    await page.goto('/trade/00000000-0000-0000-0000-000000000000');
    await expect(page.getByText(/Trade not found|not found/i)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Trade messaging via SSE', () => {
  test('trade detail page loads trade items and message section', async ({ page }) => {
    await loginAs(page, ALICE);
    await page.goto('/trade');
    await page.getByRole('button', { name: 'My Trades' }).click();

    // If a trade exists, navigate into it and check messaging UI
    const firstTrade = page.locator('button').filter({ hasText: /To:|From:/ }).first();
    const count = await firstTrade.count();

    if (count > 0) {
      await firstTrade.click();
      await expect(page.getByRole('heading', { name: 'Trade Details' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Trade Items' })).toBeVisible();
    }
  });

  test('message compose box is present on active trades', async ({ page }) => {
    await loginAs(page, ALICE);
    await page.goto('/trade');
    await page.getByRole('button', { name: 'My Trades' }).click();

    const activeTrade = page.locator('button').filter({ hasText: /To:|From:/ }).first();
    const count = await activeTrade.count();

    if (count > 0) {
      await activeTrade.click();

      // If trade is not terminal, message box should be visible
      const messageBox = page.getByPlaceholder(/Type a message/);
      const isTerminal = await page.getByText(/This trade is (completed|declined|cancelled|expired)/).count();

      if (isTerminal === 0) {
        await expect(messageBox).toBeVisible();
        await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
      }
    }
  });
});

test.describe('Trade action buttons', () => {
  test('Back to Trades navigation works', async ({ page }) => {
    await loginAs(page, ALICE);
    await page.goto('/trade');
    await page.getByRole('button', { name: 'My Trades' }).click();

    const firstTrade = page.locator('button').filter({ hasText: /To:|From:/ }).first();
    const count = await firstTrade.count();

    if (count > 0) {
      await firstTrade.click();
      await expect(page.getByRole('heading', { name: 'Trade Details' })).toBeVisible();
      await page.getByText('← Trades').click();
      await expect(page).toHaveURL('/trade');
    }
  });
});
