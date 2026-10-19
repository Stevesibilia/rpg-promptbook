import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers.js';

// The PDF pane and review against the compose stack and its seeded Sabaoth,
// read only. The first PDF of a page loads the engine, 29 MB of WebAssembly
// (about 8 MB with Brotli), so the steps that wait for it get a minute.

const ENGINE = { timeout: 60_000 };

test.describe.configure({ timeout: 180_000 });

async function seededId(page: Page, title: string): Promise<string> {
  const { projects } = (await (await page.request.get('/api/projects')).json()) as {
    projects: { id: string; title: string }[];
  };
  const project = projects.find((p) => p.title === title);
  expect(project, `seeded project «${title}»`).toBeDefined();
  return project!.id;
}

async function open(page: Page, title: string): Promise<void> {
  await page.goto(`/projects/${await seededId(page, title)}`);
  await expect(page.locator('.cm-content')).toBeVisible();
}

const outlineItem = (page: Page, id: string) =>
  page
    .locator('.ol li')
    .filter({ has: page.locator('.id', { hasText: new RegExp(`^${id}$`) }) })
    .first();
const pane = (page: Page) => page.locator('.pdfpane');
const review = (page: Page) => page.getByRole('region', { name: 'PDF review' });
const engineRequests = (page: Page) => {
  const seen: string[] = [];
  page.on('request', (request) => {
    if (/typst_ts_web_compiler.*\.wasm|pdf\.worker/.test(request.url())) seen.push(request.url());
  });
  return seen;
};

// The page number the pane's header shows.
async function panePage(page: Page): Promise<number> {
  const header = pane(page).locator('.bar2 span').first();
  await expect(header).toHaveText(/^PDF preview · page \d+ of \d+ · follows the cursor$/, ENGINE);
  return Number(/page (\d+)/.exec((await header.textContent()) ?? '')![1]);
}

async function openPane(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'PDF', exact: true }).click();
  await expect(pane(page).locator('.pdf-sheet')).toBeVisible(ENGINE);
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('editor without PDF', async ({ page }) => {
  const engine = engineRequests(page);
  await open(page, "L'Ancora di Sabaoth");
  // The editor's first analysis has landed and the page has gone quiet.
  await expect(outlineItem(page, 'S5')).toBeVisible();
  await expect(page.locator('.status .counts')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(pane(page)).toHaveCount(0);
  expect(engine).toEqual([]);
});

test('follows the cursor', async ({ page }) => {
  const engine = engineRequests(page);
  await open(page, "L'Ancora di Sabaoth");
  await outlineItem(page, 'S1').click();
  await openPane(page);
  expect(engine.filter((url) => url.endsWith('.wasm'))).toHaveLength(1);
  const s1 = await panePage(page);

  await outlineItem(page, 'S4').click();
  await expect.poll(() => panePage(page)).toBeGreaterThan(s1);
  const s4 = await panePage(page);

  // The page shown is the one S4 starts on.
  await page.keyboard.press('ControlOrMeta+Shift+P');
  await expect(review(page)).toBeVisible();
  await expect(review(page).getByRole('button', { name: `Page ${s4}, S4`, exact: true })).toBeVisible();
});

test('review, options and save', async ({ page }) => {
  await open(page, "L'Ancora di Sabaoth");
  await openPane(page);
  const count = Number(/of (\d+)/.exec((await pane(page).locator('.bar2 span').first().textContent()) ?? '')![1]);
  expect(count).toBeGreaterThanOrEqual(12);

  await page.keyboard.press('ControlOrMeta+Shift+P');
  const thumbs = review(page).locator('.thumbs-col .th');
  await expect(thumbs).toHaveCount(count);
  await expect(thumbs.first()).toHaveText('1 · Cover');

  // Letter: wider and shorter pages.
  const ratio = async () => {
    const [, , width, height] = ((await thumbs.first().locator('svg').getAttribute('viewBox')) ?? '').split(' ');
    return Number(width) / Number(height);
  };
  const a4 = await ratio();
  expect(a4).toBeCloseTo(210 / 297, 2);
  await review(page).getByLabel('Paper').selectOption('us-letter');
  await expect.poll(ratio, ENGINE).toBeCloseTo(8.5 / 11, 2);

  const download = page.waitForEvent('download');
  await review(page).getByRole('button', { name: 'Save PDF' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('l-ancora-di-sabaoth.pdf');
  const chunks: Buffer[] = [];
  for await (const chunk of await file.createReadStream()) chunks.push(chunk as Buffer);
  expect(Buffer.concat(chunks).subarray(0, 5).toString('latin1')).toBe('%PDF-');
});

test('jump to the text', async ({ page }) => {
  await open(page, "L'Ancora di Sabaoth");
  await outlineItem(page, 'S2').click();
  await openPane(page);
  const s2 = await panePage(page);

  await pane(page).getByRole('button', { name: '⤢ Review' }).click();
  await expect(review(page)).toBeVisible();
  const sheet = review(page).locator(`.stage .pdf-sheet[data-page="${s2}"]`);
  await expect(sheet).toBeVisible();
  // Away from the cursor first, then into S2's page, below its heading.
  await page.keyboard.press('Escape');
  await expect(review(page)).toHaveCount(0);
  await outlineItem(page, 'S5').click();
  await pane(page).getByRole('button', { name: '⤢ Review' }).click();
  await review(page).getByRole('button', { name: new RegExp(`^Page ${s2}, `) }).click();
  const box = (await sheet.boundingBox())!;
  await sheet.dblclick({ position: { x: box.width * 0.3, y: box.height * 0.4 } });

  await expect(review(page)).toHaveCount(0);
  await expect(page.locator('.status span').first()).toHaveText(/^S2 · /);
  await expect(page.locator('.cm-content')).toBeFocused();
});

test('Esc returns to the editor', async ({ page }) => {
  await open(page, "L'Ancora di Sabaoth");
  await page.keyboard.press('ControlOrMeta+Shift+P');
  await expect(review(page)).toBeVisible();
  await expect(review(page).locator('.thumbs-col .th').first()).toBeVisible(ENGINE);
  await page.keyboard.press('Escape');
  await expect(review(page)).toHaveCount(0);
  await expect(page.locator('.cm-content')).toBeFocused();
});

test('campaign has no PDF', async ({ page }) => {
  await open(page, 'Blacksad - Il Continentale');
  await expect(page.locator('.status')).toContainText('Campaign · not checked');
  await expect(page.getByRole('button', { name: 'PDF', exact: true })).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+P');
  await expect(review(page)).toHaveCount(0);
});
