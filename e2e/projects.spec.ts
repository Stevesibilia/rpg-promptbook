import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createProject, row, signIn, syncPill } from './helpers.js';
import { baseURL, password, releaseVersion, username } from './stack.js';

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

test("the rail shows the server's release under Settings", async ({ page }) => {
  await signIn(page);
  const note = page.getByRole('note', { name: `Release ${releaseVersion}` });
  await expect(note).toHaveText(releaseVersion);
  const settings = await page.getByRole('button', { name: 'Settings' }).boundingBox();
  const release = await note.boundingBox();
  expect(release!.y).toBeGreaterThan(settings!.y + settings!.height - 1);
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

  // Enter held down repeats; the project is still created once.
  await dialog.getByLabel('Title').focus();
  for (let i = 0; i < 4; i++) await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  const { projects } = (await (await page.request.get('/api/projects')).json()) as { projects: { title: string }[] };
  expect(projects.filter((p) => p.title === title)).toHaveLength(1);
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

test('link a campaign to gdrarchive, inherit it in an adventure, override and remove', async ({ page }) => {
  await signIn(page);
  const campaign = await createProject(page.request, 'Kulthos', { category: 'campaign' });
  const adventure = await createProject(page.request, "L'Ancora di Sabaoth", {
    category: 'adventure',
    campaignId: campaign.id,
  });
  const kulthos = 'https://gdrarchive.siberio.eu/campaigns/6f1c2a9e-3b4d-4e5f-8a7b-9c0d1e2f3a4b';
  const own = 'https://gdrarchive.siberio.eu/campaigns/31';
  const panel = page.getByTestId('panel');
  const link = panel.locator('a.gdr-link');

  // The campaign: a labelled link, pasted with a trailing slash.
  await page.reload();
  await page.getByLabel('Search titles and seeds').fill(campaign.title);
  await row(page, campaign.title).click();
  await panel.getByRole('button', { name: 'Link to gdrarchive…' }).click();
  await expect(panel.getByLabel('Address')).toBeFocused();
  await panel.getByLabel('Address').fill(`${kulthos}/`);
  await panel.getByLabel(/^Label/).fill('Kulthos');
  await expect(panel.locator('.gdr-form .fh')).toHaveText('Shows as gdrarchive · Kulthos, opening in a new tab.');
  await panel.getByLabel(/^Label/).press('Enter');
  await expect(link).toHaveText('gdrarchive · Kulthos');
  await expect(link).toHaveAttribute('href', kulthos);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('title', `Opens ${kulthos} in a new tab`);
  await expect(panel.getByRole('button', { name: 'Change…' })).toBeFocused();

  // The adventure inherits it once the list carries the campaign's link.
  await page.getByLabel('Search titles and seeds').fill(adventure.title);
  await row(page, adventure.title).click();
  await expect(panel.getByText(`from campaign ${campaign.title}`)).toBeVisible({ timeout: 20_000 });
  await expect(link).toHaveText('gdrarchive · Kulthos');
  await expect(link).toHaveAttribute('href', kulthos);

  // Empty on Save keeps the campaign's link.
  await panel.getByRole('button', { name: 'Set its own…' }).click();
  await expect(panel.getByLabel('Address')).toHaveAttribute('placeholder', kulthos);
  await expect(panel.locator('.gdr-form .fh')).toHaveText(
    `Left empty, it keeps the link of campaign ${campaign.title}.`,
  );
  await expect(panel.getByRole('button', { name: 'Remove link' })).toHaveCount(0);
  await panel.getByLabel('Address').press('Enter');
  await expect(panel.getByText(`from campaign ${campaign.title}`)).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Set its own…' })).toBeFocused();

  // Escape cancels from the buttons too.
  await panel.getByRole('button', { name: 'Set its own…' }).click();
  await panel.getByRole('button', { name: 'Save' }).focus();
  await page.keyboard.press('Escape');
  await expect(panel.locator('.gdr-form')).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Set its own…' })).toBeFocused();

  // A wrong address is refused with the message, and stores nothing.
  await panel.getByRole('button', { name: 'Set its own…' }).click();
  const address = panel.getByLabel('Address');
  await address.fill('https://gdrarchive.siberio.eu/sessions/48');
  await address.press('Enter');
  await expect(panel.getByRole('alert')).toHaveText(
    'Paste a gdrarchive campaign address, like https://gdrarchive.siberio.eu/campaigns/12',
  );
  await expect(address).toHaveAttribute('aria-invalid', 'true');
  await expect(address).toHaveAccessibleDescription(/Paste a gdrarchive campaign address/);
  await address.fill(own);
  await expect(address).toHaveAttribute('aria-invalid', 'false');
  await expect(panel.getByRole('alert')).toHaveCount(0);

  // Its own link wins over the campaign's.
  await address.press('Enter');
  await expect(link).toHaveText('gdrarchive campaign');
  await expect(link).toHaveAttribute('href', own);
  await expect(panel.getByText(/from campaign/)).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Change…' })).toBeVisible();

  // Remove link brings back the campaign's.
  await panel.getByRole('button', { name: 'Change…' }).click();
  const remove = panel.getByRole('button', { name: 'Remove link' });
  await expect(remove).toHaveAttribute('title', "Back to the campaign's link");
  await remove.click();
  await expect(panel.getByText(`from campaign ${campaign.title}`)).toBeVisible();
  await expect(link).toHaveAttribute('href', kulthos);

  // The editor's top bar shows the inherited link, read-only, and focus mode hides it.
  await page.goto(`/projects/${adventure.id}`);
  const pill = page.locator('.top-meta a.gdr-link');
  await expect(pill).toHaveText('gdrarchive · Kulthos');
  await expect(pill).toHaveAttribute('href', kulthos);
  await expect(pill).toHaveAttribute('target', '_blank');
  await expect(pill).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(pill).toHaveAttribute('title', `From campaign ${campaign.title}. Opens ${kulthos} in a new tab`);
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+.');
  await expect(pill).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(pill).toBeVisible();

  // A reload keeps it.
  await page.reload();
  await expect(page.locator('.top-meta a.gdr-link')).toHaveAttribute('href', kulthos);
});

test('choose the default licence in Settings', async ({ page }) => {
  await signIn(page, '/settings/author');
  const field = page.getByLabel('Licence', { exact: true });
  await expect(field).toBeVisible();
  const previous = await field.inputValue();
  const choose = page.getByRole('button', { name: 'Choose…' });

  // A typed value is saved as the field is left, here by pressing «Choose…»,
  // and the pane opens on it.
  await field.fill('CC-BY-NC-SA-4.0');
  await choose.click();
  const pane = page.getByRole('dialog', { name: 'Choose a licence' });
  const list = pane.getByRole('listbox', { name: 'Licences' });
  await expect(list).toBeFocused();
  await expect(list.getByRole('option', { selected: true })).toContainText('CC BY-NC-SA 4.0');
  await expect(list.getByRole('option', { selected: true })).toContainText('Current');
  await expect(list.getByRole('option', { selected: true })).toContainText('Writes CC-BY-NC-SA-4.0');
  await expect(pane.getByRole('button', { name: 'Use licence' })).toBeDisabled();
  await expect(pane).toContainText('Not legal advice. Free text still works: type anything in the field.');

  await list.getByRole('option', { name: /CC BY 4\.0/ }).click();
  await pane.getByRole('button', { name: 'Use licence' }).click();
  await expect(pane).toHaveCount(0);
  await expect(choose).toBeFocused();
  await expect(field).toHaveValue('CC-BY-4.0');
  await expect(page.locator('.status')).toContainText('Saved');

  await page.reload();
  await expect(page.getByLabel('Licence', { exact: true })).toHaveValue('CC-BY-4.0');

  // Other tests make projects from the default: it is put back.
  await page.getByLabel('Licence', { exact: true }).fill(previous);
  await page.getByLabel('Licence', { exact: true }).press('Enter');
  await expect(page.locator('.status')).toContainText('Saved');
  await page.reload();
  await expect(page.getByLabel('Licence', { exact: true })).toHaveValue(previous);
});
