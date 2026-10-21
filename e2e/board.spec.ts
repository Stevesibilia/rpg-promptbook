import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { checkCuebardPack } from 'promptbook-project';
import { connectClaude } from './claude.js';
import { createProject, row, signIn, syncPill } from './helpers.js';
import { midjourneyName, png, portrait, sunoName, wav } from './media.js';

// The images and music board in the browser (asset-board design decision
// 18, image-categories design decision 10): Claude writes prompts in every
// category through the connector, the tabs count them, the files dropped
// find their prompt by name whatever the category, the rest wait in the tray
// (one matching two prompts); adding an NPC by hand, choosing per prompt,
// the viewer, removing a prompt, the track menu, a file dropped again, a
// board with no appendix, and the export. The CueBard pack (cuebard-export
// design decision 19): the dialog's counts and warnings, the download
// checked with CueBard's rules, the chosen files alone, the tray left out,
// and the projects screen's entry.

const sabaoth = await readFile(
  new URL('../packages/format/fixtures/l-ancora-di-sabaoth.converted.md', import.meta.url),
  'utf8',
);

const S1_IMAGE = 'Collapsed library at night in 1908 Messina, broken beams, books buried in dust, oil lamp light --ar 16:9 --v 8.1';
const S1_LAMP = 'Close-up of an oil lamp on a desk buried in dust and fallen books, warm flicker --ar 16:9 --v 8.1';
const S3_IMAGE = 'Soldiers in 1908 Italian uniforms standing still among cathedral ruins, smoke, grey sky --ar 16:9 --v 8.1';
const S4_IMAGE = 'Portrait of an old Sicilian fisherwoman singing on the beach at dusk, lighthouse behind --ar 16:9 --v 8.1';
const S5_IMAGE = 'A vast cathedral nave flooded with seawater under a twisting sky, a bronze anchor --ar 16:9 --v 8.1';
const ANSELMO = 'Portrait of an old Sicilian priest in a torn cassock, cracked crucifix, candlelight --ar 2:3 --v 8.1';
// Its first words are S4's: Midjourney's downloads match both.
const NINA = 'Portrait of an old Sicilian fisherwoman singing, black shawl, salt-cracked hands --ar 2:3 --v 8.1';
const ROSALIA = 'Portrait of a young Sicilian nurse in 1908, white apron stained with dust --ar 2:3 --v 8.1';
const LETTER = 'A handwritten letter on yellowed paper, 1908, Italian cursive in brown ink --ar 3:4 --v 8.1';
const TURI = 'Portrait of a barefoot Sicilian boy in 1908, oversized flat cap, a bucket of seawater --ar 2:3 --v 8.1';
const LYRICS = '[Intro: low drone]\n[Instrumental]\n[Outro: fade out]\n[End]';

const file = (name: string, buffer: Buffer) => ({
  name,
  mimeType: name.endsWith('.png') ? 'image/png' : 'audio/wav',
  buffer,
});

async function typeDocument(page: Page, id: string, text: string): Promise<void> {
  await page.goto(`/projects/${id}`);
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
  await expect(syncPill(page)).toHaveAttribute('data-state', 'synced');
}

const sceneRow = (page: Page, sceneId: string) => page.locator(`#row-${sceneId}`);
const toast = (page: Page) => page.locator('.toast');
const tab = (page: Page, name: string) => page.getByRole('tab', { name: new RegExp(`^${name}`) });
// A PC's, an NPC's or a handout's card on the tab shown.
const card = (page: Page, name: string) =>
  page.locator('[role=tabpanel]:not([hidden]) .ent', { has: page.locator('.enm', { hasText: new RegExp(`^${name}$`) }) });
const block = (page: Page, sceneId: string, n: number) => sceneRow(page, sceneId).locator('.ip').nth(n - 1);

test('Claude writes prompts in every category, the drop finds each file its prompt, and the board edits them', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page);
  const claude = await connectClaude(page);
  const { id } = await createProject(page.request, 'Sabaoth per la board');
  await typeDocument(page, id, sabaoth);
  await expect(page.locator('.ol li .id', { hasText: /^S5$/ }).first()).toBeVisible();

  // Prompts through the connector, in every category.
  const board = await claude.tool('get_board', { projectId: id });
  expect(board.appendix).toBe(true);
  expect(board.scenes.map((r: { sceneId: string }) => r.sceneId)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5']);
  await claude.tool('set_scene_prompts', {
    projectId: id,
    sceneId: 'S1',
    image: { prompt: S1_IMAGE },
    music: { title: 'La casa che cede', style: 'dark ambient, slow, low drones, dust, dread', lyrics: LYRICS },
  });
  await claude.tool('set_scene_prompts', {
    projectId: id,
    sceneId: 'S3',
    image: { prompt: S3_IMAGE },
    music: { title: 'Il cordone', style: 'martial, slow, a single snare, cold, oppressive', lyrics: LYRICS },
  });
  await claude.tool('add_image_prompt', { projectId: id, category: 'scene', sceneId: 'S1', prompt: S1_LAMP });
  await claude.tool('add_image_prompt', { projectId: id, category: 'scene', sceneId: 'S4', prompt: S4_IMAGE });
  await claude.tool('add_image_prompt', { projectId: id, category: 'npc', name: 'Padre Anselmo', prompt: ANSELMO });
  const nina = await claude.tool('add_image_prompt', { projectId: id, category: 'npc', name: "Za' Nina", prompt: NINA });
  expect(nina.warnings).toHaveLength(1);
  await claude.tool('add_image_prompt', { projectId: id, category: 'pc', name: 'Rosalia Ferrante', prompt: ROSALIA });
  await claude.tool('add_image_prompt', { projectId: id, category: 'handout', name: 'Lettera di Salvi', prompt: LETTER });

  // The tabs count them.
  await page.goto(`/projects/${id}/board`);
  await expect(page.getByRole('heading', { name: 'Images and music' })).toBeVisible();
  await expect(tab(page, 'Scenes')).toHaveText('Scenes44 wanted');
  await expect(tab(page, 'PCs')).toHaveText('PCs11 wanted');
  await expect(tab(page, 'NPCs')).toHaveText('NPCs22 wanted');
  await expect(tab(page, 'Handouts')).toHaveText('Handouts11 wanted');
  await expect(tab(page, 'Scenes')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.status')).toContainText('5 scenes · 8 image prompts');
  await expect(sceneRow(page, 'S1').locator('.hsum')).toHaveText('2 prompts · 0 chosen');
  await expect(block(page, 'S1', 1).getByText(S1_IMAGE)).toBeVisible();
  await expect(block(page, 'S1', 2).getByText(S1_LAMP)).toBeVisible();
  await expect(block(page, 'S1', 1).locator('.prov')).toContainText('by Claude');
  await expect(sceneRow(page, 'S2').getByText('No image prompts yet. Ask Claude, or write one.')).toBeVisible();

  // The drop, through Add files…: eleven files with their prompt or scene,
  // three without, one of them matching two prompts.
  const uploads: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PUT' && r.url().includes('/files/')) uploads.push(r.url());
  });
  const s1 = [1, 2].map((n) => file(midjourneyName(S1_IMAGE, n), png()));
  const lamp = file(midjourneyName(S1_LAMP, 0), png());
  const s3 = file(midjourneyName(S3_IMAGE, 1), png());
  const anselmo = [0, 1].map((n) => file(midjourneyName(ANSELMO, n), portrait()));
  const rosalia = file(midjourneyName(ROSALIA, 0), portrait());
  const letter = file(midjourneyName(LETTER, 0), png(120, 160));
  const both = file(midjourneyName(NINA, 2, { words: 6 }), portrait());
  const nave = file(midjourneyName(S5_IMAGE, 2, { words: 5 }), png());
  const tracks = [
    file(sunoName('La casa che cede'), wav()),
    file(sunoName('La casa che cede', 1), wav()),
    file(sunoName('Il cordone'), wav()),
  ];
  const untitled = file(sunoName('untitled track'), wav());
  await page
    .locator('.board input[type=file]')
    .setInputFiles([...s1, lamp, s3, ...anselmo, rosalia, letter, both, nave, ...tracks, untitled]);
  const result = page.locator('.info.good');
  await expect(result).toContainText('14 files added: 11 matched, 3 to assign.', { timeout: 30_000 });
  await expect(result).toContainText(
    'S1: 3 images, 2 tracks · S3: 1 image, 1 track · PCs · Rosalia Ferrante: 1 image · NPCs · Padre Anselmo: 2 images · Handouts · Lettera di Salvi: 1 image.',
  );
  // A thumbnail and the original for each image, the bytes of each track.
  expect(uploads).toHaveLength(10 * 2 + 4);
  await expect(block(page, 'S1', 1).locator('.th-i img')).toHaveCount(2);
  await expect(block(page, 'S1', 2).locator('.th-i img')).toHaveCount(1);
  await expect(sceneRow(page, 'S1').locator('.th-i .badge.new')).toHaveCount(3);
  await expect(sceneRow(page, 'S1').locator('.trk-r')).toHaveCount(2);
  for (const name of ['Scenes', 'PCs', 'NPCs', 'Handouts']) await expect(tab(page, name).locator('.nd')).toHaveCount(1);

  // The result line's link opens the tab.
  await result.getByRole('button', { name: 'NPCs · Padre Anselmo' }).click();
  await expect(page).toHaveURL(/\?tab=npcs$/);
  await expect(tab(page, 'NPCs')).toHaveAttribute('aria-selected', 'true');
  await expect(card(page, 'Padre Anselmo').locator('.th-i img')).toHaveCount(2);
  await expect(page.getByText('NPCs belong to the whole adventure, not to a scene.')).toBeVisible();

  // The tray, on every tab: the file matching two prompts names them, and
  // its menu lists them first.
  const tray = page.getByRole('region', { name: 'Unmatched' });
  await expect(tray).toContainText('3 files');
  await expect(tray).toContainText("matches 2 prompts S4 · prompt 1 and NPC · Za' Nina. Pick one.");
  await expect(tray).toContainText('No prompt starts with "a vast cathedral nave flooded".');
  await expect(tray).toContainText('No track title "untitled track".');
  const assign = tray.getByLabel(`Assign ${both.name} to a prompt`);
  await expect(assign.locator('optgroup').first()).toHaveAttribute('label', 'Its name matches');
  await expect(assign.locator('optgroup').first().locator('option')).toHaveText([
    'Scenes · S4 #1 · Portrait of an old Sicilian…',
    "NPCs · Za' Nina",
  ]);
  await assign.selectOption({ label: "NPCs · Za' Nina" });
  await expect(toast(page)).toHaveText("Assigned to NPCs · Za' Nina.");
  await expect(card(page, "Za' Nina").locator('.th-i .badge.new')).toHaveCount(1);
  await expect(tray).toContainText('2 files');

  // An NPC by hand: an empty prompt is refused, then Add.
  await page.getByRole('button', { name: 'Add NPC' }).click();
  await expect(page.getByLabel('Name')).toBeFocused();
  await page.getByLabel('Name').fill('Turi');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(toast(page)).toHaveText('Write the prompt first: its first words are how its images find it.');
  await page.getByLabel('Midjourney prompt for the new NPC').fill(TURI);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(toast(page)).toHaveText('Added NPC · Turi. Copy it into Midjourney.');
  await expect(card(page, 'Turi').locator('.st')).toHaveText('Wanted');
  await expect(tab(page, 'NPCs')).toHaveText(/^NPCs3/);

  // The tab is kept on reload; a name edited by hand.
  await page.reload();
  await expect(tab(page, 'NPCs')).toHaveAttribute('aria-selected', 'true');
  await card(page, 'Turi').getByRole('button', { name: 'Edit' }).click();
  await card(page, 'Turi').getByLabel('Name').fill('Turi Lo Presti');
  await card(page, 'Turi').getByRole('button', { name: 'Save' }).click();
  await expect(toast(page)).toHaveText('Saved.');
  await expect(card(page, 'Turi Lo Presti').locator('.prov')).toContainText('edited by you');

  // Choose per prompt: S1's prompt 1 is Chosen, its prompt 2 still Received.
  await tab(page, 'Scenes').click();
  await expect(page).not.toHaveURL(/tab=/);
  const p1Thumbs = block(page, 'S1', 1).locator('.th-i');
  await p1Thumbs.nth(1).hover();
  await p1Thumbs.nth(1).getByRole('button', { name: 'Choose this image' }).click();
  await expect(p1Thumbs.nth(1)).toHaveClass(/chosen/);
  await expect(block(page, 'S1', 1).locator('.st')).toHaveText('Chosen');
  await expect(block(page, 'S1', 2).locator('.st')).toHaveText('Received');
  await expect(sceneRow(page, 'S1').locator('.hsum')).toHaveText('2 prompts · 1 chosen');

  // The viewer: image 1 of S1's prompt 1 moves to an NPC.
  await p1Thumbs.nth(0).click();
  const viewer = page.getByRole('dialog', { name: 'Image viewer' });
  await expect(viewer).toContainText('1 of 2');
  await expect(viewer).toContainText('S1 · La casa che cede · prompt 1');
  await expect(viewer).toContainText('Another image is chosen');
  await viewer.getByLabel('Move to another prompt').selectOption({ label: 'Turi Lo Presti' });
  await expect(toast(page)).toHaveText('Moved to NPC · Turi Lo Presti.');
  await expect(viewer).toHaveCount(0);
  await expect(p1Thumbs).toHaveCount(1);

  // A second scene prompt by hand.
  await sceneRow(page, 'S2').getByRole('button', { name: 'Add image prompt' }).click();
  await page.getByLabel('Midjourney prompt for S2 · prompt 1').fill('Ruined doctor’s office, 1908, cold dawn light --ar 16:9 --v 8.1');
  await sceneRow(page, 'S2').getByRole('button', { name: 'Add', exact: true }).click();
  await expect(toast(page)).toHaveText('Added S2 · prompt 1. Copy it into Midjourney.');
  await expect(block(page, 'S2', 1).locator('.prov')).toContainText('edited by you');

  // Removing a prompt with images: they wait in the tray.
  await sceneRow(page, 'S1').getByRole('button', { name: 'Remove S1 · prompt 2' }).click();
  const confirm = page.getByRole('dialog', { name: 'Remove this image prompt?' });
  await expect(confirm).toContainText('S1 · La casa che cede · prompt 2 leaves the board.');
  await expect(confirm).toContainText('Its 1 image moves to Unmatched, where you can assign it to another prompt.');
  await confirm.getByRole('button', { name: 'Remove' }).click();
  await expect(toast(page)).toHaveText('Prompt removed. 1 image in Unmatched.');
  await expect(sceneRow(page, 'S1').locator('.ip')).toHaveCount(1);
  await expect(tray).toContainText(`${lamp.name}Image · Its prompt was removed.`);

  // Match again, once S5 has its prompt.
  await claude.tool('add_image_prompt', { projectId: id, category: 'scene', sceneId: 'S5', prompt: S5_IMAGE });
  await expect(sceneRow(page, 'S5').getByText(S5_IMAGE)).toBeVisible();
  await tray.getByRole('button', { name: 'Match again' }).click();
  await expect(toast(page)).toHaveText('1 file found its prompt.');
  await expect(block(page, 'S5', 1).locator('.th-i img')).toHaveCount(1);
  await tray.getByLabel('Assign untitled track.wav to a scene').selectOption('S2');
  await expect(toast(page)).toHaveText("Assigned to S2 · L'ambulatorio di Salvi.");
  await expect(sceneRow(page, 'S2').locator('.trk-r')).toHaveCount(1);

  // The viewer's Remove, then the track menu: take 2 to S4, take 1 removed.
  await p1Thumbs.nth(0).click();
  const removedName = await viewer.locator('.fn').textContent();
  const removed = s1.find((f) => f.name === removedName)!;
  await viewer.getByRole('button', { name: 'Remove' }).click();
  const imageConfirm = page.getByRole('dialog', { name: 'Remove this image?' });
  await expect(imageConfirm).toContainText('Image 1 leaves S1 · La casa che cede · prompt 1.');
  await expect(imageConfirm).toContainText('The file in your Downloads folder is not touched.');
  await imageConfirm.getByRole('button', { name: 'Remove' }).click();
  await expect(toast(page)).toHaveText('Image removed.');
  await expect(viewer).toHaveCount(0);
  await expect(block(page, 'S1', 1).locator('.st')).toHaveText('Wanted');
  const s1Tracks = sceneRow(page, 'S1').locator('.trk-r');
  await sceneRow(page, 'S1').getByRole('button', { name: 'More for take 2' }).click();
  await page.getByRole('menuitem', { name: 'Move to another scene…' }).click();
  await sceneRow(page, 'S1').getByLabel('Move to another scene').selectOption('S4');
  await expect(toast(page)).toHaveText('Moved to S4 · Torre Faro e la canzone.');
  await expect(sceneRow(page, 'S4').locator('.trk-r')).toHaveCount(1);
  await sceneRow(page, 'S1').getByRole('button', { name: 'More for take 1' }).click();
  await page.getByRole('menuitem', { name: 'Remove' }).click();
  const trackConfirm = page.getByRole('dialog', { name: 'Remove this track?' });
  await expect(trackConfirm).toContainText('Take 1 leaves S1 · La casa che cede.');
  await trackConfirm.getByRole('button', { name: 'Remove' }).click();
  await expect(toast(page)).toHaveText('Track removed.');
  await expect(s1Tracks).toHaveCount(0);

  // The removed image dropped again: linked again with no upload.
  const before = uploads.length;
  await page.locator('.board input[type=file]').setInputFiles([removed]);
  await expect(result).toContainText('1 file added: 1 matched, 0 to assign.');
  await expect(block(page, 'S1', 1).locator('.th-i')).toHaveCount(1);
  expect(uploads.length).toBe(before);

  // The export: board.md in four parts, the files by category and prompt.
  await expect(syncPill(page)).toHaveAttribute('data-state', 'synced');
  const exported = await page.request.get(`/api/projects/${id}/export`);
  expect(exported.status()).toBe(200);
  const zip = unzipSync(new Uint8Array(await exported.body()));
  const names = Object.keys(zip);
  const boardMd = names.find((n) => /(^|\/)board\.md$/.test(n))!;
  expect(boardMd).toBeTruthy();
  const md = new TextDecoder().decode(zip[boardMd]);
  for (const line of ['# Scenes', '## S1 · La casa che cede', '### Image prompt 1', '# PCs', '# NPCs', '## Padre Anselmo', '# Handouts']) {
    expect(md).toContain(`${line}\n`);
  }
  expect(md).toContain(ANSELMO);
  const under = (folder: string) => names.filter((n) => n.includes(`/files/${folder}/`) || n.startsWith(`files/${folder}/`));
  expect(under('scenes/S1/1')).toHaveLength(1);
  expect(under('scenes/S3/1')).toHaveLength(1);
  expect(under('scenes/S3/music')).toHaveLength(1);
  expect(under('scenes/S4/music')).toHaveLength(1);
  expect(under('scenes/S5/1')).toHaveLength(1);
  expect(under('npcs/Padre Anselmo')).toHaveLength(2);
  expect(under("npcs/Za' Nina")).toHaveLength(1);
  expect(under('npcs/Turi Lo Presti')).toHaveLength(1);
  expect(under('pcs/Rosalia Ferrante')).toHaveLength(1);
  expect(under('handouts/Lettera di Salvi')).toHaveLength(1);
  expect(under('unmatched').some((n) => n.endsWith(`/${lamp.name}`))).toBe(true);
  const original = under('scenes/S1/1')[0]!;
  expect(Buffer.from(zip[original]!).equals(removed.buffer)).toBe(true);
});

test('a document with no appendix: PCs work, and the board adds the appendix', async ({ page }) => {
  await signIn(page);
  const { id } = await createProject(page.request, 'Senza appendice');
  await typeDocument(
    page,
    id,
    '---\ntitolo: Senza appendice\n---\n## Scene\n\n### S1. Il molo\n\nLuogo e momento: il molo, all’alba.\n\n### S2. La torre\n\nLuogo e momento: la torre, al tramonto.\n',
  );
  await page.goto(`/projects/${id}/board`);
  await expect(page.getByRole('heading', { name: 'No scenes for the board yet' })).toBeVisible();
  await expect(page.getByText('with empty visual: and mood: lines', { exact: false })).toContainText('(S1 to S2)');
  await expect(page.locator('.status')).toContainText('No appendix · 0 image prompts');

  // PCs need no appendix: one added by hand gets its images by name.
  await tab(page, 'PCs').click();
  await expect(page.getByRole('heading', { name: 'No PCs yet' })).toBeVisible();
  await expect(page.getByText('Claude can write them too, from the document: ask for "the PCs of', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Add PC' }).click();
  await page.getByLabel('Name').fill('Rosalia Ferrante');
  await page.getByLabel('Midjourney prompt for the new PC').fill(ROSALIA);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(toast(page)).toHaveText('Added PC · Rosalia Ferrante. Copy it into Midjourney.');
  await page
    .locator('.board input[type=file]')
    .setInputFiles([0, 1, 2, 3].map((n) => file(midjourneyName(ROSALIA, n), portrait())));
  await expect(page.locator('.info.good')).toContainText('4 files added: 4 matched, 0 to assign.', { timeout: 30_000 });
  await expect(card(page, 'Rosalia Ferrante').locator('.th-i img')).toHaveCount(4);
  await expect(card(page, 'Rosalia Ferrante').locator('.thumbs')).toHaveClass(/tall/);

  // The Scenes tab offers the appendix.
  await tab(page, 'Scenes').click();
  await page.getByRole('button', { name: 'Add the appendix' }).click();
  await expect(toast(page)).toHaveText('Appendix added with 2 scenes. Fill in visual: and mood:, or ask Claude.');
  await expect(sceneRow(page, 'S2')).toContainText('La torre');
  await expect(sceneRow(page, 'S1').locator('.srcline').first()).toContainText('visual:empty');
  await expect(page.locator('.status')).toContainText('2 scenes · 1 image prompt');
});

test('Export for CueBard: the summary, then the pack with the chosen files and not the tray', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  const claude = await connectClaude(page);
  const { id, title } = await createProject(page.request, 'Sabaoth per CueBard');
  await typeDocument(page, id, sabaoth);
  await expect(page.locator('.ol li .id', { hasText: /^S5$/ }).first()).toBeVisible();
  await claude.tool('set_scene_prompts', {
    projectId: id,
    sceneId: 'S1',
    image: { prompt: S1_IMAGE },
    music: { title: 'La casa che cede', style: 'dark ambient, slow, low drones, dust, dread', lyrics: LYRICS },
  });
  await claude.tool('set_scene_prompts', {
    projectId: id,
    sceneId: 'S3',
    image: { prompt: S3_IMAGE },
    music: { title: 'Il cordone', style: 'martial, slow, a single snare, cold, oppressive', lyrics: LYRICS },
  });
  await claude.tool('add_image_prompt', { projectId: id, category: 'scene', sceneId: 'S1', prompt: S1_LAMP });
  await claude.tool('add_image_prompt', { projectId: id, category: 'npc', name: 'Padre Anselmo', prompt: ANSELMO });
  await claude.tool('add_image_prompt', { projectId: id, category: 'npc', name: "Za' Nina", prompt: NINA });

  await page.goto(`/projects/${id}/board`);
  const s1 = [1, 2].map((n) => file(midjourneyName(S1_IMAGE, n), png()));
  const lamp = file(midjourneyName(S1_LAMP, 0), png());
  const s3 = file(midjourneyName(S3_IMAGE, 1), png());
  const anselmo = file(midjourneyName(ANSELMO, 0), portrait());
  const s1Tracks = [file(sunoName('La casa che cede'), wav()), file(sunoName('La casa che cede', 1), wav())];
  const s3Track = file(sunoName('Il cordone'), wav());
  const untitled = file(sunoName('untitled track'), wav());
  await page
    .locator('.board input[type=file]')
    .setInputFiles([...s1, lamp, s3, anselmo, ...s1Tracks, s3Track, untitled]);
  await expect(page.locator('.info.good')).toContainText('9 files added: 8 matched, 1 to assign.', { timeout: 30_000 });

  // S1's second image of prompt 1 and its second take are chosen.
  const p1Thumbs = block(page, 'S1', 1).locator('.th-i');
  await p1Thumbs.nth(1).hover();
  await p1Thumbs.nth(1).getByRole('button', { name: 'Choose this image' }).click();
  await expect(p1Thumbs.nth(1)).toHaveClass(/chosen/);
  await p1Thumbs.nth(1).click();
  const viewer = page.getByRole('dialog', { name: 'Image viewer' });
  const chosenImage = (await viewer.locator('.fn').textContent())!;
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);
  const takes = sceneRow(page, 'S1').locator('.trk-r');
  await takes.nth(1).getByRole('button', { name: 'Choose' }).click();
  await expect(takes.nth(1)).toHaveClass(/chosen/);
  const chosenTrack = (await takes.nth(1).locator('.fn').getAttribute('title'))!;
  const otherTrack = (await takes.nth(0).locator('.fn').getAttribute('title'))!;
  await expect(syncPill(page)).toHaveAttribute('data-state', 'synced');

  // The summary: five cue groups, the chosen take and S3's, the images by
  // folder, a warning per gap.
  await page.getByRole('button', { name: 'Export for CueBard…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export for CueBard' });
  await expect(dialog.locator('.xsum')).toContainText('Cue groups5 scenes·2 tracks');
  await expect(dialog.locator('.xsum')).toContainText('Visual foldersScenes 3·PCs 0·NPCs 1·Handouts 0 images');
  await expect(dialog.locator('.xwarn li')).toContainText([
    "S2. L'ambulatorio di Salvi has no track: its cue group is empty.",
    'NPC "Za\' Nina" has no image.',
  ]);
  await expect(dialog).toContainText(`Your browser downloads ${title}.cbpack`);
  await expect(dialog.getByRole('button', { name: 'Export' })).toBeFocused();

  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export' }).click();
  const download = await downloading;
  await expect(dialog).toHaveCount(0);
  await expect(toast(page)).toHaveText(`Downloading ${title}.cbpack.`);
  expect(download.suggestedFilename()).toBe(`${title}.cbpack`);
  const saved = await download.path();
  const bytes = new Uint8Array(await readFile(saved));
  if (process.env.E2E_CUEBARD_OUT) await download.saveAs(`${process.env.E2E_CUEBARD_OUT}/web.cbpack`);
  expect(checkCuebardPack(bytes)).toEqual([]);
  const zip = unzipSync(bytes);
  const names = Object.keys(zip);
  const project = JSON.parse(strFromU8(zip[`${title}.cuebard`]!));
  expect(project.items.map((g: { displayName: string }) => g.displayName.slice(0, 2))).toEqual(['S1', 'S2', 'S3', 'S4', 'S5']);
  // The chosen take alone for S1, the chosen image alone for its prompt 1.
  expect(names).toContain(`media/${chosenTrack}`);
  expect(names).not.toContain(`media/${otherTrack}`);
  expect(names).toContain(`media/${s3Track.name}`);
  const visuals = names.filter((n) => n.startsWith('media/visuals/'));
  expect(visuals).toHaveLength(4);
  expect(visuals.filter((n) => s1.some((f) => n.endsWith(`_${f.name}`)))).toHaveLength(1);
  expect(visuals.some((n) => n.endsWith(`_${chosenImage}`))).toBe(true);
  // The tray's track is not in the pack.
  expect(names.some((n) => n.endsWith(untitled.name))).toBe(false);
  expect(names).not.toContain('left-out.txt');

  // The projects screen's Actions entry opens the same summary.
  await page.goto('/');
  await row(page, title).click();
  const panel = page.getByTestId('panel');
  await panel.locator('summary', { hasText: 'Actions' }).click();
  await panel.getByRole('button', { name: 'Export for CueBard…' }).click();
  await expect(dialog.locator('.xsum')).toContainText('Cue groups5 scenes·2 tracks');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
});

test('Export for CueBard with nothing on the board: Export is off', async ({ page }) => {
  await signIn(page);
  const { id } = await createProject(page.request, 'Senza file');
  await page.goto(`/projects/${id}/board`);
  await page.getByRole('button', { name: 'Export for CueBard…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export for CueBard' });
  await expect(dialog).toContainText('Nothing to export yet: add files to the board first.');
  await expect(dialog.getByRole('button', { name: 'Export' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
