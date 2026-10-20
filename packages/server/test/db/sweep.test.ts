import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { addFiles, readFiles, removeFile, type NewFile } from 'promptbook-project';
import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { openBlobStore, type FsBlobStore } from '../../src/files/blobs.js';
import { linkFile } from '../../src/files/store.js';
import { sweepFiles } from '../../src/files/sweep.js';
import { createProject, loadProjectDoc, storeProjectDoc } from '../../src/projects.js';
import { db, steve, tempDataDir } from './helpers.js';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), randomBytes(500)]);

const GRACE = { graceDays: 30 };
const TWO_DAYS_AGO = (Date.now() - 2 * 86_400_000) / 1000;

interface Setup {
  blobs: FsBlobStore;
  userId: string;
}

async function setup(): Promise<Setup> {
  const user = await steve();
  return { blobs: await openBlobStore(tempDataDir()), userId: user.id };
}

const project = async ({ userId }: Setup, title = 'L’Ancora di Sabaoth') =>
  (await createProject(db, userId, { category: 'one-shot', title, campaignId: null, status: 'draft', seed: '' })).id;

// A stored file linked to the project, with its bytes dated two days ago so
// the sweep treats them as settled.
async function stored({ blobs, userId }: Setup, projectId: string, bytes = png()): Promise<string> {
  const hash = sha(bytes);
  await blobs.put(hash, Readable.from([bytes]), { maxBytes: bytes.length });
  utimesSync(join(blobs.root, hash.slice(0, 2), hash), TWO_DAYS_AGO, TWO_DAYS_AGO);
  await linkFile(db, blobs, projectId, { sha256: hash, size: bytes.length, mime: 'image/png' }, { userId, quotaBytes: 1024 ** 3 });
  return hash;
}

const entry = (sha256: string, thumbSha256: string | null = null): NewFile => ({
  sha256,
  thumbSha256,
  name: 'steve_scene.png',
  kind: 'image',
  mime: 'image/png',
  size: 504,
  width: 1456,
  height: 816,
  duration: null,
  sceneId: 'S1',
  matchedBy: 'prompt',
  addedBy: 'user',
});

// Changes the project's stored document as a client's edit would.
async function edit(projectId: string, change: (doc: import('yjs').Doc) => void): Promise<void> {
  const doc = (await loadProjectDoc(db, projectId))!;
  change(doc);
  await storeProjectDoc(db, projectId, doc);
}

const links = () =>
  db.query<{ project_id: string; sha256: string; unreferenced: boolean }>(
    `select project_id, sha256, unreferenced_since is not null as unreferenced from project_files order by project_id, sha256`,
  );

const filesRows = async () => (await db.query<{ sha256: string }>('select sha256 from files order by sha256')).map((r) => r.sha256);

const onDisk = ({ blobs }: Setup, hash: string) => existsSync(join(blobs.root, hash.slice(0, 2), hash));

describe('the file sweep', () => {
  it('keeps a file its document lists, the thumbnail included', async () => {
    const s = await setup();
    const id = await project(s);
    const original = await stored(s, id);
    const thumb = await stored(s, id);
    await edit(id, (doc) => addFiles(doc, [entry(original, thumb)]));
    expect(await sweepFiles(db, s.blobs, GRACE)).toMatchObject({ unreferenced: 0, dropped: 0, files: 0 });
    expect(await links()).toEqual([
      { project_id: id, sha256: [original, thumb].sort()[0], unreferenced: false },
      { project_id: id, sha256: [original, thumb].sort()[1], unreferenced: false },
    ]);
  });

  it('marks a file the document stopped listing, and clears the mark when it lists it again', async () => {
    const s = await setup();
    const id = await project(s);
    const hash = await stored(s, id);
    await edit(id, (doc) => addFiles(doc, [entry(hash)]));
    await edit(id, (doc) => removeFile(doc, readFiles(doc)[0]!.id));
    expect(await sweepFiles(db, s.blobs, GRACE)).toMatchObject({ unreferenced: 1 });
    expect(await links()).toEqual([{ project_id: id, sha256: hash, unreferenced: true }]);
    // The date is set once, not moved on by later sweeps.
    const since = () => db.queryOne<{ at: Date }>('select unreferenced_since as at from project_files');
    const first = await since();
    await sweepFiles(db, s.blobs, GRACE);
    expect(await since()).toEqual(first);
    await edit(id, (doc) => addFiles(doc, [entry(hash)]));
    expect(await sweepFiles(db, s.blobs, GRACE)).toMatchObject({ relisted: 1 });
    expect(await links()).toEqual([{ project_id: id, sha256: hash, unreferenced: false }]);
  });

  it('keeps an unlisted link within the grace period and drops it after, with the bytes', async () => {
    const s = await setup();
    const id = await project(s);
    const hash = await stored(s, id);
    await db.query(`update project_files set unreferenced_since = now() - interval '29 days'`);
    expect(await sweepFiles(db, s.blobs, GRACE)).toMatchObject({ dropped: 0, files: 0 });
    expect(await links()).toHaveLength(1);
    expect(onDisk(s, hash)).toBe(true);
    await db.query(`update project_files set unreferenced_since = now() - interval '31 days'`);
    expect(await sweepFiles(db, s.blobs, GRACE)).toMatchObject({ dropped: 1, files: 1 });
    expect(await links()).toEqual([]);
    expect(await filesRows()).toEqual([]);
    expect(onDisk(s, hash)).toBe(false);
  });

  it('reads the grace period from its options', async () => {
    const s = await setup();
    const id = await project(s);
    await stored(s, id);
    await db.query(`update project_files set unreferenced_since = now() - interval '3 days'`);
    expect(await sweepFiles(db, s.blobs, { graceDays: 2 })).toMatchObject({ dropped: 1 });
  });

  it('keeps the bytes while another project links them', async () => {
    const s = await setup();
    const one = await project(s, 'Uno');
    const two = await project(s, 'Due');
    const bytes = png();
    const hash = await stored(s, one, bytes);
    await stored(s, two, bytes);
    await edit(two, (doc) => addFiles(doc, [entry(hash)]));
    await db.query(`update project_files set unreferenced_since = now() - interval '31 days' where project_id = $1`, [one]);
    expect(await sweepFiles(db, s.blobs, GRACE)).toMatchObject({ dropped: 1, files: 0 });
    expect(await links()).toEqual([{ project_id: two, sha256: hash, unreferenced: false }]);
    expect(await filesRows()).toEqual([hash]);
    expect(onDisk(s, hash)).toBe(true);
  });

  it('deletes files no project links, once the projects are purged', async () => {
    const s = await setup();
    const id = await project(s);
    const hash = await stored(s, id);
    await db.query('delete from projects where id = $1', [id]);
    expect(await links()).toEqual([]);
    expect(await sweepFiles(db, s.blobs, GRACE)).toMatchObject({ files: 1 });
    expect(await filesRows()).toEqual([]);
    expect(onDisk(s, hash)).toBe(false);
  });

  it('keeps the links of files of a kind it does not know, which a newer client may write', async () => {
    const s = await setup();
    const id = await project(s);
    const hash = await stored(s, id);
    await edit(id, (doc) => {
      const item = new Y.Map<unknown>();
      for (const [k, v] of Object.entries({ id: 'v1', sha256: hash, kind: 'video', addedAt: new Date().toISOString() })) item.set(k, v);
      doc.getArray<Y.Map<unknown>>('files').push([item]);
    });
    expect(await sweepFiles(db, s.blobs, GRACE)).toMatchObject({ unreferenced: 0 });
    expect(await links()).toEqual([{ project_id: id, sha256: hash, unreferenced: false }]);
  });

  it('answers retry to an upload whose bytes a sweep deleted before it was linked', async () => {
    const s = await setup();
    const id = await project(s);
    const bytes = png();
    const hash = sha(bytes);
    await s.blobs.put(hash, Readable.from([bytes]), { maxBytes: bytes.length });
    await s.blobs.delete(hash);
    const linking = linkFile(db, s.blobs, id, { sha256: hash, size: bytes.length, mime: 'image/png' }, {
      userId: s.userId,
      quotaBytes: 1024 ** 3,
    });
    await expect(linking).rejects.toMatchObject({ status: 503, code: 'retry' });
    expect(await links()).toEqual([]);
  });

  it('checks the quota again when it links, against uploads that finished meanwhile', async () => {
    const s = await setup();
    const id = await project(s);
    await stored(s, id);
    await db.query('update files set size = 1000');
    const bytes = png();
    await s.blobs.put(sha(bytes), Readable.from([bytes]), { maxBytes: bytes.length });
    const linking = linkFile(db, s.blobs, id, { sha256: sha(bytes), size: bytes.length, mime: 'image/png' }, {
      userId: s.userId,
      quotaBytes: 1200,
    });
    await expect(linking).rejects.toMatchObject({ status: 507, code: 'quota' });
    expect(await links()).toHaveLength(1);
  });

  it('deletes bytes with no row and temporary files older than a day, and keeps newer ones', async () => {
    const s = await setup();
    const old = sha(png());
    const fresh = sha(png());
    for (const hash of [old, fresh]) {
      mkdirSync(join(s.blobs.root, hash.slice(0, 2)), { recursive: true });
      writeFileSync(join(s.blobs.root, hash.slice(0, 2), hash), 'x');
    }
    utimesSync(join(s.blobs.root, old.slice(0, 2), old), TWO_DAYS_AGO, TWO_DAYS_AGO);
    writeFileSync(join(s.blobs.tmp, 'stale'), 'x');
    writeFileSync(join(s.blobs.tmp, 'uploading'), 'x');
    utimesSync(join(s.blobs.tmp, 'stale'), TWO_DAYS_AGO, TWO_DAYS_AGO);
    expect(await sweepFiles(db, s.blobs, GRACE)).toMatchObject({ orphans: 1, temp: 1 });
    expect(onDisk(s, old)).toBe(false);
    expect(onDisk(s, fresh)).toBe(true);
    expect(existsSync(join(s.blobs.tmp, 'stale'))).toBe(false);
    expect(existsSync(join(s.blobs.tmp, 'uploading'))).toBe(true);
  });

  it('keeps old bytes that have a row', async () => {
    const s = await setup();
    const id = await project(s);
    const hash = await stored(s, id);
    await edit(id, (doc) => addFiles(doc, [entry(hash)]));
    expect(await sweepFiles(db, s.blobs, GRACE)).toMatchObject({ orphans: 0 });
    expect(onDisk(s, hash)).toBe(true);
  });
});
