import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { HALL_ID } from './helpers';

/** Smoke scenario 1 of docs/requirements.md §6, against the real HallConstructor. */

const SCREENS = fileURLToPath(new URL('../test-results/screens/', import.meta.url));
const DRAFT_KEY = `cinema-hall-demo:draft:${HALL_ID}`;
const FIT_WIDTH = /A row with its wall clearance/;

/** The centre section's "Seats per row" field in the main band. */
const centreSeats = (page: Page): Locator =>
  page.locator('[data-chk="editor-inspector"]').getByLabel('Seats per row');
const errorGroup = (page: Page): Locator =>
  page.locator('[data-chk="editor-issue-group"][data-severity="error"]');
const fitWidthIssue = (page: Page): Locator =>
  errorGroup(page).getByRole('button', { name: FIT_WIDTH });
const saveButton = (page: Page): Locator => page.getByRole('button', { name: /^Save/ });

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
  await page.goto('/constructor');
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
  await page.goto('/constructor');
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
  await page.goto('/constructor');
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
  await page.goto('/constructor');
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
