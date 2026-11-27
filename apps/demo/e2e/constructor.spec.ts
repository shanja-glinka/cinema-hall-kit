import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { HALL_ID } from './helpers';

/** Smoke scenario 1 of docs/requirements.md §6, against the real HallConstructor. */

const SCREENS = fileURLToPath(new URL('../test-results/screens/', import.meta.url));
const DRAFT_KEY = `cinema-hall-demo:draft:${HALL_ID}`;
// The core message names the band first: "In band “Main”, a row with its wall clearance needs …".
const FIT_WIDTH = /a row with its wall clearance/i;

/** The centre section's "Seats per row" field in the main band. */
const centreSeats = (page: Page): Locator =>
  page.locator('[data-chk="editor-inspector"]').getByLabel('Seats per row');
const errorGroup = (page: Page): Locator =>
  page.locator('[data-chk="editor-issue-group"][data-severity="error"]');
const fitWidthIssue = (page: Page): Locator =>
  errorGroup(page).getByRole('button', { name: FIT_WIDTH });
const saveButton = (page: Page): Locator =>
  page.locator('[data-chk="editor"]').getByRole('button', { name: /^Save/ });

/** The sample hall is protected: the first save asks, and these tests choose to update it. */
async function updateSample(page: Page): Promise<void> {
  const dialog = page.getByTestId('save-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Update the sample hall', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

/** A user's edit: a number field applies its value on blur or Enter, not on each key press. */
async function commit(field: Locator, value: string): Promise<void> {
  await field.fill(value);
  await field.blur();
}

async function serverHall(
  request: APIRequestContext,
): Promise<{ revision: number; source: string }> {
  const response = await request.get(`/api/halls/${HALL_ID}`);
  return (await response.json()) as { revision: number; source: string };
}

test('constructor: seatsPerRow 30 gives fit.width, the fix saves a new revision, the export keeps comments', async ({
  page,
  request,
}) => {
  mkdirSync(SCREENS, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/constructor?hall=${HALL_ID}`);
  await page.locator('[data-chk="editor-section-object"][data-section="centre"]').click();
  const seats = centreSeats(page);
  await expect(seats).toHaveValue('8');
  await page.screenshot({ path: `${SCREENS}constructor.png` });
  const before = (await serverHall(request)).revision;

  await commit(seats, '30');
  await expect(
    page.locator('[data-chk="editor-issue-badge"][data-severity="error"]').first(),
  ).toBeVisible();
  await expect(saveButton(page)).toBeDisabled();

  await page.locator('[data-chk="editor-issue-badge"][data-severity="error"]').first().click();
  await commit(seats, '8');
  await expect(errorGroup(page)).toHaveCount(0);
  await expect(saveButton(page)).toBeEnabled();

  await saveButton(page).click();
  await updateSample(page);
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  const saved = await serverHall(request);
  expect(saved.revision).toBe(before + 1);
  expect(saved.source).toContain('# Cinema Hall Config');

  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download YAML', exact: true }).click();
  const file = await (await download).path();
  if (file === null) throw new Error('the YAML download did not finish');
  const exported = readFileSync(file, 'utf8');
  expect(exported).toContain('# Cinema Hall Config');
  expect(exported).toContain('# Interior hall dimensions.');
  expect(exported).toContain('seatsPerRow: 8');
});

test('constructor: clicking an error badge selects the section and focuses its seat field', async ({
  page,
}) => {
  await page.goto(`/constructor?hall=${HALL_ID}`);
  await page.locator('[data-chk="editor-section-object"][data-section="centre"]').click();
  await commit(centreSeats(page), '30');
  // Back to the hall overview, where the issue list names the problem.
  await page.getByRole('button', { name: 'Hall overview', exact: true }).click();
  await fitWidthIssue(page).click();
  await expect(centreSeats(page)).toBeFocused();
});

test('constructor: a save from an old revision conflicts; the server version then saves', async ({
  page,
  request,
}) => {
  await page.goto(`/constructor?hall=${HALL_ID}`);
  await page.locator('[data-chk="editor-section-object"][data-section="centre"]').click();
  const seats = centreSeats(page);
  await expect(seats).toHaveValue('8');

  // Another editor saves first, so this page is left with an old revision.
  const current = await serverHall(request);
  const other = await request.post(`/api/halls/${HALL_ID}`, {
    data: {
      baseRevision: current.revision,
      yaml: current.source.replace('hallType: LUX', 'hallType: 2D'),
    },
  });
  expect(other.ok()).toBe(true);
  const theirs = await serverHall(request);

  await commit(seats, '9');
  await saveButton(page).click();
  await updateSample(page);
  await expect(page.getByText('The hall was changed on the server')).toBeVisible();

  // Loading the server version replaces the local edit; the next save of it must go through.
  await page.getByRole('button', { name: 'Load server version', exact: true }).click();
  await expect(centreSeats(page)).toHaveValue('8');
  await saveButton(page).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  const saved = await serverHall(request);
  expect(saved.revision).toBe(theirs.revision + 1);
  expect(saved.source).toContain('hallType: 2D');
});

test('constructor: an unsaved edit is kept as a draft and offered after a reload', async ({
  page,
}) => {
  // Reloading a page with unsaved edits raises beforeunload; accept it so the reload goes through.
  page.on('dialog', (dialog) => void dialog.accept());
  await page.goto(`/constructor?hall=${HALL_ID}`);
  await page.locator('[data-chk="editor-section-object"][data-section="centre"]').click();
  const seats = centreSeats(page);
  await commit(seats, '9');
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await page.waitForFunction((key) => window.localStorage.getItem(key) !== null, DRAFT_KEY);

  await page.reload();
  const prompt = page.getByRole('alertdialog', { name: 'Restore draft?' });
  await expect(prompt).toBeVisible();
  await prompt.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(prompt).toHaveCount(0);
  await page.locator('[data-chk="editor-section-object"][data-section="centre"]').click();
  await expect(centreSeats(page)).toHaveValue('9');
});

test("constructor: saving a copy keeps the original hall's unrestored draft and closes its offer", async ({
  page,
  request,
}) => {
  const { source } = await serverHall(request);
  const draft = JSON.stringify({
    yaml: `${source}\n# an unsaved draft\n`,
    savedAt: new Date().toISOString(),
  });
  await page.goto(`/constructor?hall=${HALL_ID}`);
  await page.evaluate(({ key, value }) => window.localStorage.setItem(key, value), {
    key: DRAFT_KEY,
    value: draft,
  });
  await page.reload();
  const prompt = page.getByRole('alertdialog', { name: 'Restore draft?' });
  await expect(prompt).toBeVisible();

  // The draft is not restored: the visible hall is edited and saved as a new hall.
  await page.locator('[data-chk="editor-section-object"][data-section="centre"]').click();
  await commit(centreSeats(page), '9');
  await saveButton(page).click();
  const dialog = page.getByTestId('save-dialog');
  await dialog.getByLabel('Name of the new hall').fill(`Draft copy ${Date.now().toString(36)}`);
  await dialog.getByRole('button', { name: 'Save as new hall', exact: true }).click();
  await expect(page.getByTestId('saved-panel')).toContainText('created');

  // The offer belonged to the original hall: it is not shown on the copy, and the draft stays.
  await expect(prompt).toHaveCount(0);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), DRAFT_KEY)).toBe(draft);
});

test('constructor: without parameters it asks what to do instead of opening a sample hall', async ({
  page,
}) => {
  await page.goto('/constructor');
  await expect(page.getByTestId('constructor-chooser')).toBeVisible();
  await expect(page.locator('[data-chk="editor"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Single block/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Orbita Hall 2', exact: true })).toBeVisible();
});

test('constructor: the save question can be cancelled; nothing is saved', async ({
  page,
  request,
}) => {
  const before = (await serverHall(request)).revision;
  await page.goto(`/constructor?hall=${HALL_ID}`);
  await expect(page.getByTestId('sample-badge')).toBeVisible();
  await page.locator('[data-chk="editor-section-object"][data-section="centre"]').click();
  await commit(centreSeats(page), '9');
  await saveButton(page).click();
  const dialog = page.getByTestId('save-dialog');
  await expect(dialog).toContainText('is a sample hall');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await serverHall(request)).revision).toBe(before);
});

test('constructor: saving a sample as a new hall leaves the sample unchanged', async ({
  page,
  request,
}) => {
  const before = await serverHall(request);
  const name = `Novyi zal ${Date.now().toString(36)}`;
  await page.goto(`/constructor?hall=${HALL_ID}`);
  await page.locator('[data-chk="editor-section-object"][data-section="centre"]').click();
  await commit(centreSeats(page), '9');
  await saveButton(page).click();
  const dialog = page.getByTestId('save-dialog');
  await dialog.getByLabel('Name of the new hall').fill(name);
  await dialog.getByRole('button', { name: 'Save as new hall', exact: true }).click();

  const panel = page.getByTestId('saved-panel');
  await expect(panel).toContainText(`Hall “${name}” created`);
  await expect(panel).toContainText('“Orbita Hall 2” is unchanged');
  await expect(panel.getByTestId('saved-add-showtimes')).toBeVisible();
  await expect(page).toHaveURL(/\/constructor\?hall=novyi-zal-/);
  await expect(page.locator('h1')).toContainText(name);

  const after = await serverHall(request);
  expect(after.revision).toBe(before.revision);
  expect(after.source).toBe(before.source);
  const halls = (await (await request.get('/api/halls')).json()) as {
    halls: { id: string; name: string; seats: number; sample?: boolean }[];
  };
  const created = halls.halls.find((hall) => hall.name === name);
  expect(created?.sample).toBeUndefined();
  // Seven rows of the centre block gain a seat each.
  expect(created?.seats).toBe(126 + 7);
  const copy = (await (await request.get(`/api/halls/${created?.id}`)).json()) as {
    source: string;
  };
  expect(copy.source.split('\n')[0]).toBe(`# Cinema Hall Config — ${name}.`);
  // The id line keeps the sample's comment after the value (`id: <id>  # ...`).
  expect(copy.source).toMatch(new RegExp(`^id: ${created?.id}(?:\\s+#.*)?$`, 'm'));
});

test('constructor: an edit made while a new hall is being saved is kept after the save', async ({
  page,
  request,
}) => {
  const name = `Slow save ${Date.now().toString(36)}`;
  // The create request waits until the test lets it through.
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived: () => void = () => {};
  const inFlight = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  await page.route('**/api/halls', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    arrived();
    await gate;
    return route.continue();
  });
  await page.goto(`/constructor?hall=${HALL_ID}`);
  await page.locator('[data-chk="editor-section-object"][data-section="centre"]').click();
  await commit(centreSeats(page), '9');
  await saveButton(page).click();
  const dialog = page.getByTestId('save-dialog');
  await dialog.getByLabel('Name of the new hall').fill(name);
  await dialog.getByRole('button', { name: 'Save as new hall', exact: true }).click();
  await inFlight;
  // The user goes on editing while the request runs.
  await commit(centreSeats(page), '10');
  release();
  // The create answer carries the stored hall; the editor takes it without a second request.
  await expect(page.getByTestId('saved-panel')).toContainText(`Hall “${name}” created`);
  await expect(page.locator('h1')).toContainText(name);
  // The server copy was taken (new id in the address), and the later edit is still there, unsaved.
  await expect(page).toHaveURL(/\/constructor\?hall=slow-save-/);
  await expect(centreSeats(page)).toHaveValue('10');
  const halls = (await (await request.get('/api/halls')).json()) as {
    halls: { id: string; name: string; seats: number }[];
  };
  // The saved hall has the state the save sent: seven rows of the centre block gain one seat.
  expect(halls.halls.find((hall) => hall.name === name)?.seats).toBe(126 + 7);
});

test('constructor: no second save starts while a new hall is being saved and loaded', async ({
  page,
}) => {
  const name = `Slow guard ${Date.now().toString(36)}`;
  // The create request waits until the test lets it through; every hall write is counted.
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived: () => void = () => {};
  const creating = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/api\/halls(\/|$)/.test(new URL(request.url()).pathname)) {
      writes.push(new URL(request.url()).pathname);
    }
  });
  await page.route('**/api/halls', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    arrived();
    await gate;
    return route.continue();
  });
  await page.goto(`/constructor?hall=${HALL_ID}`);
  await page.locator('[data-chk="editor-section-object"][data-section="centre"]').click();
  await commit(centreSeats(page), '9');
  await saveButton(page).click();
  const dialog = page.getByTestId('save-dialog');
  await dialog.getByLabel('Name of the new hall').fill(name);
  await dialog.getByRole('button', { name: 'Save as new hall', exact: true }).click();
  await creating;
  // While the new hall is on its way, the header action is off ...
  const header = page.locator('.header-actions').getByRole('button', { name: 'Save as new hall' });
  await expect(header).toBeDisabled();
  // ... and a save from the toolbar starts nothing: the button is off, and a forced click is ignored.
  const toolbarSave = page
    .locator('[data-chk="editor"]')
    .getByRole('button', { name: /^Sav(e|ing)/ });
  await expect(toolbarSave).toBeDisabled();
  await toolbarSave.click({ force: true });
  release();
  await expect(page).toHaveURL(/\/constructor\?hall=slow-guard-/);
  await expect(header).toBeEnabled();
  // One write only: the create. Nothing was written to the original hall or to the new one.
  expect(writes).toEqual(['/api/halls']);
});

test('the save dialog keeps the keyboard inside it: the page behind cannot save', async ({
  page,
}) => {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith('/api/halls')) {
      writes.push(new URL(request.url()).pathname);
    }
  });
  await page.goto(`/constructor?hall=${HALL_ID}`);
  await page.locator('[data-chk="editor-section-object"][data-section="centre"]').click();
  await commit(centreSeats(page), '9');
  await page.locator('.header-actions').getByRole('button', { name: 'Save as new hall' }).click();
  const dialog = page.getByTestId('save-dialog');
  await expect(dialog).toBeVisible();
  // The toolbar's Save button is in the inert page behind the dialog.
  await expect
    .poll(() => saveButton(page).evaluate((element) => element.closest('[inert]') !== null))
    .toBe(true);
  // Tab moves through the dialog only; it never lands on a control of the page behind.
  for (let step = 0; step < 12; step += 1) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => {
      const active = document.activeElement;
      const open = document.querySelector('[data-testid="save-dialog"]');
      return active === null || active === document.body || (open?.contains(active) ?? false);
    });
    expect(inside).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(() => saveButton(page).evaluate((element) => element.closest('[inert]') !== null))
    .toBe(false);
  expect(writes).toEqual([]);
});

test('a new hall saved after the editor was left does not change the address', async ({ page }) => {
  const name = `Left behind ${Date.now().toString(36)}`;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived: () => void = () => {};
  const creating = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  await page.route('**/api/halls', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    arrived();
    await gate;
    return route.continue();
  });
  await page.goto(`/constructor?hall=${HALL_ID}`);
  await page.locator('.header-actions').getByRole('button', { name: 'Save as new hall' }).click();
  const dialog = page.getByTestId('save-dialog');
  await dialog.getByLabel('Name of the new hall').fill(name);
  await dialog.getByRole('button', { name: 'Save as new hall', exact: true }).click();
  await creating;
  // The user leaves for the hall list while the hall is still being created.
  await page.locator('.constructor-header').getByRole('link', { name: 'All halls' }).click();
  await expect(page).toHaveURL(/\/$/);
  const answered = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().endsWith('/api/halls'),
  );
  release();
  await answered;
  // The hall exists, but the page the user is on keeps its own address.
  await page.waitForTimeout(500);
  expect(new URL(page.url()).pathname).toBe('/');
  expect(new URL(page.url()).search).toBe('');
});

test('closing the save dialog returns the focus to the button that opened it', async ({ page }) => {
  await page.goto(`/constructor?hall=${HALL_ID}`);
  const opener = page.locator('.header-actions').getByRole('button', { name: 'Save as new hall' });
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByTestId('save-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Name of the new hall')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});
