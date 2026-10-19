import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { templates } from 'promptbook-format';
import { createProject, signIn, syncPill } from './helpers.js';

// One test per scenario of the editor spec, against the compose stack and its
// seed. Tests that only look use the seeded projects; tests that write use a
// copy of their own.

const sabaoth = await readFile(
  new URL('../packages/format/fixtures/l-ancora-di-sabaoth.converted.md', import.meta.url),
  'utf8',
);

async function seededId(page: Page, title: string): Promise<string> {
  const { projects } = (await (await page.request.get('/api/projects')).json()) as {
    projects: { id: string; title: string }[];
  };
  const project = projects.find((p) => p.title === title);
  expect(project, `seeded project «${title}»`).toBeDefined();
  return project!.id;
}

async function open(page: Page, id: string): Promise<void> {
  await page.goto(`/projects/${id}`);
  await expect(page.locator('.cm-content')).toBeVisible();
}

// The seeded Sabaoth, read only.
async function openSabaoth(page: Page): Promise<void> {
  await open(page, await seededId(page, "L'Ancora di Sabaoth"));
  await expect(outlineItem(page, 'S5')).toBeVisible();
}

// A project of the test's own holding `text`, typed in through the editor,
// once the outline shows the scene `last` from its analysis.
async function projectWith(page: Page, text: string, title = 'Sabaoth copia', last = 'S5'): Promise<string> {
  const { id } = await createProject(page.request, title);
  await open(page, id);
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
  await expect(outlineItem(page, last)).toBeVisible();
  await expect(syncPill(page)).toHaveAttribute('data-state', 'synced');
  return id;
}

// An outline item by its scene id ("S4") or its whole name.
const outlineItem = (page: Page, text: string) =>
  page
    .locator('.ol li')
    .filter({ has: page.locator(/^S\d+$/.test(text) ? '.id' : '.nm', { hasText: new RegExp(`^${text}$`) }) })
    .first();
const cursorLine = (page: Page) => page.locator('.cm-activeLine');
const statusItem = (page: Page, text: RegExp) => page.locator('.status span', { hasText: text }).first();

// The error and warning counts of the status bar, added up.
async function problemCount(page: Page): Promise<number> {
  const text = await page.locator('.status .counts').textContent();
  return [...(text ?? '').matchAll(/(\d+) (error|warning)/g)].reduce((sum, m) => sum + Number(m[1]), 0);
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('edit in two tabs', async ({ page }) => {
  const id = await projectWith(page, '## Scene\n\n### S1. Uno\n\nTesto.\n', 'Due schede', 'S1');
  const other = await page.context().newPage();
  await open(other, id);
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\nUna riga dalla prima scheda.');
  await expect(other.locator('.cm-content')).toContainText('Una riga dalla prima scheda.', { timeout: 2_000 });
  await other.close();
});

test('table drawn and edited', async ({ page }) => {
  await openSabaoth(page);
  // On the section's heading: the table below it is not touched.
  await outlineItem(page, 'Mappa delle scene').click();
  const table = page.locator('.cm-table-wrap').filter({ hasText: 'Il cordone di Donato' });
  await expect(table.locator('thead th')).toHaveText(['#', 'Scena', 'Luogo', 'In gioco', 'PNG', 'Indizi']);
  await expect(table).not.toContainText('|');
  await expect(table).not.toContainText('---');

  await table.locator('td', { hasText: 'Il cordone di Donato' }).click();
  await expect(table).toHaveCount(0);
  await expect(cursorLine(page)).toHaveClass(/cm-table-src/);
  const row = sabaoth.split('\n').find((line) => line.startsWith('| S3'))!;
  await expect(cursorLine(page)).toHaveText(row);
  await expect(statusItem(page, /^Ln /)).toContainText(`Col ${row.indexOf('Il cordone') + 1}`);
});

test('marks follow the cursor', async ({ page }) => {
  await openSabaoth(page);
  const heading = page.locator('.cm-line.cm-h3', { hasText: 'La casa che cede' }).first();
  await outlineItem(page, 'Scene').click();
  await expect(heading).toHaveText('S1. La casa che cede');
  await outlineItem(page, 'S1').click();
  await expect(heading).toHaveText('### S1. La casa che cede');
});

test('callout box', async ({ page }) => {
  const text = sabaoth.replace(
    '\n> [!leggi]\n> Una trave',
    '\n> [!documento] La lettera di Neri\n> Umberto, non sei pazzo.\n\n> [!leggi]\n> Una trave',
  );
  await projectWith(page, text);
  await outlineItem(page, 'S1').click();
  const box = page.locator('.cm-line.cm-callout-handout.cm-callout-head');
  await expect(box).toHaveText('Documento da consegnare · La lettera di Neri');
  await expect(box).not.toContainText('[!documento]');
});

test('unknown field fixed', async ({ page }) => {
  await projectWith(page, sabaoth);
  // Far below its scene's heading: reached from the checks.
  await page.locator('.inspector .prob', { hasText: 'Se il tempo stringe' }).click();
  const field = page.locator('.cm-line', { hasText: 'Se il tempo stringe:' });
  await expect(field.locator('.cm-lintRange-error').first()).toBeVisible();
  const before = await problemCount(page);

  await field.locator('.cm-lintRange-error').first().hover();
  const fix = page.locator('.cm-tooltip-lint .cm-diagnosticAction', {
    hasText: 'Turn "Se il tempo stringe" into a "Riquadro" box',
  });
  await fix.click();
  const box = page.locator('.cm-line.cm-callout-box.cm-callout-head', { hasText: 'Se il tempo stringe' });
  // Drawn as a box, or as its source while the cursor is on it.
  await expect(box).toHaveText(/^(Riquadro · |> \[!riquadro\] )Se il tempo stringe$/);
  await expect(page.locator('.cm-line', { hasText: '**Se il tempo stringe:**' })).toHaveCount(0);
  await expect.poll(() => problemCount(page)).toBe(before - 1);
});

test('campaign not checked', async ({ page }) => {
  await open(page, await seededId(page, 'Blacksad - Il Continentale'));
  await expect(page.locator('.status')).toContainText('Campaign · not checked');
  await expect(page.locator('.status .counts')).toHaveCount(0);
  await expect(page.locator('.cm-lint-marker')).toHaveCount(0);
  await expect(page.locator('.inspector .checks')).toHaveCount(0);
});

test('jump to a scene', async ({ page }) => {
  await openSabaoth(page);
  await outlineItem(page, 'S4').click();
  await expect(cursorLine(page)).toHaveText('### S4. Torre Faro e la canzone');
  await expect(cursorLine(page)).toBeInViewport();
});

test('move a scene', async ({ page }) => {
  const id = await projectWith(page, sabaoth);
  const other = await page.context().newPage();
  await open(other, id);
  const scenes = (p: Page) => p.locator('.ol li[data-movable] .id');
  await expect(scenes(other)).toHaveText(['S1', 'S2', 'S3', 'S4', 'S5']);

  const s3 = page.locator('.ol li[data-movable]', { hasText: 'S3' });
  const box = (await s3.boundingBox())!;
  await page
    .locator('.ol li[data-movable]', { hasText: 'S2' })
    .locator('.grip')
    .dragTo(s3, { targetPosition: { x: 20, y: box.height - 3 } });

  await expect(scenes(page)).toHaveText(['S1', 'S3', 'S2', 'S4', 'S5']);
  await expect(scenes(other)).toHaveText(['S1', 'S3', 'S2', 'S4', 'S5']);
  await outlineItem(page, 'S2').click();
  await expect(cursorLine(page)).toHaveText("### S2. L'ambulatorio di Salvi");
  await other.close();
});

test('insert a missing field', async ({ page }) => {
  await projectWith(page, sabaoth.replace('\n**Prove e regole:** leggere il quaderno bruciato [da manuale].\n', ''));
  await outlineItem(page, 'S2').click();
  const row = page.locator('.this-scene .rules li', { hasText: 'Prove e regole' });
  await row.getByRole('button', { name: 'Insert' }).click();
  await expect(cursorLine(page)).toHaveText(/^\*\*Prove e regole:\*\*\s*$/);
  await expect(row.locator('.ok')).toBeVisible();
  // After the last field before it in the template, «Indizi qui».
  const above = await cursorLine(page).evaluate((line) => {
    let node = line.previousElementSibling;
    while (node && !node.textContent?.trim()) node = node.previousElementSibling;
    return node?.textContent ?? '';
  });
  expect(above).toContain('I9.');
  await page.keyboard.type('una prova');
  await expect(cursorLine(page)).toHaveText('**Prove e regole:** una prova');
});

test('problem from the list', async ({ page }) => {
  await openSabaoth(page);
  await page.locator('.inspector .prob', { hasText: 'Se il tempo stringe' }).click();
  const selected = await page.evaluate(() => getSelection()?.toString() ?? '');
  expect(selected.length).toBeGreaterThan(0);
  expect(selected).toContain('Se il tempo stringe');
  await expect(cursorLine(page)).toBeInViewport();
});

test('new scene from the menu', async ({ page }) => {
  await projectWith(page, sabaoth);
  await outlineItem(page, 'S5').click();
  // A new line above the heading of S5: in the scenes section, in no scene.
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.type('/');
  const menu = page.locator('.cm-tooltip-autocomplete');
  await expect(menu.getByRole('option', { name: /New scene/ })).toBeVisible();
  await page.keyboard.type('new');
  await page.keyboard.press('Enter');
  await expect(cursorLine(page)).toHaveText(/^### S6\.\s*$/);
  await page.keyboard.type('Nuova');
  await expect(outlineItem(page, 'S6')).toContainText('Nuova');

  // Escape leaves the / as typed.
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(cursorLine(page)).toHaveText('/');
});

test('sheet matches the template', async ({ page }) => {
  await openSabaoth(page);
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+/');
  const sheet = page.getByRole('dialog', { name: /^Syntax/ });
  await expect(sheet).toBeVisible();
  const fields = sheet.locator('section', { hasText: 'Scene fields' }).locator('td:nth-child(2)');
  await expect(fields).toHaveText(templates.avventura.sceneFields.map((f) => f.label));
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
});

test('go to a scene by name', async ({ page }) => {
  await openSabaoth(page);
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  await page.keyboard.type('cordone');
  await expect(palette.getByRole('option')).toHaveText(['Go to S3 Il cordone di Donato']);
  await page.keyboard.press('Enter');
  await expect(palette).toHaveCount(0);
  await expect(cursorLine(page)).toHaveText('### S3. Il cordone di Donato');

  // The top bar's hint opens it too.
  await page.getByRole('button', { name: 'Command palette' }).click();
  await expect(palette).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette).toHaveCount(0);
});

test('focus and back', async ({ page }) => {
  await openSabaoth(page);
  await page.locator('.cm-content').click();
  const panels = [page.locator('nav.outline'), page.locator('.inspector'), page.locator('.crumbs')];
  for (const panel of panels) await expect(panel).toBeVisible();
  await page.keyboard.press('ControlOrMeta+.');
  for (const panel of panels) await expect(panel).toBeHidden();
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(page.locator('.status')).toContainText('Template: Avventura v1');
  await page.keyboard.press('Escape');
  for (const panel of panels) await expect(panel).toBeVisible();
});

test('counts follow the text', async ({ page }) => {
  await projectWith(page, sabaoth);
  await expect.poll(() => problemCount(page)).toBeGreaterThan(0);
  const before = await problemCount(page);
  await outlineItem(page, 'S1').click();
  await page.keyboard.press('End');
  await page.keyboard.type('\n\n**Campo inventato:** niente.');

  // Main-thread tasks while typing (design, risks: parse time), reported.
  await page.evaluate(() => {
    const w = window as unknown as { longTasks: number[] };
    w.longTasks = [];
    new PerformanceObserver((list) => list.getEntries().forEach((e) => w.longTasks.push(e.duration))).observe({
      type: 'longtask',
    });
  });
  await page.keyboard.type(' Una frase battuta per misurare i tempi.', { delay: 30 });
  await expect.poll(() => problemCount(page)).toBe(before + 1);
  const tasks = await page.evaluate(() => (window as unknown as { longTasks: number[] }).longTasks);
  const longest = Math.round(Math.max(0, ...tasks));
  test
    .info()
    .annotations.push({
      type: 'main-thread tasks over 50 ms while typing',
      description: `${tasks.length}, longest ${longest} ms`,
    });
  console.log(`main-thread tasks over 50 ms while typing in Sabaoth: ${tasks.length}, longest ${longest} ms`);
});
