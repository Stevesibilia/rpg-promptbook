import { expect, test, type Page } from '@playwright/test';
import { baseURL } from './stack.js';
import { connectClaude } from './claude.js';
import { signIn, syncPill } from './helpers.js';
import { pdfTexts } from './pdf-text.js';

// Document templates (template-editor, mockup states 1 to 9): duplicate a
// built-in, edit and save versions, start a project from one, update the
// project to the next version and undo it; two tabs saving the same version;
// Claude changing a template and updating a project through the connector.
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

// PDF options (template-pdf-layout): an own section prints, a role section
// left out does not.
test('an own section prints in the PDF and a section left out does not', async ({ page }) => {
  const name = `Avventura PDF ${Date.now().toString(36)}`;
  await duplicate(page);
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('New section').fill('Atmosfera');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const atmosfera = sectionRow(page, 'Atmosfera');
  await expect(atmosfera.getByRole('button', { name: 'In the PDF, Atmosfera' })).toHaveText('Printed');
  await expect(atmosfera.getByRole('button', { name: 'New page, Atmosfera' })).toHaveAttribute('aria-pressed', 'true');
  await expect(atmosfera.getByRole('button', { name: 'Side column, Atmosfera' })).toHaveAttribute('aria-pressed', 'false');
  // Turned off and on again, «New page» counts no change.
  await atmosfera.getByRole('button', { name: 'New page, Atmosfera' }).click();
  await atmosfera.getByRole('button', { name: 'New page, Atmosfera' }).click();
  await expect(saveBar(page)).toContainText('2 unsaved changes');
  const before = sectionRow(page, 'Prima della sessione');
  await expect(before.locator('.tg.fixed')).toHaveText('References');
  await before.getByRole('button', { name: 'In the PDF, Prima della sessione' }).click();
  await expect(before.getByRole('button', { name: 'In the PDF, Prima della sessione' })).toHaveText('Left out');
  await expect(saveBar(page)).toContainText('3 unsaved changes');
  await expect(page.getByTestId('starting-document').locator('.cm-line', { hasText: 'Prima della sessione' })).toContainText(
    'not in the PDF',
  );
  await save(page, 2, 'Atmosfera', ['Section «Atmosfera», optional', 'PDF options of «Prima della sessione»']);

  await page.getByRole('button', { name: '← Document templates' }).click();
  await row(page, name).getByRole('button', { name: 'Make default' }).click();
  await expect(row(page, name).locator('.chip.def')).toHaveText('Default');

  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('radio', { name: /One-shot/ }).click();
  await expect(dialog.getByLabel('Template').locator('option:checked')).toHaveText(`${name} · v2 (default)`);
  await dialog.getByLabel('Title').fill(`Nella nebbia ${Date.now().toString(36)}`);
  await dialog.getByRole('button', { name: 'Create and open' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);

  // Text under «Atmosfera», then the PDF.
  await outline(page).getByText('Atmosfera', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('La nebbia sale dal porto e copre le lanterne.');
  await expect(page.locator('.cm-content')).toContainText('copre le lanterne');
  await page.keyboard.press('ControlOrMeta+Shift+P');
  const review = page.getByRole('region', { name: 'PDF review' });
  await expect(review.locator('.thumbs-col .th', { hasText: /· Atmosfera$/ })).toBeVisible(ENGINE);
  const download = page.waitForEvent('download');
  await review.getByRole('button', { name: 'Save PDF' }).click();
  const chunks: Buffer[] = [];
  for await (const chunk of await (await download).createReadStream()) chunks.push(chunk as Buffer);
  const pages = pdfTexts(Buffer.concat(chunks));
  const own = pages.find((text) => text.includes('copre le lanterne'));
  expect(own).toContain('Atmosfera');
  expect(pages.some((text) => text.includes('Prima della sessione'))).toBe(false);
});

// Campaign templates' PDF options (campaign-pdf design decision 12): the
// built-in «Campagna» v2 read only, then a copy with «Aggiornamenti» left out
// and «Fazioni» on a new page, saved.
test('a copy of Campagna v2 with a section left out and one on a new page', async ({ page }) => {
  const name = `Campagna PDF ${Date.now().toString(36)}`;
  await expect(row(page, 'Campagna')).toHaveCount(1);
  await row(page, 'Campagna').getByRole('button', { name: 'View' }).click();
  await expect(
    page.getByText(
      "Built-in template. It can't be changed; duplicate it to make your own. v1 stays available for the projects that use it.",
    ),
  ).toBeVisible();
  const fronti = sectionRow(page, 'Fronti');
  await expect(fronti.getByRole('button', { name: 'In the PDF, Fronti' })).toHaveText('Printed');
  await expect(fronti.getByRole('button', { name: 'In the PDF, Fronti' })).toBeDisabled();
  await expect(fronti.getByRole('button', { name: 'New page, Fronti' })).toHaveAttribute('aria-pressed', 'true');
  await expect(sectionRow(page, 'Fazioni').getByRole('button', { name: 'New page, Fazioni' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(sectionRow(page, 'Appendice: stile visivo e sonoro').locator('.tg.fixed')).toHaveText('Never in the PDF');
  await expect(page.getByRole('button', { name: /^Side column/ })).toHaveCount(0);
  await expect(page.getByText('Sections the template does not list still print, flowing after the section before them.')).toBeVisible();
  await page.getByRole('tab', { name: /Front matter/ }).click();
  await expect(page.getByText(/print on the line above the title/)).toBeVisible();
  await page.getByRole('tab', { name: /Sections/ }).click();

  await page.getByRole('button', { name: 'Duplicate' }).click();
  await expect(page).toHaveURL(/\/settings\/documents\/t-[0-9a-z]{10}$/);
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(/^Copia di Campagna/);
  await page.getByLabel('Name', { exact: true }).fill(name);
  const aggiornamenti = sectionRow(page, 'Aggiornamenti');
  await aggiornamenti.getByRole('button', { name: 'In the PDF, Aggiornamenti' }).click();
  await expect(aggiornamenti.getByRole('button', { name: 'In the PDF, Aggiornamenti' })).toHaveText('Left out');
  await expect(aggiornamenti.getByRole('button', { name: 'New page, Aggiornamenti' })).toHaveCount(0);
  const fazioni = sectionRow(page, 'Fazioni');
  await fazioni.getByRole('button', { name: 'New page, Fazioni' }).click();
  await expect(fazioni.getByRole('button', { name: 'New page, Fazioni' })).toHaveAttribute('aria-pressed', 'true');
  await expect(saveBar(page)).toContainText('3 unsaved changes');
  const preview = page.getByTestId('starting-document');
  await expect(preview.locator('.cm-line', { hasText: 'Aggiornamenti' })).toContainText('not in the PDF');
  await expect(preview.locator('.cm-line', { hasText: 'Fazioni' })).toContainText('new page');
  await save(page, 2, 'PDF', ['PDF options of «Aggiornamenti»', 'PDF options of «Fazioni»']);
  await expect(page.getByRole('button', { name: 'In the PDF, Aggiornamenti' })).toHaveText('Left out');
});

// Claude through the connector (template-connector): a copy of Avventura, a
// project on its v1 open in the editor, v2 saved by Claude, the «v2
// available» chip once the window gets the focus back, and the project
// updated by Claude with a snapshot in History.
test('Claude saves a version of a template and updates an open project to it', async ({ page }) => {
  const claude = await connectClaude(page);
  const name = `Avventura Claude ${Date.now().toString(36)}`;
  const copy = await claude.tool('duplicate_template', { from: { id: 'avventura' }, name });
  expect(copy).toMatchObject({ version: 1, name, copiedFrom: 'Avventura' });
  const created = await claude.tool('create_project', {
    title: `Il faro spento ${Date.now().toString(36)}`,
    category: 'one-shot',
    template: { id: copy.id },
  });
  const project = await claude.tool('get_project', { projectId: created.id });
  expect(project.template).toEqual({ id: copy.id, version: 1, name, builtin: false, latestVersion: 1 });

  await page.goto(`/projects/${created.id}`);
  await expect(outline(page)).toContainText('Inizio forte');
  await expect(page.locator('.status')).toContainText(`Template: ${name} v1`);
  await expect(chip(page)).toHaveCount(0);

  // v2: «Atmosfera» added, «Inizio forte» renamed «Apertura».
  const read = await claude.tool('get_template', { templateId: copy.id });
  const body = read.template;
  body.sections.find((s: { role?: string }) => s.role === 'strongStart').name = 'Apertura';
  const truths = body.sections.findIndex((s: { role?: string }) => s.role === 'truths');
  body.sections.splice(truths + 1, 0, { name: 'Atmosfera', requirement: 'optional' });
  const saved = await claude.tool('save_template_version', { templateId: copy.id, baseVersion: 1, body, note: 'mood section' });
  expect(saved.version).toBe(2);
  expect(saved.note).toMatch(/^via Claude .+: mood section$/);

  // Back at the window: the list is read again and the chip offers v2.
  await expect(async () => {
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(chip(page)).toHaveText(`${name} v1 · v2 available`, { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });

  // Claude updates the project; the open editor follows without a reload.
  const updated = await claude.tool('update_project_template', { projectId: created.id });
  expect(updated).toMatchObject({ template: { id: copy.id, from: 1, to: 2 }, edits: 2 });
  // The editor hides the heading marks; the outline lists the headings.
  await expect(outline(page)).toContainText('Apertura');
  await expect(outline(page)).toContainText('Atmosfera');
  await expect(outline(page)).not.toContainText('Inizio forte');
  await expect(page.locator('.cm-content')).toContainText('Atmosfera');
  await expect(page.locator('.status')).toContainText(`Template: ${name} v2`);
  await expect(chip(page)).toHaveCount(0);

  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'History' }).click();
  await expect(page.getByRole('row').filter({ hasText: `Template «${name}» v1 → v2` })).toBeVisible();
});

// Where the night parts and the scene fields print (template-placement,
// mockup states 3, 4, 8 and 10): the template editor's switches and
// sketches, a project whose document carries the marks, the palette's move,
// an unknown word in Checks, and the saved PDF.

const column = (page: Page, name: string) => page.getByRole('group', { name: `Column: ${name}` });
const fieldRow = (page: Page, label: string) =>
  page.getByTestId('field-row').filter({ has: page.locator(`input[value="${label}"]`) });
const markOn = (page: Page, text: string) => page.locator('.cm-line', { hasText: text }).locator('.cm-pm');

// The PDF the review saves, as the text of its pages.
async function savedPdf(page: Page): Promise<string[]> {
  await page.keyboard.press('ControlOrMeta+Shift+P');
  const review = page.getByRole('region', { name: 'PDF review' });
  await expect(review.locator('.thumbs-col .th').first()).toBeVisible(ENGINE);
  const download = page.waitForEvent('download');
  await review.getByRole('button', { name: 'Save PDF' }).click();
  const chunks: Buffer[] = [];
  for await (const chunk of await (await download).createReadStream()) chunks.push(chunk as Buffer);
  await page.keyboard.press('Escape');
  await expect(review).toHaveCount(0);
  return pdfTexts(Buffer.concat(chunks));
}

test('columns: the switches, a project with marks, the palette and the PDF', async ({ page }) => {
  const name = `Colonne e2e ${Date.now().toString(36)}`;

  // The built-in shows today's places, every switch disabled.
  await row(page, 'Avventura').getByRole('button', { name: 'View' }).click();
  await expect(column(page, 'Da non perdere stasera').getByRole('button', { name: 'Side' })).toHaveAttribute('aria-pressed', 'true');
  await expect(column(page, 'Orologio').getByRole('button', { name: 'Main' })).toHaveAttribute('aria-pressed', 'true');
  for (const button of await page.locator('.col button').all()) await expect(button).toBeDisabled();
  await expect(page.getByTestId('night-sketch')).toBeVisible();

  // A copy: «Orologio» to the side, «Rivelazioni» to the main column.
  await duplicate(page);
  await page.getByLabel('Name', { exact: true }).fill(name);
  await column(page, 'Orologio').getByRole('button', { name: 'Side' }).click();
  await expect(column(page, 'Orologio').getByRole('button', { name: 'Side' })).toHaveAttribute('aria-pressed', 'true');
  await expect(sectionRow(page, 'Orologio')).toHaveClass(/changed/);
  const night = page.getByTestId('night-sketch');
  await expect(night.getByTestId('sketch-side')).toContainText('Orologio');
  await expect(night.getByTestId('sketch-main')).not.toContainText('Orologio');
  const preview = page.getByTestId('starting-document');
  await expect(markOn(page, 'Orologio')).toHaveText('{laterale}');
  await expect(preview).toContainText('Orologio {laterale}');
  await expect(saveBar(page)).toContainText('2 unsaved changes');

  const revelations = page.getByTestId('revelations-row');
  await expect(revelations.getByLabel('Revelations label')).toHaveValue('↳ Rivelazioni');
  await expect(revelations.getByLabel('Revelations label')).toBeDisabled();
  await column(page, 'Rivelazioni').getByRole('button', { name: 'Main' }).click();
  await expect(night.getByTestId('sketch-main')).toContainText('Rivelazioni');
  await expect(markOn(page, 'Rivelazioni')).toHaveText('{principale}');
  await expect(saveBar(page)).toContainText('3 unsaved changes');

  // Scene fields: the four switches and the fixed places.
  await page.getByRole('tab', { name: /Scene fields/ }).click();
  for (const label of ['Da non perdere qui', 'Cosa succede da sé', "Chi c'è", 'Indizi qui']) {
    await expect(column(page, label)).toBeVisible();
  }
  await expect(fieldRow(page, 'Prove e regole').locator('.tg.fixed')).toHaveText('Framed, main column');
  await expect(fieldRow(page, 'Se deragliano').locator('.tg.fixed')).toHaveText('End of main column');
  await expect(fieldRow(page, 'In gioco').locator('.tg.fixed')).toHaveText('Scene header');
  await expect(page.getByTestId('scene-sketch').getByTestId('sketch-side')).toContainText("Chi c'è");
  await column(page, "Chi c'è").getByRole('button', { name: 'Main' }).click();
  await expect(page.getByTestId('scene-sketch').getByTestId('sketch-main')).toContainText("Chi c'è");
  await expect(saveBar(page)).toContainText('4 unsaved changes');
  await column(page, "Chi c'è").getByRole('button', { name: 'Side' }).click();
  await expect(saveBar(page)).toContainText('3 unsaved changes');
  await expect(fieldRow(page, "Chi c'è")).not.toHaveClass(/changed/);
  await page.getByRole('tab', { name: /Sections/ }).click();
  await save(page, 2, 'Orologio a lato', [
    'Section «Orologio» prints in the side column',
    'Revelations list «Rivelazioni» prints in the main column',
  ]);
  const editor = new URL(page.url()).pathname;
  const templateId = editor.split('/').at(-1)!;

  // A project from v2: its document carries the marks.
  const response = await page.request.post('/api/projects', {
    headers: { origin: baseURL },
    data: { category: 'one-shot', title: `Le colonne ${Date.now().toString(36)}`, template: { id: templateId, version: 2 } },
  });
  expect(response.status()).toBe(201);
  const { project } = (await response.json()) as { project: { id: string } };
  await page.goto(`/projects/${project.id}`);
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(outline(page)).toContainText('Orologio');
  // The mark shows with the cursor elsewhere.
  await page.locator('.cm-line', { hasText: 'titolo:' }).click();
  await expect(markOn(page, 'Orologio')).toHaveText('{laterale}');
  await expect(markOn(page, 'Orologio')).toBeVisible();
  await expect(markOn(page, 'Da non perdere stasera')).toHaveText('{laterale}');
  await expect(markOn(page, 'Rivelazioni')).toHaveText('{principale}');
  // The scene is further down: the outline brings it into view.
  await outline(page).getByText('Prima scena').click();
  await expect(markOn(page, 'Da non perdere qui')).toHaveText('{laterale}');
  await page.keyboard.press('ControlOrMeta+Home');

  // The palette moves «Orologio» back to the main column.
  await page.locator('.cm-line', { hasText: 'Orologio' }).click();
  await page.keyboard.press('ControlOrMeta+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await page.keyboard.type('column');
  await expect(palette.getByRole('option')).toHaveText(['Move to main column']);
  await page.keyboard.press('Enter');
  await expect(palette).toHaveCount(0);
  await page.locator('.cm-line', { hasText: 'titolo:' }).click();
  await expect(markOn(page, 'Orologio')).toHaveText('{principale}');
  // On a part without a column, neither command.
  await page.locator('.cm-line', { hasText: 'Mappa delle scene' }).click();
  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.type('column');
  await expect(palette.getByRole('option')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // An unknown word: a warning, in its own style.
  await page.locator('.cm-line', { hasText: 'Verità del mondo' }).click();
  await page.keyboard.press('End');
  for (let i = 0; i < '{principale}'.length; i++) await page.keyboard.press('Backspace');
  await page.keyboard.type('{latterale}');
  await page.locator('.cm-line', { hasText: 'titolo:' }).click();
  await expect(page.locator('.cm-line', { hasText: 'Verità del mondo' }).locator('.cm-pm-bad')).toHaveText('{latterale}');
  await expect(page.locator('.inspector .plist .prow', { hasText: 'Unknown column «latterale»' })).toBeVisible();

  // A revelation under the label, then the PDF: no mark printed, and the
  // revelations, set to the main column, head it before «Orologio».
  await page.locator('.cm-line', { hasText: 'Rivelazioni' }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- **R1.** La lanterna è spenta da anni. (I1)');
  await expect(syncPill(page)).toHaveAttribute('data-state', 'synced');
  const pages = await savedPdf(page);
  expect(pages.join('\n')).not.toContain('{');
  const nightPage = pages.find((text) => text.includes('La lanterna è spenta da anni'));
  expect(nightPage).toBeDefined();
  expect(nightPage!.indexOf('Rivelazioni')).toBeGreaterThanOrEqual(0);
  expect(nightPage!.indexOf('Rivelazioni')).toBeLessThan(nightPage!.indexOf('Orologio'));
});

// A project on v2 of a copy of Avventura whose text has no mark on
// «Orologio», and v3 of the copy, which moves «Orologio» to the side.
async function withoutMarks(page: Page): Promise<{ name: string; projectId: string }> {
  const name = `Colonne update ${Date.now().toString(36)}`;
  await duplicate(page);
  await page.getByLabel('Name', { exact: true }).fill(name);
  await save(page, 2, '', []);
  const templateId = new URL(page.url()).pathname.split('/').at(-1)!;

  // A project on v2 whose text has no mark on «Orologio».
  const response = await page.request.post('/api/projects', {
    headers: { origin: baseURL },
    data: { category: 'one-shot', title: `Senza segni ${Date.now().toString(36)}`, template: { id: templateId, version: 2 } },
  });
  const { project } = (await response.json()) as { project: { id: string } };
  await page.goto(`/projects/${project.id}`);
  await expect(page.locator('.cm-content')).toBeVisible();
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  const text = '---\ntitolo: Senza segni\n---\n\n## Orologio\n\n- La marea sale.\n\n## Verità del mondo {laterale}\n\n- Il faro è chiuso.\n';
  await page.keyboard.insertText(text);
  await expect(outline(page)).toContainText('Verità del mondo');
  await expect(syncPill(page)).toHaveAttribute('data-state', 'synced');

  // v3 moves «Orologio» to the side.
  await page.goto(`/settings/documents/${templateId}`);
  await column(page, 'Orologio').getByRole('button', { name: 'Side' }).click();
  await save(page, 3, '', ['Section «Orologio» prints in the side column']);

  return { name, projectId: project.id };
}

test('columns: the update writes the marks by default, in one undo step', async ({ page }) => {
  const { name, projectId } = await withoutMarks(page);
  await page.goto(`/projects/${projectId}`);
  await expect(page.locator('.cm-content')).toBeVisible();
  await chip(page).click();
  const update = page.getByRole('dialog', { name: `Update to ${name} v3` });
  await expect(update).toContainText('Section «Orologio» prints in the side column');
  const option = update.getByLabel('Write the column marks where the text has none');
  await expect(option).toBeChecked();
  await expect(update).toContainText('e.g. «## Orologio {principale}»; marks you wrote stay as they are');
  await update.getByRole('button', { name: 'Update to v3' }).click();
  await expect(update).toHaveCount(0);
  await expect(page.locator('.status')).toContainText(`Template: ${name} v3`);
  await page.locator('.cm-line', { hasText: 'titolo:' }).click();
  await expect(markOn(page, 'Orologio')).toHaveText('{laterale}');
  await expect(markOn(page, 'Verità del mondo')).toHaveText('{laterale}');

  // One undo puts back the text and v2.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.status')).toContainText(`Template: ${name} v2`);
  await expect(markOn(page, 'Orologio')).toHaveCount(0);
  await expect(markOn(page, 'Verità del mondo')).toHaveText('{laterale}');
});

test('columns: the update with the option unticked leaves the text, and the palette writes the marks in one undo step', async ({ page }) => {
  const { name, projectId } = await withoutMarks(page);
  await page.goto(`/projects/${projectId}`);
  await expect(page.locator('.cm-content')).toBeVisible();
  await chip(page).click();
  const update = page.getByRole('dialog', { name: `Update to ${name} v3` });
  const option = update.getByLabel('Write the column marks where the text has none');
  await expect(option).toBeChecked();
  await option.uncheck();
  await update.getByRole('button', { name: 'Update to v3' }).click();
  await expect(update).toHaveCount(0);
  await expect(page.locator('.status')).toContainText(`Template: ${name} v3`);
  await page.locator('.cm-line', { hasText: 'titolo:' }).click();
  await expect(markOn(page, 'Orologio')).toHaveCount(0);

  // The palette lists the command while a mark is missing; one run writes the
  // template's column, and one undo takes every mark away.
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.type('write column');
  await expect(palette.getByRole('option')).toHaveText(['Write column marks']);
  await page.keyboard.press('Enter');
  await expect(palette).toHaveCount(0);
  await expect(markOn(page, 'Orologio')).toHaveText('{laterale}');
  await expect(markOn(page, 'Verità del mondo')).toHaveText('{laterale}');
  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.type('write column');
  await expect(palette.getByRole('option')).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.keyboard.press('ControlOrMeta+z');
  await expect(markOn(page, 'Orologio')).toHaveCount(0);
  await expect(markOn(page, 'Verità del mondo')).toHaveText('{laterale}');
  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.type('write column');
  await expect(palette.getByRole('option')).toHaveText(['Write column marks']);
  await page.keyboard.press('Escape');
});
