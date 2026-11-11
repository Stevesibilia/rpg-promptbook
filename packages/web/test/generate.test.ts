import { afterEach, describe, expect, it, vi } from 'vitest';
import { addFiles, readFiles, setFileThumb, type FileEntry, type GenerationJob, type NewFile, type PromptRow } from 'promptbook-project';
import * as Y from 'yjs';
import { api, ApiError } from '../src/api.js';
import { ThumbBackfill, type BackfillDeps } from '../src/board/backfill.js';
import {
  badge,
  doneToast,
  endedJobs,
  errorLine,
  generateDefaults,
  generatedRows,
  jobFiles,
  jobsByPrompt,
  modelLine,
  nextThumbless,
  OFFLINE_TITLE,
  panelShape,
  priceLine,
  progressLine,
  refusal,
  sentView,
  slotsLeft,
  startChoice,
  toastLabel,
} from '../src/board/generate.js';
import type { ShownPrompt } from '../src/board/summary.js';

// Image generation on the board (board-image-generation design decisions 6,
// 10, 12 and 13, «The approved screens»): the panel's state and texts, the
// badges and the viewer's rows, the progress, the toast, the errors, the
// thumbnail backfill and the REST calls.

const sha = (n: number) => n.toString(16).padStart(64, '0');

const file = (patch: Partial<FileEntry> = {}): FileEntry => ({
  id: 'f1',
  sha256: sha(1),
  thumbSha256: null,
  name: 'S2-p1-gpt-1.png',
  kind: 'image',
  mime: 'image/png',
  size: 1000,
  width: 1536,
  height: 864,
  duration: null,
  sceneId: null,
  promptId: 'p1',
  matchedBy: 'generated',
  addedAt: '2026-11-11T10:00:30.000Z',
  addedBy: 'user',
  generatedModel: 'gpt',
  cost: 0.041,
  ...patch,
});

const job = (patch: Partial<GenerationJob> = {}): GenerationJob => ({
  id: 'j1',
  promptId: 'p1',
  model: 'gpt',
  count: 4,
  done: 1,
  failed: 0,
  startedAt: '2026-11-11T10:00:00.000Z',
  by: 'u1',
  error: null,
  finishedAt: null,
  ...patch,
});

const at = (iso: string) => Date.parse(iso);

describe('the Generate panel', () => {
  it('starts from the Settings defaults, then from the last choice of the session', () => {
    const defaults = generateDefaults({ imageGeneration: { model: 'nb', count: 3 } });
    expect(startChoice(defaults, null)).toEqual({ model: 'nb', count: 3 });
    expect(startChoice(defaults, { model: 'gpt', count: 1 })).toEqual({ model: 'gpt', count: 1 });
  });

  it('falls back to GPT and 2 when the settings have no defaults (a desktop cache from before)', () => {
    expect(generateDefaults(null)).toEqual({ model: 'gpt', count: 2 });
    expect(generateDefaults({ author: 'x' })).toEqual({ model: 'gpt', count: 2 });
    expect(generateDefaults({ imageGeneration: { model: 'mj', count: 9 } as never })).toEqual({ model: 'gpt', count: 2 });
  });

  it("gives each model's estimate and time, and the price of the batch at 1K", () => {
    expect(modelLine('gpt')).toBe('≈ $0.04 · 53 s per image');
    expect(modelLine('nb')).toBe('≈ $0.04 · 17 s per image');
    expect(priceLine({ model: 'gpt', count: 2 })).toEqual({ amount: '$0.08', text: 'About $0.08 · 1K' });
    expect(priceLine({ model: 'nb', count: 4 }).text).toBe('About $0.15 · 1K');
    expect(priceLine({ model: 'gpt', count: 1 }).text).toBe('About $0.04 · 1K');
  });

  it("takes the shape from the prompt's --ar, the nearest one, or the category", () => {
    expect(panelShape('scene', 'a ruined library --ar 3:2 --v 8.1')).toEqual({
      shape: '3:2',
      source: 'prompt',
      hint: "from the prompt's --ar",
    });
    expect(panelShape('scene', 'a coast --ar 21:9')).toEqual({
      shape: '16:9',
      source: 'nearest',
      hint: "nearest to the prompt's --ar 21:9",
    });
    expect(panelShape('scene', 'a coast')).toEqual({ shape: '16:9', source: 'category', hint: 'default for Scenes' });
    expect(panelShape('pc', 'a portrait').hint).toBe('default for PCs');
    expect(panelShape('npc', 'a portrait')).toMatchObject({ shape: '2:3', hint: 'default for NPCs' });
    expect(panelShape('handout', 'a letter')).toMatchObject({ shape: '1:1', hint: 'default for Handouts' });
  });

  it('shows what is sent: the flags left out, the --no sentence added', () => {
    expect(sentView('desaturated --ar 3:2 --v 8.1 --no text, letters, modern buildings')).toEqual({
      summary: 'What is sent: Midjourney flags left out',
      open: true,
      base: 'desaturated',
      added: 'No text, letters or modern buildings.',
      dropped: '--ar 3:2 --v 8.1 --no text, letters, modern buildings',
    });
    expect(sentView('melancholic --ar 2:3 --v 8.1')).toMatchObject({ added: null, dropped: '--ar 2:3 --v 8.1' });
    expect(sentView('Wide shot of a library, vignette.')).toEqual({
      summary: 'What is sent',
      open: false,
      base: 'Wide shot of a library, vignette.',
      added: null,
      dropped: null,
    });
  });
});

describe('generated images', () => {
  it('carry a badge with the model and the cost, two decimals, three in the title', () => {
    expect(badge(file())).toEqual({ text: 'GPT · $0.04', title: 'GPT Image 2.6 Sunburst, $0.041' });
    expect(badge(file({ generatedModel: 'nb', cost: 0.037 }))).toEqual({
      text: 'Nano Banana · $0.04',
      title: 'Nano Banana 2.1, $0.037',
    });
    expect(badge(file({ cost: null }))).toEqual({ text: 'GPT · cost unknown', title: 'GPT Image 2.6 Sunburst, cost unknown' });
    expect(badge(file({ generatedModel: null, cost: null, matchedBy: 'prompt' }))).toBeNull();
  });

  it("give the viewer Source, Model and Cost in place of «Matched by»", () => {
    expect(generatedRows(file())).toEqual([
      { label: 'Source', value: 'Generated' },
      { label: 'Model', value: 'GPT Image 2.6 Sunburst' },
      { label: 'Cost', value: '$0.041' },
    ]);
    expect(generatedRows(file({ cost: null }))![2]).toEqual({ label: 'Cost', value: 'unknown' });
    expect(generatedRows(file({ generatedModel: null }))).toBeNull();
  });
});

describe('a running job', () => {
  it('says which image is on its way, with which model, since when', () => {
    const now = at('2026-11-11T10:00:47.400Z');
    expect(progressLine(job(), now)).toBe(
      'Generating 2 of 4 with GPT Image 2.6 · 47s. It keeps going if you leave this page.',
    );
    expect(progressLine(job({ model: 'nb', count: 2, done: 0 }), now)).toMatch(/^Generating 1 of 2 with Nano Banana 2\.1 · 47s\./);
    // The last one, a failure counted: never «5 of 4».
    expect(progressLine(job({ done: 3, failed: 1 }), now)).toMatch(/^Generating 4 of 4 /);
    // A device whose clock is behind the server's.
    expect(progressLine(job(), at('2026-11-11T09:59:58.000Z'))).toMatch(/ · 0s\./);
  });

  it('keeps a slot for each image still to come', () => {
    expect(slotsLeft(job())).toBe(3);
    expect(slotsLeft(job({ done: 2, failed: 2 }))).toBe(0);
    expect(slotsLeft(job({ done: 5 }))).toBe(0);
  });

  it('shows on its prompt, before an older error there', () => {
    const error = job({ id: 'j0', startedAt: '2026-11-11T09:00:00.000Z', error: 'x', finishedAt: '2026-11-11T09:01:00.000Z' });
    const running = job();
    expect(jobsByPrompt([error, running]).get('p1')).toBe(running);
    expect(jobsByPrompt([running, error]).get('p1')).toBe(running);
    const newer = job({ id: 'j2', startedAt: '2026-11-11T09:30:00.000Z', error: 'y', finishedAt: '2026-11-11T09:31:00.000Z' });
    expect(jobsByPrompt([error, newer]).get('p1')).toBe(newer);
  });
});

describe('the end of a job', () => {
  const now = at('2026-11-11T10:02:00.000Z');

  it('is a running job gone, or finished with an error', () => {
    const a = job({ id: 'a' });
    const b = job({ id: 'b', promptId: 'p2' });
    const c = job({ id: 'c', promptId: 'p3' });
    const failed = { ...b, error: 'OpenRouter did not answer. Try again.', finishedAt: '2026-11-11T10:01:00.000Z' };
    expect(endedJobs([a, b, c], [failed, c], now)).toEqual([
      { job: a, error: null },
      { job: b, error: 'OpenRouter did not answer. Try again.' },
    ]);
  });

  it('is not an error dismissed, nor a job gone stale', () => {
    const dismissed = job({ error: 'x', finishedAt: '2026-11-11T10:01:00.000Z' });
    expect(endedJobs([dismissed], [], now)).toEqual([]);
    expect(endedJobs([job()], [], at('2026-11-11T10:16:00.000Z'))).toEqual([]);
    // Started more than 15 minutes in the future: stale too.
    expect(endedJobs([job({ startedAt: '2026-11-11T10:30:00.000Z' })], [], now)).toEqual([]);
  });

  it("toasts the images it added to its prompt and their cost", () => {
    const files = [
      file({ id: 'old', addedAt: '2026-11-11T09:00:00.000Z' }),
      file({ id: 'a', cost: 0.041 }),
      file({ id: 'b', cost: 0.039 }),
      file({ id: 'other', promptId: 'p2' }),
      file({ id: 'nb', generatedModel: 'nb' }),
      file({ id: 'dropped', matchedBy: 'prompt', generatedModel: null, cost: null }),
    ];
    const mine = jobFiles(files, job());
    expect(mine.map((f) => f.id)).toEqual(['a', 'b']);
    expect(doneToast('S2 · prompt 1', mine)).toBe('2 images for S2 · prompt 1 · $0.08');
    expect(doneToast('Padre Anselmo', [file({ cost: null })])).toBe('1 image for Padre Anselmo · $0.00');
    expect(doneToast('S2 · prompt 1', [])).toBeNull();
  });

  it('names a scene prompt by its scene and number, a card by its name', () => {
    const row = (patch: Partial<PromptRow['prompt']>) => ({ number: 1, prompt: { name: '', category: 'scene', ...patch } }) as PromptRow;
    const scene: ShownPrompt = { row: row({}), scene: { sceneId: 'S2', title: 'La cripta' } };
    expect(toastLabel(scene)).toBe('S2 · prompt 1');
    expect(toastLabel({ row: row({ category: 'npc', name: 'Padre Anselmo' }), scene: null })).toBe('Padre Anselmo');
    expect(toastLabel({ row: row({ category: 'npc' }), scene: null })).toBe('New NPC');
  });
});

describe('an error on a prompt', () => {
  it("shows the job's error as it comes, its first sentence bold", () => {
    expect(
      errorLine(
        job({
          error:
            'OpenRouter refused: your key has no credit left. Add credit on openrouter.ai, then try again. Nothing was charged.',
        }),
      ),
    ).toEqual({
      strong: 'OpenRouter refused: your key has no credit left.',
      rest: 'Add credit on openrouter.ai, then try again. Nothing was charged.',
    });
    // Nothing is added on the client: the server decides «Nothing was charged.».
    expect(errorLine(job({ done: 2, failed: 2, error: '2 of 4 images failed: OpenRouter did not answer. Try again.' }))).toEqual({
      strong: '2 of 4 images failed: OpenRouter did not answer.',
      rest: 'Try again.',
    });
    expect(errorLine(job({ done: 0, error: 'OpenRouter refused the request (HTTP 418).' }))).toEqual({
      strong: 'OpenRouter refused the request (HTTP 418).',
      rest: '',
    });
    expect(errorLine(job())).toBeNull();
  });

  it('says why Generate did not start', () => {
    expect(refusal('busy', '', false)).toBe('Images are already being generated for this prompt.');
    expect(refusal('too_many_jobs', '', false)).toBe('Three generations are already running. Wait for one to finish.');
    expect(refusal('quota', '', false)).toBe('Your files have reached their quota.');
    expect(refusal('no_key', '', false)).toMatch(/^Add your OpenRouter key first\./);
    expect(refusal('not_configured', '', false)).toBe('This server is not set up for image generation.');
    expect(refusal('offline', 'Offline.', true)).toBe(OFFLINE_TITLE);
    expect(refusal('network', 'The server cannot be reached.', false)).toBe('The server cannot be reached.');
    expect(refusal('validation_error', 'count: 1 to 4', false)).toBe('count: 1 to 4');
  });
});

describe('the thumbnail backfill', () => {
  it('picks an image with no thumbnail it has not tried yet', () => {
    const files = [
      file({ id: 'a', thumbSha256: sha(9) }),
      file({ id: 'audio', kind: 'audio', mime: 'audio/mpeg', generatedModel: null, cost: null }),
      file({ id: 'b' }),
      file({ id: 'c' }),
    ];
    expect(nextThumbless(files, new Set())?.id).toBe('b');
    expect(nextThumbless(files, new Set(['b']))?.id).toBe('c');
    expect(nextThumbless(files, new Set(['b', 'c']))).toBeNull();
  });

  function setup(fetched: (sha256: string) => Uint8Array | null = () => new Uint8Array([1, 2, 3])) {
    const doc = new Y.Doc();
    addImagePrompts(doc);
    const calls: string[] = [];
    const deps: BackfillDeps = {
      fetchBytes: async (_p, s) => {
        calls.push(`fetch ${s.slice(-2)}`);
        return fetched(s);
      },
      probe: async (blob) => {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (bytes[0] === 0xff) return { width: null, height: null, duration: null, thumb: null };
        return { width: 10, height: 10, duration: null, thumb: { bytes: new Uint8Array([7, bytes.length]), mime: 'image/webp' } };
      },
      hash: async (bytes) => sha(100 + bytes[1]!),
      putFile: async (_p, s, _b, mime) => {
        calls.push(`put ${s.slice(-2)} ${mime}`);
        return { mime };
      },
    };
    return { doc, deps, calls, backfill: new ThumbBackfill('proj', doc, deps) };
  }

  function addImagePrompts(doc: Y.Doc) {
    const add = (n: number, thumbSha256: string | null): NewFile => {
      const { id: _id, ...rest } = file({ sha256: sha(n), name: `${n}.png`, thumbSha256 });
      return { ...rest, addedAt: `2026-11-11T10:00:0${n}.000Z` };
    };
    addFiles(doc, [add(1, null), add(2, null), add(3, sha(50))]);
  }

  const thumbs = (doc: Y.Doc) => readFiles(doc).map((f) => f.thumbSha256);

  it('fills each thumbnail once, one file at a time', async () => {
    const { doc, backfill, calls } = setup();
    await backfill.poke();
    expect(thumbs(doc)).toEqual([sha(103), sha(103), sha(50)]);
    expect(calls).toEqual(['fetch 01', 'put 67 image/webp', 'fetch 02', 'put 67 image/webp']);
    await backfill.poke();
    expect(calls).toHaveLength(4);
  });

  it('leaves alone a thumbnail another device set meanwhile', async () => {
    const { doc, deps } = setup();
    const id = readFiles(doc)[0]!.id;
    const backfill = new ThumbBackfill('proj', doc, {
      ...deps,
      putFile: async (...args) => {
        // The other device wins the race.
        setFileThumb(doc, id, sha(77));
        return deps.putFile(...args);
      },
    });
    await backfill.poke();
    expect(thumbs(doc)[0]).toBe(sha(77));
  });

  it('does not retry an image it cannot read', async () => {
    const { doc, backfill, calls } = setup(() => new Uint8Array([0xff]));
    await backfill.poke();
    await backfill.poke();
    expect(thumbs(doc)).toEqual([null, null, sha(50)]);
    expect(calls).toEqual(['fetch 01', 'fetch 02']);
  });

  it('tries again after a download the files whose bytes were not here yet', async () => {
    let here = false;
    const { doc, backfill, calls } = setup(() => (here ? new Uint8Array([1]) : null));
    await backfill.poke();
    await backfill.poke();
    expect(calls).toEqual(['fetch 01', 'fetch 02']);
    here = true;
    await backfill.retryWaiting();
    expect(thumbs(doc)).toEqual([sha(101), sha(101), sha(50)]);
  });

  it('lets a file go when the board goes mid-file, for the next board to try', async () => {
    const { doc, deps } = setup();
    const tried = new Set<string>();
    let first!: ThumbBackfill;
    first = new ThumbBackfill('proj', doc, {
      ...deps,
      putFile: async (...args) => {
        first.dispose();
        return deps.putFile(...args);
      },
    }, tried);
    await first.poke();
    expect(thumbs(doc)).toEqual([null, null, sha(50)]);
    const second = new ThumbBackfill('proj', doc, deps, tried);
    await second.poke();
    expect(thumbs(doc)).toEqual([sha(103), sha(103), sha(50)]);
  });

  it('writes nothing once the board is gone', async () => {
    const { doc, backfill } = setup();
    backfill.dispose();
    await backfill.poke();
    expect(thumbs(doc)).toEqual([null, null, sha(50)]);
  });
});

describe('the REST calls', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stub(status: number, body: unknown) {
    const seen: { url: string; method: string; body: unknown }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      seen.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body as string) : undefined });
      return new Response(status === 204 ? null : JSON.stringify(body), { status });
    });
    return seen;
  }

  it('asks the status plain, or with the check Settings wants', async () => {
    const seen = stub(200, { configured: true, key: null, spending: {} });
    await api.imageGeneration();
    await api.imageGeneration(true);
    expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([
      'GET /api/image-generation',
      'GET /api/image-generation?check=1',
    ]);
  });

  it('saves and removes the key', async () => {
    const seen = stub(200, { configured: true, key: { hint: 'a41f', checkedAt: '', limitRemaining: 12.4 }, spending: {} });
    await api.saveOpenRouterKey('sk-or-v1-good');
    expect(seen[0]).toEqual({ url: '/api/image-generation/key', method: 'PUT', body: { key: 'sk-or-v1-good' } });
    stub(204, null);
    await expect(api.removeOpenRouterKey()).resolves.toBeUndefined();
  });

  it('starts a job and reads a refusal by its code', async () => {
    const seen = stub(202, { jobId: 'j1' });
    await expect(api.generate('p/1', 'q 2', { model: 'nb', count: 3, shape: '2:3' })).resolves.toEqual({ jobId: 'j1' });
    expect(seen[0]).toEqual({
      url: '/api/projects/p%2F1/image-prompts/q%202/generate',
      method: 'POST',
      body: { model: 'nb', count: 3, shape: '2:3' },
    });
    stub(507, { error: 'quota', message: 'Full.' });
    const error = await api.generate('p', 'q', { model: 'gpt', count: 1, shape: '1:1' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 507, code: 'quota' });
    // 503 offline and 503 not_configured are told apart by the code.
    stub(503, { error: 'not_configured' });
    await expect(api.generate('p', 'q', { model: 'gpt', count: 1, shape: '1:1' })).rejects.toMatchObject({
      code: 'not_configured',
    });
  });

  it("reads the project's spending", async () => {
    const seen = stub(200, { images: 3, cost: 0.12 });
    await expect(api.imageSpending('p1')).resolves.toEqual({ images: 3, cost: 0.12 });
    expect(seen[0]!.url).toBe('/api/projects/p1/image-spending');
  });
});
