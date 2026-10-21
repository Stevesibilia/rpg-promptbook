import type { FastifyInstance } from 'fastify';
import { addFiles, addImagePrompt, chooseImage, readBoard, readFiles, readImagePrompts, type NewFile } from 'promptbook-project';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createUser, type User } from '../../src/accounts/users.js';
import { check } from '../../src/mcp/edits.js';
import { setDocumentText, withLiveDocument } from '../../src/live.js';
import { loadProjectDoc, storeProjectDoc } from '../../src/projects.js';
import { db, ORIGIN, PASSWORD, signedIn, startApp, steve } from './helpers.js';
import { mcpCallTool, mcpListTools } from './mcp-helpers.js';
import { connect as connectClient, cookie } from './oauth-helpers.js';
import { connect, destroyClients, listen, synced, waitFor } from './sync-helpers.js';

afterEach(destroyClients);

// Three scenes with their appendix rows. The scenes themselves lack most of
// what the template requires, so the document has errors.
const ADVENTURE = [
  '## Scene',
  '',
  '### S1. La casa che cede',
  '',
  '**Luogo e momento:** casa Faraci.',
  '',
  '### S2. Il molo',
  '',
  '### S3. Torre Faro',
  '',
  '## Appendice: immagini e musica',
  '',
  '### S1. La casa che cede',
  '',
  'visual: collapsed 1900s Sicilian library at night',
  '',
  'mood: chaotic, suffocating',
  '',
  '### S2. Il molo',
  '',
  'visual: a pier at dawn',
  '',
  'mood: calm',
  '',
  '### S3. Torre Faro',
  '',
  'visual: a lighthouse',
  '',
  '### S9 senza riga nel documento',
  '',
].join('\n');

const NO_APPENDIX = ['## Scene', '', '### S1. La casa che cede', '', '**Luogo e momento:** casa Faraci.', ''].join('\n');
const CAMPAIGN = ['# La campagna', '', '## Luoghi', '', 'Il porto.', ''].join('\n');

const IMAGE = 'a collapsed library at night, moonlight through the roof, oil painting, dread --ar 16:9 --v 8.1';
const MUSIC = {
  title: 'La casa cede',
  style: 'dark ambient, slow, low drones, detuned piano, oppressive',
  lyrics: '[Intro: low drone]\n[Instrumental]\n[Outro: fade out]\n[End]',
};

const hash = (n: number) => n.toString(16).padStart(64, '0');
// A scene's first image prompt.
const firstPrompt = (doc: Y.Doc, sceneId: string) => readImagePrompts(doc).find((p) => p.sceneId === sceneId);
const file = (n: number, overrides: Partial<NewFile> = {}): NewFile => ({
  sha256: hash(n),
  thumbSha256: hash(1000 + n),
  name: `steve_${n}.png`,
  kind: 'image',
  mime: 'image/png',
  size: 1000,
  width: 1456,
  height: 816,
  duration: null,
  sceneId: null,
  promptId: null,
  matchedBy: 'prompt',
  addedBy: 'user',
  ...overrides,
});

interface Setup {
  app: FastifyInstance;
  user: User;
  session: string;
  id: string;
  token: string;
  call(name: string, args?: Record<string, unknown>): ReturnType<typeof mcpCallTool>;
}

async function newProject(app: FastifyInstance, session: string, user: User, category: string, text: string) {
  const created = await app.inject({
    method: 'POST',
    url: '/api/projects',
    headers: { ...cookie(session), origin: ORIGIN },
    payload: { category, title: "L'Ancora di Sabaoth" },
  });
  const id = created.json().project.id as string;
  await withLiveDocument(app.sync, id, user.id, (doc) => setDocumentText(doc, text));
  return id;
}

async function setup({
  scope = 'read_write',
  category = 'adventure',
  text,
}: { scope?: 'read' | 'read_write'; category?: string; text?: string } = {}): Promise<Setup> {
  const user = await steve();
  const app = await startApp();
  const session = await signedIn(app);
  const id = await newProject(app, session, user, category, text ?? (category === 'campaign' ? CAMPAIGN : ADVENTURE));
  const tokens = await connectClient(app, session, scope);
  const token = tokens.access_token;
  return { app, user, session, id, token, call: (name, args = {}) => mcpCallTool(app, token, name, args) };
}

async function storedDoc(id: string): Promise<Y.Doc> {
  const row = await db.queryOne<{ state: Buffer }>('select state from project_docs where project_id = $1', [id]);
  const doc = new Y.Doc();
  Y.applyUpdate(doc, row!.state);
  return doc;
}

// Every key the board's writes touch.
const boardSize = (doc: Y.Doc) => doc.getMap('board').size + doc.getMap('imagePrompts').size;

const snapshots = (id: string) => db.query('select id from snapshots where project_id = $1', [id]);

describe('the board tools in the list', () => {
  it('lists get_board as a read tool and set_scene_prompts as an idempotent write tool', async () => {
    const s = await setup();
    const tools = await mcpListTools(s.app, s.token);
    expect(tools).toHaveLength(22);
    expect(tools.find((t) => t.name === 'get_board')!.annotations).toMatchObject({
      readOnlyHint: true,
      idempotentHint: true,
      destructiveHint: false,
      openWorldHint: false,
    });
    expect(tools.find((t) => t.name === 'set_scene_prompts')!.annotations).toMatchObject({
      readOnlyHint: false,
      idempotentHint: true,
      destructiveHint: false,
      openWorldHint: false,
    });
    const hints = (name: string) => {
      const a = tools.find((t) => t.name === name)!.annotations!;
      return [a.readOnlyHint, a.idempotentHint, a.destructiveHint, a.openWorldHint];
    };
    expect(hints('add_image_prompt')).toEqual([false, false, false, false]);
    expect(hints('update_image_prompt')).toEqual([false, true, false, false]);
    expect(hints('remove_image_prompt')).toEqual([false, true, true, false]);
  });

  it('teaches the prompt rules in the descriptions', async () => {
    const s = await setup();
    const tools = await mcpListTools(s.app, s.token);
    const write = tools.find((t) => t.name === 'set_scene_prompts')!.description!;
    for (const part of ['--ar 16:9 --v 8.1', '[End]', 'unique in the project', 'English', '4 to 7 descriptors', 'instrumental']) {
      expect(write).toContain(part);
    }
    expect(tools.find((t) => t.name === 'get_board')!.description).toContain('Read it before writing prompts');
    expect(tools.find((t) => t.name === 'get_board')!.description).toContain('Scenes (any number per scene');
    const add = tools.find((t) => t.name === 'add_image_prompt')!.description!;
    for (const part of ['--ar 16:9', '--ar 2:3', 'words no other prompt starts with', 'English', 'PCs, NPCs, Handouts']) {
      expect(add).toContain(part);
    }
    expect(tools.find((t) => t.name === 'remove_image_prompt')!.description).toContain('no file is deleted');
  });
});

describe('get_board', () => {
  it('answers a row per appendix row with the lines, the prompts and the statuses', async () => {
    const s = await setup();
    await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S3', image: { prompt: IMAGE } });
    await withLiveDocument(s.app.sync, s.id, s.user.id, (doc) => {
      const promptId = firstPrompt(doc, 'S3')!.id;
      const of = (n: number) => file(n, { promptId });
      return addFiles(doc, [of(1), of(2), of(3), of(4), file(5, { matchedBy: null })]);
    });
    const outcome = await s.call('get_board', { projectId: s.id });
    expect(outcome.isError).toBe(false);
    const board = outcome.value;
    expect(board.appendix).toBe(true);
    expect(board.unmatched).toBe(1);
    expect(board.duplicateTitles).toEqual([]);
    expect(board.scenes.map((r: { sceneId: string }) => r.sceneId)).toEqual(['S1', 'S2', 'S3']);
    expect(board.scenes[0]).toEqual({
      sceneId: 'S1',
      title: 'La casa che cede',
      visual: 'collapsed 1900s Sicilian library at night',
      mood: 'chaotic, suffocating',
      images: [],
      music: { title: null, style: null, lyrics: null, by: null, at: null, status: 'wanted', tracks: 0 },
    });
    expect(board.scenes[2]).toMatchObject({
      sceneId: 'S3',
      mood: null,
      images: [{ category: 'scene', sceneId: 'S3', number: 1, prompt: IMAGE, by: 'claude', status: 'received', files: 4, chosen: null }],
    });
    expect(board.scenes[2].images[0].id).toBeTruthy();
    expect(board.scenes[2].images[0].at).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect([board.pcs, board.npcs, board.handouts, board.outsideAppendix]).toEqual([[], [], [], []]);
  });

  it('answers appendix false and no rows for a document without an appendix', async () => {
    const s = await setup({ text: NO_APPENDIX });
    expect((await s.call('get_board', { projectId: s.id })).value).toEqual({
      appendix: false,
      scenes: [],
      pcs: [],
      npcs: [],
      handouts: [],
      outsideAppendix: [],
      unmatched: 0,
      duplicateTitles: [],
    });
  });

  it('answers no_board for a campaign, to the read and to the write', async () => {
    const s = await setup({ category: 'campaign' });
    expect((await s.call('get_board', { projectId: s.id })).error?.code).toBe('no_board');
    const write = await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S1', image: { prompt: IMAGE } });
    expect(write.error?.code).toBe('no_board');
    for (const [name, args] of [
      ['add_image_prompt', { category: 'npc', name: 'x', prompt: IMAGE }],
      ['update_image_prompt', { id: 'x', prompt: IMAGE }],
      ['remove_image_prompt', { id: 'x' }],
    ] as const) {
      expect((await s.call(name, { projectId: s.id, ...args })).error?.code, name).toBe('no_board');
    }
  });

  it('lets a read grant read it', async () => {
    const s = await setup({ scope: 'read' });
    expect((await s.call('get_board', { projectId: s.id })).isError).toBe(false);
  });

  it('answers not_found for another user’s project and for one in the bin', async () => {
    const s = await setup();
    const anna = await createUser(db, { username: 'anna', password: PASSWORD, displayName: 'Anna' });
    const annas = await newProject(s.app, await signedIn(s.app, 'anna'), anna, 'adventure', ADVENTURE);
    const binned = await newProject(s.app, s.session, s.user, 'adventure', ADVENTURE);
    await s.app.inject({ method: 'DELETE', url: `/api/projects/${binned}`, headers: { ...cookie(s.session), origin: ORIGIN } });
    for (const projectId of [annas, binned, 'not-an-id']) {
      expect((await s.call('get_board', { projectId })).error?.code, projectId).toBe('not_found');
      const write = await s.call('set_scene_prompts', { projectId, sceneId: 'S1', image: { prompt: IMAGE } });
      expect(write.error?.code, projectId).toBe('not_found');
    }
    expect(boardSize(await storedDoc(annas))).toBe(0);
  });
});

describe('set_scene_prompts', () => {
  it('writes both prompts as Claude, dated now, and answers the row', async () => {
    const s = await setup();
    const before = Date.now();
    const outcome = await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S1', image: { prompt: IMAGE }, music: MUSIC });
    expect(outcome.isError).toBe(false);
    expect(outcome.value.warnings).toEqual([]);
    expect(outcome.value.scene).toMatchObject({
      sceneId: 'S1',
      title: 'La casa che cede',
      images: [{ number: 1, prompt: IMAGE, by: 'claude', status: 'wanted', files: 0 }],
      music: { ...MUSIC, by: 'claude', status: 'wanted', tracks: 0 },
    });
    const stored = await storedDoc(s.id);
    const entry = readBoard(stored).get('S1')!;
    expect(firstPrompt(stored, 'S1')).toMatchObject({ prompt: IMAGE, by: 'claude' });
    expect(entry.music).toMatchObject({ ...MUSIC, by: 'claude' });
    const at = Date.parse(firstPrompt(stored, 'S1')!.at);
    expect(at).toBeGreaterThanOrEqual(before - 1000);
    expect(at).toBeLessThanOrEqual(Date.now() + 1000);
    // What get_board says is what was written.
    const row = (await s.call('get_board', { projectId: s.id })).value.scenes[0];
    expect(row).toEqual(outcome.value.scene);
  });

  it('replaces only the half it is given', async () => {
    const s = await setup();
    await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S1', image: { prompt: IMAGE }, music: MUSIC });
    const music = readBoard(await storedDoc(s.id)).get('S1')!.music!;
    const outcome = await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S1', image: { prompt: 'a new library' } });
    expect(outcome.value.scene.images.map((i: { prompt: string }) => i.prompt)).toEqual(['a new library']);
    expect(outcome.value.scene.music).toMatchObject(MUSIC);
    expect(readBoard(await storedDoc(s.id)).get('S1')!.music).toEqual(music);

    const only = await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S1', music: { ...MUSIC, title: 'Altro titolo' } });
    expect(only.value.scene.images[0].prompt).toBe('a new library');
    expect(only.value.scene.music.title).toBe('Altro titolo');
  });

  it('replaces only the first of two image prompts', async () => {
    const s = await setup();
    await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S3', image: { prompt: 'first' }, music: MUSIC });
    await s.call('add_image_prompt', { projectId: s.id, category: 'scene', sceneId: 'S3', prompt: 'second' });
    const outcome = await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S3', image: { prompt: IMAGE } });
    expect(outcome.value.scene.images.map((i: { number: number; prompt: string }) => [i.number, i.prompt])).toEqual([
      [1, IMAGE],
      [2, 'second'],
    ]);
    expect(outcome.value.scene.music).toMatchObject(MUSIC);
  });

  it('keeps the choices and files of the scene', async () => {
    const s = await setup();
    await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S3', image: { prompt: 'a first text' } });
    await withLiveDocument(s.app.sync, s.id, s.user.id, (doc) => addFiles(doc, [file(1, { promptId: firstPrompt(doc, 'S3')!.id })]));
    await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S3', image: { prompt: IMAGE } });
    expect((await s.call('get_board', { projectId: s.id })).value.scenes[2].images).toMatchObject([
      { prompt: IMAGE, status: 'received', files: 1 },
    ]);
  });

  it('refuses a scene the appendix has no row for, and writes nothing', async () => {
    const s = await setup();
    for (const sceneId of ['S9', 's1', 'S1/image']) {
      const outcome = await s.call('set_scene_prompts', { projectId: s.id, sceneId, image: { prompt: IMAGE } });
      expect(outcome.error?.code, sceneId).toBe('unknown_scene');
    }
    expect((await s.call('set_scene_prompts', { projectId: s.id, sceneId: '', image: { prompt: IMAGE } })).isError).toBe(true);
    const unknown = await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S9', image: { prompt: IMAGE } });
    expect(unknown.error).toMatchObject({ code: 'unknown_scene', field: 'sceneId' });
    expect(unknown.error!.message).toContain('S1, S2, S3');
    expect(boardSize(await storedDoc(s.id))).toBe(0);
  });

  it('refuses a read grant, and writes nothing', async () => {
    const s = await setup({ scope: 'read' });
    const outcome = await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S1', image: { prompt: IMAGE } });
    expect(outcome.error).toMatchObject({ code: 'insufficient_scope', scope_required: 'read_write' });
    expect(boardSize(await storedDoc(s.id))).toBe(0);
  });

  it('refuses texts over the limits and malformed input, and writes nothing', async () => {
    const s = await setup();
    const refused: [string, Record<string, unknown>][] = [
      ['an image prompt over 2000 characters', { image: { prompt: 'x'.repeat(2001) } }],
      ['an empty image prompt', { image: { prompt: '  ' } }],
      ['a title over 120 characters', { music: { ...MUSIC, title: 'x'.repeat(121) } }],
      ['a title on two lines', { music: { ...MUSIC, title: 'uno\ndue' } }],
      ['an empty title', { music: { ...MUSIC, title: '' } }],
      ['a style over 1000 characters', { music: { ...MUSIC, style: 'x'.repeat(1001) } }],
      ['lyrics over 3000 characters', { music: { ...MUSIC, lyrics: 'x'.repeat(3001) } }],
      ['a music half without lyrics', { music: { title: 't', style: 's' } }],
      ['an unknown key in a half', { image: { prompt: IMAGE, by: 'user' } }],
      ['an unknown key', { by: 'user', image: { prompt: IMAGE } }],
      ['neither half', {}],
      ['a prompt that is not text', { image: { prompt: 5 } }],
    ];
    for (const [what, args] of refused) {
      const outcome = await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S1', ...args });
      expect(outcome.isError, what).toBe(true);
    }
    expect(boardSize(await storedDoc(s.id))).toBe(0);
    // The limits themselves are allowed.
    const edge = await s.call('set_scene_prompts', {
      projectId: s.id,
      sceneId: 'S1',
      image: { prompt: 'x'.repeat(2000) },
      music: { title: 'x'.repeat(120), style: 'x'.repeat(1000), lyrics: 'x'.repeat(3000) },
    });
    expect(edge.isError).toBe(false);
  });

  it('writes in a document with errors, and in one with none of the appendix’s checks passing', async () => {
    const s = await setup();
    expect(check(ADVENTURE, 'adventure', new Map(), new Date())!.errors).toBeGreaterThan(1);
    const outcome = await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S1', image: { prompt: IMAGE }, music: MUSIC });
    expect(outcome.isError).toBe(false);
    expect(firstPrompt(await storedDoc(s.id), 'S1')!.prompt).toBe(IMAGE);
  });

  it('writes the prompt of a scene whose appendix row has no visual: line', async () => {
    const s = await setup({
      text: ['## Appendice: immagini e musica', '', '### S1. La casa che cede', '', 'some text', ''].join('\n'),
    });
    const outcome = await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S1', image: { prompt: IMAGE } });
    expect(outcome.isError).toBe(false);
    expect(outcome.value.scene).toMatchObject({ visual: null, mood: null });
  });

  it('warns, and writes, when another scene has the title', async () => {
    const s = await setup();
    await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S3', music: { ...MUSIC, title: 'Ordini del Re' } });
    // Compared as the board matches: no case, no punctuation.
    const outcome = await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S2', music: { ...MUSIC, title: 'ordini del re!' } });
    expect(outcome.isError).toBe(false);
    expect(outcome.value.warnings).toHaveLength(1);
    expect(outcome.value.warnings[0]).toContain('S3');
    expect(outcome.value.warnings[0]).toContain('Give each scene its own title');
    expect(readBoard(await storedDoc(s.id)).get('S2')!.music!.title).toBe('ordini del re!');
    const board = (await s.call('get_board', { projectId: s.id })).value;
    // As the first of the rows writes it.
    expect(board.duplicateTitles).toEqual(['ordini del re!']);
    // An image-only write is not told about a title it did not write.
    const image = await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S2', image: { prompt: IMAGE } });
    expect(image.value.warnings).toEqual([]);
  });

  it('stores no snapshot', async () => {
    const s = await setup();
    await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S1', image: { prompt: IMAGE }, music: MUSIC });
    await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S1', image: { prompt: 'again' } });
    expect(await snapshots(s.id)).toEqual([]);
    expect((await s.app.inject({ method: 'GET', url: `/api/projects/${s.id}/snapshots`, headers: { ...cookie(s.session), origin: ORIGIN } })).json()).toMatchObject(
      { snapshots: [] },
    );
  });

  it('reaches a client that has the project open, without a reload', async () => {
    const s = await setup();
    const url = await listen(s.app);
    const client = connect(url, s.id, { token: s.session });
    await synced(client);
    const text = client.doc.getText('document').toString();
    await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S2', image: { prompt: IMAGE }, music: MUSIC });
    await waitFor(() => readBoard(client.doc).get('S2')?.music?.title === MUSIC.title, 'the board change');
    expect(firstPrompt(client.doc, 'S2')).toMatchObject({ prompt: IMAGE, by: 'claude' });
    // The prep document is not touched.
    expect(client.doc.getText('document').toString()).toBe(text);
  });

  it('counts in the write quota, 120 per grant', async () => {
    const s = await setup();
    for (let i = 0; i < 120; i++) {
      const outcome = await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S1', image: { prompt: `prompt ${i}` } });
      expect(outcome.isError, `write ${i}`).toBe(false);
    }
    const refused = await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S1', image: { prompt: 'one more' } });
    expect(refused.error).toMatchObject({ code: 'rate_limited' });
    expect(firstPrompt(await storedDoc(s.id), 'S1')!.prompt).toBe('prompt 119');
    // Reads go on.
    expect((await s.call('get_board', { projectId: s.id })).isError).toBe(false);
  });
});

const NPC = 'portrait of an old Sicilian priest with a cracked rosary, candlelight, oil painting --ar 2:3 --v 8.1';
const NINA = 'portrait of an old Sicilian fisherwoman singing on the quay at dawn --ar 2:3 --v 8.1';

// The board as v0.6 stored it, written straight to the database while no
// one has the project open: S1's single prompt, its chosen image and two
// images naming their scene.
async function storeV06Board(id: string): Promise<void> {
  const doc = (await loadProjectDoc(db, id))!;
  doc.transact(() => {
    const board = doc.getMap<unknown>('board');
    board.set('S1/image', { prompt: IMAGE, by: 'claude', at: '2026-10-19T09:00:00.000Z' });
    board.set('S1/chosenImage', 'i2');
    for (const n of [1, 2]) {
      const image = new Y.Map<unknown>();
      const { promptId: _, ...fields } = { ...file(n), id: `i${n}`, sceneId: 'S1', addedAt: `2026-10-19T09:0${n}:00.000Z` };
      for (const [key, value] of Object.entries(fields)) image.set(key, value);
      doc.getArray('files').push([image]);
    }
  });
  await storeProjectDoc(db, id, doc);
}

describe('a board from before image categories', () => {
  it('reads as migrated in get_board, for a read grant too, and nothing is written', async () => {
    const s = await setup({ scope: 'read' });
    await storeV06Board(s.id);
    expect(s.app.sync.liveDocument(s.id)).toBeNull();
    const board = (await s.call('get_board', { projectId: s.id })).value;
    expect(board.scenes[0].images).toEqual([
      {
        id: 'legacy-S1',
        category: 'scene',
        sceneId: 'S1',
        number: 1,
        prompt: IMAGE,
        by: 'claude',
        at: '2026-10-19T09:00:00.000Z',
        status: 'chosen',
        files: 2,
        chosen: 'steve_2.png',
      },
    ]);
    const stored = await storedDoc(s.id);
    expect(stored.getMap('board').has('S1/image')).toBe(true);
    expect(stored.getMap('imagePrompts').size).toBe(0);
  });

  it('is migrated before a write: Claude’s text goes to the scene’s prompt 1', async () => {
    const s = await setup();
    await storeV06Board(s.id);
    const outcome = await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S1', image: { prompt: 'a new library' } });
    expect(outcome.value.scene.images).toMatchObject([{ id: 'legacy-S1', prompt: 'a new library', files: 2, chosen: 'steve_2.png' }]);
  });

  it('is migrated in the write when an older client wrote a legacy key to the open document', async () => {
    const s = await setup();
    const url = await listen(s.app);
    const old = connect(url, s.id, { token: s.session });
    await synced(old);
    old.doc.getMap<unknown>('board').set('S2/image', { prompt: 'written by v0.6', by: 'user', at: '2026-10-19T09:00:00.000Z' });
    await waitFor(() => s.app.sync.liveDocument(s.id)?.getMap('board').has('S2/image') ?? false, 'the old client’s write');
    const outcome = await s.call('add_image_prompt', { projectId: s.id, category: 'scene', sceneId: 'S2', prompt: IMAGE });
    expect(outcome.value.prompt).toMatchObject({ sceneId: 'S2', number: 2 });
    const board = (await s.call('get_board', { projectId: s.id })).value;
    expect(board.scenes[1].images.map((i: { id: string; prompt: string }) => [i.id, i.prompt])).toEqual([
      ['legacy-S2', 'written by v0.6'],
      [outcome.value.prompt.id, IMAGE],
    ]);
    await waitFor(() => !old.doc.getMap('board').has('S2/image'), 'the migration to reach the client');
  });
});

describe('add_image_prompt', () => {
  it('adds an NPC as Claude, dated now, that reaches an open client without a reload, with no snapshot', async () => {
    const s = await setup();
    const url = await listen(s.app);
    const client = connect(url, s.id, { token: s.session });
    await synced(client);
    const before = Date.now();
    const outcome = await s.call('add_image_prompt', { projectId: s.id, category: 'npc', name: 'Padre Anselmo', prompt: NPC });
    expect(outcome.isError).toBe(false);
    expect(outcome.value).toMatchObject({
      prompt: { category: 'npc', name: 'Padre Anselmo', number: 1, prompt: NPC, by: 'claude', status: 'wanted', files: 0, chosen: null },
      warnings: [],
    });
    expect(outcome.value.prompt.sceneId).toBeUndefined();
    expect(Date.parse(outcome.value.prompt.at)).toBeGreaterThanOrEqual(before - 1000);
    const id = outcome.value.prompt.id;
    await waitFor(() => readImagePrompts(client.doc).some((p) => p.id === id), 'the new prompt');
    expect((await s.call('get_board', { projectId: s.id })).value.npcs).toEqual([outcome.value.prompt]);
    expect(await snapshots(s.id)).toEqual([]);
  });

  it('adds a second shot of a scene after its first', async () => {
    const s = await setup();
    await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S1', image: { prompt: IMAGE } });
    const outcome = await s.call('add_image_prompt', { projectId: s.id, category: 'scene', sceneId: 'S1', prompt: 'the reading room' });
    expect(outcome.value.prompt).toMatchObject({ sceneId: 'S1', number: 2 });
    const images = (await s.call('get_board', { projectId: s.id })).value.scenes[0].images;
    expect(images.map((i: { number: number; prompt: string }) => [i.number, i.prompt])).toEqual([
      [1, IMAGE],
      [2, 'the reading room'],
    ]);
  });

  it('writes, with a warning, a prompt whose first words another shown prompt has', async () => {
    const s = await setup();
    await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S3', image: { prompt: NINA.replace('--ar 2:3', '--ar 16:9') } });
    const outcome = await s.call('add_image_prompt', {
      projectId: s.id,
      category: 'npc',
      name: 'Za’ Nina',
      prompt: 'portrait of an old Sicilian fisherwoman singing, close up --ar 2:3 --v 8.1',
    });
    expect(outcome.isError).toBe(false);
    expect(outcome.value.warnings).toEqual([
      'S3 · prompt 1 starts with the same words, so Midjourney’s downloads may match both. Start each prompt differently.',
    ]);
    const pc = await s.call('add_image_prompt', { projectId: s.id, category: 'pc', name: 'Rosalia', prompt: 'portrait of a young nurse' });
    expect(pc.value.warnings).toEqual([]);
    // A prompt whose words start another's collides too.
    const short = await s.call('add_image_prompt', { projectId: s.id, category: 'handout', name: 'Foto', prompt: 'portrait of an old' });
    expect(short.value.warnings).toHaveLength(2);
    expect(short.value.warnings.join(' ')).toContain('NPC · Za’ Nina starts with the same words');
  });

  it('refuses a scene with no appendix row and malformed input, writing nothing', async () => {
    const s = await setup();
    const unknown = await s.call('add_image_prompt', { projectId: s.id, category: 'scene', sceneId: 'S9', prompt: IMAGE });
    expect(unknown.error).toMatchObject({ code: 'unknown_scene', field: 'sceneId' });
    expect(unknown.error!.message).toContain('S1, S2, S3');
    // Refused by the tool: invalid_input.
    const mismatched: [string, Record<string, unknown>][] = [
      ['a scene prompt without a scene', { category: 'scene', prompt: IMAGE }],
      ['a scene prompt with a name', { category: 'scene', sceneId: 'S1', name: 'x', prompt: IMAGE }],
      ['an NPC without a name', { category: 'npc', prompt: NPC }],
      ['an NPC with a scene', { category: 'npc', name: 'x', sceneId: 'S1', prompt: NPC }],
    ];
    for (const [what, args] of mismatched) {
      const outcome = await s.call('add_image_prompt', { projectId: s.id, ...args });
      expect(outcome.error?.code, what).toBe('invalid_input');
    }
    // Refused by the input schema.
    const refused: [string, Record<string, unknown>][] = [
      ['a name on two lines', { category: 'pc', name: 'uno\ndue', prompt: NPC }],
      ['a name over 200 characters', { category: 'pc', name: 'x'.repeat(201), prompt: NPC }],
      ['an empty prompt', { category: 'pc', name: 'x', prompt: '  ' }],
      ['a prompt over 2000 characters', { category: 'pc', name: 'x', prompt: 'x'.repeat(2001) }],
      ['an unknown category', { category: 'monster', name: 'x', prompt: NPC }],
      ['an unknown key', { category: 'pc', name: 'x', prompt: NPC, by: 'user' }],
    ];
    for (const [what, args] of refused) {
      const outcome = await s.call('add_image_prompt', { projectId: s.id, ...args });
      expect(outcome.isError, what).toBe(true);
    }
    expect(boardSize(await storedDoc(s.id))).toBe(0);
  });

  it('refuses the 501st prompt', async () => {
    const s = await setup();
    await withLiveDocument(s.app.sync, s.id, s.user.id, (doc) => {
      for (let i = 0; i < 500; i++) addImagePrompt(doc, { category: 'npc', name: `NPC ${i}`, prompt: `npc number ${i}` }, 'user');
    });
    const outcome = await s.call('add_image_prompt', { projectId: s.id, category: 'npc', name: 'One more', prompt: NPC });
    expect(outcome.error).toMatchObject({ code: 'invalid_input' });
    expect(outcome.error!.message).toContain('at most 500');
  });
});

describe('update_image_prompt', () => {
  it('changes the text as Claude, and an NPC’s name, reaching an open client', async () => {
    const s = await setup();
    const added = (await s.call('add_image_prompt', { projectId: s.id, category: 'npc', name: 'Turi', prompt: NPC })).value.prompt;
    const url = await listen(s.app);
    const client = connect(url, s.id, { token: s.session });
    await synced(client);
    const outcome = await s.call('update_image_prompt', { projectId: s.id, id: added.id, prompt: NINA, name: 'Za’ Nina' });
    expect(outcome.value).toEqual({ prompt: { ...added, name: 'Za’ Nina', prompt: NINA, at: outcome.value.prompt.at }, warnings: [] });
    await waitFor(() => readImagePrompts(client.doc)[0]?.name === 'Za’ Nina', 'the change');
    expect(readImagePrompts(client.doc)[0]).toMatchObject({ prompt: NINA, by: 'claude' });
    const renamed = await s.call('update_image_prompt', { projectId: s.id, id: added.id, name: 'Nina' });
    expect(renamed.value.prompt).toMatchObject({ name: 'Nina', prompt: NINA });
    expect(await snapshots(s.id)).toEqual([]);
  });

  it('warns when the new text starts as another prompt does', async () => {
    const s = await setup();
    await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S2', image: { prompt: NINA } });
    const added = (await s.call('add_image_prompt', { projectId: s.id, category: 'npc', name: 'Za’ Nina', prompt: NPC })).value.prompt;
    const outcome = await s.call('update_image_prompt', { projectId: s.id, id: added.id, prompt: NINA });
    expect(outcome.value.warnings).toEqual([
      'S2 · prompt 1 starts with the same words, so Midjourney’s downloads may match both. Start each prompt differently.',
    ]);
  });

  it('refuses an unknown id, a name for a scene prompt, and nothing to change', async () => {
    const s = await setup();
    const scene = (await s.call('add_image_prompt', { projectId: s.id, category: 'scene', sceneId: 'S1', prompt: IMAGE })).value.prompt;
    const unknown = await s.call('update_image_prompt', { projectId: s.id, id: 'no-such-prompt', prompt: IMAGE });
    expect(unknown.error).toMatchObject({ code: 'unknown_prompt', field: 'id' });
    expect(unknown.error!.message).toBe('No image prompt with that id. get_board lists them.');
    expect((await s.call('update_image_prompt', { projectId: s.id, id: scene.id, name: 'x' })).error?.code).toBe('invalid_input');
    expect((await s.call('update_image_prompt', { projectId: s.id, id: scene.id })).error?.code).toBe('invalid_input');
    expect((await s.call('get_board', { projectId: s.id })).value.scenes[0].images).toEqual([scene]);
  });

  it('changes a scene prompt whose scene left the appendix, which get_board lists apart', async () => {
    const s = await setup();
    const id = await withLiveDocument(s.app.sync, s.id, s.user.id, (doc) =>
      addImagePrompt(doc, { category: 'scene', sceneId: 'S7', prompt: 'kept, not shown' }, 'user').id,
    );
    const board = (await s.call('get_board', { projectId: s.id })).value;
    expect(board.outsideAppendix).toMatchObject([{ id, sceneId: 'S7', number: 1, prompt: 'kept, not shown', by: 'user' }]);
    const outcome = await s.call('update_image_prompt', { projectId: s.id, id, prompt: 'still kept' });
    expect(outcome.value.prompt).toMatchObject({ id, prompt: 'still kept', by: 'claude' });
  });
});

describe('remove_image_prompt', () => {
  it('removes a prompt: its images wait in Unmatched, no file is deleted, the client sees it', async () => {
    const s = await setup();
    await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S1', image: { prompt: IMAGE } });
    const second = (await s.call('add_image_prompt', { projectId: s.id, category: 'scene', sceneId: 'S1', prompt: 'the reading room' }))
      .value.prompt;
    await withLiveDocument(s.app.sync, s.id, s.user.id, (doc) => {
      const { added } = addFiles(doc, [1, 2, 3, 4].map((n) => file(n, { promptId: second.id })));
      chooseImage(doc, second.id, added[0]!.id);
    });
    const url = await listen(s.app);
    const client = connect(url, s.id, { token: s.session });
    await synced(client);
    const outcome = await s.call('remove_image_prompt', { projectId: s.id, id: second.id });
    expect(outcome.value).toEqual({ removed: second.id, imagesToUnmatched: 4 });
    const board = (await s.call('get_board', { projectId: s.id })).value;
    expect(board.scenes[0].images.map((i: { prompt: string }) => i.prompt)).toEqual([IMAGE]);
    expect(board.unmatched).toBe(4);
    await waitFor(() => !readImagePrompts(client.doc).some((p) => p.id === second.id), 'the removal');
    expect(readFiles(await storedDoc(s.id))).toHaveLength(4);
    expect(await snapshots(s.id)).toEqual([]);
    const again = await s.call('remove_image_prompt', { projectId: s.id, id: second.id });
    expect(again.error).toMatchObject({ code: 'unknown_prompt' });
  });

  it('refuses a read grant, and the prompt stays', async () => {
    const s = await setup();
    const added = (await s.call('add_image_prompt', { projectId: s.id, category: 'pc', name: 'Rosalia', prompt: NPC })).value.prompt;
    const reader = mcpCallTool.bind(null, s.app, (await connectClient(s.app, s.session, 'read')).access_token);
    for (const [name, args] of [
      ['remove_image_prompt', { id: added.id }],
      ['update_image_prompt', { id: added.id, prompt: 'x' }],
      ['add_image_prompt', { category: 'pc', name: 'x', prompt: 'x' }],
    ] as const) {
      const outcome = await reader(name, { projectId: s.id, ...args });
      expect(outcome.error, name).toMatchObject({ code: 'insufficient_scope', scope_required: 'read_write' });
    }
    expect(readImagePrompts(await storedDoc(s.id))).toMatchObject([{ id: added.id, name: 'Rosalia', prompt: NPC }]);
  });

  it('counts the image prompt tools in the write quota, 120 per grant', async () => {
    const s = await setup();
    const added = (await s.call('add_image_prompt', { projectId: s.id, category: 'pc', name: 'Rosalia', prompt: NPC })).value.prompt;
    for (let i = 1; i < 120; i++) {
      const outcome = await s.call('update_image_prompt', { projectId: s.id, id: added.id, prompt: `prompt ${i}` });
      expect(outcome.isError, `write ${i}`).toBe(false);
    }
    for (const [name, args] of [
      ['remove_image_prompt', { id: added.id }],
      ['update_image_prompt', { id: added.id, prompt: 'x' }],
      ['add_image_prompt', { category: 'pc', name: 'x', prompt: 'x' }],
    ] as const) {
      expect((await s.call(name, { projectId: s.id, ...args })).error, name).toMatchObject({ code: 'rate_limited' });
    }
    expect(readImagePrompts(await storedDoc(s.id))).toMatchObject([{ id: added.id, prompt: 'prompt 119' }]);
  });
});
