import type { FastifyInstance } from 'fastify';
import { addFiles, readBoard, readImagePrompts, type NewFile } from 'promptbook-project';
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { createUser, type User } from '../../src/accounts/users.js';
import { check } from '../../src/mcp/edits.js';
import { setDocumentText, withLiveDocument } from '../../src/live.js';
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

const snapshots = (id: string) => db.query('select id from snapshots where project_id = $1', [id]);

describe('the board tools in the list', () => {
  it('lists get_board as a read tool and set_scene_prompts as an idempotent write tool', async () => {
    const s = await setup();
    const tools = await mcpListTools(s.app, s.token);
    expect(tools).toHaveLength(19);
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
  });

  it('teaches the prompt rules in the descriptions', async () => {
    const s = await setup();
    const tools = await mcpListTools(s.app, s.token);
    const write = tools.find((t) => t.name === 'set_scene_prompts')!.description!;
    for (const part of ['--ar 16:9 --v 8.1', '[End]', 'unique in the project', 'English', '4 to 7 descriptors', 'instrumental']) {
      expect(write).toContain(part);
    }
    expect(tools.find((t) => t.name === 'get_board')!.description).toContain('Read it before writing prompts');
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
    expect(board.rows.map((r: { sceneId: string }) => r.sceneId)).toEqual(['S1', 'S2', 'S3']);
    expect(board.rows[0]).toEqual({
      sceneId: 'S1',
      title: 'La casa che cede',
      visual: 'collapsed 1900s Sicilian library at night',
      mood: 'chaotic, suffocating',
      image: { prompt: null, by: null, at: null, status: 'wanted', files: 0 },
      music: { title: null, style: null, lyrics: null, by: null, at: null, status: 'wanted', tracks: 0 },
    });
    expect(board.rows[2]).toMatchObject({
      sceneId: 'S3',
      mood: null,
      image: { prompt: IMAGE, by: 'claude', status: 'received', files: 4 },
    });
    expect(board.rows[2].image.at).toMatch(/^\d{4}-\d\d-\d\dT/);
  });

  it('answers appendix false and no rows for a document without an appendix', async () => {
    const s = await setup({ text: NO_APPENDIX });
    expect((await s.call('get_board', { projectId: s.id })).value).toEqual({
      appendix: false,
      rows: [],
      unmatched: 0,
      duplicateTitles: [],
    });
  });

  it('answers no_board for a campaign, to the read and to the write', async () => {
    const s = await setup({ category: 'campaign' });
    expect((await s.call('get_board', { projectId: s.id })).error?.code).toBe('no_board');
    const write = await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S1', image: { prompt: IMAGE } });
    expect(write.error?.code).toBe('no_board');
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
    expect(readBoard(await storedDoc(annas)).size).toBe(0);
  });
});

describe('set_scene_prompts', () => {
  it('writes both prompts as Claude, dated now, and answers the row', async () => {
    const s = await setup();
    const before = Date.now();
    const outcome = await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S1', image: { prompt: IMAGE }, music: MUSIC });
    expect(outcome.isError).toBe(false);
    expect(outcome.value.warnings).toEqual([]);
    expect(outcome.value.row).toMatchObject({
      sceneId: 'S1',
      title: 'La casa che cede',
      image: { prompt: IMAGE, by: 'claude', status: 'wanted', files: 0 },
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
    const row = (await s.call('get_board', { projectId: s.id })).value.rows[0];
    expect(row).toEqual(outcome.value.row);
  });

  it('replaces only the half it is given', async () => {
    const s = await setup();
    await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S1', image: { prompt: IMAGE }, music: MUSIC });
    const music = readBoard(await storedDoc(s.id)).get('S1')!.music!;
    const outcome = await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S1', image: { prompt: 'a new library' } });
    expect(outcome.value.row.image.prompt).toBe('a new library');
    expect(outcome.value.row.music).toMatchObject(MUSIC);
    expect(readBoard(await storedDoc(s.id)).get('S1')!.music).toEqual(music);

    const only = await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S1', music: { ...MUSIC, title: 'Altro titolo' } });
    expect(only.value.row.image.prompt).toBe('a new library');
    expect(only.value.row.music.title).toBe('Altro titolo');
  });

  it('keeps the choices and files of the scene', async () => {
    const s = await setup();
    await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S3', image: { prompt: 'a first text' } });
    await withLiveDocument(s.app.sync, s.id, s.user.id, (doc) => addFiles(doc, [file(1, { promptId: firstPrompt(doc, 'S3')!.id })]));
    await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S3', image: { prompt: IMAGE } });
    expect((await s.call('get_board', { projectId: s.id })).value.rows[2].image).toMatchObject({ status: 'received', files: 1 });
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
    expect(readBoard(await storedDoc(s.id)).size).toBe(0);
  });

  it('refuses a read grant, and writes nothing', async () => {
    const s = await setup({ scope: 'read' });
    const outcome = await s.call('set_scene_prompts', { projectId: s.id, sceneId: 'S1', image: { prompt: IMAGE } });
    expect(outcome.error).toMatchObject({ code: 'insufficient_scope', scope_required: 'read_write' });
    expect(readBoard(await storedDoc(s.id)).size).toBe(0);
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
    expect(readBoard(await storedDoc(s.id)).size).toBe(0);
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
    expect(check(ADVENTURE, 'adventure')!.errors).toBeGreaterThan(1);
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
    expect(outcome.value.row).toMatchObject({ visual: null, mood: null });
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
