import type { FastifyInstance } from 'fastify';
import { addFiles, addImagePrompt, readFiles, type NewFile } from 'promptbook-project';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { User } from '../../src/accounts/users.js';
import { setDocumentText, withLiveDocument } from '../../src/live.js';
import { FAKE_ATELIER_TOKENS, startFakeAtelier, type FakeAtelier } from './fake-atelier.js';
import { png, startFakeOpenRouter, type FakeOpenRouter } from './fake-openrouter.js';
import { db, ORIGIN, signedIn, startApp, steve } from './helpers.js';
import { mcpCallTool, type ToolOutcome } from './mcp-helpers.js';
import { connect as connectClient } from './oauth-helpers.js';

// The connector's image tools (connector-board-images design decisions 6 to
// 10, 15), against the fake Atelier and the fake OpenRouter.

const ADVENTURE = [
  '## Scene',
  '',
  '### S2. Il molo',
  '',
  '## Appendice: immagini e musica',
  '',
  '### S2. Il molo',
  '',
  'visual: a pier at dawn',
  '',
].join('\n');

const CAMPAIGN = ['# La campagna', '', '## Luoghi', '', 'Il porto.', ''].join('\n');

const GOOD = FAKE_ATELIER_TOKENS.good;

let atelier: FakeAtelier;
let openRouter: FakeOpenRouter;
beforeEach(async () => {
  atelier = await startFakeAtelier();
  openRouter = await startFakeOpenRouter();
});
afterEach(async () => {
  await atelier.close();
  await openRouter.close();
});

interface Setup {
  app: FastifyInstance;
  user: User;
  headers: Record<string, string>;
  session: string;
  id: string;
  // S2's prompt 1, and the NPC «Padre Anselmo».
  scene: string;
  npc: string;
  token: string;
  call(name: string, args?: Record<string, unknown>, app?: FastifyInstance): Promise<ToolOutcome>;
}

async function setup({
  token = GOOD as string | null,
  key = null as string | null,
  provider = 'atelier' as 'atelier' | 'openrouter',
  scope = 'read_write' as 'read' | 'read_write',
  category = 'adventure',
  config = {} as Parameters<typeof startApp>[0],
} = {}): Promise<Setup> {
  const user = await steve();
  const app = await startApp({ openRouterBaseUrl: openRouter.baseUrl, atelierUrl: atelier.url, ...config }, { atelierPollMs: 10 });
  const session = await signedIn(app);
  const headers = { cookie: `pb_session=${session}`, origin: ORIGIN };
  const created = await app.inject({ method: 'POST', url: '/api/projects', headers, payload: { category, title: "L'Ancora di Sabaoth" } });
  const id = created.json().project.id as string;
  const ids = await withLiveDocument(app.sync, id, user.id, (doc) => {
    setDocumentText(doc, category === 'campaign' ? CAMPAIGN : ADVENTURE);
    if (category === 'campaign') return { scene: 'none', npc: 'none' };
    return {
      scene: addImagePrompt(doc, { category: 'scene', sceneId: 'S2', prompt: 'a pier at dawn, fog --ar 16:9 --v 8.1' }, 'claude').id,
      npc: addImagePrompt(doc, { category: 'npc', name: 'Padre Anselmo', prompt: 'an old priest, candlelight --ar 2:3 --v 8.1' }, 'claude').id,
    };
  });
  if (token !== null) {
    const saved = await app.inject({ method: 'PUT', url: '/api/image-generation/atelier-token', headers, payload: { token } });
    expect(saved.statusCode).toBe(200);
  }
  if (key !== null) {
    const saved = await app.inject({ method: 'PUT', url: '/api/image-generation/key', headers, payload: { key } });
    expect(saved.statusCode).toBe(200);
  }
  const settings = (await app.inject({ url: '/api/settings', headers })).json();
  const chosen = await app.inject({
    method: 'PUT',
    url: '/api/settings',
    headers,
    payload: { ...settings, imageGeneration: { ...settings.imageGeneration, provider } },
  });
  expect(chosen.statusCode).toBe(200);
  const mcp = (await connectClient(app, session, scope)).access_token;
  atelier.calls.length = 0;
  openRouter.calls.length = 0;
  return {
    app,
    user,
    headers,
    session,
    id,
    token: mcp,
    ...ids,
    call: (name, args = {}, other = app) => mcpCallTool(other, mcp, name, args),
  };
}

const liveFiles = (s: Setup) => withLiveDocument(s.app.sync, s.id, s.user.id, (doc) => readFiles(doc));

const generations = (id: string) => db.query('select id from image_generations where project_id = $1', [id]);

const fileCalls = () => atelier.calls.filter((c) => /^\/api\/v1\/images\/[^/]+\/file$/.test(c.path));

const errorOf = (outcome: ToolOutcome) => [outcome.error?.code, outcome.error?.message];

// Every answer's text and error, for the check that the token is in none.
const texts: string[] = [];
const seen = (outcome: ToolOutcome) => {
  texts.push(outcome.text, JSON.stringify(outcome.error ?? null));
  return outcome;
};

describe('attach_atelier_image (D6, D7, D9)', () => {
  it('attaches a PNG from Atelier to an NPC prompt, as Claude’s, with no model, cost or spending', async () => {
    const s = await setup();
    const bytes = png(1024, 1536, 7);
    const imageId = atelier.addImage(bytes);
    const answer = seen(await s.call('attach_atelier_image', { projectId: s.id, promptId: s.npc, atelierImageId: imageId }));
    expect(answer.isError, answer.text).toBe(false);
    const name = `padre-anselmo-atelier-${imageId.slice(0, 8)}.png`;
    expect(answer.value).toEqual({
      promptId: s.npc,
      atelierImageId: imageId,
      file: { name, mime: 'image/png', size: bytes.length, width: 1024, height: 1536 },
      already: false,
    });
    // Downloaded once, with the token, from Atelier's file route.
    expect(fileCalls()).toEqual([{ method: 'GET', path: `/api/v1/images/${imageId}/file`, body: null, bearer: true }]);
    const [file] = await liveFiles(s);
    expect(file).toMatchObject({
      name,
      kind: 'image',
      mime: 'image/png',
      size: bytes.length,
      width: 1024,
      height: 1536,
      promptId: s.npc,
      matchedBy: 'hand',
      addedBy: 'claude',
      thumbSha256: null,
      generatedModel: null,
      cost: null,
      generatedVia: null,
      atelierImageId: imageId,
    });
    // The blob is stored and linked to the project.
    const linked = await db.query<{ sha256: string }>('select sha256 from project_files where project_id = $1', [s.id]);
    expect(linked.map((r) => r.sha256)).toEqual([file!.sha256]);
    const blob = await s.app.inject({ url: `/api/projects/${s.id}/files/${file!.sha256}`, headers: s.headers });
    expect([blob.statusCode, blob.rawPayload.equals(bytes)]).toEqual([200, true]);
    // Nothing spent.
    expect(await generations(s.id)).toEqual([]);
    expect((await s.app.inject({ url: `/api/projects/${s.id}/image-spending`, headers: s.headers })).json()).toEqual({ images: 0, cost: 0 });
    const status = (await s.app.inject({ url: '/api/image-generation', headers: s.headers })).json();
    expect(status.spending.month).toEqual({ images: 0, cost: 0 });
    // get_board counts it.
    const board = await s.call('get_board', { projectId: s.id });
    expect(board.value.npcs[0]).toMatchObject({ id: s.npc, status: 'received', files: 1 });
  });

  it('says already, and adds nothing, when the same image is attached again', async () => {
    const s = await setup();
    const imageId = atelier.addImage(png(200, 300, 8));
    const first = await s.call('attach_atelier_image', { projectId: s.id, promptId: s.npc, atelierImageId: imageId });
    expect(first.value.already).toBe(false);
    // Again, the id in capitals, onto another prompt: the same bytes.
    const again = await s.call('attach_atelier_image', { projectId: s.id, promptId: s.scene, atelierImageId: imageId.toUpperCase() });
    expect(again.isError, again.text).toBe(false);
    expect(again.value).toMatchObject({ already: true, atelierImageId: imageId, file: { name: first.value.file.name } });
    expect(await liveFiles(s)).toHaveLength(1);
  });

  it('attaches a JPEG to a scene prompt, named after the scene and its number', async () => {
    const s = await setup();
    const { jpeg } = await import('./fake-openrouter.js');
    const imageId = atelier.addImage(jpeg('16:9', 3), 'image/jpeg');
    const answer = await s.call('attach_atelier_image', { projectId: s.id, promptId: s.scene, atelierImageId: imageId });
    expect(answer.isError, answer.text).toBe(false);
    expect(answer.value.file).toMatchObject({ name: `S2-p1-atelier-${imageId.slice(0, 8)}.jpg`, mime: 'image/jpeg' });
  });

  it('attaches whichever provider the account generates through', async () => {
    const s = await setup({ provider: 'openrouter' });
    const imageId = atelier.addImage(png(120, 120, 9));
    const answer = await s.call('attach_atelier_image', { projectId: s.id, promptId: s.npc, atelierImageId: imageId });
    expect(answer.isError, answer.text).toBe(false);
    expect(await liveFiles(s)).toHaveLength(1);
  });
});

describe('attach_atelier_image’s refusals (D10), each leaving the board as it was', () => {
  const unchanged = async (s: Setup) => {
    expect(await liveFiles(s)).toEqual([]);
  };

  it('answers no_atelier_token without a token, or with one that cannot be read', async () => {
    const none = await setup({ token: null });
    const imageId = atelier.addImage(png(50, 50, 1));
    const answer = seen(await none.call('attach_atelier_image', { projectId: none.id, promptId: none.npc, atelierImageId: imageId }));
    expect(errorOf(answer)).toEqual(['no_atelier_token', 'Add your Atelier API token in Promptbook’s Settings first.']);
    await unchanged(none);
    // The same database, another secrets key: the saved token cannot be read.
    await db.query('truncate users cascade');
    const s = await setup();
    const rotated = await startApp({ openRouterBaseUrl: openRouter.baseUrl, atelierUrl: atelier.url, secretsKey: Buffer.alloc(32, 99) });
    const unreadable = seen(await s.call('attach_atelier_image', { projectId: s.id, promptId: s.npc, atelierImageId: imageId }, rotated));
    expect(errorOf(unreadable)).toEqual(['no_atelier_token', 'Add your Atelier API token in Promptbook’s Settings first.']);
    expect(fileCalls()).toEqual([]);
    await unchanged(s);
  });

  it('answers not_configured and atelier_unavailable as refusals a model can read', async () => {
    const s = await setup();
    const imageId = atelier.addImage(png(50, 50, 2));
    const args = { projectId: s.id, promptId: s.npc, atelierImageId: imageId };
    const noKey = await startApp({ openRouterBaseUrl: openRouter.baseUrl, atelierUrl: atelier.url, secretsKey: null });
    expect(errorOf(seen(await s.call('attach_atelier_image', args, noKey)))).toEqual([
      'not_configured',
      'This server is not set up for image generation.',
    ]);
    const noAtelier = await startApp({ openRouterBaseUrl: openRouter.baseUrl, atelierUrl: null });
    expect(errorOf(seen(await s.call('attach_atelier_image', args, noAtelier)))).toEqual([
      'atelier_unavailable',
      'This server has no Atelier address.',
    ]);
    expect(fileCalls()).toEqual([]);
    await unchanged(s);
  });

  it('answers quota, before the download, without room for the largest image', async () => {
    // 0.03 GB is less than the 40 MiB an image may be.
    const s = await setup({ config: { filesQuotaGb: 0.03 } });
    const imageId = atelier.addImage(png(50, 50, 3));
    const answer = seen(await s.call('attach_atelier_image', { projectId: s.id, promptId: s.npc, atelierImageId: imageId }));
    expect(errorOf(answer)).toEqual(['quota', 'Your files have reached their quota.']);
    expect(fileCalls()).toEqual([]);
    await unchanged(s);
  });

  it('answers atelier_image_not_found for an id Atelier does not know', async () => {
    const s = await setup();
    const answer = seen(
      await s.call('attach_atelier_image', { projectId: s.id, promptId: s.npc, atelierImageId: '52f9552c-0000-4000-8000-000000000000' }),
    );
    expect(errorOf(answer)).toEqual(['atelier_image_not_found', 'Atelier has no image with this id.']);
    await unchanged(s);
  });

  it('answers token_rejected when Atelier rejects the saved token', async () => {
    const s = await setup();
    const imageId = atelier.addImage(png(50, 50, 4));
    atelier.answerNext(401, { error: 'invalid_token', message: 'The API token is missing, unknown, revoked or expired.' });
    const answer = seen(await s.call('attach_atelier_image', { projectId: s.id, promptId: s.npc, atelierImageId: imageId }));
    expect(errorOf(answer)).toEqual(['token_rejected', 'Atelier rejected the saved token. Replace it in Settings.']);
    await unchanged(s);
  });

  it('answers atelier_unreachable, atelier_bad_answer and atelier_refused as they are', async () => {
    const s = await setup();
    const imageId = atelier.addImage(png(50, 50, 5));
    const args = { projectId: s.id, promptId: s.npc, atelierImageId: imageId };
    // An address nothing answers on.
    const gone = await startApp({ openRouterBaseUrl: openRouter.baseUrl, atelierUrl: 'http://127.0.0.1:9' });
    expect(errorOf(seen(await s.call('attach_atelier_image', args, gone)))).toEqual(['atelier_unreachable', 'Atelier did not answer.']);
    // An answer past the image size limit.
    atelier.answerNext(200, 'x'.repeat(40 * 1024 * 1024 + 1));
    expect(errorOf(seen(await s.call('attach_atelier_image', args)))).toEqual([
      'atelier_bad_answer',
      'Atelier sent an answer Promptbook cannot read.',
    ]);
    // A refusal Atelier did not word.
    atelier.answerNext(500, 'oops');
    expect(errorOf(seen(await s.call('attach_atelier_image', args)))).toEqual([
      'atelier_refused',
      'Atelier refused the request (500).',
    ]);
    // A refusal Atelier worded itself.
    atelier.answerNext(403, { error: 'insufficient_scope', message: 'This token is read only.' });
    expect(errorOf(seen(await s.call('attach_atelier_image', args)))).toEqual([
      'atelier_refused',
      'Atelier refused: this token is read only.',
    ]);
    await unchanged(s);
  });

  it('answers unsupported_type for a file that is not a PNG, JPEG or WebP', async () => {
    const s = await setup();
    const imageId = atelier.addImage(Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'latin1'), 'image/gif');
    const answer = seen(await s.call('attach_atelier_image', { projectId: s.id, promptId: s.npc, atelierImageId: imageId }));
    expect(errorOf(answer)).toEqual(['unsupported_type', 'That Atelier file is not a PNG, JPEG or WebP image.']);
    await unchanged(s);
  });

  it('answers board_full when the board holds 2000 files', async () => {
    const s = await setup();
    const hash = (n: number) => n.toString(16).padStart(64, '0');
    const filler = (n: number): NewFile => ({
      sha256: hash(n),
      thumbSha256: null,
      name: `steve_${n}.png`,
      kind: 'image',
      mime: 'image/png',
      size: 1000,
      width: 10,
      height: 10,
      duration: null,
      sceneId: null,
      promptId: null,
      matchedBy: null,
      addedBy: 'user',
    });
    await withLiveDocument(s.app.sync, s.id, s.user.id, (doc) => addFiles(doc, Array.from({ length: 2000 }, (_, i) => filler(i + 1))));
    const imageId = atelier.addImage(png(50, 50, 6));
    const answer = seen(await s.call('attach_atelier_image', { projectId: s.id, promptId: s.npc, atelierImageId: imageId }));
    expect(errorOf(answer)).toEqual(['board_full', 'The board is full.']);
    const files = await liveFiles(s);
    expect(files).toHaveLength(2000);
    expect(files.some((f) => f.atelierImageId !== null)).toBe(false);
  });

  it('answers unknown_prompt before Atelier is called', async () => {
    const s = await setup();
    const imageId = atelier.addImage(png(50, 50, 7));
    const answer = seen(await s.call('attach_atelier_image', { projectId: s.id, promptId: 'no-such-prompt', atelierImageId: imageId }));
    expect(answer.error?.code).toBe('unknown_prompt');
    expect(atelier.calls).toEqual([]);
    await unchanged(s);
  });

  it('answers no_board on a campaign', async () => {
    const s = await setup({ category: 'campaign' });
    const imageId = atelier.addImage(png(50, 50, 8));
    const answer = seen(await s.call('attach_atelier_image', { projectId: s.id, promptId: 'any', atelierImageId: imageId }));
    expect(answer.error?.code).toBe('no_board');
    expect(atelier.calls).toEqual([]);
  });

  it('answers insufficient_scope to a read grant', async () => {
    const s = await setup({ scope: 'read' });
    const imageId = atelier.addImage(png(50, 50, 9));
    const answer = seen(await s.call('attach_atelier_image', { projectId: s.id, promptId: s.npc, atelierImageId: imageId }));
    expect(answer.error?.code).toBe('insufficient_scope');
    expect(atelier.calls).toEqual([]);
    await unchanged(s);
  });

  it('refuses an id that is not a uuid', async () => {
    const s = await setup();
    const answer = seen(await s.call('attach_atelier_image', { projectId: s.id, promptId: s.npc, atelierImageId: '../token' }));
    expect(answer.isError).toBe(true);
    expect(atelier.calls).toEqual([]);
  });

  it('puts the token in no answer and no error', () => {
    expect(texts.length).toBeGreaterThan(10);
    for (const text of texts) {
      expect(text).not.toContain(GOOD);
      expect(text).not.toContain('atl_pat_');
    }
  });
});

const OPENROUTER_KEY = 'sk-or-v1-good';

const rows = (id: string) =>
  db.query<{ prompt_id: string; model: string; cost: string | null; ok: boolean; provider: string }>(
    'select prompt_id, model, cost, ok, provider from image_generations where project_id = $1 order by created_at',
    [id],
  );

async function setChoice(s: Setup, model: 'gpt' | 'nb', count: number) {
  const settings = (await s.app.inject({ url: '/api/settings', headers: s.headers })).json();
  const saved = await s.app.inject({
    method: 'PUT',
    url: '/api/settings',
    headers: s.headers,
    payload: { ...settings, imageGeneration: { ...settings.imageGeneration, model, count } },
  });
  expect(saved.statusCode).toBe(200);
}

const routeGenerate = (s: Setup, promptId: string) =>
  s.app.inject({
    method: 'POST',
    url: `/api/projects/${s.id}/image-prompts/${promptId}/generate`,
    headers: s.headers,
    payload: { model: 'nb', count: 1, shape: '1:1' },
  });

const allDone = (s: Setup) => Promise.all([...s.app.generationRuns.values()].map((r) => r.done));

describe('generate_image (D3, D4, D5)', () => {
  it('generates two images through OpenRouter, as Claude’s, and answers them', async () => {
    const s = await setup({ token: null, key: OPENROUTER_KEY, provider: 'openrouter' });
    const answer = await s.call('generate_image', { projectId: s.id, promptId: s.scene, model: 'gpt', count: 2, shape: '3:2' });
    expect(answer.isError, answer.text).toBe(false);
    const { jobId, images, ...rest } = answer.value;
    expect(rest).toEqual({
      promptId: s.scene,
      provider: 'openrouter',
      model: 'gpt',
      count: 2,
      shape: '3:2',
      state: 'finished',
      failed: 0,
      error: null,
    });
    expect(typeof jobId).toBe('string');
    expect(images).toEqual([
      { name: 'S2-p1-gpt-1.png', width: 150, height: 100, cost: 0.04, atelierImageId: null },
      { name: 'S2-p1-gpt-2.png', width: 150, height: 100, cost: 0.04, atelierImageId: null },
    ]);
    const files = await liveFiles(s);
    expect(files.map((f) => [f.promptId, f.matchedBy, f.addedBy, f.generatedModel])).toEqual([
      [s.scene, 'generated', 'claude', 'gpt'],
      [s.scene, 'generated', 'claude', 'gpt'],
    ]);
    expect((await rows(s.id)).map((r) => [r.prompt_id, r.model, Number(r.cost), r.ok, r.provider])).toEqual([
      [s.scene, 'gpt', 0.04, true, 'openrouter'],
      [s.scene, 'gpt', 0.04, true, 'openrouter'],
    ]);
    const board = await s.call('get_board', { projectId: s.id });
    expect(board.value.scenes[0].images[0]).toMatchObject({ status: 'received', files: 2, generating: false, generationError: null });
  });

  it('generates two images through Atelier, with their Atelier ids', async () => {
    const s = await setup();
    const answer = await s.call('generate_image', { projectId: s.id, promptId: s.npc, model: 'nb', count: 2 });
    expect(answer.isError, answer.text).toBe(false);
    expect(answer.value).toMatchObject({ provider: 'atelier', model: 'nb', count: 2, shape: '2:3', state: 'finished', failed: 0, error: null });
    const ids = atelier.generations[0]!.images.map((i) => i.id);
    expect(answer.value.images).toEqual([
      { name: 'padre-anselmo-nb-1.png', width: 100, height: 150, cost: 0.037, atelierImageId: ids[0] },
      { name: 'padre-anselmo-nb-2.png', width: 100, height: 150, cost: 0.037, atelierImageId: ids[1] },
    ]);
    expect((await liveFiles(s)).map((f) => f.addedBy)).toEqual(['claude', 'claude']);
    expect((await rows(s.id)).map((r) => [r.model, r.ok, r.provider])).toEqual([
      ['nb', true, 'atelier'],
      ['nb', true, 'atelier'],
    ]);
  });

  it('takes the model and count from the settings, the shape as the panel picks it', async () => {
    const s = await setup({ token: null, key: OPENROUTER_KEY, provider: 'openrouter' });
    await setChoice(s, 'nb', 3);
    const pc = await withLiveDocument(s.app.sync, s.id, s.user.id, (doc) =>
      addImagePrompt(doc, { category: 'pc', name: 'Rosalia', prompt: 'a young sailor, salt wind' }, 'user').id,
    );
    // A PC prompt with no --ar: the category's 2:3.
    const answer = await s.call('generate_image', { projectId: s.id, promptId: pc });
    expect(answer.value).toMatchObject({ model: 'nb', count: 3, shape: '2:3', state: 'finished' });
    expect(openRouter.calls.filter((c) => c.method === 'POST').map((c) => (c.body as { model: string }).model)).toEqual([
      'google/gemini-nano-banana-2.1',
      'google/gemini-nano-banana-2.1',
      'google/gemini-nano-banana-2.1',
    ]);
    // A scene prompt's own --ar 16:9.
    await setChoice(s, 'gpt', 1);
    const scene = await s.call('generate_image', { projectId: s.id, promptId: s.scene });
    expect(scene.value).toMatchObject({ model: 'gpt', count: 1, shape: '16:9' });
  });

  it('answers running with waitSeconds 0, and the job still finishes', async () => {
    const s = await setup({ token: null, key: OPENROUTER_KEY, provider: 'openrouter' });
    openRouter.setDelay(300);
    const answer = await s.call('generate_image', { projectId: s.id, promptId: s.scene, count: 2, waitSeconds: 0 });
    expect(answer.value).toMatchObject({ state: 'running', images: [], failed: 0, error: null });
    const during = await s.call('get_board', { projectId: s.id });
    expect(during.value.scenes[0].images[0]).toMatchObject({ generating: true, files: 0 });
    await s.app.generationRuns.get(answer.value.jobId)?.done;
    const after = await s.call('get_board', { projectId: s.id });
    expect(after.value.scenes[0].images[0]).toMatchObject({ generating: false, generationError: null, files: 2 });
  });

  it('answers the job’s error, and get_board says it after a failed job', async () => {
    const s = await setup({ token: null, key: OPENROUTER_KEY, provider: 'openrouter' });
    openRouter.failNext(500);
    const answer = await s.call('generate_image', { projectId: s.id, promptId: s.scene, count: 1 });
    expect(answer.value).toMatchObject({
      state: 'finished',
      images: [],
      failed: 1,
      error: 'OpenRouter did not answer. Try again. Nothing was charged.',
    });
    const board = await s.call('get_board', { projectId: s.id });
    expect(board.value.scenes[0].images[0]).toMatchObject({
      generating: false,
      generationError: 'OpenRouter did not answer. Try again. Nothing was charged.',
    });
  });
});

describe('generate_image’s refusals (D10), each starting nothing', () => {
  const nothingStarted = (s: Setup) => {
    expect(s.app.generationRuns.size).toBe(0);
    expect(openRouter.calls.filter((c) => c.method === 'POST')).toEqual([]);
  };

  it('answers no_key without the provider’s key', async () => {
    const s = await setup({ token: null, provider: 'openrouter' });
    const answer = await s.call('generate_image', { projectId: s.id, promptId: s.scene });
    expect(errorOf(answer)).toEqual(['no_key', 'Add your OpenRouter key first.']);
    nothingStarted(s);
  });

  it('answers unknown_prompt and prompt_empty', async () => {
    const s = await setup({ token: null, key: OPENROUTER_KEY, provider: 'openrouter' });
    expect((await s.call('generate_image', { projectId: s.id, promptId: 'no-such-prompt' })).error?.code).toBe('unknown_prompt');
    const flagsOnly = await withLiveDocument(s.app.sync, s.id, s.user.id, (doc) =>
      addImagePrompt(doc, { category: 'pc', name: 'Rosalia', prompt: '  --ar 2:3 --v 8.1' }, 'user').id,
    );
    expect(errorOf(await s.call('generate_image', { projectId: s.id, promptId: flagsOnly }))).toEqual([
      'prompt_empty',
      'The prompt has no text to send.',
    ]);
    nothingStarted(s);
  });

  it('answers busy while the board’s Generate runs on the prompt', async () => {
    const s = await setup({ token: null, key: OPENROUTER_KEY, provider: 'openrouter' });
    openRouter.setDelay(500);
    expect((await routeGenerate(s, s.scene)).statusCode).toBe(202);
    const answer = await s.call('generate_image', { projectId: s.id, promptId: s.scene });
    expect(errorOf(answer)).toEqual(['busy', 'Images are already being generated for this prompt.']);
    expect(s.app.generationRuns.size).toBe(1);
    await allDone(s);
  });

  it('answers too_many_jobs counting the board’s and the connector’s jobs together', async () => {
    const s = await setup({ token: null, key: OPENROUTER_KEY, provider: 'openrouter' });
    const more = await withLiveDocument(s.app.sync, s.id, s.user.id, (doc) =>
      ['a', 'b'].map((n) => addImagePrompt(doc, { category: 'pc', name: `PC ${n}`, prompt: `a portrait ${n}` }, 'user').id),
    );
    openRouter.setDelay(1500);
    expect((await routeGenerate(s, s.scene)).statusCode).toBe(202);
    expect((await routeGenerate(s, s.npc)).statusCode).toBe(202);
    const third = await s.call('generate_image', { projectId: s.id, promptId: more[0]!, count: 1, waitSeconds: 0 });
    expect(third.value).toMatchObject({ state: 'running' });
    const fourth = await s.call('generate_image', { projectId: s.id, promptId: more[1]!, count: 1, waitSeconds: 0 });
    expect(errorOf(fourth)).toEqual(['too_many_jobs', 'Three generations are already running. Wait for one to finish.']);
    // And the board's Generate counts the connector's job.
    expect((await routeGenerate(s, more[1]!)).json().error).toBe('too_many_jobs');
    openRouter.setDelay(0);
    await allDone(s);
  });

  it('answers quota, not_configured and atelier_unavailable as refusals a model can read', async () => {
    // 0.03 GB: less than two images' 20 MB each.
    const s = await setup({ token: null, key: OPENROUTER_KEY, provider: 'openrouter', config: { filesQuotaGb: 0.03 } });
    expect(errorOf(await s.call('generate_image', { projectId: s.id, promptId: s.scene, count: 2 }))).toEqual([
      'quota',
      'Your files have reached their quota.',
    ]);
    const noKey = await startApp({ openRouterBaseUrl: openRouter.baseUrl, atelierUrl: atelier.url, secretsKey: null });
    expect(errorOf(await s.call('generate_image', { projectId: s.id, promptId: s.scene }, noKey))).toEqual([
      'not_configured',
      'This server is not set up for image generation.',
    ]);
    nothingStarted(s);
    await db.query('truncate users cascade');
    const a = await setup({ provider: 'atelier' });
    const noAtelier = await startApp({ openRouterBaseUrl: openRouter.baseUrl, atelierUrl: null });
    expect(errorOf(await a.call('generate_image', { projectId: a.id, promptId: a.scene }, noAtelier))).toEqual([
      'atelier_unavailable',
      'This server has no Atelier address.',
    ]);
    expect(atelier.calls).toEqual([]);
  });

  it('answers insufficient_scope to a read grant', async () => {
    const s = await setup({ token: null, key: OPENROUTER_KEY, provider: 'openrouter', scope: 'read' });
    expect((await s.call('generate_image', { projectId: s.id, promptId: s.scene })).error?.code).toBe('insufficient_scope');
    nothingStarted(s);
  });
});
