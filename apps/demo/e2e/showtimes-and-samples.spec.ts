import { expect, test, type APIRequestContext } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Deleting a showtime, the way back from a booking page, and the names the sample halls and the
 * plan of a two-level hall use.
 */

test.use({ viewport: { width: 1440, height: 900 } });

const SCREENS = fileURLToPath(new URL('../test-results/screens/', import.meta.url));

const ORBITA = readFileSync(
  fileURLToPath(new URL('../data/orbita-hall-2.yaml', import.meta.url)),
  'utf8',
);

function dayFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${String(date.getDate()).padStart(2, '0')}`;
}

async function createHall(request: APIRequestContext, id: string, times: string[]) {
  const yaml = ORBITA.replace(/^id:.*$/m, `id: ${id}`).replace(/^name:.*$/m, `name: ${id}`);
  const response = await request.post('/api/halls', {
    data: {
      yaml,
      generator: {
        from: dayFromNow(1),
        to: dayFromNow(1),
        slots: times.map((time) => ({ time, format: '2D' })),
        occupancyPercent: 0,
      },
    },
  });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { hall: { id: string; sessions: { id: string }[] } };
  return body.hall;
}

test('showtimes: one is deleted after a confirmation; one with reserved seats is refused with the reason', async ({
  page,
  request,
}) => {
  const hall = await createHall(request, `e2e-del-${Date.now().toString(36)}`, ['12:00', '18:00']);
  const [first, second] = hall.sessions;
  if (!first || !second) throw new Error('sessions were not created');

  await page.goto(`/halls/${hall.id}/showtimes`);
  const rows = page.getByTestId('showtime-row');
  await expect(rows).toHaveCount(2);
  mkdirSync(SCREENS, { recursive: true });
  await page.screenshot({ path: `${SCREENS}showtimes.png`, fullPage: true });
  const firstRow = rows.filter({ has: page.locator(`[href="/sessions/${first.id}"]`) });
  await firstRow.getByTestId('delete-showtime').click();
  // Nothing is deleted before the confirmation; "Keep it" cancels.
  await firstRow.getByRole('button', { name: 'Keep it' }).click();
  await expect(rows).toHaveCount(2);
  await firstRow.getByTestId('delete-showtime').click();
  await expect(firstRow).toContainText('This cannot be undone.');
  await firstRow.getByTestId('confirm-delete').click();
  await expect(rows).toHaveCount(1);
  await expect(page.getByTestId('showtime-deleted')).toContainText('deleted');
  const listed = await request.get(`/api/halls/${hall.id}/sessions`);
  expect(((await listed.json()) as { sessions: unknown[] }).sessions).toHaveLength(1);

  // A viewer reserves a seat of the other showtime: it cannot be deleted now, and the page says why.
  await page.goto(`/sessions/${second.id}`);
  await expect(page.locator('[data-chk="map"]')).not.toHaveAttribute('aria-busy');
  await page.locator('[data-chk="seat"][data-status="available"]').first().click();
  await page.getByRole('button', { name: /^Continue · / }).click();
  await expect(page.getByRole('region', { name: 'Booking' })).toBeVisible();

  await page.goto(`/halls/${hall.id}/showtimes`);
  await rows.first().getByTestId('delete-showtime').click();
  await rows.first().getByTestId('confirm-delete').click();
  await expect(rows.first().getByTestId('delete-error')).toContainText('temporarily reserved');
  await expect(rows).toHaveCount(1);
});

test('booking: the back link leads to the page the showtime was opened from', async ({ page }) => {
  // Opened directly: the hall's showtimes.
  await page.goto('/sessions/sat-1610');
  const back = page.getByTestId('booking-back');
  await expect(back).toHaveAttribute('href', '/halls/orbita-hall-2/showtimes');
  await expect(back).toContainText('Showtimes of this hall');

  // From a chip on the home page: back to all halls.
  await page.goto('/');
  await page.locator('[data-hall-id="orbita-hall-2"] [data-testid="session-chip"]').first().click();
  await expect(page).toHaveURL(/\/sessions\//);
  await expect(back).toHaveAttribute('href', '/');
  await expect(back).toContainText('All halls');
  await back.click();
  await expect(page).toHaveURL(/\/$/);
});

test('sample seat types, bands and the plan use clear names; a copy keeps them', async ({
  page,
  request,
}) => {
  await page.goto('/');
  const grand = page.locator('[data-hall-id="bolshoy-hall"]');
  const tiers = grand.getByRole('list', { name: 'Seat types and prices' });
  await expect(tiers).toContainText('Classic');
  await expect(tiers).toContainText('Lounge (recliners)');
  await expect(tiers).toContainText('Balcony');
  await expect(grand.getByTestId('hall-thumb')).toContainText('Balcony');

  // The booking page of a sample showtime: the legend says what the premium seats are.
  await page.goto('/sessions/sat-1610');
  await expect(page.locator('[data-chk="seat"]').first()).toBeAttached();
  await expect(page.getByText(/Lounge \(recliners\) ·/).first()).toBeVisible();

  // A copy of the Grand Hall: the plan names every section, with a level legend.
  await page.goto('/constructor?copy=bolshoy-hall');
  const editor = page.locator('[data-chk="editor"]');
  const sectionNames = editor.locator('[data-chk="editor-section-object"] text');
  await expect(sectionNames.first()).toBeAttached();
  const names = await sectionNames.allTextContents();
  expect(names).toContain('Balcony');
  await expect(editor.locator('[data-chk="editor-level-legend"]')).toContainText(
    'Dashed: balcony above it',
  );
  await expect(
    editor.locator('[data-chk="editor-band-group"][data-covered]').first(),
  ).toBeAttached();

  await page.screenshot({ path: `${SCREENS}constructor-balcony.png` });
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('saved-panel')).toContainText('created');
  await expect(page).toHaveURL(/\/constructor\?hall=/);
  const id = new URL(page.url()).searchParams.get('hall') ?? '';
  const saved = (await (await request.get(`/api/halls/${encodeURIComponent(id)}`)).json()) as {
    source: string;
  };
  expect(saved.source).toContain('Lounge (recliners)');
  expect(saved.source).toContain('Stalls');
});
