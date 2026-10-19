import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createProject, row, signIn, syncPill } from './helpers.js';
import { baseURL, password, username } from './stack.js';

// The scenarios of design decision 11, against the compose stack.

test('sign in, with a wrong password first, lands on the page asked for', async ({ page, request }) => {
  await page.goto('/');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Wrong username or password.');
  await expect(page.getByLabel('Username')).toHaveValue(username);

  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  await expect(row(page, 'Blacksad - Il Continentale')).toBeVisible();

  // A deep link opens its project once signed in.
  const login = await request.post('/api/auth/login', { headers: { origin: baseURL }, data: { username, password } });
  expect(login.ok()).toBe(true);
  const project = await createProject(request, 'Deep link');
  const other = await page.context().browser()!.newContext();
  const fresh = await other.newPage();
  await signIn(fresh, `${baseURL}/projects/${project.id}`);
  await expect(fresh.locator('.crumbs')).toContainText(project.title);
  await expect(fresh.locator('.cm-content')).toContainText(`titolo: ${project.title}`);
  await other.close();
});

test('create an adventure in a campaign and open it', async ({ page }) => {
  await signIn(page);
  const title = `Il ballo dei Lorenzetti ${Date.now().toString(36)}`;
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByRole('radio', { name: /Adventure/ }).click();
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByLabel('Campaign').selectOption({ label: 'Blacksad - Il Continentale' });
  await dialog.getByLabel('System').fill('Not The End');
  await expect(dialog.getByTestId('preview')).toContainText('campagna: Blacksad - Il Continentale');
  await expect(dialog.getByTestId('preview')).toContainText('Scrivere le scene');

  // Switching to Campaign hides the campaign field and changes the preview.
  await dialog.getByRole('radio', { name: /Campaign/ }).click();
  await expect(dialog.getByLabel('Campaign')).toHaveCount(0);
  await expect(dialog.getByTestId('preview')).toContainText('## Premessa');
  await expect(dialog.getByTestId('preview')).toContainText('Fronti e minacce');
  await dialog.getByRole('radio', { name: /Adventure/ }).click();
  await dialog.getByLabel('Campaign').selectOption({ label: 'Blacksad - Il Continentale' });

  await dialog.getByRole('button', { name: 'Create and open' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(page.locator('.crumbs')).toContainText(`Blacksad - Il Continentale › ${title}`);
  await expect(page.locator('.cm-content')).toContainText('formato: avventura');

  await page.getByRole('button', { name: 'Projects' }).click();
  await page.getByLabel('Search titles and seeds').fill(title);
  await expect(page.locator('.tr.child', { hasText: title })).toBeVisible();
  await page.getByLabel('Search titles and seeds').fill('');
});

test('a tick and a sentence reach another browser', async ({ browser }) => {
  const one = await browser.newContext();
  const two = await browser.newContext();
  const a = await one.newPage();
  const b = await two.newPage();
  await signIn(a);
  await signIn(b);
  const project = await createProject(a.request, 'Due schede');

  for (const page of [a, b]) {
    await page.reload();
    await page.getByLabel('Search titles and seeds').fill(project.title);
    await row(page, project.title).click();
    await expect(page.getByTestId('todo-count')).toHaveText('0/9');
  }

  await a.getByRole('checkbox', { name: 'Brani scelti' }).check();
  await expect(a.getByTestId('todo-count')).toHaveText('1/9');
  await expect(b.getByRole('checkbox', { name: 'Brani scelti' })).toBeChecked({ timeout: 2_000 });
  await expect(b.getByTestId('todo-count')).toHaveText('1/9');
  // The row follows once the server has stored the change.
  await expect(row(a, project.title).locator('.todo-count')).toHaveText('1/9', { timeout: 15_000 });

  await a.goto(`/projects/${project.id}`);
  await b.goto(`/projects/${project.id}`);
  await b.locator('.cm-content').click();
  // At the top: CodeMirror draws only the lines near the viewport.
  await b.keyboard.press('ControlOrMeta+Home');
  await b.keyboard.type('Una frase scritta nella seconda scheda.\n');
  await expect(a.locator('.cm-content')).toContainText('Una frase scritta nella seconda scheda.', { timeout: 2_000 });
  await expect(syncPill(a)).toHaveAttribute('data-state', 'synced');
  await one.close();
  await two.close();
});

test('import a folder of notes and a pasted note', async ({ page }) => {
  await signIn(page);
  const stamp = Date.now().toString(36);
  await page.getByRole('button', { name: 'Import Markdown' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import Markdown' });
  const esempio = await readFile(new URL('../packages/format/fixtures/esempio.md', import.meta.url), 'utf8');
  await dialog.getByTestId('import-files').setInputFiles([
    { name: `esempio-${stamp}.md`, mimeType: 'text/markdown', buffer: Buffer.from(esempio) },
    { name: 'lista spesa.md', mimeType: 'text/markdown', buffer: Buffer.from('- pane\n- latte\n- caffè\n') },
  ]);
  await expect(dialog.getByTestId('import-row')).toHaveCount(2);
  const shopping = dialog.getByTestId('import-row').filter({ hasText: 'lista spesa' });
  await expect(shopping).toContainText('not an adventure note');
  await expect(shopping.getByRole('checkbox')).not.toBeChecked();
  const note = dialog.getByTestId('import-row').filter({ hasText: `esempio-${stamp}.md` });
  await expect(note.getByLabel('Category')).toHaveValue('one-shot');
  await expect(note).toContainText('A project with this title exists');
  await note.locator('.rep').click();
  await expect(note).toContainText('Needs you');
  await expect(dialog.getByRole('button', { name: 'Import 1 project' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Import 1 project' }).click();
  await expect(dialog).toHaveCount(0);

  // Paste: the category is required unless the note names one.
  const pastedTitle = `Il pozzo di Ganzirri ${stamp}`;
  await page.getByRole('button', { name: 'Import Markdown' }).click();
  await dialog.getByRole('tab', { name: 'Paste' }).click();
  await dialog
    .getByLabel('Markdown')
    .fill(`# ${pastedTitle}\n\nUn pozzo che restituisce gli annegati, ma sempre un giorno troppo presto.\n`);
  await expect(dialog.getByRole('button', { name: 'Import as a project' })).toBeDisabled();
  await dialog.getByLabel('Category').selectOption('one-shot');
  await dialog.getByRole('button', { name: 'Import as a project' }).click();
  await expect(dialog).toHaveCount(0);

  await page.getByLabel('Search titles and seeds').fill(pastedTitle);
  const pasted = row(page, pastedTitle);
  await expect(pasted).toContainText('One-shot');
  await expect(pasted).toContainText('Draft');
  await pasted.dblclick();
  await expect(page.locator('.cm-content')).toContainText('Un pozzo che restituisce gli annegati');
});

test('export a project as a Markdown folder', async ({ page }) => {
  await signIn(page);
  await page.getByLabel('Search titles and seeds').fill('Cronaca del Gabbiano');
  await row(page, 'Cronaca del Gabbiano').first().click();
  await page.getByText('Actions').click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Export as a Markdown folder…' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  const zip = await readFile((await download.path())!);
  expect(zip.subarray(0, 2).toString()).toBe('PK');
  for (const name of ['document.md', 'todo.md', 'seed.md', 'project.json']) expect(zip.includes(name)).toBe(true);
});

test('delete to the bin and restore', async ({ page }) => {
  await signIn(page);
  const project = await createProject(page.request, 'Da cestinare');
  await page.reload();
  await page.getByLabel('Search titles and seeds').fill(project.title);
  await row(page, project.title).click();
  await page.getByText('Actions').click();
  await page.getByRole('button', { name: 'Delete…' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete project?' });
  await expect(confirm).toContainText(`${project.title} goes to the bin. It can be restored for 30 days.`);
  await confirm.getByRole('button', { name: 'Move to bin' }).click();
  await expect(row(page, project.title)).toHaveCount(0);
  await expect(page.getByText('No project matches these filters.')).toBeVisible();

  await page.getByRole('link', { name: /^Bin · / }).click();
  const binned = row(page, project.title);
  await expect(binned).toBeVisible();
  await binned.getByRole('button', { name: 'Restore' }).click();
  await expect(binned).toHaveCount(0);
  await page.getByRole('button', { name: 'Projects' }).click();
  await expect(row(page, project.title)).toBeVisible();
});

test('signing out in another tab asks to sign in, and typed text still arrives', async ({ browser }) => {
  const context = await browser.newContext();
  const editing = await context.newPage();
  await signIn(editing);
  const project = await createProject(editing.request, 'Sessione finita');
  await editing.goto(`/projects/${project.id}`);
  await expect(editing.locator('.cm-content')).toContainText(project.title);

  const other = await context.newPage();
  await other.goto('/');
  await syncPill(other).click();
  await other.getByRole('button', { name: 'Sign out' }).click();
  await expect(other.getByRole('button', { name: 'Sign in' })).toBeVisible();

  await expect(syncPill(editing)).toHaveText(/Sign in to sync/);
  await expect(editing.getByRole('alert')).toContainText('Signed out.');
  await editing.locator('.cm-content').click();
  await editing.keyboard.press('ControlOrMeta+Home');
  await editing.keyboard.type('Scritto dopo la fine della sessione.\n');

  await editing.getByRole('alert').getByRole('button', { name: 'Sign in…' }).click();
  const dialog = editing.getByRole('dialog', { name: 'Sign in to sync' });
  await dialog.getByLabel('Password').fill(password);
  await dialog.getByRole('button', { name: 'Sign in' }).click();
  await expect(syncPill(editing)).toHaveAttribute('data-state', 'synced', { timeout: 15_000 });
  await expect(editing.getByRole('alert')).toHaveCount(0);

  // A fresh browser sees the text, so it reached the server.
  const check = await browser.newContext();
  const reader = await check.newPage();
  await signIn(reader, `/projects/${project.id}`);
  await expect(reader.locator('.cm-content')).toContainText('Scritto dopo la fine della sessione.');
  await context.close();
  await check.close();
});
