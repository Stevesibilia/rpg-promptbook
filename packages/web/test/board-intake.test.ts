import { afterEach, describe, expect, it, vi } from 'vitest';
import { addFiles, readFiles, setImagePrompt, setMusicPrompt, type FileKind } from 'promptbook-project';
import * as Y from 'yjs';
import { hashBytes } from '../src/board/hash.js';
import { Intake, kindOf, progressLine, resultLine, type IntakeDeps } from '../src/board/intake.js';
import type { PutFileResult } from '../src/platform/bridge.js';
import { PutFileError } from '../src/platform/index.js';
import { createWebPlatform } from '../src/platform/web.js';

// Intake with a fake platform (asset-board design decision 11): what is
// skipped, what is already here, what is uploaded and added, and Retry.

const UUID = '3f9a1c22-5d4e-4b1a-9c2f-7e8d6a5b4c3d';

const png = (seed: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, seed, seed >> 8, 1, 2, 3]);
const mp3 = (seed: number) => new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0, seed, seed >> 8]);
const file = (name: string, bytes: Uint8Array, type = '') => new File([bytes as Uint8Array<ArrayBuffer>], name, { type });
const sha = (bytes: Uint8Array) => hashBytes(bytes);

function setup(options: { put?: IntakeDeps['putFile']; parallel?: number } = {}) {
  const doc = new Y.Doc();
  setImagePrompt(doc, 'S1', 'collapsed 1900s Sicilian library at night, broken beams --ar 16:9', 'claude');
  setImagePrompt(doc, 'S2', "ruined doctor's office in 1908 Messina, anatomical drawings", 'claude');
  setMusicPrompt(doc, 'S1', { title: 'Cinque e venti', style: 'dark ambient', lyrics: '[End]' }, 'claude');
  const puts: { sha256: string; mime: string }[] = [];
  const opened: string[] = [];
  const released: string[] = [];
  const deps: IntakeDeps = {
    where: 'browser',
    putFile:
      options.put ??
      (async (_id, sha256, _bytes, mime): Promise<PutFileResult> => {
        puts.push({ sha256, mime });
        return { mime, state: 'uploaded' };
      }),
    hash: (bytes) => hashBytes(bytes),
    probe: async (_blob, kind: FileKind) =>
      kind === 'image'
        ? { width: 1456, height: 816, duration: null, thumb: { bytes: new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80, kind.length]), mime: 'image/webp' } }
        : { width: null, height: null, duration: 192, thumb: null },
    open: (id) => {
      opened.push(id);
      return doc;
    },
    release: (id) => released.push(id),
  };
  const intake = new Intake('p1', deps, options.parallel);
  intake.setScenes(['S1', 'S2', 'S3']);
  const done = () =>
    new Promise<void>((resolve) => {
      if (!intake.state.working) return resolve();
      const off = intake.store.subscribe(() => {
        if (!intake.state.working) {
          off();
          resolve();
        }
      });
    });
  return { doc, intake, puts, opened, released, done };
}

describe('intake', () => {
  it('matches Midjourney and Suno names, uploads the thumbnail first, and counts the result', async () => {
    const { doc, intake, puts, opened, released, done } = setup();
    const images = [0, 1, 2, 3].map((n) =>
      file(`steve_ruined_doctors_office_in_1908_Messina_anatomical_${UUID}_${n}.png`, png(n), 'image/png'),
    );
    intake.add([
      ...images,
      file('cinque e venti (1).mp3', mp3(1), 'audio/mpeg'),
      file('untitled track.mp3', mp3(2), 'audio/mpeg'),
    ]);
    await done();

    const files = readFiles(doc);
    expect(files).toHaveLength(6);
    expect(files.filter((f) => f.sceneId === 'S2').map((f) => f.matchedBy)).toEqual(['prompt', 'prompt', 'prompt', 'prompt']);
    expect(files.find((f) => f.name === 'cinque e venti (1).mp3')).toMatchObject({ sceneId: 'S1', matchedBy: 'title', duration: 192 });
    expect(files.find((f) => f.name === 'untitled track.mp3')).toMatchObject({ sceneId: null, matchedBy: null });
    const image = files.find((f) => f.kind === 'image')!;
    expect(image).toMatchObject({ width: 1456, height: 816, mime: 'image/png', addedBy: 'user' });
    expect(image.thumbSha256).toMatch(/^[0-9a-f]{64}$/);
    // The thumbnail before the original.
    const thumbAt = puts.findIndex((p) => p.sha256 === image.thumbSha256);
    expect(thumbAt).toBeGreaterThanOrEqual(0);
    expect(thumbAt).toBeLessThan(puts.findIndex((p) => p.sha256 === image.sha256));

    const result = intake.state.result!;
    expect(result).toMatchObject({ added: 6, matched: 5, toAssign: 1, alreadyHere: 0, skipped: 0, failed: 0 });
    expect(resultLine(result)).toEqual({
      head: '6 files added: 5 matched, 1 to assign.',
      rest: 'S1: 1 track · S2: 4 images. New files are marked.',
    });
    expect(intake.state.marks.size).toBe(6);
    // The document held from the first file to the last.
    expect(opened).toEqual(['p1']);
    expect(released).toEqual(['p1']);
  });

  it('skips what is not an image or a track, by type and extension, then by its bytes', async () => {
    const { intake, puts, done } = setup();
    intake.add([
      file('notes.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46]), 'application/pdf'),
      file('scene.png', new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3, 4, 5, 6, 7, 8])),
    ]);
    await done();
    expect(puts).toEqual([]);
    expect(intake.state.result).toMatchObject({ added: 0, skipped: 2 });
    expect(resultLine(intake.state.result!)).toEqual({ head: 'No files added.', rest: '2 skipped: not an image or a track.' });
  });

  it('counts a content the project lists as already here, with no upload', async () => {
    const { doc, intake, puts, done } = setup();
    const bytes = png(7);
    addFiles(doc, [
      { sha256: await sha(bytes), thumbSha256: null, name: 'old.png', kind: 'image', mime: 'image/png', size: 13, width: null, height: null, duration: null, sceneId: null, matchedBy: null, addedBy: 'user' },
    ]);
    intake.add([file('again.png', bytes, 'image/png')]);
    await done();
    expect(puts).toEqual([]);
    expect(readFiles(doc)).toHaveLength(1);
    expect(intake.state.result).toMatchObject({ added: 0, alreadyHere: 1 });
    expect(resultLine(intake.state.result!).rest).toBe('1 already here.');
  });

  it('adds one content dropped twice at once only once', async () => {
    const { doc, intake, done } = setup();
    intake.add([file('a.png', png(3), 'image/png'), file('b.png', png(3), 'image/png')]);
    await done();
    expect(readFiles(doc)).toHaveLength(1);
    expect(intake.state.result).toMatchObject({ added: 1, alreadyHere: 1 });
  });

  it('tries the second copy of a content when the first failed', async () => {
    let calls = 0;
    const { doc, intake, done } = setup({
      put: async (_id, _sha, _bytes, mime) => {
        calls += 1;
        // The first copy's thumbnail fails; everything after succeeds.
        if (calls === 1) throw new PutFileError(503, 'The file was removed while it was uploaded. Upload it again.');
        return { mime, state: 'uploaded' };
      },
    });
    intake.add([file('a.png', png(4), 'image/png'), file('b.png', png(4), 'image/png')]);
    await done();
    expect(readFiles(doc).map((f) => f.name)).toEqual(['b.png']);
    expect(intake.state.result).toMatchObject({ added: 1, alreadyHere: 0, failed: 1 });
  });

  it('adds nothing more once disposed (the desktop account changed), and releases once', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { doc, intake, released, done } = setup({
      put: async (_id, _sha, _bytes, mime) => {
        await gate;
        return { mime, state: 'uploaded' };
      },
    });
    intake.add([file('a.png', png(1), 'image/png'), file('b.png', png(2), 'image/png'), file('c.png', png(3), 'image/png')]);
    await vi.waitFor(() => expect(intake.state.started).toBe(2));
    intake.dispose();
    release();
    await done();
    expect(readFiles(doc)).toEqual([]);
    expect(released).toEqual(['p1']);
    intake.add([file('d.png', png(5), 'image/png')]);
    expect(intake.state.working).toBe(false);
  });

  it('joins a second drop to the batch running', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { doc, intake, opened, done } = setup({
      put: async (_id, _sha, _bytes, mime) => {
        await gate;
        return { mime, state: 'uploaded' };
      },
    });
    intake.add([file('a.png', png(1), 'image/png')]);
    intake.add([file('b.png', png(2), 'image/png'), file('c.mp3', mp3(3), 'audio/mpeg')]);
    expect(intake.state).toMatchObject({ working: true, total: 3 });
    expect(progressLine(intake.state, 'browser')).toMatch(/^Uploading \d of 3$/);
    release();
    await done();
    expect(readFiles(doc)).toHaveLength(3);
    expect(intake.state.result).toMatchObject({ added: 3 });
    expect(opened).toEqual(['p1']);
  });

  it('keeps a failed upload out of the document with Retry, and Retry adds it', async () => {
    let down = true;
    const { doc, intake, done } = setup({
      put: async (_id, _sha, _bytes, mime) => {
        if (down) throw new PutFileError(0, 'The server cannot be reached.');
        return { mime, state: 'uploaded' };
      },
    });
    intake.add([file(`steve_collapsed_1900s_Sicilian_library_${UUID}_0.png`, png(1), 'image/png')]);
    await done();
    expect(readFiles(doc)).toEqual([]);
    expect(intake.state.failed).toMatchObject([{ message: 'The server cannot be reached.', retry: true }]);
    expect(resultLine(intake.state.result!)).toEqual({ head: 'No files added.', rest: '1 not added.' });

    down = false;
    intake.retry(intake.state.failed[0]!.key);
    await done();
    expect(intake.state.failed).toEqual([]);
    expect(readFiles(doc)).toMatchObject([{ sceneId: 'S1', matchedBy: 'prompt' }]);
    expect(intake.state.result).toMatchObject({ added: 1, matched: 1 });
  });

  it('offers no Retry for a refusal Retry cannot change', async () => {
    const { intake, done } = setup({
      put: async () => {
        throw new PutFileError(507, 'Your files have reached their quota.');
      },
    });
    intake.add([file('a.png', png(1), 'image/png')]);
    await done();
    expect(intake.state.failed).toMatchObject([{ message: 'Your files have reached their quota.', retry: false }]);
  });

  it('writes nothing once the document is gone, even for an upload that finishes after', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { doc, intake, released, done } = setup({
      put: async (_id, _sha, _bytes, mime) => {
        await gate;
        return { mime, state: 'uploaded' };
      },
    });
    intake.add([file('a.png', png(1), 'image/png'), file('b.png', png(2), 'image/png'), file('c.png', png(3), 'image/png')]);
    await vi.waitFor(() => expect(intake.state.started).toBe(2));
    doc.destroy();
    release();
    await done();
    expect(readFiles(doc)).toEqual([]);
    expect(released).toEqual(['p1']);
    expect(intake.state.failed).toEqual([]);
  });

  it('clears the marks when the board is left, not while a batch runs', async () => {
    const { intake, done } = setup();
    intake.add([file('a.png', png(1), 'image/png')]);
    intake.left();
    expect(intake.state.working).toBe(true);
    await done();
    expect(intake.state.marks.size).toBe(1);
    intake.left();
    expect(intake.state.marks.size).toBe(0);
    expect(intake.state.result).toBeNull();
  });

  it('dates a batch in drop order, whatever order the uploads end in', async () => {
    const { doc, intake, done } = setup({
      // The first take's upload is the slowest.
      put: async (_id, _sha, bytes, mime) => {
        await new Promise((resolve) => setTimeout(resolve, bytes[10] === 1 ? 30 : 0));
        return { mime, state: 'uploaded' };
      },
    });
    intake.add([file('cinque e venti (1).mp3', mp3(2), 'audio/mpeg'), file('cinque e venti.mp3', mp3(1), 'audio/mpeg')]);
    await done();
    expect(readFiles(doc).map((f) => f.name)).toEqual(['cinque e venti.mp3', 'cinque e venti (1).mp3']);
  });

  it('knows images and tracks by type or extension', () => {
    expect(kindOf({ name: 'x.PNG', type: '' })).toBe('image');
    expect(kindOf({ name: 'x', type: 'image/webp' })).toBe('image');
    expect(kindOf({ name: 'take (1).FLAC', type: '' })).toBe('audio');
    expect(kindOf({ name: 'notes.txt', type: 'text/plain' })).toBeNull();
  });
});

describe('the fallback hash', () => {
  it('gives the same SHA-256 without Web Crypto as with it', async () => {
    expect(await hashBytes(new TextEncoder().encode('abc'), undefined)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    for (const bytes of [new Uint8Array(0), new TextEncoder().encode('abc'), new Uint8Array(100_000).fill(7)]) {
      expect(await hashBytes(bytes, undefined)).toBe(await hashBytes(bytes, globalThis.crypto.subtle));
    }
  });

  it('adds files with no Web Crypto', async () => {
    const { doc, intake, done } = setup();
    const subtle = vi.spyOn(globalThis.crypto, 'subtle', 'get').mockReturnValue(undefined as unknown as SubtleCrypto);
    try {
      intake.add([file('a.png', png(9), 'image/png')]);
      await done();
    } finally {
      subtle.mockRestore();
    }
    expect(readFiles(doc)).toMatchObject([{ sha256: await hashBytes(png(9)) }]);
  });
});

describe('the browser putFile', () => {
  const sha256 = 'a'.repeat(64);
  afterEach(() => vi.unstubAllGlobals());

  it('re-links with no upload when HEAD finds the file', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 200, headers: { 'content-type': 'image/png' } }));
    vi.stubGlobal('fetch', fetch);
    const answer = await createWebPlatform().putFile('p1', sha256, new Uint8Array([1]), 'image/png');
    expect(answer).toEqual({ mime: 'image/png', state: 'uploaded' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]).toEqual([`/api/projects/p1/files/${sha256}`, { method: 'HEAD', credentials: 'include' }]);
  });

  it('PUTs the raw bytes on a 404, and maps a refusal to its message', async () => {
    const answers = [
      new Response(null, { status: 404 }),
      Response.json({ sha256, size: 1, mime: 'image/png' }, { status: 201 }),
      new Response(null, { status: 404 }),
      Response.json({ error: 'unsupported_type', message: 'Only PNG, JPEG and WebP images.' }, { status: 415 }),
    ];
    const fetch = vi.fn(async () => answers.shift()!);
    vi.stubGlobal('fetch', fetch);
    const platform = createWebPlatform();
    await expect(platform.putFile('p1', sha256, new Uint8Array([1]), 'image/png')).resolves.toEqual({
      mime: 'image/png',
      state: 'uploaded',
    });
    expect(fetch.mock.calls[1]).toMatchObject([
      `/api/projects/p1/files/${sha256}`,
      { method: 'PUT', headers: { 'content-type': 'application/octet-stream' } },
    ]);
    const refused = platform.putFile('p1', sha256, new Uint8Array([1]), 'image/png');
    await expect(refused).rejects.toBeInstanceOf(PutFileError);
    await expect(refused).rejects.toMatchObject({ status: 415, message: 'Only PNG, JPEG and WebP images.' });
  });

  it('says the server cannot be reached when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(createWebPlatform().putFile('p1', sha256, new Uint8Array([1]), 'image/png')).rejects.toMatchObject({
      status: 0,
      message: 'The server cannot be reached.',
    });
  });
});
