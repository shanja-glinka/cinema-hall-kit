import { expect, test } from '@playwright/test';
import { pickBookableSeat } from './helpers';

/** Smoke scenario 3 of docs/requirements.md §6: going back in the middle of the flight (phone flow). */

test.use({ viewport: { width: 390, height: 844 } });

test('transition: back in the middle of the flight reverses it, with no console errors', async ({
  page,
  request,
}) => {
  const session = 'sat-1610';
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  const key = await pickBookableSeat(request, session);
  await page.goto(`/sessions/${session}`);
  const seat = page.locator(`[data-chk="seat"][data-key="${key}"]`);
  await expect(page.locator('[data-chk="seat"][data-status="taken"]').first()).toBeAttached();

  await seat.click();
  await expect(seat).toHaveAttribute('data-selected');
  await page.getByRole('button', { name: 'Preview' }).click();

  const root = page.locator('[data-chk="root"]');
  await expect(root).toHaveAttribute('data-phase', /.+/);
  await page.getByRole('button', { name: 'Back' }).first().click();

  await expect(root).toHaveAttribute('data-stage', 'map');
  await expect(root).not.toHaveAttribute('data-phase');
  await expect(page).toHaveURL((url) => !url.searchParams.has('seat'));
  // The selection survives the trip back to the map, as in the concept.
  await expect(seat).toHaveAttribute('data-selected');
  expect(errors).toEqual([]);
});
