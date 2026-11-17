import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  addFiles,
  addImagePrompt,
  readFiles,
  readGenerationJobs,
  readImagePrompts,
  setPromptReferences,
  type NewFile,
} from 'promptbook-project';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type * as Y from 'yjs';
import type { User } from '../../src/accounts/users.js';
import { openBlobStore, type BlobStore } from '../../src/files/blobs.js';
import { IMAGE_ERRORS } from '../../src/images/openrouter.js';
import { setDocumentText, withLiveDocument } from '../../src/live.js';
import { loadProjectDoc } from '../../src/projects.js';
import { ATELIER_SENTENCES, FAKE_ATELIER_TOKENS, startFakeAtelier, type FakeAtelier } from './fake-atelier.js';
import { jpeg, png, startFakeOpenRouter, type FakeOpenRouter } from './fake-openrouter.js';
import { db, ORIGIN, signedIn, startApp, steve, tempDataDir } from './helpers.js';

// Reference images sent with a generation (reference-images D5 to D10, D21,
// D22), through the fake OpenRouter and the fake Atelier.

const ADVENTURE = ['## Scene', '', '### S2. Il molo', '', '## Appendice: immagini e musica', '', '### S2. Il molo', '', 'visual: a pier at dawn', ''].join(
  '\n',
);
const MB = 1024 * 1024;

let openRouter: FakeOpenRouter;
let atelier: FakeAtelier;
beforeEach(async () => {
  openRouter = await startFakeOpenRouter();
  atelier = await startFakeAtelier();
});
afterEach(async () => {
  await openRouter.close();
  await atelier.close();
});

interface Setup {
  app: FastifyInstance;
  user: User;
  headers: Record<string, string>;
  id: string;
  // A scene prompt of S2 and an NPC's.
  scene: string;
  npc: string;
}

// A file store whose get fails, as a disk error would, for the hashes in
// `failing`; everything else goes to the real store in `dataDir`.
async function failingStore(dataDir: string, failing: Set<string>): Promise<BlobStore> {
  const real = await openBlobStore(dataDir);
  return new Proxy(real, {
    get(target, name) {
      if (name === 'get') {
        return (sha256: string, range?: { start: number; end: number }) =>
          failing.has(sha256) ? Promise.reject(new Error('EIO: i/o error, read')) : target.get(sha256, range);
      }
      const value = Reflect.get(target, name) as unknown;
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
}

async function setup(provider: 'openrouter' | 'atelier' = 'openrouter', failing: Set<string> | null = null): Promise<Setup> {
  const user = await steve();
  const dataDir = tempDataDir();
  const app = await startApp(
    { openRouterBaseUrl: openRouter.baseUrl, atelierUrl: atelier.url, dataDir },
    { atelierPollMs: 10, ...(failing ? { blobs: await failingStore(dataDir, failing) } : {}) },
  );
  const headers = { cookie: `pb_session=${await signedIn(app)}`, origin: ORIGIN };
  const created = await app.inject({ method: 'POST', url: '/api/projects', headers, payload: { category: 'adventure', title: 'Il faro spento' } });
  const id = created.json().project.id as string;
  const ids = await withLiveDocument(app.sync, id, user.id, (doc) => {
    setDocumentText(doc, ADVENTURE);
    const scene = addImagePrompt(doc, { category: 'scene', sceneId: 'S2', prompt: 'a pier at dawn, fog --ar 3:2' }, 'claude').id;
    const npc = addImagePrompt(doc, { category: 'npc', name: 'Maestro Ilario', prompt: 'an old lighthouse keeper' }, 'claude').id;
    return { scene, npc };
  });
  if (provider === 'openrouter') {
    expect((await app.inject({ method: 'PUT', url: '/api/image-generation/key', headers, payload: { key: 'sk-or-v1-good' } })).statusCode).toBe(200);
  } else {
    const token = await app.inject({
      method: 'PUT',
      url: '/api/image-generation/atelier-token',
      headers,
      payload: { token: FAKE_ATELIER_TOKENS.good },
    });
    expect(token.statusCode).toBe(200);
    const settings = (await app.inject({ url: '/api/settings', headers })).json();
    const saved = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers,
      payload: { ...settings, imageGeneration: { ...settings.imageGeneration, provider: 'atelier' } },
    });
    expect(saved.statusCode).toBe(200);
  }
  openRouter.calls.length = 0;
  atelier.calls.length = 0;
  return { app, user, headers, id, ...ids };
}

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

// An image on the board: its bytes sent to the server unless `upload` is
// false, its file added to the prompt. Answers the file id.
async function boardImage(
  s: Setup,
  promptId: string | null,
  bytes: Buffer,
  {
    upload = true,
    mime = 'image/png',
    extra = {},
    project = s.id,
  }: { upload?: boolean; mime?: string; extra?: Partial<NewFile>; project?: string } = {},
): Promise<string> {
  const sha256 = sha(bytes);
  if (upload) {
    const put = await s.app.inject({
      method: 'PUT',
      url: `/api/projects/${project}/files/${sha256}`,
      headers: { ...s.headers, 'content-type': 'application/octet-stream' },
      payload: bytes,
    });
    expect(put.statusCode, put.body).toBe(201);
  }
  return withLiveDocument(s.app.sync, project, s.user.id, (doc) => {
    const file: NewFile = {
      sha256,
      thumbSha256: null,
      name: `ref-${sha256.slice(0, 6)}.png`,
      kind: 'image',
      mime,
      size: bytes.length,
      width: 120,
      height: 120,
      duration: null,
      sceneId: null,
      promptId,
      matchedBy: promptId === null ? null : 'hand',
      addedBy: 'user',
      ...extra,
    };
    return addFiles(doc, [file]).added[0]!.id;
  });
}

const generate = (s: Setup, promptId: string, body: Record<string, unknown> = {}) =>
  s.app.inject({
    method: 'POST',
    url: `/api/projects/${s.id}/image-prompts/${promptId}/generate`,
    headers: s.headers,
    payload: { model: 'gpt', count: 2, shape: '3:2', ...body },
  });

async function generated(s: Setup, promptId: string, body: Record<string, unknown> = {}): Promise<string> {
  const response = await generate(s, promptId, body);
  expect(response.statusCode, response.body).toBe(202);
  const { jobId } = response.json() as { jobId: string };
  await s.app.generationRuns.get(jobId)?.done;
  return jobId;
}

const stored = async (id: string): Promise<Y.Doc> => (await loadProjectDoc(db, id))!;
const promptOf = async (s: Setup, promptId: string) => readImagePrompts(await stored(s.id)).find((p) => p.id === promptId)!;
const generatedOn = async (s: Setup, promptId: string) =>
  readFiles(await stored(s.id)).filter((f) => f.promptId === promptId && f.generatedModel !== null);
const referenceCounts = async (id: string) =>
  (await db.query<{ reference_count: number }>('select reference_count from image_generations where project_id = $1', [id])).map(
    (r) => r.reference_count,
  );
const imageCalls = () => openRouter.calls.filter((c) => c.path === '/api/v1/images');
const inputsOf = (body: unknown) =>
  ((body as { input_references?: { type: string; image_url: { url: string } }[] }).input_references ?? []).map((r) => [
    r.type,
    r.image_url.url.slice(0, r.image_url.url.indexOf(',') + 1),
    Buffer.from(r.image_url.url.slice(r.image_url.url.indexOf(',') + 1), 'base64'),
  ]);

describe('references through OpenRouter (D5, D7, D9, D10)', () => {
  it('sends a given list with every call, remembers it on the prompt, and records it on the images, the job and the rows', async () => {
    const s = await setup();
    const face = png(120, 120, 901);
    const ref = await boardImage(s, s.npc, face);
    await generated(s, s.scene, { references: [ref] });
    expect(imageCalls()).toHaveLength(2);
    for (const call of imageCalls()) expect(inputsOf(call.body)).toEqual([['image_url', 'data:image/png;base64,', face]]);
    expect(openRouter.lastReferences()).toBe(1);
    expect(await promptOf(s, s.scene)).toMatchObject({ references: [ref], missingReferences: 0 });
    const images = await generatedOn(s, s.scene);
    expect(images.map((f) => f.references)).toEqual([[ref], [ref]]);
    expect(await referenceCounts(s.id)).toEqual([1, 1]);
  });

  it('sends the prompt’s remembered references when the list is left out, in their order, JPEG as JPEG', async () => {
    const s = await setup();
    const a = await boardImage(s, s.npc, jpeg('1:1', 902), { mime: 'image/jpeg' });
    const b = await boardImage(s, s.scene, png(120, 120, 903));
    await withLiveDocument(s.app.sync, s.id, s.user.id, (doc) => setPromptReferences(doc, s.scene, [b, a], 'user'));
    const response = await generate(s, s.scene, { count: 1 });
    expect(response.statusCode).toBe(202);
    await s.app.generationRuns.get(response.json().jobId)?.done;
    expect(inputsOf(imageCalls()[0]!.body).map(([type, head]) => [type, head])).toEqual([
      ['image_url', 'data:image/png;base64,'],
      ['image_url', 'data:image/jpeg;base64,'],
    ]);
    expect((await generatedOn(s, s.scene))[0]!.references).toEqual([b, a]);
  });

  it('sends none for an empty list, which also clears the prompt’s, and none for a prompt without', async () => {
    const s = await setup();
    const ref = await boardImage(s, s.npc, png(120, 120, 904));
    await withLiveDocument(s.app.sync, s.id, s.user.id, (doc) => setPromptReferences(doc, s.scene, [ref], 'user'));
    await generated(s, s.scene, { count: 1, references: [] });
    expect(imageCalls()[0]!.body).not.toHaveProperty('input_references');
    expect((await promptOf(s, s.scene)).references).toEqual([]);
    expect((await generatedOn(s, s.scene))[0]!.references).toBeNull();
    await generated(s, s.npc, { count: 1 });
    expect(imageCalls()[1]!.body).not.toHaveProperty('input_references');
    expect(openRouter.lastReferences()).toBe(0);
    expect(await referenceCounts(s.id)).toEqual([0, 0]);
    expect(readGenerationJobs(await stored(s.id))).toEqual([]);
  });

  it('dedupes a list and leaves out a remembered reference whose image was removed', async () => {
    const s = await setup();
    const ref = await boardImage(s, s.npc, png(120, 120, 905));
    await generated(s, s.scene, { count: 1, references: [ref, ref] });
    expect(inputsOf(imageCalls()[0]!.body)).toHaveLength(1);
    await withLiveDocument(s.app.sync, s.id, s.user.id, (doc) => {
      const gone = addFiles(doc, [{ ...readFiles(doc).find((f) => f.id === ref)!, sha256: sha(Buffer.from('x')), references: null }]).added[0]!.id;
      setPromptReferences(doc, s.npc, [gone, ref], 'user');
      doc.getArray('files').delete(doc.getArray('files').toArray().findIndex((i) => (i as Y.Map<unknown>).get('id') === gone), 1);
    });
    expect(await promptOf(s, s.npc)).toMatchObject({ references: [ref], missingReferences: 1 });
    await generated(s, s.npc, { count: 1 });
    expect(inputsOf(imageCalls()[1]!.body)).toHaveLength(1);
  });

  it('refuses more than three references in the body, before anything else', async () => {
    const s = await setup();
    const response = await generate(s, s.scene, { references: ['a', 'b', 'c', 'd'] });
    expect(response.statusCode).toBe(400);
    expect(imageCalls()).toEqual([]);
  });
});

describe('the references’ refusals (D6)', () => {
  // Each refusal: 400 with its sentence, no job, no row, nothing asked of a
  // provider. A list naming a file that is not an image is not remembered;
  // any other list given is, since it is written with the prompt's read (D5)
  // before the bytes are checked.
  async function expectRefused(s: Setup, body: Record<string, unknown>, error: string, message: string) {
    const given = body.references as string[] | undefined;
    const before = error === 'reference_missing' || given === undefined ? (await promptOf(s, s.scene)).references : given;
    const response = await generate(s, s.scene, body);
    expect([response.statusCode, response.json()]).toEqual([400, { error, message }]);
    expect(openRouter.calls).toEqual([]);
    expect(atelier.calls).toEqual([]);
    expect(readGenerationJobs(await stored(s.id))).toEqual([]);
    expect(await referenceCounts(s.id)).toEqual([]);
    expect((await promptOf(s, s.scene)).references).toEqual(before);
  }

  it('refuses an id that is not an image of the project: unknown, a track, another project’s', async () => {
    const s = await setup();
    const track = await withLiveDocument(s.app.sync, s.id, s.user.id, (doc) =>
      addFiles(doc, [
        {
          sha256: sha(Buffer.from('a track')),
          thumbSha256: null,
          name: 'tema.mp3',
          kind: 'audio',
          mime: 'audio/mpeg',
          size: 10,
          width: null,
          height: null,
          duration: 3,
          sceneId: 'S2',
          promptId: null,
          matchedBy: 'hand',
          addedBy: 'user',
        },
      ]).added[0]!.id,
    );
    // An image of another project of the same account, its bytes there.
    const other = (await s.app.inject({ method: 'POST', url: '/api/projects', headers: s.headers, payload: { category: 'one-shot', title: 'Altrove' } })).json()
      .project.id as string;
    const elsewhere = await boardImage(s, null, png(120, 120, 912), { project: other });
    for (const ref of ['nope', track, elsewhere]) {
      await expectRefused(s, { references: [ref] }, 'reference_missing', IMAGE_ERRORS.referenceGone);
    }
  });

  it('refuses an image of this board whose bytes are linked only to another project', async () => {
    const s = await setup();
    const other = (await s.app.inject({ method: 'POST', url: '/api/projects', headers: s.headers, payload: { category: 'one-shot', title: 'Altrove' } })).json()
      .project.id as string;
    const bytes = png(120, 120, 913);
    await boardImage(s, null, bytes, { project: other });
    // The same bytes listed on this board, never sent to this project.
    const copied = await boardImage(s, s.npc, bytes, { upload: false });
    await expectRefused(s, { references: [copied] }, 'reference_not_synced', IMAGE_ERRORS.referenceNotSynced);
  });

  it('refuses an image whose bytes have not reached the server, and leaves the remembered list as it was', async () => {
    const s = await setup();
    const kept = await boardImage(s, s.npc, png(120, 120, 906));
    const local = await boardImage(s, s.npc, png(120, 120, 907), { upload: false });
    await withLiveDocument(s.app.sync, s.id, s.user.id, (doc) => setPromptReferences(doc, s.scene, [local], 'user'));
    // Remembered, then given.
    await expectRefused(s, {}, 'reference_not_synced', IMAGE_ERRORS.referenceNotSynced);
    expect(
      [
        (await generate(s, s.scene, { references: [kept, local] })).json(),
        (await promptOf(s, s.scene)).references,
      ],
    ).toEqual([{ error: 'reference_not_synced', message: IMAGE_ERRORS.referenceNotSynced }, [kept, local]]);
    expect(openRouter.calls).toEqual([]);
  });

  it('refuses bytes the server holds as another type', async () => {
    const s = await setup();
    const ref = await boardImage(s, s.npc, png(120, 120, 908));
    await db.query(`update files set mime = 'image/gif' where sha256 = $1`, [sha(png(120, 120, 908))]);
    await expectRefused(s, { references: [ref] }, 'reference_type', IMAGE_ERRORS.referenceType);
  });

  it('refuses one over 20 MB, or three over 30 MB together, as the server measured them', async () => {
    const s = await setup();
    const bytes = [909, 910, 911].map((n) => png(120, 120, n));
    const ids = [];
    for (const b of bytes) ids.push(await boardImage(s, s.npc, b));
    await db.query('update files set size = $2 where sha256 = $1', [sha(bytes[0]!), 20 * MB + 1]);
    await expectRefused(s, { references: [ids[0]] }, 'reference_too_large', IMAGE_ERRORS.referenceSize);
    for (const b of bytes) await db.query('update files set size = $2 where sha256 = $1', [sha(b), 10 * MB + 1]);
    await expectRefused(s, { references: ids }, 'reference_too_large', IMAGE_ERRORS.referenceSize);
    // 20 MB each and 30 MB together pass.
    await db.query('update files set size = $2 where sha256 = $1', [sha(bytes[0]!), 10 * MB - 2]);
    await generated(s, s.scene, { count: 1, references: ids });
    expect(inputsOf(imageCalls()[0]!.body)).toHaveLength(3);
  });
});

describe('references through Atelier (D8)', () => {
  it('uploads a file dropped on the board, once per job, and starts the generation with its id', async () => {
    const s = await setup('atelier');
    const face = png(120, 120, 920);
    const ref = await boardImage(s, s.npc, face);
    await generated(s, s.scene, { references: [ref] });
    const uploads = atelier.calls.filter((c) => c.path === '/api/v1/uploads');
    expect(uploads).toHaveLength(1);
    expect(atelier.uploads()).toBe(1);
    const start = atelier.calls.find((c) => c.path === '/api/v1/generations')!.body as { referenceIds: string[] };
    expect(start.referenceIds).toHaveLength(1);
    expect(atelier.lastReferenceIds()).toEqual(start.referenceIds);
    expect(atelier.generations[0]!.referenceIds).toEqual(start.referenceIds);
    const images = await generatedOn(s, s.scene);
    expect(images.map((f) => [f.generatedVia, f.references])).toEqual([
      ['atelier', [ref]],
      ['atelier', [ref]],
    ]);
    expect(await referenceCounts(s.id)).toEqual([1, 1]);
    // The same bytes again give the same Atelier image.
    await generated(s, s.scene, { references: [ref] });
    expect(atelier.lastReferenceIds()).toEqual(start.referenceIds);
  });

  it('sends an image that came from Atelier by its own id, uploading nothing', async () => {
    const s = await setup('atelier');
    const bytes = png(120, 120, 921);
    const atelierId = atelier.addImage(bytes);
    const ref = await boardImage(s, s.npc, bytes, { extra: { atelierImageId: atelierId } });
    await generated(s, s.scene, { count: 1, references: [ref] });
    expect(atelier.uploads()).toBe(0);
    expect(atelier.lastReferenceIds()).toEqual([atelierId]);
    expect((await generatedOn(s, s.scene))[0]!.references).toEqual([ref]);
  });

  it('uploads an Atelier image deleted there since, and starts again once', async () => {
    const s = await setup('atelier');
    const bytes = png(120, 120, 922);
    const atelierId = atelier.addImage(bytes);
    const ref = await boardImage(s, s.npc, bytes, { extra: { atelierImageId: atelierId } });
    atelier.deleteImage(atelierId);
    await generated(s, s.scene, { count: 1, references: [ref] });
    const starts = atelier.calls.filter((c) => c.path === '/api/v1/generations' && c.method === 'POST');
    expect(starts.map((c) => (c.body as { referenceIds: string[] }).referenceIds)).toEqual([[atelierId], atelier.lastReferenceIds()]);
    expect(atelier.lastReferenceIds()[0]).not.toBe(atelierId);
    expect(atelier.uploads()).toBe(1);
    expect(await generatedOn(s, s.scene)).toHaveLength(1);
  });

  it('shows Atelier’s refusal of an upload as it is, nothing charged', async () => {
    const s = await setup('atelier');
    const ref = await boardImage(s, s.npc, png(120, 120, 923));
    // The upload is the job's first call to Atelier.
    atelier.answerNext(413, { error: 'too_large', message: ATELIER_SENTENCES.tooLarge });
    await generated(s, s.scene, { count: 2, references: [ref] });
    expect(readGenerationJobs(await stored(s.id))[0]!.error).toBe(
      'Atelier refused: A reference image can be at most 20 MB. Nothing was charged.',
    );
    expect(atelier.calls.map((c) => c.path)).toEqual(['/api/v1/uploads']);
    expect(await generatedOn(s, s.scene)).toEqual([]);
  });

  it('shows any other refusal of the references at once, uploading nothing', async () => {
    const s = await setup('atelier');
    const bytes = png(120, 120, 924);
    const atelierId = atelier.addImage(bytes);
    const ref = await boardImage(s, s.npc, bytes, { extra: { atelierImageId: atelierId } });
    // A first job makes the collection, so the next job's first call is its start.
    await generated(s, s.scene, { count: 1 });
    for (const message of ['GPT Image 2.6 Sunburst takes at most 2 reference images.', 'GPT Image 2.6 Sunburst takes no reference images.']) {
      atelier.answerNext(400, { error: 'invalid_request', message, field: 'referenceIds' });
      const calls = atelier.calls.length;
      const response = await generate(s, s.scene, { count: 1, references: [ref] });
      expect(response.statusCode).toBe(202);
      await s.app.generationRuns.get(response.json().jobId)?.done;
      expect(atelier.calls.slice(calls).map((c) => c.path)).toEqual(['/api/v1/generations']);
      expect(readGenerationJobs(await stored(s.id))[0]!.error).toBe(`Atelier refused: ${message} Nothing was charged.`);
    }
    expect(atelier.uploads()).toBe(0);
  });
});

describe('a reference the file store cannot read', () => {
  // The job ends with the reference sentence on both paths, nothing asked of
  // the provider, and the prompt is free for the next job.
  for (const provider of ['openrouter', 'atelier'] as const) {
    it(`fails every image through ${provider}, nothing charged, the job finished`, async () => {
      const failing = new Set<string>();
      const s = await setup(provider, failing);
      const bytes = png(120, 120, 940);
      const ref = await boardImage(s, s.npc, bytes);
      failing.add(sha(bytes));
      await generated(s, s.scene, { count: 2, references: [ref] });
      const [job] = readGenerationJobs(await stored(s.id));
      expect(job).toMatchObject({ failed: 2, done: 0, error: `${IMAGE_ERRORS.referenceNotSynced} Nothing was charged.` });
      expect(job!.finishedAt).not.toBeNull();
      expect(imageCalls()).toEqual([]);
      expect(atelier.calls.filter((c) => c.path === '/api/v1/uploads' || c.path === '/api/v1/generations')).toEqual([]);
      // Readable again: the next job runs.
      failing.clear();
      await generated(s, s.scene, { count: 1, references: [ref] });
      expect(await generatedOn(s, s.scene)).toHaveLength(1);
    });
  }
});

describe('the fakes’ test routes (D21, D22)', () => {
  it('OpenRouter: __last without a key, and 400 for input references not of the shape', async () => {
    const answer = await fetch(`${openRouter.baseUrl}/__last`);
    expect([answer.status, await answer.json()]).toEqual([200, { references: 0 }]);
    const url = 'data:image/png;base64,iVBORw0KGgo=';
    const ask = (refs: unknown) =>
      fetch(`${openRouter.baseUrl}/images`, {
        method: 'POST',
        headers: { authorization: 'Bearer sk-or-v1-good', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'openai/gpt-image-2.6-sunburst', prompt: 'a pier', aspect_ratio: '1:1', resolution: '1K', input_references: refs }),
      });
    const one = { type: 'image_url', image_url: { url } };
    for (const bad of [[], [one, one, one, one], [{ type: 'image_url', image_url: { url: 'https://x/y.png' } }], [{ image_url: { url } }], 'x']) {
      expect((await ask(bad)).status).toBe(400);
    }
    expect((await ask([one, one])).status).toBe(200);
    expect(openRouter.lastReferences()).toBe(2);
    expect(await (await fetch(`${openRouter.baseUrl}/__last`)).json()).toEqual({ references: 2 });
    // Not recorded as a call.
    expect(openRouter.calls.some((c) => c.path === '/api/v1/__last')).toBe(false);
  });

  it('Atelier: uploads, __last and __images without a token, unknown reference ids refused', async () => {
    const auth = { authorization: `Bearer ${FAKE_ATELIER_TOKENS.good}` };
    const upload = (bytes: Buffer, type = 'image/png') =>
      fetch(`${atelier.url}/api/v1/uploads`, { method: 'POST', headers: { ...auth, 'content-type': type }, body: bytes });
    const bytes = png(120, 120, 930);
    const first = await upload(bytes);
    const { id } = (await first.json()) as { id: string };
    expect(first.status).toBe(201);
    expect([(await upload(bytes)).status, ((await (await upload(bytes)).json()) as { id: string }).id]).toEqual([200, id]);
    expect((await upload(bytes, 'image/gif')).status).toBe(415);
    expect((await upload(Buffer.alloc(20 * MB + 1, 1))).status).toBe(413);
    const start = (referenceIds: unknown) =>
      fetch(`${atelier.url}/api/v1/generations`, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'a pier', model: 'openai/gpt-image-2.6-sunburst', aspectRatio: '1:1', count: 1, referenceIds }),
      });
    const made = await start([id]);
    expect([made.status, ((await made.json()) as { referenceIds: string[] }).referenceIds]).toEqual([201, [id]]);
    expect(await (await fetch(`${atelier.url}/api/v1/__last`)).json()).toEqual({ referenceIds: [id], uploads: 3 });
    const forget = await fetch(`${atelier.url}/api/v1/__images/${id}`, { method: 'DELETE' });
    expect(forget.status).toBe(204);
    const refused = await start([id]);
    expect([refused.status, await refused.json()]).toEqual([
      400,
      { error: 'invalid_request', message: ATELIER_SENTENCES.referenceNotFound, field: 'referenceIds' },
    ]);
    expect((await start(['not-a-uuid'])).status).toBe(400);
  });
});
