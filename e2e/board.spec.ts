import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { connectClaude } from './claude.js';
import { createProject, signIn, syncPill } from './helpers.js';
import { midjourneyName, png, sunoName, wav } from './media.js';

// The images and music board in the browser (asset-board design decision
// 18): Claude writes prompts through the connector, the board shows them,
// the files dropped find their scene by name, the rest wait in the tray;
// choosing, the viewer, the track menu, editing by hand, a file dropped
// again, Add the appendix, and the export.

const sabaoth = await readFile(
  new URL('../packages/format/fixtures/l-ancora-di-sabaoth.converted.md', import.meta.url),
  'utf8',
);

const S1_IMAGE = 'Collapsed library at night in 1908 Messina, broken beams, books buried in dust, oil lamp light --ar 16:9 --v 8.1';
const S3_IMAGE = 'Soldiers in 1908 Italian uniforms standing still among cathedral ruins, smoke, grey sky --ar 16:9 --v 8.1';
const S5_IMAGE = 'A vast cathedral nave flooded with seawater under a twisting sky, a bronze anchor --ar 16:9 --v 8.1';
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

test('Claude writes the prompts, the drop finds each file its scene, and the board edits them', async ({ page }) => {
  await signIn(page);
  const claude = await connectClaude(page);
  const { id } = await createProject(page.request, 'Sabaoth per la board');
  await typeDocument(page, id, sabaoth);
  await expect(page.locator('.ol li .id', { hasText: /^S5$/ }).first()).toBeVisible();

  // Prompts through the connector.
  const board = await claude.tool('get_board', { projectId: id });
  expect(board.appendix).toBe(true);
  expect(board.rows.map((r: { sceneId: string }) => r.sceneId)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5']);
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

  await page.goto(`/projects/${id}/board`);
  await expect(page.getByRole('heading', { name: 'Images and music' })).toBeVisible();
  await expect(sceneRow(page, 'S1').getByText(S1_IMAGE)).toBeVisible();
  await expect(sceneRow(page, 'S1').locator('.prov').first()).toContainText('by Claude');
  await expect(sceneRow(page, 'S2').getByText('No Midjourney prompt yet. Ask Claude, or write one.')).toBeVisible();

  // The drop, through Add files…: eight files with their scene, two without.
  const uploads: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PUT' && r.url().includes('/files/')) uploads.push(r.url());
  });
  const s1 = [1, 2, 3, 4].map((n) => file(midjourneyName(S1_IMAGE, n), png()));
  const s3 = file(midjourneyName(S3_IMAGE, 1), png());
  const nave = file(midjourneyName(S5_IMAGE, 2, { words: 5 }), png());
  const tracks = [
    file(sunoName('La casa che cede'), wav()),
    file(sunoName('La casa che cede', 1), wav()),
    file(sunoName('Il cordone'), wav()),
  ];
  const untitled = file(sunoName('untitled track'), wav());
  await page.locator('.board input[type=file]').setInputFiles([...s1, s3, nave, ...tracks, untitled]);
  const result = page.locator('.info.good');
  await expect(result).toContainText('10 files added: 8 matched, 2 to assign.', { timeout: 30_000 });
  await expect(result).toContainText('S1: 4 images, 2 tracks');
  await expect(result).toContainText('S3: 1 image, 1 track');
  // A thumbnail and the original for each image, the bytes of each track.
  expect(uploads).toHaveLength(6 * 2 + 4);
  await expect(sceneRow(page, 'S1').locator('.th-i img')).toHaveCount(4);
  await expect(sceneRow(page, 'S1').locator('.th-i .badge.new')).toHaveCount(4);
  await expect(sceneRow(page, 'S1').locator('.trk-r')).toHaveCount(2);

  // The tray: Match again once S5 has its prompt, then by hand.
  const tray = page.getByRole('region', { name: 'Unmatched' });
  await expect(tray).toContainText('2 files');
  await expect(tray).toContainText('No prompt starts with "a vast cathedral nave flooded".');
  await expect(tray).toContainText('No track title "untitled track".');
  await claude.tool('set_scene_prompts', { projectId: id, sceneId: 'S5', image: { prompt: S5_IMAGE } });
  await expect(sceneRow(page, 'S5').getByText(S5_IMAGE)).toBeVisible();
  await tray.getByRole('button', { name: 'Match again' }).click();
  await expect(toast(page)).toHaveText('1 file found its scene.');
  await expect(sceneRow(page, 'S5').locator('.th-i img')).toHaveCount(1);
  await tray.getByLabel('Assign untitled track.wav to a scene').selectOption('S2');
  await expect(toast(page)).toHaveText("Assigned to S2 · L'ambulatorio di Salvi.");
  await expect(tray).toHaveCount(0);
  await expect(sceneRow(page, 'S2').locator('.trk-r')).toHaveCount(1);

  // Choose an image from its badge.
  const s1Thumbs = sceneRow(page, 'S1').locator('.th-i');
  await s1Thumbs.nth(1).hover();
  await s1Thumbs.nth(1).getByRole('button', { name: 'Choose this image' }).click();
  await expect(s1Thumbs.nth(1)).toHaveClass(/chosen/);
  await expect(sceneRow(page, 'S1').locator('.st').first()).toHaveText('Chosen');

  // The viewer: move image 4 to S4, then remove image 3.
  await s1Thumbs.nth(3).click();
  const viewer = page.getByRole('dialog', { name: 'Image viewer' });
  await expect(viewer).toContainText('4 of 4');
  await expect(viewer).toContainText("the prompt's first words");
  await viewer.getByLabel('Move to another scene').selectOption('S4');
  await expect(toast(page)).toHaveText('Moved to S4 · Torre Faro e la canzone.');
  await expect(viewer).toHaveCount(0);
  await expect(sceneRow(page, 'S4').locator('.th-i img')).toHaveCount(1);
  await s1Thumbs.nth(2).click();
  const removedName = await viewer.locator('.fn').textContent();
  const removed = s1.find((f) => f.name === removedName)!;
  await viewer.getByRole('button', { name: 'Remove' }).click();
  const confirm = page.getByRole('dialog', { name: 'Remove this image?' });
  await expect(confirm).toContainText('Image 3 leaves S1 · La casa che cede.');
  await expect(confirm).toContainText('The file in your Downloads folder is not touched.');
  await confirm.getByRole('button', { name: 'Remove' }).click();
  await expect(toast(page)).toHaveText('Image removed.');
  await expect(s1Thumbs).toHaveCount(2);
  await viewer.getByRole('button', { name: 'Close' }).click();
  await expect(viewer).toHaveCount(0);

  // The track menu: take 2 to S4, then take 1 removed.
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

  // A prompt by hand.
  await sceneRow(page, 'S2').getByRole('button', { name: 'Write by hand' }).first().click();
  await page.getByLabel('Midjourney prompt for S2').fill('Ruined doctor’s office, 1908, cold dawn light --ar 16:9 --v 8.1');
  await sceneRow(page, 'S2').getByRole('button', { name: 'Save' }).click();
  await expect(toast(page)).toHaveText('Saved.');
  await expect(sceneRow(page, 'S2').locator('.prov').first()).toContainText('edited by you');

  // The removed image dropped again: linked again with no upload.
  const before = uploads.length;
  await page.locator('.board input[type=file]').setInputFiles([removed]);
  await expect(result).toContainText('1 file added: 1 matched, 0 to assign.');
  await expect(s1Thumbs).toHaveCount(3);
  expect(uploads.length).toBe(before);

  // The export holds board.md and the files, by scene.
  await expect(syncPill(page)).toHaveAttribute('data-state', 'synced');
  const exported = await page.request.get(`/api/projects/${id}/export`);
  expect(exported.status()).toBe(200);
  const zip = unzipSync(new Uint8Array(await exported.body()));
  const names = Object.keys(zip);
  const boardMd = names.find((n) => /(^|\/)board\.md$/.test(n))!;
  expect(boardMd).toBeTruthy();
  const md = new TextDecoder().decode(zip[boardMd]);
  expect(md).toContain('## S1 · La casa che cede');
  expect(md).toContain(S1_IMAGE);
  expect(md).toContain('Chosen: ');
  const s1Files = names.filter((n) => /(^|\/)files\/S1\//.test(n));
  expect(s1Files).toHaveLength(3);
  expect(names.filter((n) => /(^|\/)files\/S4\//.test(n))).toHaveLength(2);
  expect(names.some((n) => n.endsWith(`files/S2/${untitled.name}`))).toBe(true);
  const original = s1.find((f) => s1Files.some((n) => n.endsWith(`/${f.name}`)))!;
  expect(Buffer.from(zip[s1Files.find((n) => n.endsWith(`/${original.name}`))!]!).equals(original.buffer)).toBe(true);
});

test('a document with no appendix gets one from the board', async ({ page }) => {
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
  await expect(page.getByRole('button', { name: 'Add files…' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add the appendix' }).click();
  await expect(toast(page)).toHaveText('Appendix added with 2 scenes. Fill in visual: and mood:, or ask Claude.');
  await expect(sceneRow(page, 'S2')).toContainText('La torre');
  await expect(sceneRow(page, 'S1').locator('.srcline').first()).toContainText('visual:empty');
});
