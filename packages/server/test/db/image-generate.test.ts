import type { FastifyInstance } from 'fastify';
import {
  addImagePrompt,
  IMAGE_MODELS,
  readDocumentBoard,
  readFiles,
  readGenerationJobs,
  removeImagePrompt,
  sentPrompt,
  startGenerationJob,
} from 'promptbook-project';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type * as Y from 'yjs';
import type { User } from '../../src/accounts/users.js';
import { setDocumentText, withLiveDocument } from '../../src/live.js';
import { loadProjectDoc } from '../../src/projects.js';
import { startFakeOpenRouter, type FakeOpenRouter } from './fake-openrouter.js';
import { capturedLog, db, ORIGIN, signedIn, startApp, steve } from './helpers.js';

// Generating board images (board-image-generation D7 to D11), against the
// fake OpenRouter.

const ADVENTURE = [
  '## Scene',
  '',
  '### S1. La casa che cede',
  '',
  '### S2. Il molo',
  '',
  '## Appendice: immagini e musica',
  '',
  '### S1. La casa che cede',
  '',
  'visual: collapsed 1900s Sicilian library at night',
  '',
  '### S2. Il molo',
  '',
  'visual: a pier at dawn',
  '',
].join('\n');

const CATHEDRAL =
  'collapsed cathedral facade, soldiers in 1908 Italian uniforms standing perfectly still among the ruins, survivors kneeling in rows, smoke and grey sky, desaturated --ar 3:2 --v 8.1 --no text, letters, modern buildings';
const GOOD = 'sk-or-v1-good';
const BROKE = 'sk-or-v1-broke';

let fake: FakeOpenRouter;
beforeEach(async () => {
  fake = await startFakeOpenRouter();
});
afterEach(() => fake.close());

interface Setup {
  app: FastifyInstance;
  user: User;
  headers: Record<string, string>;
  id: string;
  // S2's prompt 1 (CATHEDRAL), S2's prompt 2, an NPC's.
  scene: string;
  second: string;
  npc: string;
}

async function setup(
  { key = GOOD, config = {}, options = {} }: {
    key?: string | null;
    config?: Parameters<typeof startApp>[0];
    options?: Parameters<typeof startApp>[1];
  } = {},
): Promise<Setup> {
  const user = await steve();
  const app = await startApp({ openRouterBaseUrl: fake.baseUrl, ...config }, options);
  const headers = { cookie: `pb_session=${await signedIn(app)}`, origin: ORIGIN };
  const created = await app.inject({
    method: 'POST',
    url: '/api/projects',
    headers,
    payload: { category: 'adventure', title: "L'Ancora di Sabaoth" },
  });
  const id = created.json().project.id as string;
  const ids = await withLiveDocument(app.sync, id, user.id, (doc) => {
    setDocumentText(doc, ADVENTURE);
    const scene = addImagePrompt(doc, { category: 'scene', sceneId: 'S2', prompt: CATHEDRAL }, 'claude').id;
    const second = addImagePrompt(doc, { category: 'scene', sceneId: 'S2', prompt: 'a pier at dawn, fog' }, 'claude').id;
    const npc = addImagePrompt(doc, { category: 'npc', name: 'Padre Anselmo', prompt: 'an old priest, candlelight' }, 'claude').id;
    return { scene, second, npc };
  });
  if (key !== null) {
    const saved = await app.inject({ method: 'PUT', url: '/api/image-generation/key', headers, payload: { key } });
    expect(saved.statusCode).toBe(200);
  }
  fake.calls.length = 0;
  return { app, user, headers, id, ...ids };
}

const generate = (s: Setup, promptId: string, body: unknown = { model: 'gpt', count: 2, shape: '3:2' }, id = s.id) =>
  s.app.inject({
    method: 'POST',
    url: `/api/projects/${id}/image-prompts/${promptId}/generate`,
    headers: s.headers,
    payload: body as object,
  });

// Starts a job and waits for it to end.
async function generated(s: Setup, promptId: string, body?: unknown): Promise<string> {
  const response = await generate(s, promptId, body);
  expect(response.statusCode).toBe(202);
  const { jobId } = response.json() as { jobId: string };
  await s.app.generationRuns.get(jobId)?.done;
  return jobId;
}

async function stored(id: string): Promise<Y.Doc> {
  const doc = await loadProjectDoc(db, id);
  return doc!;
}

const rows = (id?: string) =>
  db.query<{ prompt_id: string; model: string; cost: string | null; sha256: string | null; ok: boolean; error: string | null }>(
    `select prompt_id, model, cost, sha256, ok, error from image_generations
     ${id ? 'where project_id = $1' : ''} order by created_at, ok desc`,
    id ? [id] : [],
  );

const refused = (response: { statusCode: number; json(): unknown }) => [
  response.statusCode,
  (response.json() as { error: string }).error,
];

describe('the generate route’s checks, in order (D7)', () => {
  it('needs a session', async () => {
    const s = await setup();
    const response = await s.app.inject({
      method: 'POST',
      url: `/api/projects/${s.id}/image-prompts/${s.scene}/generate`,
      headers: { origin: ORIGIN },
      payload: { model: 'gpt', count: 1, shape: '1:1' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('refuses a body that is not one', async () => {
    const s = await setup();
    for (const body of [
      {},
      { model: 'midjourney', count: 1, shape: '1:1' },
      { model: 'gpt', count: 5, shape: '1:1' },
      { model: 'gpt', count: 0, shape: '1:1' },
      { model: 'gpt', count: 1.5, shape: '1:1' },
      { model: 'gpt', count: 1, shape: '21:9' },
      { model: 'gpt', count: 1, shape: '1:1', seed: 4 },
    ]) {
      expect(refused(await generate(s, s.scene, body))).toEqual([400, 'validation_error']);
    }
    expect(fake.calls).toEqual([]);
  });

  it('answers 404 for a project that is not the user’s or is in the bin, before anything else', async () => {
    const s = await setup({ key: null, config: { secretsKey: null } });
    expect(refused(await generate(s, s.scene, undefined, '00000000-0000-4000-8000-000000000000'))).toEqual([404, 'not_found']);
    expect(refused(await generate(s, s.scene, undefined, 'not-a-uuid'))).toEqual([404, 'not_found']);
    await s.app.inject({ method: 'DELETE', url: `/api/projects/${s.id}`, headers: s.headers });
    expect(refused(await generate(s, s.scene))).toEqual([404, 'not_found']);
  });

  it('answers 503 not_configured, then 409 no_key', async () => {
    const off = await setup({ key: null, config: { secretsKey: null } });
    expect(refused(await generate(off, 'no-such-prompt'))).toEqual([503, 'not_configured']);
    await db.query('truncate users cascade');
    const on = await setup({ key: null });
    expect(refused(await generate(on, 'no-such-prompt'))).toEqual([409, 'no_key']);
  });

  it('answers 409 no_key for a key that no longer opens', async () => {
    const s = await setup();
    const rotated = await startApp({ openRouterBaseUrl: fake.baseUrl, secretsKey: Buffer.alloc(32, 99) });
    expect(refused(await generate({ ...s, app: rotated }, s.scene))).toEqual([409, 'no_key']);
  });

  it('answers 404 prompt_not_found for a missing or removed prompt, 400 prompt_empty for one with nothing to send', async () => {
    const s = await setup();
    expect(refused(await generate(s, 'no-such-prompt'))).toEqual([404, 'prompt_not_found']);
    const flagsOnly = await withLiveDocument(s.app.sync, s.id, s.user.id, (doc) => {
      removeImagePrompt(doc, s.second);
      return addImagePrompt(doc, { category: 'pc', name: 'Rosalia', prompt: '  --ar 2:3 --v 8.1' }, 'user').id;
    });
    expect(refused(await generate(s, s.second))).toEqual([404, 'prompt_not_found']);
    expect(refused(await generate(s, flagsOnly))).toEqual([400, 'prompt_empty']);
    expect(fake.calls).toEqual([]);
  });

  it('answers 409 busy while a job runs on the prompt, and 507 quota without room for count × 20 MB', async () => {
    const s = await setup({ config: { filesQuotaGb: 1 } });
    fake.setDelay(300);
    const first = await generate(s, s.scene);
    expect(first.statusCode).toBe(202);
    expect(refused(await generate(s, s.scene))).toEqual([409, 'busy']);
    // The quota: 2 × 20 MB more than the room left.
    await db.query(
      `insert into files (sha256, size, mime, created_by) values ($1, $2, 'image/png', $3)`,
      ['f'.repeat(64), 1024 ** 3 - 30 * 1024 * 1024, s.user.id],
    );
    await db.query(`insert into project_files (project_id, sha256) values ($1, $2)`, [s.id, 'f'.repeat(64)]);
    expect(refused(await generate(s, s.second))).toEqual([507, 'quota']);
    expect((await generate(s, s.second, { model: 'nb', count: 1, shape: '16:9' })).statusCode).toBe(202);
    await Promise.all([...s.app.generationRuns.values()].map((r) => r.done));
  });

  it('starts one job of two concurrent generates on one prompt', async () => {
    const s = await setup();
    fake.setDelay(200);
    const answers = await Promise.all([generate(s, s.scene), generate(s, s.scene)]);
    expect(answers.map((a) => a.statusCode).sort()).toEqual([202, 409]);
    expect(answers.find((a) => a.statusCode === 409)!.json().error).toBe('busy');
    await Promise.all([...s.app.generationRuns.values()].map((r) => r.done));
    expect(readFiles(await stored(s.id))).toHaveLength(2);
  });

  it('answers 429 too_many_jobs to a fourth running job of the account, and 202 once one ends', async () => {
    const s = await setup();
    const fourth = await withLiveDocument(s.app.sync, s.id, s.user.id, (doc) => [
      addImagePrompt(doc, { category: 'npc', name: 'Za’ Nina', prompt: 'an old fisherwoman' }, 'user').id,
      addImagePrompt(doc, { category: 'handout', name: 'Lettera', prompt: 'a burnt letter' }, 'user').id,
    ]);
    fake.setDelay(1500);
    const started = await Promise.all([s.scene, s.second, s.npc].map((p) => generate(s, p, { model: 'nb', count: 1, shape: '1:1' })));
    expect(started.map((r) => r.statusCode)).toEqual([202, 202, 202]);
    const refusedFourth = await generate(s, fourth[0]!, { model: 'nb', count: 1, shape: '1:1' });
    expect(refusedFourth.statusCode).toBe(429);
    expect(refusedFourth.json()).toEqual({
      error: 'too_many_jobs',
      message: 'Three generations are already running. Wait for one to finish.',
    });
    fake.setDelay(0);
    await s.app.generationRuns.get(started[0]!.json().jobId)?.done;
    expect((await generate(s, fourth[1]!, { model: 'nb', count: 1, shape: '1:1' })).statusCode).toBe(202);
    await Promise.all([...s.app.generationRuns.values()].map((r) => r.done));
  });

  it('counts concurrent starts against the limit too', async () => {
    const s = await setup();
    const more = await withLiveDocument(s.app.sync, s.id, s.user.id, (doc) =>
      ['a', 'b'].map((n) => addImagePrompt(doc, { category: 'pc', name: `PC ${n}`, prompt: `a portrait ${n}` }, 'user').id),
    );
    fake.setDelay(500);
    const answers = await Promise.all(
      [s.scene, s.second, s.npc, ...more].map((p) => generate(s, p, { model: 'nb', count: 1, shape: '1:1' })),
    );
    expect(answers.map((a) => a.statusCode).sort()).toEqual([202, 202, 202, 429, 429]);
    await Promise.all([...s.app.generationRuns.values()].map((r) => r.done));
  });

  it('treats a stale job as no job', async () => {
    const s = await setup();
    await withLiveDocument(s.app.sync, s.id, s.user.id, (doc) =>
      startGenerationJob(
        doc,
        { id: 'old', promptId: s.scene, model: 'gpt', count: 1, by: s.user.id, startedAt: '2026-11-01T00:00:00.000Z' },
        new Date('2026-11-01T00:01:00.000Z'),
      ),
    );
    await generated(s, s.scene, { model: 'gpt', count: 1, shape: '3:2' });
    expect(readGenerationJobs(await stored(s.id))).toEqual([]);
  });
});

describe('a whole job (D9)', () => {
  it('adds GPT Image’s images to the prompt, with their model, cost and size', async () => {
    const s = await setup();
    const jobId = await generated(s, s.scene);
    const doc = await stored(s.id);
    const files = readFiles(doc);
    expect(files.map((f) => f.name).sort()).toEqual(['S2-p1-gpt-1.png', 'S2-p1-gpt-2.png']);
    for (const f of files) {
      expect(f).toMatchObject({
        kind: 'image',
        mime: 'image/png',
        promptId: s.scene,
        sceneId: null,
        matchedBy: 'generated',
        generatedModel: 'gpt',
        cost: 0.04,
        width: 150,
        height: 100,
        thumbSha256: null,
        addedBy: 'user',
      });
    }
    expect(new Set(files.map((f) => f.sha256)).size).toBe(2);
    // On the board under its prompt; the job is gone.
    const board = readDocumentBoard(doc);
    expect(board.rows.find((r) => r.sceneId === 'S2')!.prompts[0]!.images).toHaveLength(2);
    expect(doc.getMap('generationJobs').has(jobId)).toBe(false);
    // The blobs are stored and linked, and each image has its row.
    const linked = await db.query<{ sha256: string; size: string; mime: string }>(
      `select f.sha256, f.size, f.mime from project_files pf join files f using (sha256) where pf.project_id = $1`,
      [s.id],
    );
    expect(linked.map((l) => l.sha256).sort()).toEqual(files.map((f) => f.sha256).sort());
    for (const f of files) {
      const served = await s.app.inject({ url: `/api/projects/${s.id}/files/${f.sha256}`, headers: s.headers });
      expect(served.statusCode).toBe(200);
      expect(served.headers['content-type']).toBe('image/png');
    }
    expect(await rows(s.id)).toEqual(
      files.map(() => ({ prompt_id: s.scene, model: 'gpt', cost: '0.040000', sha256: expect.any(String), ok: true, error: null })),
    );
    // What OpenRouter received: the model's id, D5's text, the shape, 1K.
    expect(fake.calls).toHaveLength(2);
    for (const call of fake.calls) {
      expect(call).toEqual({
        method: 'POST',
        path: '/api/v1/images',
        bearer: true,
        body: {
          model: 'openai/gpt-image-2.6-sunburst',
          prompt: sentPrompt(CATHEDRAL).text,
          aspect_ratio: '3:2',
          resolution: '1K',
        },
      });
    }
    expect((fake.calls[0]!.body as { prompt: string }).prompt).toMatch(/desaturated\. No text, letters or modern buildings\.$/);
  });

  it('adds Nano Banana’s JPEGs to a named prompt, numbered after the images already there', async () => {
    const s = await setup();
    await generated(s, s.npc, { model: 'gpt', count: 1, shape: '2:3' });
    await generated(s, s.npc, { model: 'nb', count: 2, shape: '2:3' });
    const files = readFiles(await stored(s.id));
    expect(files.map((f) => f.name).sort()).toEqual([
      'padre-anselmo-gpt-1.png',
      'padre-anselmo-nb-2.jpg',
      'padre-anselmo-nb-3.jpg',
    ]);
    for (const f of files.filter((f) => f.generatedModel === 'nb')) {
      expect(f).toMatchObject({ mime: 'image/jpeg', cost: 0.037, width: 100, height: 150, promptId: s.npc });
    }
    expect(fake.calls.map((c) => (c.body as { model: string }).model)).toEqual([
      IMAGE_MODELS.gpt.id,
      IMAGE_MODELS.nb.id,
      IMAGE_MODELS.nb.id,
    ]);
    expect((await rows(s.id)).filter((r) => r.model === 'nb').map((r) => r.cost)).toEqual(['0.037000', '0.037000']);
  });

  it('names a later scene prompt by its number', async () => {
    const s = await setup();
    await generated(s, s.second, { model: 'nb', count: 1, shape: '16:9' });
    expect(readFiles(await stored(s.id)).map((f) => f.name)).toEqual(['S2-p2-nb-1.jpg']);
  });
});

describe('errors in plain words (D10)', () => {
  // The image's sentence, and the cost OpenRouter reported for it: none for
  // a refusal, so the job's error ends with «Nothing was charged.».
  const cases: [string, (f: FakeOpenRouter) => void, string, string | null][] = [
    ['401', (f) => f.failNext(401), 'OpenRouter rejected your key. Check it in Settings → Image generation.', null],
    ['429', (f) => f.failNext(429), 'OpenRouter is busy (rate limit). Try again in a minute.', null],
    [
      '400 moderation',
      (f) => f.failNext(400, { error: { code: 400, message: 'Request blocked by moderation' } }),
      'OpenRouter refused this prompt (content policy).',
      null,
    ],
    ['400 other', (f) => f.failNext(400, { error: { message: 'bad' } }), 'OpenRouter refused the request (HTTP 400).', null],
    ['500', (f) => f.failNext(500), 'OpenRouter did not answer. Try again.', null],
    ['a 200 with data: []', (f) => f.failNext(200, { data: [], usage: { cost: 0 } }), 'OpenRouter sent no image. Try again.', null],
    [
      'a 200 with bytes that are no image',
      (f) => f.failNext(200, { data: [{ b64_json: Buffer.from('hello world, not an image').toString('base64') }], usage: { cost: 0.04 } }),
      'OpenRouter sent no image. Try again.',
      // Billed, then refused here: its cost stays and nothing says it was free.
      '0.040000',
    ],
  ];
  for (const [name, arrange, sentence, cost] of cases) {
    it(`keeps the job with its sentence: ${name}`, async () => {
      const s = await setup();
      arrange(fake);
      const jobId = await generated(s, s.scene, { model: 'gpt', count: 1, shape: '3:2' });
      const doc = await stored(s.id);
      expect(readFiles(doc)).toEqual([]);
      expect(readGenerationJobs(doc)).toEqual([
        expect.objectContaining({
          id: jobId,
          promptId: s.scene,
          done: 0,
          failed: 1,
          error: cost === null ? `${sentence} Nothing was charged.` : sentence,
          finishedAt: expect.any(String),
        }),
      ]);
      expect(await rows(s.id)).toEqual([{ prompt_id: s.scene, model: 'gpt', cost, sha256: null, ok: false, error: sentence }]);
    });
  }

  it('says when the key has no credit left (402)', async () => {
    const s = await setup({ key: BROKE });
    await generated(s, s.scene, { model: 'nb', count: 2, shape: '3:2' });
    expect(readGenerationJobs(await stored(s.id))[0]!.error).toBe(
      'OpenRouter refused: your key has no credit left. Add credit on openrouter.ai, then try again. Nothing was charged.',
    );
  });

  it('gives up on an image that takes too long', async () => {
    const s = await setup({ options: { generationTimeoutMs: 200 } });
    fake.setDelay(1000);
    await generated(s, s.scene, { model: 'gpt', count: 1, shape: '3:2' });
    expect(readGenerationJobs(await stored(s.id))[0]!.error).toBe('OpenRouter did not answer. Try again. Nothing was charged.');
  });

  it('keeps the images that arrived and counts the rest', async () => {
    const s = await setup();
    fake.failNext(500);
    await generated(s, s.scene, { model: 'gpt', count: 4, shape: '3:2' });
    const doc = await stored(s.id);
    expect(readFiles(doc)).toHaveLength(3);
    expect(readGenerationJobs(doc)[0]).toMatchObject({
      done: 3,
      failed: 1,
      error: '1 of 4 images failed: OpenRouter did not answer. Try again.',
    });
    expect((await rows(s.id)).map((r) => r.ok).sort()).toEqual([false, true, true, true]);
  });

  it('fails an image the quota refuses when it lands', async () => {
    const s = await setup({ config: { filesQuotaGb: 1 } });
    fake.setDelay(300);
    const response = await generate(s, s.scene, { model: 'gpt', count: 1, shape: '3:2' });
    await db.query(`insert into files (sha256, size, mime, created_by) values ($1, $2, 'image/png', $3)`, [
      'e'.repeat(64),
      1024 ** 3,
      s.user.id,
    ]);
    await db.query(`insert into project_files (project_id, sha256) values ($1, $2)`, [s.id, 'e'.repeat(64)]);
    await s.app.generationRuns.get(response.json().jobId)?.done;
    const doc = await stored(s.id);
    expect(readFiles(doc)).toEqual([]);
    // Billed, then refused here: no «Nothing was charged.», and the cost
    // counts in spending though the image does not.
    expect(readGenerationJobs(doc)[0]!.error).toBe('Your files have reached their quota.');
    expect(await rows(s.id)).toEqual([
      { prompt_id: s.scene, model: 'gpt', cost: '0.040000', sha256: null, ok: false, error: 'Your files have reached their quota.' },
    ]);
    const spending = await s.app.inject({ url: `/api/projects/${s.id}/image-spending`, headers: s.headers });
    expect(spending.json()).toEqual({ images: 0, cost: 0.04 });
  });
});

describe('the board changing during a job', () => {
  it('leaves the images of a prompt removed meanwhile in the Unmatched tray', async () => {
    const s = await setup();
    fake.setDelay(300);
    const response = await generate(s, s.scene);
    await withLiveDocument(s.app.sync, s.id, s.user.id, (doc) => removeImagePrompt(doc, s.scene));
    await s.app.generationRuns.get(response.json().jobId)?.done;
    const board = readDocumentBoard(await stored(s.id));
    expect(board.unmatched.map((u) => [u.file.generatedModel, u.reason])).toEqual([
      ['gpt', 'Its prompt was removed.'],
      ['gpt', 'Its prompt was removed.'],
    ]);
  });

  it('writes nothing to a project moved to the bin meanwhile', async () => {
    const s = await setup();
    fake.setDelay(300);
    const response = await generate(s, s.scene);
    const before = await stored(s.id);
    expect(readGenerationJobs(before)).toHaveLength(1);
    expect((await s.app.inject({ method: 'DELETE', url: `/api/projects/${s.id}`, headers: s.headers })).statusCode).toBe(204);
    await s.app.generationRuns.get(response.json().jobId)?.done;
    const after = await stored(s.id);
    expect(readFiles(after)).toEqual([]);
    // The job is as it was; it goes stale.
    expect(readGenerationJobs(after)).toEqual(readGenerationJobs(before));
    expect((await rows(s.id)).map((r) => [r.ok, r.cost, r.error])).toEqual([
      [false, '0.040000', 'The project was moved to the bin.'],
      [false, '0.040000', 'The project was moved to the bin.'],
    ]);
    // Billed: the cost counts in the month's spending, the images do not.
    const status = (await s.app.inject({ url: '/api/image-generation', headers: s.headers })).json();
    expect(status.spending.month).toEqual({ images: 0, cost: 0.08 });
    expect(status.spending.projects).toEqual([{ projectId: s.id, title: "L'Ancora di Sabaoth", images: 0, cost: 0.08 }]);
    // Nothing was linked to it either.
    expect(await db.query('select * from project_files where project_id = $1', [s.id])).toEqual([]);
  });
});

describe('spending (D11)', () => {
  it('counts the ok images per project and per month, failed ones not, removed files and projects kept', async () => {
    const s = await setup();
    await generated(s, s.scene);
    fake.failNext(500);
    await generated(s, s.npc, { model: 'nb', count: 2, shape: '2:3' });
    const project = await s.app.inject({ url: `/api/projects/${s.id}/image-spending`, headers: s.headers });
    expect(project.json()).toEqual({ images: 3, cost: 0.117 });

    // A second project with one image, and a row from last month.
    const other = await s.app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: s.headers,
      payload: { category: 'one-shot', title: 'Il Faro di Capo Peloro' },
    });
    const otherId = other.json().project.id as string;
    await db.query(
      `insert into image_generations (user_id, project_id, prompt_id, model, cost, sha256, ok, created_at)
       values ($1, $2, 'p', 'gpt', 0.05, $3, true, date_trunc('month', now()) - interval '3 days'),
              ($1, $2, 'p', 'gpt', null, null, false, now())`,
      [s.user.id, otherId, 'd'.repeat(64)],
    );

    // Removing a file keeps its cost.
    const files = readFiles(await stored(s.id));
    await withLiveDocument(s.app.sync, s.id, s.user.id, (doc) => {
      doc.getArray('files').delete(0, 1);
    });
    expect(readFiles(await stored(s.id))).toHaveLength(files.length - 1);

    const status = (await s.app.inject({ url: '/api/image-generation', headers: s.headers })).json();
    expect(status.spending).toEqual({
      month: { images: 3, cost: 0.117 },
      all: { images: 4, cost: 0.167 },
      projects: [
        { projectId: otherId, title: 'Il Faro di Capo Peloro', images: 0, cost: 0 },
        { projectId: s.id, title: "L'Ancora di Sabaoth", images: 3, cost: 0.117 },
      ],
    });
    expect((await s.app.inject({ url: `/api/projects/${otherId}/image-spending`, headers: s.headers })).json()).toEqual({
      images: 1,
      cost: 0.05,
    });

    // A project removed for good: under null.
    await db.query('delete from projects where id = $1', [s.id]);
    const after = (await s.app.inject({ url: '/api/image-generation', headers: s.headers })).json();
    expect(after.spending.projects).toEqual([
      { projectId: otherId, title: 'Il Faro di Capo Peloro', images: 0, cost: 0 },
      { projectId: null, title: null, images: 3, cost: 0.117 },
    ]);
    expect(after.spending.month).toEqual({ images: 3, cost: 0.117 });
  });

  it('answers 404 for another’s project or one in the bin, also when not configured', async () => {
    const s = await setup({ key: null, config: { secretsKey: null } });
    const url = (id: string) => `/api/projects/${id}/image-spending`;
    expect((await s.app.inject({ url: url(s.id), headers: s.headers })).json()).toEqual({ images: 0, cost: 0 });
    expect((await s.app.inject({ url: url('00000000-0000-4000-8000-000000000000'), headers: s.headers })).statusCode).toBe(404);
    await s.app.inject({ method: 'DELETE', url: `/api/projects/${s.id}`, headers: s.headers });
    expect((await s.app.inject({ url: url(s.id), headers: s.headers })).statusCode).toBe(404);
    const status = (await s.app.inject({ url: '/api/image-generation', headers: s.headers })).json();
    expect(status).toEqual({ configured: false, key: null, spending: { month: { images: 0, cost: 0 }, all: { images: 0, cost: 0 }, projects: [] } });
  });
});

describe('closing the app', () => {
  it('waits for a running job to land its images', async () => {
    const s = await setup();
    fake.setDelay(300);
    expect((await generate(s, s.scene)).statusCode).toBe(202);
    await s.app.close();
    const doc = await stored(s.id);
    expect(readFiles(doc)).toHaveLength(2);
    expect(readGenerationJobs(doc)).toEqual([]);
  });

  it('stops a job still running after the wait, which ends with a sentence', async () => {
    const s = await setup({ options: { generationCloseWaitMs: 100 } });
    fake.setDelay(5000);
    expect((await generate(s, s.scene)).statusCode).toBe(202);
    const started = Date.now();
    await s.app.close();
    expect(Date.now() - started).toBeLessThan(3000);
    const doc = await stored(s.id);
    expect(readFiles(doc)).toEqual([]);
    expect(readGenerationJobs(doc)).toEqual([
      expect.objectContaining({ failed: 2, error: 'The server restarted before the image arrived. Try again. Nothing was charged.' }),
    ]);
  });
});

describe('removing the key', () => {
  it('stops the user’s running jobs', async () => {
    const s = await setup();
    fake.setDelay(5000);
    const response = await generate(s, s.scene);
    expect((await s.app.inject({ method: 'DELETE', url: '/api/image-generation/key', headers: s.headers })).statusCode).toBe(204);
    await s.app.generationRuns.get(response.json().jobId)?.done;
    const doc = await stored(s.id);
    expect(readFiles(doc)).toEqual([]);
    expect(readGenerationJobs(doc)[0]!.error).toBe('Stopped: the OpenRouter key was removed. Nothing was charged.');
  });
});

describe('the key during a job', () => {
  it('is in no log line of a whole job, its errors included', async () => {
    const log = capturedLog();
    const s = await setup({ options: { logger: log.logger } });
    fake.failNext(500);
    await generated(s, s.scene, { model: 'gpt', count: 2, shape: '3:2' });
    fake.failNext(200, { data: [{ b64_json: 'bm90IGFuIGltYWdl' }] });
    await generated(s, s.npc, { model: 'nb', count: 1, shape: '2:3' });
    await fake.close();
    await generated(s, s.second, { model: 'gpt', count: 1, shape: '16:9' });
    expect(log.text()).toContain('/generate');
    expect(log.text()).not.toContain(GOOD);
    expect(log.text()).not.toContain('sk-or-v1-');
  });
});
