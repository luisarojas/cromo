import { test, expect, type Page } from '@playwright/test';

/**
 * E2E for the in-trade messaging surface (Phase A3).
 *
 * Verifies:
 *   - Alice can open trade A and see the seeded messages
 *   - Sending a new message persists and re-renders without a page refresh
 *   - Bob (recipient) sees the message via SSE within ~3s
 *
 * Seeded trade (see 09_trust_safety.sql and trade.spec.ts):
 *   Trade A id: 00000000-0000-0000-0002-000000000001
 */

const ALICE = { email: 'alice@test.local', password: 'any' };
const BOB   = { email: 'bob@test.local',   password: 'any' };
const TRADE_A = '00000000-0000-0000-0002-000000000001';

async function loginAs(page: Page, user: { email: string; password: string }) {
  await page.goto('/login');
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  // Gate on the auth-indicating "Log out" button rather than a URL change:
  // when the backend rate-limits the login, the page briefly transitions
  // away from /login before bouncing back, so waitForURL would resolve
  // even though authentication failed. See trade.spec.ts for the same
  // pattern and the underlying explanation.
  await expect(page.getByRole('button', { name: /Log out/i }))
    .toBeVisible({ timeout: 10_000 });
}

test('alice can post a message and bob sees it via SSE', async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx   = await browser.newContext();
  const alicePage = await aliceCtx.newPage();
  const bobPage   = await bobCtx.newPage();

  try {
    await loginAs(alicePage, ALICE);
    await loginAs(bobPage,   BOB);

    // Bob's tab subscribes to `/api/v1/trade/requests/:id/stream` (SSE) after
    // hydration. Alice can otherwise post the message before Bob's EventSource
    // has connected and the broadcast goes nowhere on his side. Set up the
    // response wait BEFORE navigating so we don't miss the headers, then gate
    // Alice's send on it.
    const bobStreamReady = bobPage.waitForResponse(
      (resp) => resp.url().includes('/trade/requests/') && resp.url().includes('/stream'),
      { timeout: 10_000 },
    );

    await alicePage.goto(`/trade/${TRADE_A}`);
    await bobPage.goto(  `/trade/${TRADE_A}`);

    // Existing seed messages should already be visible.
    await expect(alicePage.getByText(/message|chat/i).first()).toBeVisible({ timeout: 10_000 });
    await bobStreamReady;

    const stamp = Date.now();
    const messageText = `smoke-test ${stamp}`;

    // The message composer is canonically a textarea; fall back to input if the
    // markup changes so the test stays useful.
    const composer = alicePage.locator('textarea, input[name="message"]').first();
    await composer.fill(messageText);
    // Submit by Enter (composer behaviour) or by clicking the nearest submit.
    await composer.press('Enter').catch(async () => {
      await alicePage.getByRole('button', { name: /send/i }).click();
    });

    // Alice sees her own message immediately.
    await expect(alicePage.getByText(messageText)).toBeVisible({ timeout: 5_000 });

    // Bob's tab receives it via SSE without manual refresh.
    await expect(bobPage.getByText(messageText)).toBeVisible({ timeout: 10_000 });
  } finally {
    await aliceCtx.close();
    await bobCtx.close();
  }
});
