import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { connectClaude } from './claude.js';
import { createProject, signIn, syncPill } from './helpers.js';
import { atelierURL, baseURL } from './stack.js';

// Generating board images through the fake Atelier
// (atelier-image-provider design decisions 5, 8, 13 and 15, e2e/stack.ts):
// Settings refuses a read-only token and saves a write one with its month;
// choosing Atelier; Generate's Through line and Atelier's estimates; two
// images with their badges, the viewer's Through row and its Atelier link;
// Atelier's cap sentence on the prompt; removing the token switches back to
// OpenRouter; the spending table splits the cost by provider. The account is
// left on OpenRouter with no Atelier token, as the other specs expect it.
//
// Named to run after generate.spec.ts (the tests share one account and run
// in file order): that spec checks the account's month as its own images
// alone, so these images must come after it.

const sabaoth = await readFile(
  new URL('../packages/format/fixtures/l-ancora-di-sabaoth.converted.md', import.meta.url),
  'utf8',
);

const S2 =
  'Low-angle view of a flooded crypt under a ruined church, sepia and ash palette, desaturated --ar 3:2 --v 8.1 --no text, letters, modern buildings';
const S3 = 'Soldiers in 1908 Italian uniforms among cathedral ruins, smoke, grey sky --ar 16:9 --v 8.1';

const SETTINGS = '/settings/image-generation';
const CAP_REACHED =
  'This would pass your monthly cap of $20.00 ($19.96 spent). Raise the cap in Settings or wait for next month. Nothing was charged.';

const headers = { origin: baseURL };
const toast = (page: Page) => page.locator('.toast');
const block = (page: Page, sceneId: string) => page.locator(`#row-${sceneId} .ip`).first();
const panel = (page: Page) => page.getByRole('dialog', { name: 'Generate images' });
const generate = (page: Page, sceneId: string) =>
  block(page, sceneId).getByRole('button', { name: 'Generate', exact: true });
const through = (page: Page) => page.getByRole('group', { name: 'Generate through' });
const atelierCard = (page: Page) => page.locator('.card', { has: page.getByRole('heading', { name: 'Atelier', exact: true }) });

// No Atelier token, OpenRouter chosen: how this spec starts and ends.
async function reset(page: Page): Promise<void> {
  expect((await page.request.delete('/api/image-generation/atelier-token', { headers })).status()).toBe(204);
  const settings = await (await page.request.get('/api/settings')).json();
  const saved = await page.request.put('/api/settings', {
    headers,
    data: { ...settings, imageGeneration: { ...settings.imageGeneration, provider: 'openrouter' } },
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

async function saveToken(page: Page, token: string): Promise<void> {
  const card = atelierCard(page);
  const replace = card.getByRole('button', { name: 'Replace' });
  // The section checks the token it has first; a token saved before is replaced.
  await expect(card.getByRole('button', { name: /Replace|Save and check/ }).first()).toBeVisible();
  if (await replace.isVisible()) await replace.click();
  await page.getByLabel('API token', { exact: true }).fill(token);
  await card.getByRole('button', { name: 'Save and check' }).click();
}

// Also after a failure, with a timeout of its own: the specs after this one
// use the same account.
test.afterEach(async ({ page }) => {
  await reset(page);
});

test('Generate goes through Atelier when the account chooses it', async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page);
  await reset(page);
  {
    // An OpenRouter key, so removing the token switches back to it (D5).
    const key = await page.request.put('/api/image-generation/key', { headers, data: { key: 'sk-or-v1-good' } });
    expect(key.status()).toBe(200);
    const claude = await connectClaude(page);
    const { id, title } = await createProject(page.request, 'Sabaoth in Atelier');
    await typeDocument(page, id, sabaoth);
    await expect(page.locator('.ol li .id', { hasText: /^S3$/ }).first()).toBeVisible();
    for (const [sceneId, prompt] of [
      ['S2', S2],
      ['S3', S3],
    ] as const) {
      await claude.tool('add_image_prompt', { projectId: id, category: 'scene', sceneId, prompt });
    }

    // Settings: Atelier off until a token works; the server's address.
    await page.goto(SETTINGS);
    const atelier = through(page).getByRole('button', { name: /^Atelier/ });
    const openRouter = through(page).getByRole('button', { name: /^OpenRouter/ });
    await expect(atelier).toBeDisabled();
    await expect(atelier).toContainText('Add a token below');
    await expect(openRouter).toHaveAttribute('aria-pressed', 'true');
    await expect(openRouter).toContainText('Key works');
    await expect(atelierCard(page).locator('.srv')).toHaveText(atelierURL);

    // A read-only token is refused and nothing is stored.
    await saveToken(page, 'atl_pat_read');
    await expect(atelierCard(page).locator('.err-inline')).toHaveText(
      'This token is read only. Make one with Generate + read in Atelier.',
    );
    await expect(atelier).toBeDisabled();

    // A write token: checked, with its name, expiry and the month.
    await saveToken(page, 'atl_pat_good');
    await expect(toast(page)).toHaveText(/^Token saved and checked: write access, \$\d+\.\d\d of \$20 used\.$/);
    await expect(atelierCard(page).locator('.keyv')).toHaveText('atl_pat_••••••••••••good');
    await expect(atelierCard(page).locator('.keyline')).toHaveText(
      /^Works\. Write token «promptbook», expires 12 Nov 2027\. \$\d+\.\d\d of the \$20 cap used in \p{L}+ \(checked \d\d:\d\d\)\.$/u,
    );
    await expect(atelier).toBeEnabled();
    await expect(atelier).toContainText('Token works');

    // Choosing Atelier saves it.
    await atelier.click();
    await expect(toast(page)).toHaveText('Generate now goes through Atelier.');
    await expect(atelier).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('group', { name: 'Model' }).getByRole('button', { name: /^GPT Image 2\.6/ })).toContainText(
      '≈ $0.08 · 53 s per image',
    );

    // The panel: through Atelier, into the project's collection, Atelier's
    // estimates.
    await page.goto(`/projects/${id}/board`);
    await generate(page, 'S2').click();
    await expect(panel(page).locator('.via')).toHaveText(
      new RegExp(`^Through Atelier · into the collection «${title}» · \\$\\d+\\.\\d\\d of \\$20 used this month Change$`),
    );
    await expect(panel(page).getByRole('button', { name: /^GPT Image 2\.6/ })).toContainText('≈ $0.08 · 53 s per image');
    await expect(panel(page).locator('.est')).toHaveText('About $0.17 · 1K');

    // Two images arrive with their badges and the toast.
    await panel(page).getByRole('button', { name: 'Generate 2' }).click();
    await expect(panel(page)).toHaveCount(0);
    await expect(block(page, 'S2').locator('.genline')).toContainText(/Generating [12] of 2 with GPT Image 2\.6 through Atelier · \d+s\./);
    await expect(toast(page)).toHaveText('2 images for S2 · prompt 1 · $0.16', { timeout: 30_000 });
    const badges = block(page, 'S2').locator('.th-i .badge.gen');
    await expect(badges).toHaveText(['GPT · $0.08', 'GPT · $0.08'], { useInnerText: true });
    await expect(badges.first()).toHaveAttribute('title', 'GPT Image 2.6 Sunburst through Atelier, $0.080');
    await expect(page.locator('.spend')).toHaveText('Generated here: 2 images · $0.16');
    await expect(page.locator('.spend')).toHaveAttribute('title', 'Generated in this project, as billed by Atelier');

    // The viewer: Through Atelier, linked to the image in Atelier.
    await block(page, 'S2').locator('.th-i').first().click();
    const viewer = page.getByRole('dialog', { name: 'Image viewer' });
    await expect(viewer.locator('dl.kv')).toContainText(/SourceGeneratedThroughAtelier · No\. [0-9a-f]{8} in Atelier ↗ModelGPT Image 2\.6 SunburstCost\$0\.080/);
    const link = viewer.getByRole('link', { name: /^No\. [0-9a-f]{8} in Atelier ↗$/ });
    await expect(link).toHaveAttribute('href', new RegExp(`^${atelierURL}/images/[0-9a-f-]{36}$`));
    await expect(link).toHaveAttribute('target', '_blank');
    await viewer.getByRole('button', { name: 'Close' }).click();

    // Atelier's cap: its sentence on the prompt, nothing charged.
    await page.goto(SETTINGS);
    await saveToken(page, 'atl_pat_capped');
    await expect(toast(page)).toHaveText(/^Token saved and checked/);
    await page.goto(`/projects/${id}/board`);
    await generate(page, 'S3').click();
    await panel(page).getByRole('button', { name: 'Generate 2' }).click();
    const error = block(page, 'S3').locator('.info.err');
    await expect(error).toContainText(CAP_REACHED, { timeout: 30_000 });
    await expect(error.locator('b')).toHaveText('This would pass your monthly cap of $20.00 ($19.96 spent).');
    await expect(block(page, 'S3').locator('.th-i')).toHaveCount(0);

    // Removing the token switches Generate back to OpenRouter.
    await page.goto(SETTINGS);
    await atelierCard(page).getByRole('button', { name: 'Remove' }).click();
    await expect(toast(page)).toHaveText('Token removed. Generate now goes through OpenRouter.');
    await expect(openRouter).toHaveAttribute('aria-pressed', 'true');
    await expect(atelier).toBeDisabled();
    await expect(page.getByLabel('API token', { exact: true })).toBeVisible();

    // The spending table splits the month by provider.
    await expect(page.locator('.spt thead th')).toHaveText(['Project', 'Images', 'Atelier', 'OpenRouter', /^\p{L}+$/u]);
    await expect(page.locator('.spt tbody tr', { hasText: title }).locator('td.n')).toHaveText([
      '2',
      '$0.16',
      '$0.00',
      '$0.16',
    ]);

    // The board's panel goes through OpenRouter again.
    await page.goto(`/projects/${id}/board`);
    await generate(page, 'S3').click();
    await expect(panel(page).locator('.via')).toHaveText('Through OpenRouter · billed to your OpenRouter key Change');
  }
});
