import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { checkCuebardPack } from 'promptbook-project';
import { createProject, signIn } from './helpers.js';
import { midjourneyName, png, sunoName, wav } from './media.js';

// The board of a campaign (campaign-board design decisions 2 to 5 and 11,
// the mockup's screens 11, 11b and 11c): the rail opens it on General with
// no Scenes tab and the Claude card; a General image, two music prompts and
// an NPC added by hand; files dropped find them by filename, a track that
// matches nothing waits in Unmatched with no scene to go to; a track chosen;
// the export dialog's campaign lines and a pack with the one cue group
// General. It generates nothing and leaves the account's settings alone.

const COVER = 'An ancient bronze anchor half buried in black sand, storm light over a dark sea --ar 2:3 --v 8.1';
const ANSELMO = 'Portrait of an old Sicilian priest in a torn cassock, cracked crucifix, candlelight --ar 2:3 --v 8.1';

const file = (name: string, buffer: Buffer) => ({
  name,
  mimeType: name.endsWith('.png') ? 'image/png' : 'audio/wav',
  buffer,
});

const toast = (page: Page) => page.locator('.toast');
const tab = (page: Page, name: string) => page.getByRole('tab', { name: new RegExp(`^${name}`) });
const card = (page: Page, name: string) =>
  page.locator('[role=tabpanel]:not([hidden]) .ent', { has: page.locator('.enm', { hasText: new RegExp(`^${name}$`) }) });

async function addMusic(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: 'Add music prompt' }).click();
  const adding = page.locator('.ent', { has: page.locator('.enm', { hasText: 'New music prompt' }) });
  await adding.getByLabel('Title').fill(title);
  await adding.getByLabel('Style').fill('dark orchestral, slow, low strings');
  await adding.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(toast(page)).toHaveText(`Added General · ${title}. Copy it into Suno.`);
}

test('a campaign has a board: General, PCs, NPCs and Handouts, its files, and its CueBard pack', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  const { id, title } = await createProject(page.request, 'Kulthos', { category: 'campaign' });

  // Screen 11c: the rail opens the board on General, with no Scenes tab.
  await page.goto(`/projects/${id}`);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Images and music' }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${id}/board$`));
  await expect(page.getByRole('tab')).toHaveText(['General0none yet', 'PCs0none yet', 'NPCs0none yet', 'Handouts0none yet']);
  await expect(tab(page, 'General')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.board .lead')).toHaveText(
    'Images and music for the whole campaign, with PCs, NPCs and handouts. For the table and the CueBard export.',
  );
  const claude = page.locator('.card.claude');
  await expect(claude).toContainText('Claude reads the campaign and writes General images and music for it');
  await expect(claude).toContainText(
    `Write the image and music prompts for the board of «${title}»: general images and music, portraits of the PCs and NPCs, and the handouts`,
  );
  await expect(page.getByRole('heading', { name: 'Nothing general yet' })).toBeVisible();
  await expect(page.getByText('Images and music for the whole campaign, not tied to a scene:')).toBeVisible();
  await expect(page.locator('.status')).toContainText('Campaign · 0 image prompts · 0 general music');
  await expect(page.getByText('Reading the appendix…')).toHaveCount(0);

  // A campaign has no Scenes: the address opens General and says so.
  await page.goto(`/projects/${id}/board?tab=scenes`);
  await expect(tab(page, 'General')).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(new RegExp(`/projects/${id}/board$`));
  await expect(page.getByRole('button', { name: 'Add the appendix' })).toHaveCount(0);

  // A General image and two music prompts by hand.
  await page.getByRole('button', { name: 'Add image' }).click();
  await expect(page.getByLabel('Name')).toHaveAttribute('placeholder', 'Copertina della campagna');
  await page.getByLabel('Name').fill('Copertina della campagna');
  await page.getByLabel('Midjourney prompt for the new General image').fill(COVER);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(toast(page)).toHaveText('Added General · Copertina della campagna. Copy it into Midjourney.');
  await addMusic(page, 'Tema della campagna');
  await addMusic(page, 'Combattimento');
  await expect(claude).toHaveCount(0);
  await expect(
    page.getByText(
      'General images and music belong to the whole campaign, not to a scene. Their files find them by filename, like the others.',
    ),
  ).toBeVisible();

  // The drop: the image and three takes find their prompt; a fourth waits.
  const untitled = file('untitled take.wav', wav());
  await page
    .locator('.board input[type=file]')
    .setInputFiles([
      file(midjourneyName(COVER, 0), png(120, 180)),
      file(sunoName('Tema della campagna'), wav()),
      file(sunoName('combattimento'), wav()),
      file(sunoName('combattimento', 1), wav()),
      untitled,
    ]);
  const result = page.locator('.info.good');
  await expect(result).toContainText('5 files added: 4 matched, 1 to assign.', { timeout: 30_000 });
  await expect(result).toContainText('General · Combattimento: 2 tracks');
  await expect(card(page, 'Copertina della campagna').locator('.th-i img')).toHaveCount(1);
  await expect(card(page, 'Combattimento').locator('.trk-r')).toHaveCount(2);

  // Choose the main theme's take.
  const tema = card(page, 'Tema della campagna');
  await tema.locator('.trk-r').first().getByRole('button', { name: 'Choose' }).click();
  await expect(tema.locator('.st')).toHaveText('Chosen');

  // The tray names no scene: General music only.
  const tray = page.getByRole('region', { name: 'Unmatched' });
  const assign = tray.getByLabel('Assign untitled take.wav to a music prompt');
  await expect(assign.locator('option').first()).toHaveText('Assign to music…');
  await expect(assign.locator('optgroup')).toHaveCount(1);
  await expect(assign.locator('optgroup')).toHaveAttribute('label', 'General');
  await expect(assign.locator('optgroup option')).toHaveText(['Tema della campagna', 'Combattimento']);

  // The help names no scene.
  await page.getByRole('button', { name: 'How matching works' }).first().click();
  const help = page.getByRole('dialog', { name: 'How files find their prompt' });
  await expect(help).toContainText('in any category: General, PCs, NPCs or Handouts.');
  await expect(help).toContainText('The filename is the track title of a General music prompt.');
  await expect(help).not.toContainText('Scenes');
  await page.keyboard.press('Escape');

  // An NPC by hand.
  await tab(page, 'NPCs').click();
  await expect(page).toHaveURL(/\?tab=npcs$/);
  await page.getByRole('button', { name: 'Add NPC' }).click();
  await page.getByLabel('Name').fill('Padre Anselmo');
  await page.getByLabel('Midjourney prompt for the new NPC').fill(ANSELMO);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(toast(page)).toHaveText('Added NPC · Padre Anselmo. Copy it into Midjourney.');
  await expect(page.getByText('NPCs belong to the whole campaign, not to a scene.')).toBeVisible();
  await expect(tab(page, 'NPCs')).toHaveText('NPCs11 wanted');
  await expect(page.locator('.status')).toContainText('Campaign · 2 image prompts · 2 general music');

  // Screen 11b: the export dialog's campaign lines.
  await page.getByRole('button', { name: 'Export for CueBard…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export for CueBard' });
  await expect(dialog).toContainText(
    "A CueBard project: one cue group General with the campaign's music, and the images in four visual folders.",
  );
  await expect(dialog.locator('.xsum')).toContainText('Cue groupsGeneral·3 tracks');
  await expect(dialog.locator('.xsum')).toContainText('Visual foldersGeneral 1·PCs 0·NPCs 0·Handouts 0 images');
  await expect(dialog).toContainText('Each prompt and music prompt gives its chosen file, or every matched file when nothing is chosen.');
  await expect(dialog.locator('.xwarn li')).toHaveText(['NPC "Padre Anselmo" has no image.']);
  await expect(dialog).toContainText(`Your browser downloads ${title}.cbpack`);

  // The pack: one cue group, General, with the chosen theme and both
  // combat takes; the tray's take stays out.
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export' }).click();
  const download = await downloading;
  await expect(toast(page)).toHaveText(`Downloading ${title}.cbpack.`);
  const bytes = new Uint8Array(await readFile(await download.path()));
  expect(checkCuebardPack(bytes)).toEqual([]);
  const zip = unzipSync(bytes);
  const names = Object.keys(zip);
  const project = JSON.parse(strFromU8(zip[`${title}.cuebard`]!));
  expect(project.items.map((g: { displayName: string }) => g.displayName)).toEqual(['General']);
  expect(names).toContain(`media/${sunoName('Tema della campagna')}`);
  expect(names).toContain(`media/${sunoName('combattimento', 1)}`);
  expect(names.some((n) => n.endsWith(untitled.name))).toBe(false);
  expect(names.filter((n) => n.startsWith('media/visuals/'))).toHaveLength(1);
});
