import type { FastifyInstance } from 'fastify';
import type { Template } from 'promptbook-format';
import { cuebardFiles, cuebardLeftOut, cuebardPack, needsDuration, readMeta, type CuebardPack } from 'promptbook-project';
import * as Y from 'yjs';
import { requireSession } from '../accounts/auth.js';
import type { Db } from '../db.js';
import { AppError } from '../errors.js';
import type { BlobStore } from '../files/blobs.js';
import { trackDuration } from '../files/duration.js';
import { getProject, loadProjectDoc } from '../projects.js';
import type { Sync } from '../sync.js';
import { accountTemplates } from '../templates.js';
import { NOT_FOUND } from './projects.js';
import { send, ZIP_BYTES_MAX, ZIP_ENTRIES_MAX, zipWriter } from './zip.js';

// The CueBard pack, streamed (cuebard-export design decisions 13 and 14).

const TOO_LARGE = () =>
  new AppError(
    413,
    'export_too_large',
    'This project holds more than 4 GB of images and tracks for CueBard, more than one pack can take. Choose fewer files on the board.',
  );

// A copy of a live document, so that the files checked against the
// project's links are the ones the pack holds, whatever a client writes
// while the plan awaits.
function frozen(doc: Y.Doc): Y.Doc {
  const copy = new Y.Doc();
  Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
  return copy;
}

export async function cuebardRoutes(app: FastifyInstance, { db, sync, blobs }: { db: Db; sync: Sync; blobs: BlobStore }) {
  // The pack of one document: the files the project does not link, or whose
  // bytes are gone, left out; the lengths the board lacks read from the
  // files. The document is the user's to write, so a hash it names is read
  // only when this project's links list it: knowing a hash never grants a
  // file. Sizes and types are the stored files' own, never the document's.
  // The limits are checked on everything picked before a length is read, so
  // a pack too large is refused before any file is parsed, and each content
  // is parsed once. `gone` says the client has left: no more reading then.
  async function plan(projectId: string, doc: Y.Doc, templates: Template[], gone: () => boolean): Promise<CuebardPack> {
    const stored = new Map(
      (
        await db.query<{ sha256: string; size: string; mime: string }>(
          `select f.sha256, f.size, f.mime from project_files pf join files f using (sha256) where pf.project_id = $1`,
          [projectId],
        )
      ).map((row) => [row.sha256, { size: Number(row.size), mime: row.mime }]),
    );
    const missing = new Set<string>();
    const picked = cuebardFiles(doc, templates);
    for (const file of picked) {
      if (!stored.has(file.sha256) || !(await blobs.has(file.sha256))) missing.add(file.id);
    }
    const kept = picked.filter((f) => !missing.has(f.id));
    checkFits(
      kept.reduce((sum, f) => sum + stored.get(f.sha256)!.size, 0),
      kept.length,
    );
    const durations = new Map<string, number>();
    const read = new Map<string, number | null>();
    for (const track of needsDuration(doc, templates)) {
      if (missing.has(track.id)) continue;
      if (!read.has(track.sha256)) {
        if (gone()) throw new Error('The client left before the pack was planned.');
        const { mime } = stored.get(track.sha256)!;
        const blob = mime.startsWith('audio/') ? await blobs.get(track.sha256) : null;
        read.set(track.sha256, blob ? await trackDuration(blob.stream, mime, blob.size) : null);
      }
      const seconds = read.get(track.sha256);
      if (seconds != null) durations.set(track.id, seconds);
    }
    const pack = cuebardPack(doc, { now: new Date().toISOString(), durations, missing, templates });
    // The project file and left-out.txt count too: their texts come from the
    // document.
    const text = pack.projectFile.json.length + (cuebardLeftOut(pack, 'not on the server')?.length ?? 0);
    checkFits(
      pack.entries.reduce((sum, e) => sum + stored.get(e.sha256)!.size, 0) + 3 * text,
      pack.entries.length,
    );
    return pack;
  }

  // fflate's Zip writes 32-bit sizes and offsets and a 16-bit entry count, so
  // a pack past them would be silently corrupt: refuse it up front.
  function checkFits(bytes: number, entries: number): void {
    if (bytes > ZIP_BYTES_MAX || entries + 2 > ZIP_ENTRIES_MAX) throw TOO_LARGE();
  }

  // The project file first, deflated, then each track and image stored as
  // it is read, then left-out.txt when anything was left out. A blob gone
  // since the plan (the sweep) aborts the stream: the zip then has no
  // central directory, and CueBard refuses it rather than open a project
  // that names a file it lacks.
  async function* packChunks(pack: CuebardPack, projectId: string, log: FastifyInstance['log']): AsyncGenerator<Uint8Array> {
    const zip = zipWriter();
    try {
      zip.text(pack.projectFile.path, pack.projectFile.json);
      yield* zip.flush();
      for (const entry of pack.entries) {
        const blob = await blobs.get(entry.sha256);
        if (!blob) {
          log.warn({ project: projectId, file: entry.fileId }, 'CueBard export: a file without bytes aborted the pack');
          throw new Error(`The bytes of ${entry.path} are gone.`);
        }
        yield* zip.stored(entry.path, blob.stream);
      }
      const leftOut = cuebardLeftOut(pack, 'not on the server');
      if (leftOut !== null) {
        log.warn({ project: projectId, leftOut: leftOut.split('\n').length - 1 }, 'CueBard export: files were left out');
        zip.text('left-out.txt', leftOut);
      }
      yield* zip.end();
    } finally {
      zip.terminate();
    }
  }

  app.get('/api/projects/:id/cuebard', async (req, reply) => {
    const { user } = requireSession(req);
    const { id } = req.params as { id: string };
    const project = await getProject(db, user.id, id);
    if (!project || project.deletedAt) throw NOT_FOUND();
    // The open document when a client has it, so edits not yet stored are in
    // the pack too; read migrated, never written.
    const live = sync.liveDocument(project.id);
    const doc = live ? frozen(live) : await loadProjectDoc(db, project.id);
    if (!doc) throw NOT_FOUND();
    const templates = await accountTemplates(db, user.id, readMeta(doc).template);
    const pack = await plan(project.id, doc, templates, () => req.raw.socket?.destroyed === true);
    return send(reply, pack.fileName, packChunks(pack, project.id, req.log));
  });
}
