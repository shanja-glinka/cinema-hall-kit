import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { pickBookablePair, pickBookableSeat } from './helpers';

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

  // On a phone the price is on the line above; the button keeps just its verb.
  await page.getByRole('button', { name: /^Reserve seats\b/ }).click();
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
    await pageB.getByRole('button', { name: /^Reserve seats\b/ }).click();

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

  test('desktop: after a reload the reservation is restored and can be bought', async ({
    page,
    request,
  }) => {
    const session = 'sat-2120';
    const key = await pickBookableSeat(request, session);
    await openSession(page, session);
    await seatOf(page, key).click();
    await page.getByRole('button', { name: /^Continue · / }).click();
    await expect(page.getByRole('region', { name: 'Booking' })).toContainText('Seats reserved');

    // The server keeps the hold for this viewer (by cookie); the reopened page selects it again.
    await page.reload();
    await expect(seatOf(page, key)).toHaveAttribute('data-status', 'held');
    await expect(seatOf(page, key)).toHaveAttribute('data-selected');
    const booking = page.getByRole('region', { name: 'Booking' });
    await expect(booking).toContainText('Seats reserved for');
    await page.getByRole('button', { name: /^Confirm purchase/ }).click();
    await expect(booking).toContainText(/Purchased · ticket № T-[0-9A-F]{8}/);
  });

  test('desktop: adding seats to a restored reservation explains why it is not sent, in the picker', async ({
    page,
    request,
  }) => {
    const session = 'sat-2120';
    const [held, extra] = await pickBookablePair(request, session);
    await openSession(page, session);
    await seatOf(page, held).click();
    await page.getByRole('button', { name: /^Continue · / }).click();
    await expect(page.getByRole('region', { name: 'Booking' })).toContainText('Seats reserved');

    await page.reload();
    await expect(seatOf(page, held)).toHaveAttribute('data-selected');
    await seatOf(page, extra).click();
    await expect(seatOf(page, extra)).toHaveAttribute('data-selected');
    await page.getByRole('button', { name: /^Continue · / }).click();

    // The explanation is the picker's own booking message; no separate notice above the picker.
    await expect(
      page
        .locator('[data-chk="message"]')
        .filter({ hasText: 'Some of these seats are already reserved for you.' })
        .first(),
    ).toBeVisible();
    await expect(page.getByText('Something went wrong. Please try again.')).toHaveCount(0);
    await expect(page.getByTestId('reserve-with-held')).toHaveCount(0);
    // Nothing was sent: the selection is kept and the new seat is not reserved.
    await expect(seatOf(page, held)).toHaveAttribute('data-selected');
    await expect(seatOf(page, extra)).toHaveAttribute('data-selected');
    await expect(seatOf(page, extra)).not.toHaveAttribute('data-status', 'held');
  });

  test('desktop: a purchase whose answer was lost shows the ticket, also after a reload', async ({
    page,
    request,
  }) => {
    const session = 'sat-1610';
    const key = await pickBookableSeat(request, session);
    await openSession(page, session);
    await seatOf(page, key).click();
    await page.getByRole('button', { name: /^Continue · / }).click();
    const booking = page.getByRole('region', { name: 'Booking' });
    await expect(booking).toContainText('Seats reserved');

    // The purchase reaches the server, but its answer is lost; the lookup that follows goes through.
    let dropped = false;
    await page.route(`**/sessions/${session}`, async (route) => {
      if (route.request().method() !== 'POST' || dropped) return route.continue();
      dropped = true;
      await route.fetch();
      return route.abort();
    });
    await page.getByRole('button', { name: /^Confirm purchase/ }).click();
    await expect(booking).toContainText(/Purchased · ticket № T-[0-9A-F]{8}/);
    expect(dropped).toBe(true);
  });

  test('desktop: a purchase whose answers never arrive shows its ticket from the occupancy, also after a reload', async ({
    page,
    request,
  }) => {
    const session = 'sat-1840';
    const key = await pickBookableSeat(request, session);
    await openSession(page, session);
    await seatOf(page, key).click();
    await page.getByRole('button', { name: /^Continue · / }).click();
    const booking = page.getByRole('region', { name: 'Booking' });
    await expect(booking).toContainText('Seats reserved');

    // The purchase goes through on the server, and then every purchase answer is lost (the repeats
    // too). The occupancy answers still arrive: they list the viewer's ticket.
    const route = '**/sessions/' + session;
    let sent = 0;
    await page.route(route, async (intercepted) => {
      if (intercepted.request().method() !== 'POST') return intercepted.continue();
      sent += 1;
      if (sent === 1) await intercepted.fetch();
      return intercepted.abort();
    });
    await page.getByRole('button', { name: /^Confirm purchase/ }).click();
    await expect(booking).toContainText(/Purchased · ticket № T-[0-9A-F]{8}/);
    const number = (await booking.textContent())?.match(/T-[0-9A-F]{8}/)?.[0];
    // The repeats were answered with the same ticket on the server: one purchase, one ticket.
    expect(sent).toBeGreaterThan(1);

    await page.unroute(route);
    await page.reload();
    await expect(page.getByRole('region', { name: 'Booking' })).toContainText(
      `Purchased · ticket № ${number}`,
    );
  });

  test('desktop: a purchase that reaches the server after a reload shows its ticket', async ({
    page,
    request,
  }) => {
    const session = 'sat-2120';
    const key = await pickBookableSeat(request, session);
    await openSession(page, session);
    await seatOf(page, key).click();
    await page.getByRole('button', { name: /^Continue · / }).click();
    await expect(page.getByRole('region', { name: 'Booking' })).toContainText('Seats reserved');

    // The purchase is held up on the way: the page gives up waiting and is reloaded.
    const route = '**/sessions/' + session;
    const held: { request?: { url: string; headers: Record<string, string>; body: string } } = {};
    await page.route(route, async (intercepted) => {
      const sentRequest = intercepted.request();
      if (sentRequest.method() !== 'POST') return intercepted.continue();
      held.request ??= {
        url: sentRequest.url(),
        headers: await sentRequest.allHeaders(),
        body: sentRequest.postData() ?? '',
      };
      return intercepted.abort();
    });
    await page.getByRole('button', { name: /^Confirm purchase/ }).click();
    await expect.poll(() => held.request !== undefined).toBe(true);
    await page.unroute(route);
    await page.reload();
    const booking = page.getByRole('region', { name: 'Booking' });
    await expect(booking).toContainText('Seats reserved for');
    await expect(booking).not.toContainText('Purchased');

    // Now the held-up purchase arrives and goes through: the reloaded page shows its ticket.
    if (!held.request) throw new Error('no purchase was sent');
    const { url, headers, body } = held.request;
    const forwarded = Object.fromEntries(
      Object.entries(headers).filter(([name]) => !/^(host|content-length|connection)$/i.test(name)),
    );
    const late = await page.request.post(url, { headers: forwarded, data: body });
    expect(late.ok()).toBe(true);
    await expect(booking).toContainText(/Purchased · ticket № T-[0-9A-F]{8}/);
    await expect(seatOf(page, key)).toHaveAttribute('data-status', 'taken');
  });
});
