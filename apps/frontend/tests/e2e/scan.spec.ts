import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Scan-flow smoke test.
 *
 * Verifies the *real* upload pipeline end-to-end:
 *   1. Alice logs in.
 *   2. /scan loads without an error boundary.
 *   3. We programmatically attach a real JPEG to the hidden file input.
 *   4. The backend accepts the multipart upload, calls identifySticker(),
 *      and returns a result (the mock pathway returns BRA5 / Vinicius Jr;
 *      a real Groq key returns whatever the model says).
 *   5. The page renders a recognisable scan card — either a sticker or a
 *      "no match" message. Anything else (5xx error, blank screen) fails.
 *
 * This catches the failure modes a unit test of `routes/v1/scan.ts` can't:
 *   - multipart parsing wired to the wrong field name
 *   - sharp/normalisation crashing on real bytes
 *   - frontend dropping the response into the wrong UI slot
 *   - feature-flag check returning 404 when it shouldn't
 *
 * Prerequisites (asserted with `test.skip()` so the suite degrades gracefully
 * when the env isn't ready, rather than producing a confusing failure):
 *   - the dev backend has FEATURE_AI_SCANNING enabled
 *   - either GROQ_API_KEY=mock (cheap, deterministic) or a real key
 *     (slower, costs money, but does exercise the real provider path)
 */

const ALICE = { email: 'alice@test.local', password: 'any' };

const API_BASE =
  process.env['PLAYWRIGHT_API_URL'] ?? 'http://localhost:3001';

async function loginAs(page: Page, user: { email: string; password: string }) {
  await page.goto('/login');
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 });
}

// A tiny but real JPEG, generated once and reused across runs.
const FIXTURE_PATH = path.resolve(__dirname, 'fixtures/scan-pixel.jpg');

function ensureFixtureExists(): void {
  if (fs.existsSync(FIXTURE_PATH)) return;
  fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
  // Smallest valid JPEG: SOI + minimal JFIF header + quantization table +
  // EOI. file-type recognises this as image/jpeg; sharp can decode it.
  const TINY_JPEG = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
    0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
    0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
    0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
    0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x10, 0x01, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
    0xa0, 0xff, 0xd9,
  ]);
  fs.writeFileSync(FIXTURE_PATH, TINY_JPEG);
}

// Used inside the browser to ping the backend for environment status. We do
// this once before each test rather than at suite-level so a flaky backend
// produces a clear skip rather than a fast fail across the whole file.
async function probeBackend(): Promise<{ aiEnabled: boolean; reachable: boolean }> {
  try {
    const flagsRes = await fetch(`${API_BASE}/api/v1/health/ready`);
    if (!flagsRes.ok) return { aiEnabled: false, reachable: false };
  } catch {
    return { aiEnabled: false, reachable: false };
  }
  // We can't read the feature flag without admin auth, so assume enabled in
  // a dev environment. The scan request itself surfaces the 404 if it isn't.
  return { aiEnabled: true, reachable: true };
}

test.describe('scan flow (smoke)', () => {
  test.beforeAll(() => { ensureFixtureExists(); });

  test('alice can open /scan and the UI renders without an error boundary', async ({ page }) => {
    const { reachable } = await probeBackend();
    test.skip(!reachable, 'Backend not reachable on PLAYWRIGHT_API_URL');

    await loginAs(page, ALICE);
    await page.goto('/scan');

    await expect(page.locator('text=/something went wrong/i')).toHaveCount(0);
    // The drop zone is the canonical entry point; assert it's mounted.
    await expect(page.getByText(/drop a sticker image here/i)).toBeVisible({ timeout: 10_000 });
  });

  test('uploading a JPEG triggers a real backend scan and renders a scan card', async ({ page }) => {
    const { reachable } = await probeBackend();
    test.skip(!reachable, 'Backend not reachable on PLAYWRIGHT_API_URL');

    await loginAs(page, ALICE);
    await page.goto('/scan');
    await expect(page.getByText(/drop a sticker image here/i)).toBeVisible({ timeout: 10_000 });

    // The file input is sr-only (visually hidden). setInputFiles bypasses the
    // visibility check by design.
    const fileInput = page.locator('input[type="file"][accept*="image/jpeg"]').first();
    await fileInput.setInputFiles(FIXTURE_PATH);

    // The scan request either:
    //  - succeeds and renders a sticker card (BRA5/Vinicius if mock, real
    //    result otherwise), OR
    //  - succeeds and renders the canonical no-match message (real Groq with
    //    a 1x1 JPEG that has no identifiable sticker)
    //
    // Both are valid behaviour. What's NOT acceptable is a 5xx-driven error
    // boundary, a hung spinner, or a blank result area — those would mean
    // the multipart pipeline or the AI provider is broken in a way that
    // surfaces to the user.
    const stickerCard = page.getByText(/BRA\d+|Vinicius|FWC\d+|EX\d+|CC\d+/);
    const noMatch = page.getByText(/couldn't identify any stickers/i);
    const anyResult = stickerCard.or(noMatch);

    await expect(anyResult).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('text=/something went wrong/i')).toHaveCount(0);
  });
});
