import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { buildHallLayout, parseHallConfig } from '@cinema-hall/core';

/**
 * The generator flow: YAML → hall → sessions → booking. Presets on the home page, the upload page
 * with its browser-side check and the server's own validation, the generator, and the
 * constructor with "move future sessions to the new version".
 */

test.use({ viewport: { width: 1440, height: 900 } });

const ORBITA = readFileSync(
  fileURLToPath(new URL('../data/orbita-hall-2.yaml', import.meta.url)),
  'utf8',
);

/** The example hall with its own id and name, so every test creates a hall of its own. */
function hallYaml(id: string, name: string): string {
  return ORBITA.replace(/^id:.*$/m, `id: ${id}`).replace(/^name:.*$/m, `name: ${name}`);
}

const uniqueId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}`;

interface HallsResponse {
  halls: { id: string; seats: number; sessions: { id: string; versionRev: number }[] }[];
}

async function listHalls(request: APIRequestContext): Promise<HallsResponse['halls']> {
  const response = await request.get('/api/halls');
  return ((await response.json()) as HallsResponse).halls;
}

function dayFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${String(date.getDate()).padStart(2, '0')}`;
}

const generator = (occupancyPercent: number, time = '11:00') => ({
  from: dayFromNow(1),
  to: dayFromNow(1),
  slots: [{ time, format: '2D' }],
  occupancyPercent,
});

const seats = (page: Page): Locator => page.locator('[data-chk="seat"]');

test('home: preset halls with a plan, prices and session chips; a session opens its own hall', async ({
  page,
}) => {
  await page.goto('/');
  const cards = page.getByTestId('hall-card');
  expect(await cards.count()).toBeGreaterThanOrEqual(3);
  // Other tests add halls of their own; the presets are the ones with three or more sessions.
  for (const id of ['orbita-hall-2', 'kamerny-hall', 'bolshoy-hall']) {
    const card = page.locator(`[data-hall-id="${id}"]`);
    await expect(card.getByTestId('hall-thumb')).toBeVisible();
    expect(await card.getByTestId('session-chip').count()).toBeGreaterThanOrEqual(3);
    await expect(card.locator('.tier-list li').first()).toContainText('¤');
  }
  await expect(page.getByRole('link', { name: 'Upload YAML' })).toBeVisible();

  const chamber = page.locator('[data-hall-id="kamerny-hall"]');
  await expect(chamber).toContainText('Chamber Hall');
  await chamber.getByTestId('session-chip').first().click();
  await expect(page).toHaveURL(/\/sessions\/kamerny-hall-\d{8}-\d{4}$/);
  await expect(page.locator('.booking-title')).toContainText('Chamber Hall');
  await expect(seats(page).first()).toBeAttached();
  const layout = await expectedLayout(page, 'kamerny-hall');
  await expect(seats(page)).toHaveCount(layout.seats.length);
  // Chips of the header: the other sessions of this hall on the same date.
  expect(await page.locator('.showtime').count()).toBeGreaterThanOrEqual(2);
});

async function expectedLayout(page: Page, hallId: string) {
  const response = await page.request.get(`/api/halls/${hallId}`);
  const body = (await response.json()) as { config: unknown };
  return buildHallLayout(parseHallConfig(body.config, { strict: true }).config);
}

test('upload: paste YAML, see the check, generate 2 days × 2 times with a price override, book', async ({
  page,
  request,
}) => {
  const id = uniqueId('e2e-upload');
  await page.goto('/halls/new');
  await expect(page.getByRole('button', { name: 'Create hall' })).toBeDisabled();

  // The example button fills the form; then the text is replaced with a hall of our own.
  await page.getByRole('button', { name: 'Load example' }).click();
  await expect(page.getByTestId('verdict')).toContainText('passed validation');
  await page.getByLabel('Hall YAML').fill(hallYaml(id, 'Test Hall'));
  await expect(page.getByTestId('verdict')).toContainText('Hall “Test Hall” passed validation');
  await expect(page.getByTestId('hall-thumb')).toBeVisible();

  await page.getByLabel('Showtime times').fill('11:00, 19:30');
  await page.getByLabel('Price · Classic').fill('999,5');
  await page.getByLabel('Seats occupied, %').fill('0');
  await expect(page.getByTestId('plan')).toContainText('Showtimes to create: 4');

  const before = (await listHalls(request)).length;
  await page.getByRole('button', { name: 'Create hall' }).click();
  await expect(page).toHaveURL(new RegExp(`/\\?new=${id}$`));

  const card = page.locator(`[data-hall-id="${id}"]`);
  await expect(card).toHaveAttribute('data-highlighted', '');
  await expect(card.getByTestId('hall-thumb')).toBeVisible();
  await expect(card.getByTestId('session-chip')).toHaveCount(4);
  expect((await listHalls(request)).length).toBe(before + 1);

  const first = card.getByTestId('session-chip').first();
  const href = await first.getAttribute('href');
  if (!href) throw new Error('the session chip has no link');
  await first.click();
  await expect(seats(page).first()).toBeAttached();
  const layout = await expectedLayout(page, id);
  await expect(seats(page)).toHaveCount(layout.seats.length);

  // A standard seat costs the overridden 999.50; Continue shows that price.
  const standard = layout.seats.find((seat) => seat.priceTier === 'standard');
  if (!standard) throw new Error('no standard seat');
  const seat = page.locator(`[data-chk="seat"][data-key="${standard.key}"]`);
  await seat.click();
  await expect(seat).toHaveAttribute('data-selected');
  const cont = page.getByRole('button', { name: /^Continue · / });
  await expect(cont).toContainText(/999\.50/);
  await cont.click();
  await expect(page.getByRole('region', { name: 'Booking' })).toBeVisible();
  await expect(seat).toHaveAttribute('data-status', 'held');

  // The backend holds the seat for this viewer.
  const occupancy = await page.request.get(
    `/api/sessions/${href.replace('/sessions/', '')}/occupancy`,
  );
  const snapshot = (await occupancy.json()) as { occupancy: { held?: { key: string }[] } };
  expect(snapshot.occupancy.held?.map((entry) => entry.key)).toContain(standard.key);
});

test('upload: invalid YAML lists the issues and creates nothing', async ({ page, request }) => {
  const before = (await listHalls(request)).length;
  await page.goto('/halls/new');
  await page.getByLabel('Hall YAML').fill('version: 1\nname: Broken\nhall:\n  width: [1, 2\n');
  const issues = page.getByTestId('issues');
  await expect(issues).toBeVisible();
  await expect(issues).toContainText('Syntax error');
  await expect(issues).toContainText(/line \d+, column \d+/);
  await expect(page.getByTestId('verdict')).toContainText('Hall rejected');
  await expect(page.getByRole('button', { name: 'Create hall' })).toBeDisabled();

  // A structurally valid but incomplete document: the schema errors name the missing parts.
  await page.getByLabel('Hall YAML').fill('version: 1\nname: Empty\n');
  await expect(issues).toContainText('Required value is missing');
  await expect(page.getByRole('button', { name: 'Create hall' })).toBeDisabled();

  // The server does not rely on the browser either.
  const direct = await request.post('/api/halls', { data: { yaml: 'name: x\n  bad: [' } });
  expect(direct.status()).toBe(400);
  expect(((await direct.json()) as { issues: unknown[] }).issues.length).toBeGreaterThan(0);
  expect((await listHalls(request)).length).toBe(before);
});

test('upload: the server enforces its own thresholds, not the ones written in the document', async ({
  page,
  request,
}) => {
  // The document zeroes the rear clearance and shortens the hall: valid by its own constraints.
  const loose = hallYaml(uniqueId('e2e-loose'), 'Tight Hall')
    .replace('minRearClearance: 1.0', 'minRearClearance: 0')
    .replace(/^(\s+)depth: 16.0/m, '$1depth: 14.0');
  const before = (await listHalls(request)).length;
  await page.goto('/halls/new');
  await page.getByLabel('Hall YAML').fill(loose);
  await expect(page.getByTestId('verdict')).toContainText('passed validation');
  await page.getByLabel('Showtime times').fill('');
  await page.getByRole('button', { name: 'Create hall' }).click();

  const failure = page.getByTestId('server-failure');
  await expect(failure).toContainText('Server rejected the request');
  await expect(failure.getByTestId('issues')).toContainText('fit.depth');
  expect((await listHalls(request)).length).toBe(before);
});

test('generator: bad price, bad time and a past date are refused before anything is created', async ({
  request,
}) => {
  const before = (await listHalls(request)).length;
  const id = uniqueId('e2e-bad-generator');
  const attempts: { generator: unknown; field: string }[] = [
    { generator: { ...generator(0), prices: { standard: '1.234' } }, field: 'prices' },
    { generator: { ...generator(0), prices: { standard: -5 } }, field: 'prices' },
    { generator: { ...generator(0), prices: { vip: 10 } }, field: 'prices' },
    { generator: { ...generator(0), slots: [{ time: '25:00', format: '2D' }] }, field: 'slots' },
    { generator: { ...generator(0), from: dayFromNow(-2), to: dayFromNow(1) }, field: 'from' },
    { generator: { ...generator(0), occupancyPercent: 101 }, field: 'occupancyPercent' },
  ];
  for (const attempt of attempts) {
    const response = await request.post('/api/halls', {
      data: { yaml: hallYaml(id, 'Will not be created'), generator: attempt.generator },
    });
    expect(response.status()).toBe(400);
    expect(((await response.json()) as { field: string }).field).toBe(attempt.field);
  }
  expect((await listHalls(request)).length).toBe(before);
});

const centreSeats = (page: Page): Locator =>
  page.locator('[data-chk="editor-inspector"]').getByLabel('Seats per row');
const saveButton = (page: Page): Locator => page.getByRole('button', { name: /^Save/ });

test('constructor: a new version moves future sessions; seats in use keep a session where it is', async ({
  page,
  request,
}) => {
  const id = uniqueId('e2e-repin');
  const created = await request.post('/api/halls', {
    data: { yaml: hallYaml(id, 'Versioned Hall'), generator: generator(0, '11:00') },
  });
  expect(created.status()).toBe(201);
  // A second session where every seat is taken: any removed seat is in use there.
  const full = await request.post(`/api/halls/${id}/sessions`, { data: generator(100, '15:00') });
  expect(full.status()).toBe(201);
  const hall = (await listHalls(request)).find((entry) => entry.id === id);
  const sessions = hall?.sessions ?? [];
  expect(sessions).toHaveLength(2);
  const free = sessions.find((session) => session.id.endsWith('1100'));
  const taken = sessions.find((session) => session.id.endsWith('1500'));
  if (!free || !taken) throw new Error('sessions were not created');
  const seatsBefore = hall?.seats ?? 0;

  await page.goto(`/constructor?hall=${id}`);
  await expect(page.locator('h1')).toContainText('Versioned Hall');
  await page.locator('[data-chk="editor-section-object"][data-section="centre"]').click();
  await expect(centreSeats(page)).toHaveValue('8');
  await centreSeats(page).fill('6');
  await centreSeats(page).blur();
  await saveButton(page).click();

  const panel = page.getByTestId('saved-panel');
  await expect(panel).toContainText('Version 2 saved');
  await expect(panel).toContainText('2 of 2 showtimes use older versions');

  await panel.getByRole('button', { name: 'Move future showtimes', exact: true }).click();
  const report = page.getByTestId('repin-report');
  await expect(report).toContainText('Moved to version 2: 1');
  await expect(report.getByTestId('repin-refused')).toHaveCount(1);
  await expect(report.getByTestId('repin-refused')).toContainText(taken.id);

  const after = (await listHalls(request)).find((entry) => entry.id === id);
  const byId = new Map((after?.sessions ?? []).map((session) => [session.id, session.versionRev]));
  expect(byId.get(free.id)).toBe(2);
  expect(byId.get(taken.id)).toBe(1);

  // The booking page of the moved session draws the new version: 14 seats fewer (7 rows × 2).
  await panel.getByRole('link', { name: 'Open booking', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/sessions/${free.id}$`));
  const layout = await expectedLayout(page, id);
  expect(layout.seats.length).toBe(seatsBefore - 14);
  await expect(seats(page)).toHaveCount(seatsBefore - 14);

  // The refused session still shows the first version.
  await page.goto(`/sessions/${taken.id}`);
  await expect(seats(page)).toHaveCount(seatsBefore);
});

test('constructor: a template becomes a hall on the first save', async ({ page, request }) => {
  const before = (await listHalls(request)).length;
  await page.goto('/constructor?template=single');
  await page.locator('[data-chk="editor-section-object"][data-section="main"]').click();
  await centreSeats(page).fill('9');
  await centreSeats(page).blur();
  await saveButton(page).click();

  const panel = page.getByTestId('saved-panel');
  await expect(panel).toContainText('Hall created · version 1');
  await expect(panel.getByRole('link', { name: 'Open booking', exact: true })).toBeVisible();
  const halls = await listHalls(request);
  expect(halls.length).toBe(before + 1);
  expect(halls.some((hall) => hall.seats === 90)).toBe(true);
});

const KAMERNY = readFileSync(
  fileURLToPath(new URL('../data/kamerny-hall.yaml', import.meta.url)),
  'utf8',
);

async function createFreeSession(
  request: APIRequestContext,
  id: string,
): Promise<{ sessionId: string; yaml: string }> {
  const yaml = hallYaml(id, 'Hall for update');
  const created = await request.post('/api/halls', {
    data: { yaml, generator: generator(0, '11:00') },
  });
  expect(created.status()).toBe(201);
  const hall = (await listHalls(request)).find((entry) => entry.id === id);
  const sessionId = hall?.sessions[0]?.id;
  if (!sessionId) throw new Error('no session was created');
  return { sessionId, yaml };
}

test('open booking page: a re-pin redraws the hall and the price, with a notice (DEMO-07)', async ({
  page,
  request,
}) => {
  const id = uniqueId('e2e-live');
  const { sessionId, yaml } = await createFreeSession(request, id);
  await page.goto(`/sessions/${sessionId}`);
  await expect(seats(page).first()).toBeAttached();
  const before = await expectedLayout(page, id);
  await expect(seats(page)).toHaveCount(before.seats.length);

  // The first seat of the left block exists in both versions.
  const seat = page.locator('[data-chk="seat"][data-key="left.r1.s1"]');
  await seat.click();
  await expect(page.getByRole('button', { name: /^Continue · / })).toContainText('450.00');

  // Another editor: a higher price and a narrower centre block, then the sessions are moved.
  const saved = await request.post(`/api/halls/${id}`, {
    data: {
      baseRevision: 1,
      yaml: yaml
        .replace('standard: 450', 'standard: 500')
        .replace('seatsPerRow: 8', 'seatsPerRow: 7'),
    },
  });
  expect(saved.status()).toBe(200);
  const moved = await request.post(`/api/halls/${id}/repin`, { data: {} });
  expect(((await moved.json()) as { moved: unknown[] }).moved).toHaveLength(1);

  await expect(page.getByTestId('hall-updated')).toBeVisible();
  const after = await expectedLayout(page, id);
  expect(after.seats.length).toBeLessThan(before.seats.length);
  await expect(seats(page)).toHaveCount(after.seats.length);
  if ((await seat.getAttribute('data-selected')) === null) await seat.click();
  await expect(page.getByRole('button', { name: /^Continue · / })).toContainText('500.00');
  // Booking at the new price is accepted: no `price_changed` from a stale page.
  await page.getByRole('button', { name: /^Continue · / }).click();
  await expect(page.getByRole('region', { name: 'Booking' })).toBeVisible();
});

test('hold countdown follows the server clock when the browser clock is an hour ahead (DEMO-11)', async ({
  page,
  request,
}) => {
  const { sessionId } = await createFreeSession(request, uniqueId('e2e-clock'));
  await page.clock.setFixedTime(new Date(Date.now() + 3_600_000));
  await page.goto(`/sessions/${sessionId}`);
  await expect(seats(page).first()).toBeAttached();
  await page.locator('[data-chk="seat"][data-key="left.r1.s1"]').click();
  await page.getByRole('button', { name: /^Continue · / }).click();
  const panel = page.getByRole('region', { name: 'Booking' });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(/\d+:\d\d/);
  await expect(panel).not.toContainText('Hold expired');
});

test('upload: price drafts of a tier the new hall lacks do not block creating (DEMO-09)', async ({
  page,
}) => {
  await page.goto('/halls/new');
  await page.getByLabel('Hall YAML').fill(hallYaml(uniqueId('e2e-tiers'), 'Lounge Hall'));
  await page.getByLabel('Price · Lounge').fill('700');
  await expect(page.getByTestId('plan')).toContainText('Showtimes to create: 4');

  // A hall without the recliner tier: its input disappears and so must its error.
  await page.getByLabel('Hall YAML').fill(KAMERNY);
  await expect(page.getByLabel('Price · Sofa')).toBeVisible();
  await expect(page.getByLabel('Price · Lounge')).toHaveCount(0);
  await expect(page.getByTestId('plan')).toContainText('Showtimes to create: 4');
  await expect(page.locator('.form-error')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create hall' })).toBeEnabled();
});

test('constructor: after a conflict, loading the server version keeps the YAML comments (DEMO-05)', async ({
  page,
  request,
}) => {
  const id = uniqueId('e2e-comments');
  await createFreeSession(request, id);
  await page.goto(`/constructor?hall=${id}`);
  await page.locator('[data-chk="editor-section-object"][data-section="centre"]').click();
  await expect(centreSeats(page)).toHaveValue('8');

  // Another editor saves first.
  const current = (await (await request.get(`/api/halls/${id}`)).json()) as {
    revision: number;
    source: string;
  };
  const other = await request.post(`/api/halls/${id}`, {
    data: {
      baseRevision: current.revision,
      yaml: current.source.replace('hallType: LUX', 'hallType: 2D'),
    },
  });
  expect(other.ok()).toBe(true);

  await centreSeats(page).fill('9');
  await centreSeats(page).blur();
  await saveButton(page).click();
  await expect(page.getByText('The hall was changed on the server')).toBeVisible();
  await page.getByRole('button', { name: 'Load server version', exact: true }).click();
  await expect(centreSeats(page)).toHaveValue('8');

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download YAML', exact: true }).click();
  const file = await (await download).path();
  if (file === null) throw new Error('the YAML download did not finish');
  const exported = readFileSync(file, 'utf8');
  expect(exported).toContain('# Cinema Hall Config');
  expect(exported).toContain('# Interior hall dimensions.');
  expect(exported).toContain('hallType: 2D');
});
