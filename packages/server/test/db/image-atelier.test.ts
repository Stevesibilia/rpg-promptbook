import type { FastifyInstance } from 'fastify';
import { addImagePrompt, readFiles, readGenerationJobs, sentPrompt } from 'promptbook-project';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type * as Y from 'yjs';
import type { User } from '../../src/accounts/users.js';
import { saveSecret } from '../../src/images/secrets.js';
import { setDocumentText, withLiveDocument } from '../../src/live.js';
import { loadProjectDoc } from '../../src/projects.js';
import { ATELIER_SENTENCES, FAKE_ATELIER_TOKENS, startFakeAtelier, type FakeAtelier } from './fake-atelier.js';
import { startFakeOpenRouter, type FakeOpenRouter } from './fake-openrouter.js';
import { capturedLog, db, ORIGIN, signedIn, startApp, steve, TEST_SECRETS_KEY } from './helpers.js';

// Atelier as a second image provider (atelier-image-provider D5, D7 to D12),
// against the fake Atelier and the fake OpenRouter.

const ADVENTURE = ['## Scene', '', '### S2. Il molo', '', '## Appendice: immagini e musica', '', '### S2. Il molo', '', 'visual: a pier at dawn', ''].join(
  '\n',
);
const CATHEDRAL =
  'collapsed cathedral facade, soldiers in 1908 Italian uniforms standing perfectly still among the ruins, survivors kneeling in rows, smoke and grey sky, desaturated --ar 3:2 --v 8.1 --no text, letters, modern buildings';
const GOOD = FAKE_ATELIER_TOKENS.good;
const READ = FAKE_ATELIER_TOKENS.read;
const OPENROUTER_KEY = 'sk-or-v1-good';
const NB = 'google/gemini-nano-banana-2.1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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
  id: string;
  prompt: string;
}

async function setup({
  token = GOOD as string | null,
  key = null as string | null,
  provider = 'atelier' as 'atelier' | 'openrouter',
  config = {} as Parameters<typeof startApp>[0],
  options = {} as Parameters<typeof startApp>[1],
  title = "L'Ancora di Sabaoth",
} = {}): Promise<Setup> {
  const user = await steve();
  const app = await startApp({ openRouterBaseUrl: openRouter.baseUrl, atelierUrl: atelier.url, ...config }, { atelierPollMs: 10, ...options });
  const headers = { cookie: `pb_session=${await signedIn(app)}`, origin: ORIGIN };
  const created = await app.inject({ method: 'POST', url: '/api/projects', headers, payload: { category: 'adventure', title } });
  const id = created.json().project.id as string;
  const prompt = await withLiveDocument(app.sync, id, user.id, (doc) => {
    setDocumentText(doc, ADVENTURE);
    return addImagePrompt(doc, { category: 'scene', sceneId: 'S2', prompt: CATHEDRAL }, 'claude').id;
  });
  if (token !== null) expect((await saveToken(app, headers, token)).statusCode).toBe(200);
  if (key !== null) {
    expect((await app.inject({ method: 'PUT', url: '/api/image-generation/key', headers, payload: { key } })).statusCode).toBe(200);
  }
  await choose(app, headers, provider);
  atelier.calls.length = 0;
  openRouter.calls.length = 0;
  return { app, user, headers, id, prompt };
}

const saveToken = (app: FastifyInstance, headers: Record<string, string>, token: unknown) =>
  app.inject({ method: 'PUT', url: '/api/image-generation/atelier-token', headers, payload: { token } as object });
const removeToken = (app: FastifyInstance, headers: Record<string, string>) =>
  app.inject({ method: 'DELETE', url: '/api/image-generation/atelier-token', headers });
const status = async (app: FastifyInstance, headers: Record<string, string>, check = false) =>
  (await app.inject({ url: `/api/image-generation${check ? '?check=1' : ''}`, headers })).json();

async function choose(app: FastifyInstance, headers: Record<string, string>, provider: 'atelier' | 'openrouter') {
  const settings = (await app.inject({ url: '/api/settings', headers })).json();
  const saved = await app.inject({
    method: 'PUT',
    url: '/api/settings',
    headers,
    payload: { ...settings, imageGeneration: { ...settings.imageGeneration, provider } },
  });
  expect(saved.statusCode).toBe(200);
}

const generate = (s: Setup, body: unknown = { model: 'nb', count: 2, shape: '3:2' }, id = s.id) =>
  s.app.inject({ method: 'POST', url: `/api/projects/${id}/image-prompts/${s.prompt}/generate`, headers: s.headers, payload: body as object });

async function generated(s: Setup, body?: unknown, id = s.id): Promise<string> {
  const response = await generate(s, body, id);
  expect(response.statusCode, response.body).toBe(202);
  const { jobId } = response.json() as { jobId: string };
  await s.app.generationRuns.get(jobId)?.done;
  return jobId;
}

const stored = async (id: string): Promise<Y.Doc> => (await loadProjectDoc(db, id))!;

const rows = (id: string) =>
  db.query<{ model: string; cost: string | null; ok: boolean; error: string | null; provider: string }>(
    `select model, cost, ok, error, provider from image_generations where project_id = $1 order by created_at, ok desc`,
    [id],
  );

const refused = (response: { statusCode: number; json(): unknown }) => [response.statusCode, (response.json() as { error: string }).error];

// The job's error left on the document, null when it finished without one.
const jobError = async (id: string) => readGenerationJobs(await stored(id)).at(0)?.error ?? null;

describe('the Atelier token (D8)', () => {
  it('answers 503 not_configured without the secrets key, then 503 atelier_unavailable without ATELIER_URL', async () => {
    const off = await setup({ token: null, provider: 'openrouter', config: { secretsKey: null } });
    expect(refused(await saveToken(off.app, off.headers, GOOD))).toEqual([503, 'not_configured']);
    expect(refused(await removeToken(off.app, off.headers))).toEqual([503, 'not_configured']);
    await db.query('truncate users cascade');
    const none = await setup({ token: null, provider: 'openrouter', config: { atelierUrl: null } });
    const response = await saveToken(none.app, none.headers, GOOD);
    expect(response.json()).toEqual({ error: 'atelier_unavailable', message: 'This server has no Atelier address.' });
    expect(response.statusCode).toBe(503);
    expect(atelier.calls).toEqual([]);
  });

  it('refuses what is not an Atelier token, without asking Atelier', async () => {
    const s = await setup({ token: null, provider: 'openrouter' });
    for (const token of ['', '   ', 'sk-or-v1-good', `atl_pat_${'x'.repeat(200)}`, 42, null]) {
      const response = await saveToken(s.app, s.headers, token);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'invalid', message: 'This is not an Atelier API token.' });
    }
    const extra = await s.app.inject({ method: 'PUT', url: '/api/image-generation/atelier-token', headers: s.headers, payload: { token: GOOD, name: 'x' } });
    expect(refused(extra)).toEqual([400, 'invalid']);
    expect(atelier.calls).toEqual([]);
  });

  it('saves a write token after checking it, sealed, and answers its details', async () => {
    const s = await setup({ token: null, provider: 'openrouter' });
    const response = await saveToken(s.app, s.headers, `  ${GOOD}\n`);
    expect(response.statusCode).toBe(200);
    expect(response.json().atelier).toMatchObject({
      available: true,
      url: atelier.url,
      token: {
        hint: 'good',
        name: 'promptbook',
        expiresAt: '2027-11-12T09:00:00.000Z',
        month: { spent: 4.12, cap: 20 },
        estimates: { gpt: 0.083, nb: 0.037 },
      },
    });
    expect(response.json().atelier.error).toBeUndefined();
    const secrets = await db.query<{ kind: string; hint: string; ciphertext: Buffer }>('select kind, hint, ciphertext from user_secrets');
    expect(secrets.map((r) => [r.kind, r.hint])).toEqual([['atelier', 'good']]);
    expect(secrets[0]!.ciphertext.toString('utf8')).not.toContain(GOOD);
    expect(atelier.calls.map((c) => c.path).sort()).toEqual(['/api/v1/models', '/api/v1/spend', '/api/v1/token']);
  });

  it('stores nothing for a read-only token, a rejected one or no answer, and keeps the old token', async () => {
    const s = await setup({ token: null, provider: 'openrouter' });
    const read = await saveToken(s.app, s.headers, READ);
    expect(read.statusCode).toBe(400);
    expect(read.json()).toEqual({ error: 'token_read_only', message: 'This token is read only. Make one with Generate + read in Atelier.' });
    const rejected = await saveToken(s.app, s.headers, 'atl_pat_0000000000000000bad1');
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json()).toEqual({ error: 'token_rejected', message: 'Atelier rejected this token.' });
    expect(await db.query('select 1 from user_secrets')).toEqual([]);

    expect((await saveToken(s.app, s.headers, GOOD)).statusCode).toBe(200);
    atelier.answerNext(503, { error: 'restarting', message: 'Atelier is restarting.' });
    const busy = await saveToken(s.app, s.headers, 'atl_pat_another_one_0000');
    expect(busy.statusCode).toBe(502);
    expect(busy.json()).toEqual({ error: 'atelier_unreachable', message: 'Atelier did not answer. Nothing was saved.' });
    const unreachable = await startApp({ atelierUrl: 'http://127.0.0.1:9' });
    expect(refused(await saveToken(unreachable, s.headers, 'atl_pat_another_one_0000'))).toEqual([502, 'atelier_unreachable']);
    expect((await db.query<{ hint: string }>('select hint from user_secrets')).map((r) => r.hint)).toEqual(['good']);
  });

  it('removes the token', async () => {
    const s = await setup({ provider: 'openrouter' });
    const response = await removeToken(s.app, s.headers);
    expect(response.statusCode).toBe(204);
    expect(await db.query('select 1 from user_secrets')).toEqual([]);
    expect((await status(s.app, s.headers)).atelier).toEqual({ available: true, url: atelier.url, token: null });
  });
});

describe('the status (D8)', () => {
  it('says Atelier is not available without ATELIER_URL, and asks Atelier nothing', async () => {
    const s = await setup({ token: null, provider: 'openrouter', config: { atelierUrl: null } });
    await saveSecret(db, TEST_SECRETS_KEY, s.user.id, 'atelier', GOOD);
    const answer = await status(s.app, s.headers, true);
    expect(answer.provider).toBe('openrouter');
    expect(answer.atelier).toMatchObject({ available: false, url: null, token: { hint: 'good', name: null, month: null } });
    expect(atelier.calls).toEqual([]);
  });

  it('answers the saved token without asking Atelier, and checks it with ?check=1', async () => {
    const s = await setup();
    const plain = await status(s.app, s.headers);
    expect(plain.provider).toBe('atelier');
    expect(plain.atelier.token).toMatchObject({ hint: 'good', name: null, expiresAt: null, month: null, estimates: null });
    expect(atelier.calls).toEqual([]);

    await db.query("update user_secrets set checked_at = now() - interval '1 day'");
    const checked = await status(s.app, s.headers, true);
    expect(checked.atelier.token).toMatchObject({
      hint: 'good',
      name: 'promptbook',
      expiresAt: '2027-11-12T09:00:00.000Z',
      month: { spent: 4.12, cap: 20 },
      estimates: { gpt: 0.083, nb: 0.037 },
    });
    expect(Date.parse(checked.atelier.token.checkedAt)).toBeGreaterThan(Date.now() - 60_000);
    expect(checked.atelier.error).toBeUndefined();
  });

  it('checks both credentials that exist', async () => {
    const s = await setup({ key: OPENROUTER_KEY });
    const checked = await status(s.app, s.headers, true);
    expect(checked.key).toMatchObject({ hint: 'good', limitRemaining: 9.5 });
    expect(checked.atelier.token.name).toBe('promptbook');
    expect(openRouter.calls.map((c) => c.path)).toEqual(['/api/v1/key']);
  });

  it('names what is wrong with the token, leaving the details null', async () => {
    const s = await setup();
    atelier.answerNext(401, { error: 'invalid_token', message: ATELIER_SENTENCES.invalidToken });
    expect((await status(s.app, s.headers, true)).atelier).toMatchObject({
      error: 'token_rejected',
      token: { hint: 'good', name: null, expiresAt: null, month: null, estimates: null },
    });
    atelier.answerNext(500, 'oops');
    expect((await status(s.app, s.headers, true)).atelier.error).toBe('atelier_unreachable');

    await saveSecret(db, TEST_SECRETS_KEY, s.user.id, 'atelier', READ);
    expect((await status(s.app, s.headers, true)).atelier).toMatchObject({ error: 'token_read_only', token: { hint: 'read', name: null } });

    const rotated = await startApp({ atelierUrl: atelier.url, secretsKey: Buffer.alloc(32, 99) });
    expect((await status(rotated, s.headers)).atelier).toEqual({ available: true, url: atelier.url, token: null, error: 'token_unreadable' });
  });
});

describe('the generate route through Atelier (D9)', () => {
  it('answers 503 not_configured, 503 atelier_unavailable, then 409 no_key', async () => {
    const off = await setup({ token: null, config: { secretsKey: null } });
    expect(refused(await generate(off))).toEqual([503, 'not_configured']);
    await db.query('truncate users cascade');
    const none = await setup({ token: null, config: { atelierUrl: null } });
    expect(refused(await generate(none))).toEqual([503, 'atelier_unavailable']);
    await db.query('truncate users cascade');
    // An OpenRouter key does not count when Atelier is chosen.
    const noToken = await setup({ token: null, key: OPENROUTER_KEY });
    const response = await generate(noToken);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'no_key', message: 'Add your Atelier API token first.' });
    expect(atelier.calls).toEqual([]);
    expect(openRouter.calls).toEqual([]);
  });

  it('generates through the provider chosen, OpenRouter by default', async () => {
    const s = await setup({ key: OPENROUTER_KEY, provider: 'openrouter' });
    await generated(s, { model: 'gpt', count: 1, shape: '1:1' });
    expect(atelier.calls).toEqual([]);
    expect(readFiles(await stored(s.id))).toMatchObject([{ generatedVia: 'openrouter', atelierImageId: null }]);
    expect((await rows(s.id)).map((r) => r.provider)).toEqual(['openrouter']);
  });
});

describe('generating through Atelier (D7, D10)', () => {
  it('lands every image of one Atelier generation, filed into the project’s collection', async () => {
    const s = await setup();
    await generated(s);
    expect(atelier.generations).toHaveLength(1);
    const [generation] = atelier.generations;
    expect(atelier.collections).toHaveLength(1);
    const [collection] = atelier.collections;
    expect(collection!.name).toBe("L'Ancora di Sabaoth");
    expect(atelier.calls.find((c) => c.method === 'POST' && c.path === '/api/v1/generations')!.body).toEqual({
      prompt: sentPrompt(CATHEDRAL).text,
      model: NB,
      aspectRatio: '3:2',
      count: 2,
      collectionId: collection!.id,
    });

    const files = readFiles(await stored(s.id));
    expect(files.map((f) => [f.name, f.generatedModel, f.cost, f.generatedVia, f.matchedBy, f.promptId])).toEqual([
      ['S2-p1-nb-1.png', 'nb', 0.037, 'atelier', 'generated', s.prompt],
      ['S2-p1-nb-2.png', 'nb', 0.037, 'atelier', 'generated', s.prompt],
    ]);
    expect(files.map((f) => f.atelierImageId)).toEqual(generation!.images.map((i) => i.id));
    expect(files.every((f) => UUID.test(f.atelierImageId!))).toBe(true);
    expect(collection!.imageIds).toEqual(generation!.images.map((i) => i.id));
    expect((await rows(s.id)).map((r) => [r.model, Number(r.cost), r.ok, r.error, r.provider])).toEqual([
      ['nb', 0.037, true, null, 'atelier'],
      ['nb', 0.037, true, null, 'atelier'],
    ]);
    expect(await jobError(s.id)).toBeNull();
    expect(readGenerationJobs(await stored(s.id))).toEqual([]);
    expect(await db.query('select collection_id from atelier_collections')).toEqual([{ collection_id: collection!.id }]);
  });

  it('records the provider on the running job', async () => {
    const s = await setup();
    atelier.setDelay(200);
    const response = await generate(s, { model: 'gpt', count: 1, shape: '1:1' });
    const { jobId } = response.json() as { jobId: string };
    expect(readGenerationJobs(await stored(s.id))).toMatchObject([{ id: jobId, provider: 'atelier', model: 'gpt', count: 1 }]);
    await s.app.generationRuns.get(jobId)?.done;
  });

  it('reuses the project’s collection, and makes it again when Atelier no longer has it', async () => {
    const s = await setup();
    await generated(s, { model: 'gpt', count: 1, shape: '1:1' });
    await generated(s, { model: 'gpt', count: 1, shape: '1:1' });
    expect(atelier.collections).toHaveLength(1);
    expect(atelier.calls.filter((c) => c.method === 'POST' && c.path === '/api/v1/collections')).toHaveLength(1);
    const first = atelier.collections[0]!.id;

    atelier.dropCollection(first);
    atelier.calls.length = 0;
    await generated(s, { model: 'gpt', count: 1, shape: '1:1' });
    expect(atelier.calls.map((c) => [c.method, c.path]).slice(0, 3)).toEqual([
      ['POST', '/api/v1/generations'],
      ['POST', '/api/v1/collections'],
      ['POST', '/api/v1/generations'],
    ]);
    expect(atelier.collections).toHaveLength(1);
    const again = atelier.collections[0]!;
    expect(again.id).not.toBe(first);
    expect(again.name).toBe("L'Ancora di Sabaoth");
    expect(await db.query('select collection_id from atelier_collections')).toEqual([{ collection_id: again.id }]);
    expect(readFiles(await stored(s.id))).toHaveLength(3);
  });

  it('finds a collection of the same name in any letter case, and names one after an empty title', async () => {
    const s = await setup({ title: 'Il Faro' });
    atelier.collections.push({ id: '9b1d6c2a-3e4f-4a5b-8c7d-0e1f2a3b4c5d', name: 'IL FARO', imageIds: [] });
    await generated(s, { model: 'gpt', count: 1, shape: '1:1' });
    expect(atelier.collections).toHaveLength(1);
    expect(atelier.generations[0]!.collectionId).toBe('9b1d6c2a-3e4f-4a5b-8c7d-0e1f2a3b4c5d');
  });

  it('fails the missing images with Atelier’s reasons', async () => {
    const s = await setup();
    atelier.failNext(1, 'The model refused this prompt.');
    await generated(s);
    expect(readFiles(await stored(s.id))).toHaveLength(1);
    expect(await jobError(s.id)).toBe('1 of 2 images failed: The model refused this prompt.');
    expect((await rows(s.id)).map((r) => [r.ok, r.error, r.provider])).toEqual([
      [true, null, 'atelier'],
      [false, 'The model refused this prompt.', 'atelier'],
    ]);

    // None arrives, at no cost: nothing was charged.
    atelier.failNext(2, 'The model sent no image.');
    await generated(s);
    expect(await jobError(s.id)).toBe('The model sent no image. Nothing was charged.');
  });

  it('puts what Atelier billed beyond its images on the first failed row', async () => {
    const s = await setup();
    atelier.failNext(1, 'The model sent no image.', 0.02);
    await generated(s, { model: 'gpt', count: 1, shape: '1:1' });
    expect(await jobError(s.id)).toBe('The model sent no image.');
    expect((await rows(s.id)).map((r) => [r.ok, Number(r.cost), r.error])).toEqual([[false, 0.02, 'The model sent no image.']]);
  });

  it('fails every image with Atelier’s sentence when the cap is reached, and adds none', async () => {
    const s = await setup();
    atelier.capReached();
    await generated(s);
    expect(readFiles(await stored(s.id))).toEqual([]);
    // Atelier's own answer, said to be Atelier's (D10, step 1).
    const refused =
      'Atelier refused: this would pass your monthly cap of $20.00 ($19.96 spent). Raise the cap in Settings or wait for next month.';
    expect(await jobError(s.id)).toBe(`${refused} Nothing was charged.`);
    expect((await rows(s.id)).map((r) => [r.ok, r.cost, r.error, r.provider])).toEqual([
      [false, null, refused, 'atelier'],
      [false, null, refused, 'atelier'],
    ]);
  });

  it('says Atelier refused when its polls answer Atelier’s own error', async () => {
    const s = await setup();
    atelier.setDelay(1000);
    const response = await generate(s, { model: 'gpt', count: 1, shape: '1:1' });
    const { jobId } = response.json() as { jobId: string };
    for (let i = 0; i < 100 && atelier.generations.length === 0; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    // The generation is gone from Atelier: each poll answers its 404.
    atelier.generations.splice(0);
    await s.app.generationRuns.get(jobId)?.done;
    expect(await jobError(s.id)).toBe('Atelier refused: Generation not found.');
  });

  it('stops when the token is removed, without saying nothing was charged (D10.6), and switches to OpenRouter (D5)', async () => {
    const s = await setup({ key: OPENROUTER_KEY });
    atelier.setDelay(300);
    const response = await generate(s);
    const { jobId } = response.json() as { jobId: string };
    // The OpenRouter key's removal leaves an Atelier job alone.
    await s.app.inject({ method: 'PUT', url: '/api/image-generation/key', headers: s.headers, payload: { key: OPENROUTER_KEY } });
    expect((await removeToken(s.app, s.headers)).statusCode).toBe(204);
    await s.app.generationRuns.get(jobId)?.done;
    expect(await jobError(s.id)).toBe('The Atelier token was removed.');
    expect((await rows(s.id)).map((r) => [r.ok, r.cost, r.error])).toEqual([
      [false, null, 'The Atelier token was removed.'],
      [false, null, 'The Atelier token was removed.'],
    ]);
    const after = await status(s.app, s.headers);
    expect(after.provider).toBe('openrouter');
    expect((await s.app.inject({ url: '/api/settings', headers: s.headers })).json().imageGeneration.provider).toBe('openrouter');
  });

  it('keeps Atelier chosen when the token goes and no OpenRouter key works', async () => {
    const s = await setup();
    expect((await removeToken(s.app, s.headers)).statusCode).toBe(204);
    expect((await status(s.app, s.headers)).provider).toBe('atelier');
  });

  it('ends the watch when its time is up (10 minutes, shortened here)', async () => {
    const s = await setup({ options: { atelierWatchMs: 50 } });
    atelier.setDelay(1000);
    await generated(s, { model: 'gpt', count: 1, shape: '1:1' });
    expect(await jobError(s.id)).toBe('Atelier did not finish in time. The images may still arrive in Atelier.');
  });

  it('ends the watch after three polls without an answer', async () => {
    const s = await setup();
    atelier.setDelay(1000);
    const response = await generate(s, { model: 'gpt', count: 1, shape: '1:1' });
    const { jobId } = response.json() as { jobId: string };
    // Wait for the start, then Atelier goes away.
    for (let i = 0; i < 100 && atelier.generations.length === 0; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    await atelier.close();
    await s.app.generationRuns.get(jobId)?.done;
    expect(await jobError(s.id)).toBe('Atelier did not answer.');
  });
});

describe('spending by provider (D12)', () => {
  it('splits each project’s month by provider', async () => {
    const s = await setup({ key: OPENROUTER_KEY, provider: 'openrouter' });
    await generated(s, { model: 'gpt', count: 1, shape: '1:1' });
    await choose(s.app, s.headers, 'atelier');
    await generated(s);
    const { spending } = await status(s.app, s.headers);
    expect(spending.month).toEqual({ images: 3, cost: 0.114 });
    expect(spending.projects).toEqual([
      { projectId: s.id, title: "L'Ancora di Sabaoth", images: 3, cost: 0.114, atelier: 0.074, openrouter: 0.04 },
    ]);
  });
});

describe('the token in no answer or log line', () => {
  it('never answers or logs the plain token', async () => {
    const log = capturedLog();
    const s = await setup({ options: { logger: log.logger } });
    const bodies: string[] = [];
    bodies.push((await saveToken(s.app, s.headers, GOOD)).body);
    bodies.push((await saveToken(s.app, s.headers, READ)).body);
    bodies.push((await saveToken(s.app, s.headers, 'atl_pat_rejected_secret_000')).body);
    bodies.push((await s.app.inject({ url: '/api/image-generation?check=1', headers: s.headers })).body);
    atelier.capReached();
    const jobId = (await generate(s)).json().jobId as string;
    await s.app.generationRuns.get(jobId)?.done;
    await generated(s, { model: 'gpt', count: 1, shape: '1:1' });
    bodies.push(JSON.stringify(readGenerationJobs(await stored(s.id))));
    bodies.push((await removeToken(s.app, s.headers)).body);
    for (const secret of [GOOD, READ, 'atl_pat_rejected_secret_000']) {
      for (const body of bodies) expect(body).not.toContain(secret);
      expect(log.text()).not.toContain(secret);
    }
    expect(log.text().length).toBeGreaterThan(0);
  });
});
