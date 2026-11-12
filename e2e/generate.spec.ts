import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { connectClaude } from './claude.js';
import { createProject, signIn, syncPill } from './helpers.js';
import { baseURL } from './stack.js';

// Generating board images against the fake OpenRouter
// (board-image-generation design decisions 2, 7, 10 to 15, e2e/stack.ts):
// Settings saves and checks a key; Generate's panel on a Midjourney prompt;
// two images arrive with their badges, the toast and the header total, and a
// second page sees the progress and the images by sync; the viewer's rows;
// the thumbnail filled in; a key with no credit gives the 402 line with Try
// again; a removed key gives the no-key panel; a key with no limit says so;
// a fourth job while three run is refused in the panel.

const sabaoth = await readFile(
  new URL('../packages/format/fixtures/l-ancora-di-sabaoth.converted.md', import.meta.url),
  'utf8',
);

const S2 =
  'Low-angle view of a flooded crypt under a ruined church, sepia and ash palette, desaturated --ar 3:2 --v 8.1 --no text, letters, modern buildings';
const S3 = 'Soldiers in 1908 Italian uniforms among cathedral ruins, smoke, grey sky --ar 16:9 --v 8.1';
const S4 = 'An old Sicilian fisherwoman singing on the beach at dusk, lighthouse behind --ar 16:9 --v 8.1';
const S5 = 'A vast cathedral nave flooded with seawater under a twisting sky, a bronze anchor --ar 16:9 --v 8.1';
const ANSELMO = 'Portrait of an old Sicilian priest in a torn cassock, cracked crucifix, candlelight';

const SETTINGS = '/settings/image-generation';
const NO_CREDIT =
  'OpenRouter refused: your key has no credit left. Add credit on openrouter.ai, then try again. Nothing was charged.';

const toast = (page: Page) => page.locator('.toast');
const block = (page: Page, sceneId: string) => page.locator(`#row-${sceneId} .ip`).first();
const panel = (page: Page) => page.getByRole('dialog', { name: 'Generate images' });
const generate = (page: Page, sceneId: string) =>
  block(page, sceneId).getByRole('button', { name: 'Generate', exact: true });

async function typeDocument(page: Page, id: string, text: string): Promise<void> {
  await page.goto(`/projects/${id}`);
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
  await expect(syncPill(page)).toHaveAttribute('data-state', 'synced');
}

async function saveKey(page: Page, key: string, saved: string): Promise<void> {
  await page.goto(SETTINGS);
  const card = page.locator('.card', { has: page.getByRole('heading', { name: 'OpenRouter key' }) });
  const replace = card.getByRole('button', { name: 'Replace' });
  // The section checks the key it has first; a key saved before is replaced.
  await expect(card.getByRole('button', { name: /Replace|Save and check/ }).first()).toBeVisible();
  if (await replace.isVisible()) await replace.click();
  await page.getByLabel('Key', { exact: true }).fill(key);
  await card.getByRole('button', { name: 'Save and check' }).click();
  await expect(toast(page)).toHaveText(saved);
  await expect(card.locator('.keyv')).toHaveText(`sk-or-v1-••••••••••••${key.slice(-4)}`);
}

test('Generate makes images from a Midjourney prompt, on every device, with their cost', async ({ page, browser }) => {
  test.setTimeout(180_000);
  await signIn(page);
  // No key from an earlier run.
  expect((await page.request.delete('/api/image-generation/key', { headers: { origin: baseURL } })).status()).toBe(204);
  const claude = await connectClaude(page);
  const { id } = await createProject(page.request, 'Sabaoth generata');
  await typeDocument(page, id, sabaoth);
  await expect(page.locator('.ol li .id', { hasText: /^S5$/ }).first()).toBeVisible();
  const prompts: Record<string, string> = {};
  for (const [sceneId, prompt] of [
    ['S2', S2],
    ['S3', S3],
    ['S4', S4],
    ['S5', S5],
  ] as const) {
    const added = await claude.tool('add_image_prompt', { projectId: id, category: 'scene', sceneId, prompt });
    prompts[sceneId] = added.prompt.id;
  }
  await claude.tool('add_image_prompt', { projectId: id, category: 'npc', name: 'Padre Anselmo', prompt: ANSELMO });

  // Settings saves the key after OpenRouter's check and shows the credit.
  await saveKey(page, 'sk-or-v1-good', 'Key saved and checked: $9.50 credit left.');
  await expect(page.locator('.keyline')).toHaveText(/^Works\. \$9\.50 credit left on this key \(checked \d\d:\d\d\)\.$/);
  await expect(page.getByLabel('Key', { exact: true })).toHaveCount(0);

  // A second device with the board open.
  const other = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const second = await other.newPage();
  await signIn(second);
  await second.goto(`/projects/${id}/board`);
  await expect(block(second, 'S2').getByText(S2)).toBeVisible();

  // The panel on a Midjourney prompt: the defaults, the shape from --ar, what
  // is sent, the price.
  await page.goto(`/projects/${id}/board`);
  await expect(block(page, 'S2').getByText('No images yet. Generate them, or drop downloaded files here.')).toBeVisible();
  await generate(page, 'S2').click();
  await expect(generate(page, 'S2')).toHaveAttribute('aria-expanded', 'true');
  const gpt = panel(page).getByRole('button', { name: /^GPT Image 2\.6/ });
  await expect(gpt).toHaveAttribute('aria-pressed', 'true');
  await expect(gpt).toContainText('≈ $0.04 · 53 s per image');
  await expect(panel(page).getByRole('group', { name: 'Images' }).getByRole('button', { name: '2' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(panel(page).locator('.gl', { hasText: 'Shape' })).toHaveText("Shape from the prompt's --ar");
  await expect(panel(page).getByRole('group', { name: 'Shape' }).getByRole('button', { name: '3:2' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(panel(page).locator('details')).toHaveAttribute('open', '');
  await expect(panel(page).locator('summary')).toHaveText('What is sent: Midjourney flags left out');
  await expect(panel(page).locator('.sent ins')).toHaveText('No text, letters or modern buildings.');
  await expect(panel(page).locator('.sent s')).toHaveText('--ar 3:2 --v 8.1 --no text, letters, modern buildings');
  await expect(panel(page).locator('.est')).toHaveText('About $0.08 · 1K');

  // Two images arrive here and on the other device.
  await panel(page).getByRole('button', { name: 'Generate 2' }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(block(second, 'S2').locator('.genline')).toContainText(/Generating [12] of 2 with GPT Image 2\.6 through OpenRouter · \d+s\./);
  await expect(toast(page)).toHaveText('2 images for S2 · prompt 1 · $0.08', { timeout: 30_000 });
  const badges = block(page, 'S2').locator('.th-i .badge.gen');
  // The text shown: the full badge where the tile is wide enough.
  await expect(badges).toHaveText(['GPT · $0.04', 'GPT · $0.04'], { useInnerText: true });
  await expect(badges.first()).toHaveAttribute('title', 'GPT Image 2.6 Sunburst through OpenRouter, $0.040');
  await expect(block(page, 'S2').locator('.th-i .badge.new')).toHaveCount(2);
  await expect(block(page, 'S2').locator('.genline')).toHaveCount(0);
  await expect(page.locator('.spend')).toHaveText('Generated here: 2 images · $0.08');
  await expect(page.locator('.spend')).toHaveAttribute('title', 'Generated in this project, as billed by OpenRouter');
  await expect(block(second, 'S2').locator('.th-i .badge.gen')).toHaveCount(2);
  await expect(block(second, 'S2').locator('.genline')).toHaveCount(0);
  await other.close();

  // The viewer's rows for a generated image.
  await block(page, 'S2').locator('.th-i').first().click();
  const viewer = page.getByRole('dialog', { name: 'Image viewer' });
  await expect(viewer.locator('.fn')).toHaveText(/^S2-p1-gpt-[12]\.png$/);
  await expect(viewer.locator('dl.kv')).toContainText('SourceGeneratedThroughOpenRouterModelGPT Image 2.6 SunburstCost$0.040');
  await expect(viewer.locator('dl.kv')).not.toContainText('Matched by');
  const original = await viewer.locator('img.big').getAttribute('src');
  await viewer.getByRole('button', { name: 'Close' }).click();
  // Its thumbnail is filled in by the board.
  const images = block(page, 'S2').locator('.th-i img');
  await expect.poll(async () => images.evaluateAll((all) => all.map((i) => i.getAttribute('src')))).not.toContain(original);

  // A fourth job while three run is refused in the panel, which stays open.
  await generate(page, 'S5').click();
  await expect(panel(page)).toBeVisible();
  for (const sceneId of ['S2', 'S3', 'S4']) {
    const started = await page.request.post(`/api/projects/${id}/image-prompts/${prompts[sceneId]}/generate`, {
      headers: { origin: baseURL },
      data: { model: 'nb', count: 1, shape: '16:9' },
    });
    expect(started.status()).toBe(202);
  }
  await panel(page).getByRole('button', { name: 'Generate 2' }).click();
  await expect(panel(page).locator('.gerr')).toHaveText('Three generations are already running. Wait for one to finish.');
  await expect(panel(page)).toBeVisible();
  await panel(page).getByRole('button', { name: 'Cancel' }).click();
  // A scene tile is too narrow for «Nano Banana · $0.04»: the cost alone, the
  // rest in the title.
  const nb = block(page, 'S4').locator('.th-i .badge.gen');
  await expect(nb).toHaveText(['$0.04'], { timeout: 30_000, useInnerText: true });
  await expect(nb).toHaveAttribute('title', 'Nano Banana 2.1 through OpenRouter, $0.037');
  await expect(block(page, 'S3').locator('.th-i .badge.gen')).toHaveCount(1);
  await expect(block(page, 'S2').locator('.th-i .badge.gen')).toHaveCount(3);
  await expect(page.locator('.genline')).toHaveCount(0);
  await expect(page.locator('.spend')).toHaveText('Generated here: 5 images · $0.19');

  // A key with no credit: the 402 line on the prompt, with Try again.
  await saveKey(page, 'sk-or-v1-broke', 'Key saved and checked: $9.50 credit left.');
  await page.goto(`/projects/${id}/board?tab=npcs`);
  const anselmo = page.locator('[role=tabpanel]:not([hidden]) .ent', { hasText: 'Padre Anselmo' });
  await anselmo.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(panel(page).locator('.gl', { hasText: 'Shape' })).toHaveText('Shape default for NPCs');
  await panel(page).getByRole('button', { name: /^Nano Banana 2\.1/ }).click();
  await panel(page).getByRole('group', { name: 'Images' }).getByRole('button', { name: '1' }).click();
  await expect(panel(page).locator('.est')).toHaveText('About $0.04 · 1K');
  await panel(page).getByRole('button', { name: 'Generate 1' }).click();
  const error = anselmo.locator('.info.err');
  await expect(error).toContainText(NO_CREDIT, { timeout: 30_000 });
  await expect(error.locator('b')).toHaveText('OpenRouter refused: your key has no credit left.');
  await expect(anselmo.getByText('No images yet')).toHaveCount(0);
  await error.getByRole('button', { name: 'Try again' }).click();
  await expect(panel(page)).toBeVisible();
  // The last choice of the session is kept.
  await expect(panel(page).getByRole('button', { name: /^Nano Banana 2\.1/ })).toHaveAttribute('aria-pressed', 'true');
  await panel(page).getByRole('button', { name: 'Close' }).click();
  await error.getByRole('button', { name: 'Dismiss' }).click();
  await expect(error).toHaveCount(0);

  // The key removed: Generate asks for one.
  await page.goto(SETTINGS);
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(toast(page)).toHaveText('Key removed. Generate asks for a key again.');
  await expect(page.getByLabel('Key', { exact: true })).toBeVisible();
  await page.goto(`/projects/${id}/board`);
  await generate(page, 'S3').click();
  await expect(panel(page)).toContainText(
    'Add your OpenRouter key first. Images are billed to your OpenRouter account.',
  );
  await panel(page).getByRole('link', { name: 'Open Settings → Image generation' }).click();
  await expect(page).toHaveURL(new RegExp(`${SETTINGS}$`));

  // A key with no spending limit.
  await saveKey(page, 'sk-or-v1-nolimit', 'Key saved and checked: no spending limit.');
  await expect(page.locator('.keyline')).toHaveText('Works. No spending limit on this key.');
  // The month's spending: the five images that landed and their cost; the
  // refused ones cost nothing.
  await expect(page.locator('.bigsum > div').first()).toHaveText(/^\$0\.19\p{L}+, 5 images$/u);
  await expect(page.locator('.spt tbody tr', { hasText: 'Sabaoth generata' }).locator('td.n')).toHaveText(['5', '$0.00', '$0.19', '$0.19']);
});
