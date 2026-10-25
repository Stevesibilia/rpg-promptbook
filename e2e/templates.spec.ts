import { expect, test, type Page } from '@playwright/test';
import { baseURL } from './stack.js';
import { signIn } from './helpers.js';
import { pdfTexts } from './pdf-text.js';

// Document templates (template-editor, mockup states 1 to 9): duplicate a
// built-in, edit and save versions, start a project from one, update the
// project to the next version and undo it; two tabs saving the same version.
// The first PDF of a page loads the engine, so its steps get a minute.

const ENGINE = { timeout: 60_000 };

test.describe.configure({ timeout: 240_000 });

test.beforeEach(async ({ page }) => {
  await signIn(page, '/settings/documents');
});

// A test that made its template the default must not leave it so: the other
// specs' new projects start from the built-ins.
test.afterEach(async ({ request }) => {
  const settings = await (await request.get('/api/settings')).json();
  settings.defaultTemplates = { adventure: 'avventura', campaign: 'campagna' };
  await request.put('/api/settings', { headers: { origin: baseURL }, data: settings });
});

const row = (page: Page, name: string) => page.locator('.trow', { has: page.locator('b', { hasText: new RegExp(`^${name}$`) }) });
const sectionRow = (page: Page, heading: string) =>
  page.getByTestId('section-row').filter({ has: page.locator(`input[value="${heading}"]`) });
const saveBar = (page: Page) => page.getByRole('region', { name: 'Unsaved changes' });
const outline = (page: Page) => page.locator('.ol');
const chip = (page: Page) => page.getByRole('button', { name: /available$/ });

// Duplicates Avventura and opens the copy, version 1; answers its editor's
// path.
async function duplicate(page: Page): Promise<string> {
  await page.goto('/settings/documents');
  await row(page, 'Avventura').getByRole('button', { name: 'Duplicate' }).click();
  await expect(page).toHaveURL(/\/settings\/documents\/t-[0-9a-z]{10}$/);
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(/^Copia di Avventura/);
  return new URL(page.url()).pathname;
}

async function save(page: Page, version: number, note: string, changes: string[]) {
  await page.getByRole('button', { name: `Save as v${version}` }).click();
  const dialog = page.getByRole('dialog', { name: new RegExp(`v${version}$`) });
  for (const change of changes) await expect(dialog.getByRole('list', { name: 'Changes' })).toContainText(change);
  await dialog.getByLabel('Note for this version (optional)').fill(note);
  await dialog.getByRole('button', { name: `Save v${version}` }).click();
  await expect(dialog).toHaveCount(0);
  await expect(saveBar(page)).toHaveCount(0);
}

test('a template from a copy of Avventura to an updated project, and undo', async ({ page }) => {
  const name = `Avventura e2e ${Date.now().toString(36)}`;

  // A built-in opens read only.
  await row(page, 'Avventura').getByRole('button', { name: 'View' }).click();
  await expect(page.getByText("Built-in template. It can't be changed; duplicate it to make your own.")).toBeVisible();
  await expect(sectionRow(page, 'Inizio forte').getByLabel('Heading')).toBeDisabled();
  await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(0);

  // Duplicate, then a name and the mockup's three edits: v2.
  const editor = await duplicate(page);
  await page.getByLabel('Name', { exact: true }).fill(name);
  await sectionRow(page, 'Inizio forte').getByLabel('Heading').fill('Apertura');
  await expect(sectionRow(page, 'Apertura')).toHaveClass(/changed/);
  await expect(page.getByTestId('starting-document')).toContainText('Apertura');
  await page.getByLabel('New section').fill('Atmosfera');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(sectionRow(page, 'Atmosfera')).toHaveClass(/added/);
  // A section with a role cannot be removed.
  await expect(sectionRow(page, 'Scene').getByRole('button', { name: 'Remove Scene' })).toBeDisabled();
  await page.getByRole('tab', { name: /Scene fields/ }).click();
  await page.getByLabel('Needed: Prove e regole').selectOption('required');
  await expect(saveBar(page)).toContainText('4 unsaved changes');
  await save(page, 2, 'Apertura e Atmosfera', [
    'Section «Atmosfera», optional',
    'Section «Inizio forte» renamed «Apertura»',
    'Scene field «Prove e regole» now required',
  ]);

  // The list shows v2; Make default, and New project preselects it.
  await page.getByRole('button', { name: '← Document templates' }).click();
  await expect(row(page, name)).toContainText('v2');
  await expect(row(page, name)).toContainText('Copied from Avventura · no projects');
  await row(page, name).getByRole('button', { name: 'Make default' }).click();
  await expect(row(page, name).locator('.chip.def')).toHaveText('Default');
  await expect(row(page, 'Avventura').locator('.chip.def')).toHaveCount(0);

  const title = `Sul faro ${Date.now().toString(36)}`;
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('radio', { name: /One-shot/ }).click();
  await expect(dialog.getByLabel('Template')).toHaveValue(/^t-/);
  await expect(dialog.getByLabel('Template').locator('option:checked')).toHaveText(`${name} · v2 (default)`);
  await expect(dialog.getByTestId('preview')).toContainText('## Apertura');
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByRole('button', { name: 'Create and open' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  const project = new URL(page.url()).pathname;
  await expect(page.locator('.status')).toContainText(`Template: ${name} v2`);
  await expect(outline(page)).toContainText('Apertura');
  await expect(chip(page)).toHaveCount(0);

  // The PDF finds the renamed strong start by its role and prints its name
  // (design decision 20): «Apertura» heads the start page («Inizio»), with
  // «Mappa delle scene», and a double-click on its read-aloud jumps back.
  await outline(page).getByText('Apertura', { exact: true }).click();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await page.keyboard.type(
    'La terra trema ancora, piano, come un cane che sogna. Il faro si accende da solo, e nessuno sale le scale.',
  );
  await expect(page.locator('.cm-content')).toContainText('come un cane che sogna');
  await page.keyboard.press('ControlOrMeta+Shift+P');
  const review = page.getByRole('region', { name: 'PDF review' });
  const start = review.locator('.thumbs-col .th', { hasText: /· Inizio$/ });
  await expect(start).toBeVisible(ENGINE);
  const download = page.waitForEvent('download');
  await review.getByRole('button', { name: 'Save PDF' }).click();
  const chunks: Buffer[] = [];
  for await (const chunk of await (await download).createReadStream()) chunks.push(chunk as Buffer);
  const pages = pdfTexts(Buffer.concat(chunks));
  const startPage = pages.find((text) => text.includes('Mappa delle scene'));
  expect(startPage).toContain('Apertura');
  expect(pages.some((text) => text.includes('Inizio forte'))).toBe(false);
  const number = Number(/^(\d+)/.exec((await start.textContent()) ?? '')![1]);
  await start.click();
  const sheet = review.locator(`.stage .pdf-sheet[data-page="${number}"]`);
  await expect(sheet).toBeVisible();
  const box = (await sheet.boundingBox())!;
  await sheet.dblclick({ position: { x: box.width * 0.3, y: box.height * 0.09 } });
  await expect(review).toHaveCount(0);
  await expect(page.locator('.status span').first()).toHaveText('Apertura');

  // v3: a renamed section and a new one.
  await page.goto(editor);
  await sectionRow(page, 'Mappa delle scene').getByLabel('Heading').fill('Mappa');
  await page.getByLabel('New section').fill('Segreti');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await save(page, 3, 'Mappa e Segreti', ['Section «Mappa delle scene» renamed «Mappa»', 'Section «Segreti», optional']);

  // The project offers v3; update with both boxes ticked.
  await page.goto(project);
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(chip(page)).toHaveText(`${name} v2 · v3 available`);
  await chip(page).click();
  const update = page.getByRole('dialog', { name: `Update to ${name} v3` });
  await expect(update.getByLabel("Add the new sections' headings to the document")).toBeChecked();
  await expect(update.getByLabel('Rename the headings that changed')).toBeChecked();
  await expect(update).toContainText('«## Mappa delle scene» becomes «## Mappa»');
  await update.getByRole('button', { name: 'Update to v3' }).click();
  await expect(update).toHaveCount(0);
  await expect(chip(page)).toHaveCount(0);
  await expect(page.locator('.status')).toContainText(`Template: ${name} v3`);
  await expect(outline(page)).toContainText('Segreti');
  await expect(outline(page)).not.toContainText('Mappa delle scene');
  await expect(page.locator('.cm-content')).toBeFocused();

  // One undo puts back the text and v2.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.status')).toContainText(`Template: ${name} v2`);
  await expect(outline(page)).toContainText('Mappa delle scene');
  await expect(outline(page)).not.toContainText('Segreti');
  await expect(chip(page)).toHaveText(`${name} v2 · v3 available`);

  // In use, the template has no Delete.
  await page.goto('/settings/documents');
  await expect(row(page, name)).toContainText('1 project');
  await expect(row(page, name).getByRole('button', { name: 'Delete' })).toHaveCount(0);
});

test('two tabs save the same version: the second is told and reloads', async ({ page, context }) => {
  const editor = await duplicate(page);
  await page.getByLabel('Name', { exact: true }).fill(`Due schede ${Date.now().toString(36)}`);
  await save(page, 2, '', []);
  const other = await context.newPage();
  await other.goto(editor);
  await expect(other.getByLabel('Name', { exact: true })).toBeVisible();

  await page.getByLabel('New section').fill('Prima');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await save(page, 3, '', ['Section «Prima», optional']);

  await other.getByLabel('New section').fill('Seconda');
  await other.getByRole('button', { name: 'Add', exact: true }).click();
  await other.getByRole('button', { name: 'Save as v3' }).click();
  await other.getByRole('dialog').getByRole('button', { name: 'Save v3' }).click();
  const conflict = other.getByRole('dialog', { name: /changed$/ });
  await expect(conflict).toContainText('A newer version was saved in another tab or on another device');
  await conflict.getByRole('button', { name: 'Reload' }).click();
  await expect(conflict).toHaveCount(0);
  await expect(other.getByRole('button', { name: 'Save as v4' })).toHaveCount(0);
  await expect(sectionRow(other, 'Prima')).toBeVisible();
  await expect(sectionRow(other, 'Seconda')).toHaveCount(0);
  await other.close();
});

test('delete an unused template; leaving with unsaved changes asks first', async ({ page }) => {
  const name = `Da buttare ${Date.now().toString(36)}`;
  await duplicate(page);
  // As the list shows a fresh copy.
  await page.getByRole('button', { name: '← Document templates' }).click();
  const copy = page.locator('.trow', { hasText: /Copia di Avventura/ }).last();
  await expect(copy).toContainText('v1');
  await expect(copy).toContainText('Copied from Avventura · no projects');
  await expect(copy.getByRole('button', { name: 'Edit' })).toBeVisible();
  await expect(copy.getByRole('button', { name: 'Delete' })).toBeVisible();
  await copy.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await save(page, 2, '', []);
  await page.getByLabel('New section').fill('Bozza');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: '← Document templates' }).click();
  const leave = page.getByRole('dialog', { name: 'Discard unsaved changes?' });
  await expect(leave.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await leave.getByRole('button', { name: 'Cancel' }).click();
  await expect(sectionRow(page, 'Bozza')).toBeVisible();
  // The browser's Back too.
  await page.goBack();
  await leave.getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(/\/settings\/documents\/t-/);
  await expect(sectionRow(page, 'Bozza')).toBeVisible();
  // The Settings menu is caught too.
  await page.getByRole('navigation', { name: 'Settings' }).getByRole('button', { name: 'Document templates' }).click();
  await leave.getByRole('button', { name: 'Discard' }).click();
  await expect(page).toHaveURL(/\/settings\/documents$/);

  await row(page, name).getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog', { name: `Delete ${name}?` }).getByRole('button', { name: 'Delete' }).click();
  await expect(row(page, name)).toHaveCount(0);
});
