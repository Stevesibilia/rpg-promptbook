import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { connectClaude, type Claude } from './claude.js';
import { createProject, signIn, syncPill } from './helpers.js';
import { midjourneyName, portrait } from './media.js';
import { atelierPort, baseURL, compose, openRouterPort } from './stack.js';

// Reference images on a prompt (reference-images design decisions 12 to 17
// and 23): on a scene's prompt, Generate's panel picks the chosen portrait
// of an NPC dropped on the board; the prompt's card names it here and on a
// second device; the panel still has it when opened again and after a
// reload; the generation sends it, through the fake OpenRouter as one input
// reference per image and through the fake Atelier as an uploaded image;
// the viewer names it; removing the portrait from the board takes it off
// the card, the panel says so, and the viewer counts it removed. A General
// prompt takes references the same way, and its images are offered to the
// other prompts.
//
// Named to run after generate.spec.ts and generated-through-atelier.spec.ts
// (the tests share one account and run in file order): the first checks the
// account's month as its own images alone. The account is left on
// OpenRouter with no Atelier token, as the other specs expect it.

const sabaoth = await readFile(
  new URL('../packages/format/fixtures/l-ancora-di-sabaoth.converted.md', import.meta.url),
  'utf8',
);

const S2 = 'A ruined doctor’s office at cold dawn, anatomical drawings on the wall, a cracked brass microscope';
const ANSELMO = 'Portrait of a gaunt village priest in a dusty cassock, a wooden rosary around his left hand';
const COVER = 'A storm-lit lighthouse over a black sea, a lone figure on the rocks, engraving style';

const headers = { origin: baseURL };
const toast = (page: Page) => page.locator('.toast');
const block = (page: Page, sceneId: string) => page.locator(`#row-${sceneId} .ip`).first();
const panel = (page: Page) => page.getByRole('dialog', { name: 'Generate images' });
const generate = (page: Page, sceneId: string) =>
  block(page, sceneId).getByRole('button', { name: 'Generate', exact: true });
const grid = (page: Page) => panel(page).getByRole('listbox', { name: 'Images on this board' });
const npcCard = (page: Page) => page.locator('[role=tabpanel]:not([hidden]) .ent', { hasText: 'Padre Anselmo' });
const coverCard = (page: Page) => page.locator('[role=tabpanel]:not([hidden]) .ent', { hasText: 'Copertina' });

const file = (name: string, buffer: Buffer) => ({ name, mimeType: 'image/png', buffer });

// What a fake received last, read inside its container: the fakes are on
// the stack's network only.
function last(service: 'openrouter' | 'atelier'): Record<string, unknown> {
  const port = service === 'openrouter' ? openRouterPort : atelierPort;
  const script = `fetch('http://127.0.0.1:${port}/api/v1/__last').then((r) => r.json()).then((j) => console.log(JSON.stringify(j)))`;
  return JSON.parse(compose('exec', '-T', service, 'node', '-e', script)) as Record<string, unknown>;
}

// No Atelier token, OpenRouter chosen: how this spec starts and ends.
async function reset(page: Page): Promise<void> {
  expect((await page.request.delete('/api/image-generation/atelier-token', { headers })).status()).toBe(204);
  await chooseProvider(page, 'openrouter');
}

async function chooseProvider(page: Page, provider: 'openrouter' | 'atelier'): Promise<void> {
  const settings = await (await page.request.get('/api/settings')).json();
  const saved = await page.request.put('/api/settings', {
    headers,
    data: { ...settings, imageGeneration: { ...settings.imageGeneration, provider } },
  });
  expect(saved.status()).toBe(200);
}

async function typeDocument(page: Page, id: string, text: string): Promise<void> {
  await page.goto(`/projects/${id}`);
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
  await expect(syncPill(page)).toHaveAttribute('data-state', 'synced');
}

// A project with a prompt on S2 and Padre Anselmo's portrait dropped on the
// board and chosen.
async function prepare(page: Page, title: string): Promise<{ id: string; claude: Claude }> {
  const claude = await connectClaude(page);
  const { id } = await createProject(page.request, title);
  await typeDocument(page, id, sabaoth);
  await expect(page.locator('.ol li .id', { hasText: /^S2$/ }).first()).toBeVisible();
  await claude.tool('add_image_prompt', { projectId: id, category: 'scene', sceneId: 'S2', prompt: S2 });
  await claude.tool('add_image_prompt', { projectId: id, category: 'npc', name: 'Padre Anselmo', prompt: ANSELMO });
  await page.goto(`/projects/${id}/board?tab=npcs`);
  await page.locator('.board input[type=file]').setInputFiles([file(midjourneyName(ANSELMO, 0), portrait())]);
  await expect(page.locator('.info.good')).toContainText('1 file added: 1 matched, 0 to assign.', { timeout: 30_000 });
  await npcCard(page).getByRole('button', { name: 'Choose this image' }).click();
  await expect(npcCard(page).locator('.th-i.chosen')).toHaveCount(1);
  return { id, claude };
}

// Opens Generate on S2 and picks Padre Anselmo's portrait.
async function pickAnselmo(page: Page): Promise<void> {
  await generate(page, 'S2').click();
  const references = panel(page).locator('.gl', { hasText: 'References' });
  await expect(references).toHaveText('References up to 3, from this board');
  await panel(page).getByRole('button', { name: '+ Add an image' }).click();
  // The chosen image first, with its ✓.
  await expect(grid(page).getByRole('option')).toHaveText(['✓ Padre Anselmo']);
  await grid(page).getByRole('option', { name: '✓ Padre Anselmo' }).click();
  await expect(grid(page).getByRole('option', { name: '✓ Padre Anselmo' })).toHaveAttribute('aria-selected', 'true');
  await expect(references).toHaveText('References 1 of 3');
  await expect(panel(page).locator('.ref .rl')).toHaveText(['Padre Anselmo']);
}

const kv = (page: Page): Locator => page.getByRole('dialog', { name: 'Image viewer' }).locator('dl.kv');

test.afterEach(async ({ page }) => {
  await reset(page);
});

test('A reference picked in the panel is remembered, sent through OpenRouter and shown', async ({ page, browser }) => {
  test.setTimeout(180_000);
  await signIn(page);
  await reset(page);
  expect((await page.request.put('/api/image-generation/key', { headers, data: { key: 'sk-or-v1-good' } })).status()).toBe(
    200,
  );
  const { id } = await prepare(page, 'Sabaoth con riferimenti');

  // A second device with the board open.
  const other = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const second = await other.newPage();
  await signIn(second);
  await second.goto(`/projects/${id}/board`);
  await expect(block(second, 'S2').getByText(S2)).toBeVisible();

  // Picked in the panel: on the card here and, after sync, there.
  await page.goto(`/projects/${id}/board`);
  await pickAnselmo(page);
  await expect(block(page, 'S2').locator('.refline')).toHaveText('References: Padre Anselmo');
  await expect(block(second, 'S2').locator('.refline')).toHaveText('References: Padre Anselmo');
  await other.close();

  // Remembered: the panel opened again, and after a reload.
  await panel(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(panel(page)).toHaveCount(0);
  await generate(page, 'S2').click();
  await expect(panel(page).locator('.ref .rl')).toHaveText(['Padre Anselmo']);
  await page.reload();
  await generate(page, 'S2').click();
  await expect(panel(page).locator('.ref .rl')).toHaveText(['Padre Anselmo']);
  await expect(panel(page).locator('.refnote')).toHaveText('Sent with the prompt and kept on this prompt for next time.');

  // Generate: each of the two requests carries one input reference.
  await expect(panel(page).locator('.est')).toHaveText('About $0.08 · 1K · plus the input images');
  await panel(page).getByRole('button', { name: 'Generate 2' }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(toast(page)).toHaveText('2 images for S2 · prompt 1 · $0.08', { timeout: 30_000 });
  await expect(block(page, 'S2').locator('.th-i')).toHaveCount(2);
  expect(last('openrouter')).toEqual({ references: 1 });

  // The viewer names it, after the cost.
  await block(page, 'S2').locator('.th-i').first().click();
  await expect(kv(page)).toContainText('Cost$0.040ReferencesPadre Anselmo');
  await page.getByRole('dialog', { name: 'Image viewer' }).getByRole('button', { name: 'Close' }).click();

  // The portrait removed from the board: off the card, the panel says so,
  // the viewer counts it removed.
  await page.goto(`/projects/${id}/board?tab=npcs`);
  await npcCard(page).locator('.th-i').first().click();
  await page.getByRole('dialog', { name: 'Image viewer' }).getByRole('button', { name: 'Remove' }).click();
  await page.getByRole('dialog', { name: 'Remove this image?' }).getByRole('button', { name: 'Remove' }).click();
  await expect(toast(page)).toHaveText('Image removed.');
  await page.goto(`/projects/${id}/board`);
  await expect(block(page, 'S2').locator('.th-i')).toHaveCount(2);
  await expect(block(page, 'S2').locator('.refline')).toHaveCount(0);
  await generate(page, 'S2').click();
  await expect(panel(page).locator('.refgone')).toHaveText('1 reference no longer on the board');
  await expect(panel(page).locator('.gl', { hasText: 'References' })).toHaveText('References up to 3, from this board');
  await expect(panel(page).locator('.est')).toHaveText('About $0.08 · 1K');
  await panel(page).getByRole('button', { name: 'Cancel' }).click();
  await block(page, 'S2').locator('.th-i').first().click();
  await expect(kv(page)).toContainText('Cost$0.040References1 removed');
});

test('A reference dropped on the board is uploaded to Atelier and sent with the generation', async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page);
  await reset(page);
  const token = await page.request.put('/api/image-generation/atelier-token', { headers, data: { token: 'atl_pat_good' } });
  expect(token.status()).toBe(200);
  await chooseProvider(page, 'atelier');
  const { id } = await prepare(page, 'Sabaoth in Atelier con riferimenti');
  const before = last('atelier');

  await page.goto(`/projects/${id}/board`);
  await pickAnselmo(page);
  await expect(panel(page).locator('.via')).toContainText('Through Atelier');
  await panel(page).getByRole('group', { name: 'Images' }).getByRole('button', { name: '1' }).click();
  await panel(page).getByRole('button', { name: 'Generate 1' }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(toast(page)).toHaveText(/^1 image for S2 · prompt 1 · \$\d\.\d\d$/, { timeout: 30_000 });

  // The dropped portrait went up to Atelier once, and its id came with the
  // generation.
  const after = last('atelier');
  expect(after.uploads).toBe((before.uploads as number) + 1);
  expect(after.referenceIds).toEqual([expect.stringMatching(/^[0-9a-f-]{36}$/)]);

  await block(page, 'S2').locator('.th-i').first().click();
  await expect(kv(page)).toContainText('ThroughAtelier');
  await expect(kv(page)).toContainText(/Cost\$\d\.\d{3}ReferencesPadre Anselmo/);
});

test('A General prompt takes references, and its images are references for the others', async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page);
  await reset(page);
  expect((await page.request.put('/api/image-generation/key', { headers, data: { key: 'sk-or-v1-good' } })).status()).toBe(
    200,
  );
  const { id, claude } = await prepare(page, 'Sabaoth, riferimenti generali');
  await claude.tool('add_image_prompt', { projectId: id, category: 'general', name: 'Copertina', prompt: COVER });

  // On the General tab: the portrait picked on the cover, sent with its image.
  await page.goto(`/projects/${id}/board?tab=general`);
  await coverCard(page).getByRole('button', { name: 'Generate', exact: true }).click();
  await panel(page).getByRole('button', { name: '+ Add an image' }).click();
  await grid(page).getByRole('option', { name: '✓ Padre Anselmo' }).click();
  await expect(panel(page).locator('.ref .rl')).toHaveText(['Padre Anselmo']);
  await expect(coverCard(page).locator('.refline')).toHaveText('References: Padre Anselmo');
  await panel(page).getByRole('group', { name: 'Images' }).getByRole('button', { name: '1' }).click();
  await panel(page).getByRole('button', { name: 'Generate 1' }).click();
  await expect(toast(page)).toHaveText('1 image for Copertina · $0.04', { timeout: 30_000 });
  await expect(coverCard(page).locator('.th-i')).toHaveCount(1);
  expect(last('openrouter')).toEqual({ references: 1 });

  // On S2: the cover is offered after the chosen portrait, picked and sent.
  await page.goto(`/projects/${id}/board`);
  await generate(page, 'S2').click();
  await panel(page).getByRole('button', { name: '+ Add an image' }).click();
  await expect(grid(page).getByRole('option')).toHaveText(['✓ Padre Anselmo', 'Copertina']);
  await grid(page).getByRole('option', { name: 'Copertina' }).click();
  await expect(block(page, 'S2').locator('.refline')).toHaveText('References: Copertina');
  await panel(page).getByRole('group', { name: 'Images' }).getByRole('button', { name: '1' }).click();
  await panel(page).getByRole('button', { name: 'Generate 1' }).click();
  await expect(toast(page)).toHaveText('1 image for S2 · prompt 1 · $0.04', { timeout: 30_000 });
  expect(last('openrouter')).toEqual({ references: 1 });
  await block(page, 'S2').locator('.th-i').first().click();
  await expect(kv(page)).toContainText('Cost$0.040ReferencesCopertina');
});
