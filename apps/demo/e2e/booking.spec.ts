import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { pickBookableSeat } from './helpers';

/** Smoke scenario 2 of docs/requirements.md §6: booking, 3D view and metrics, hold, conflict. */

const SCREENS = fileURLToPath(new URL('../test-results/screens/', import.meta.url));

// The phone flow (stage map → view → sheet). Desktop has its own scenario below.
test.use({ viewport: { width: 390, height: 844 } });

const seatOf = (page: Page, key: string) => page.locator(`[data-chk="seat"][data-key="${key}"]`);

async function openSession(page: Page, sessionId: string): Promise<void> {
  await page.goto(`/sessions/${sessionId}`);
  // Seat statuses arrive with the first occupancy poll; before that the map is inactive.
  await expect(page.locator('[data-chk="seat"][data-status="taken"]').first()).toBeAttached();
}

test('booking: taken seats are not selectable, a free seat opens the 3D view and books a hold', async ({
  page,
  request,
}) => {
  mkdirSync(SCREENS, { recursive: true });
  const session = 'sat-1840';
  const key = await pickBookableSeat(request, session);
  await openSession(page, session);

  const taken = page.locator('[data-chk="seat"][data-status="taken"]').first();
  // Forced: a taken seat is disabled, so Playwright's hit-target check would wait for it forever.
  await taken.click({ force: true });
  await expect(taken).not.toHaveAttribute('data-selected');

  const seat = seatOf(page, key);
  await seat.click();
  await expect(seat).toHaveAttribute('data-selected');
  await page.locator('.phone').screenshot({ path: `${SCREENS}map.png` });

  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get('seat') === key);
  const root = page.locator('[data-chk="root"]');
  await expect(root).toHaveAttribute('data-stage', 'view');
  await expect(page.locator('canvas').first()).toBeVisible();
  await expect(root).not.toHaveAttribute('data-phase');
  await expect(page.locator('[data-chk="metric-value"]')).toHaveCount(3);

  const sheet = page.locator('[data-chk="sheet-compact"]').first();
  await expect(sheet).toBeVisible();
  await page.locator('.phone').screenshot({ path: `${SCREENS}view.png` });
  await sheet.screenshot({ path: `${SCREENS}sheet.png` });

  await page.getByRole('button', { name: /Book/ }).click();
  await expect(page.getByRole('region', { name: 'Booking' })).toBeVisible();
  await expect(seat).toHaveAttribute('data-status', 'held');
});

test('conflict: a seat booked by one viewer is refused to a second viewer who still sees it free', async ({
  browser,
  request,
}) => {
  const session = 'sat-2120';
  const key = await pickBookableSeat(request, session);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  try {
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    await openSession(pageA, session);
    await openSession(pageB, session);

    // Viewer B stops polling: the seat still looks free to B when B books.
    await pageB.route('**/api/sessions/*/occupancy', (route) => route.abort());
    await seatOf(pageB, key).click();
    await expect(seatOf(pageB, key)).toHaveAttribute('data-selected');

    await seatOf(pageA, key).click();
    // "Continue" books directly, without the 3D preview.
    await pageA.getByRole('button', { name: /^Continue/ }).click();
    await expect(pageA.getByRole('region', { name: 'Booking' })).toBeVisible();

    await pageB.getByRole('button', { name: 'Preview' }).click();
    await expect(pageB.locator('[data-chk="root"]')).toHaveAttribute('data-stage', 'view');
    await pageB.getByRole('button', { name: /Book/ }).click();

    await expect(
      pageB
        .locator('[data-chk="message"][role="alert"]')
        .filter({ hasText: 'has just been taken' }),
    ).toBeVisible();
    await expect(seatOf(pageB, key)).not.toHaveAttribute('data-selected');
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test.describe('desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('desktop: map and live 3D side by side; Continue books directly', async ({
    page,
    request,
  }) => {
    const session = 'sat-1610';
    const key = await pickBookableSeat(request, session);
    await openSession(page, session);
    await expect(page.locator('canvas').first()).toBeVisible();

    await seatOf(page, key).click();
    await expect(seatOf(page, key)).toHaveAttribute('data-selected');
    await expect(page.locator('[data-chk="metric-value"]')).toHaveCount(3);
    await page.screenshot({ path: `${SCREENS}desktop.png` });

    await page.getByRole('button', { name: /^Continue · / }).click();
    await expect(page.getByRole('region', { name: 'Booking' })).toBeVisible();
    await expect(seatOf(page, key)).toHaveAttribute('data-status', 'held');
  });
});
